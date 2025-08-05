const express = require("express");
const https = require("https");
const WebSocket = require("ws");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const fs = require("fs");
require("dotenv").config();

const SECRET_KEY = process.env.SECRET_KEY || "ChangeMe123!";
const PUBLIC_KEY = crypto.createHash("sha1").update(SECRET_KEY).digest("hex").substring(0, 8);
const PORT = process.env.PORT || 3000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "*";
const CERT_KEY_PATH = process.env.CERT_KEY_PATH || "";
const CERT_CRT_PATH = process.env.CERT_CRT_PATH || "";

const sessions = new Map();
const usedTokens = new Set();

let config = {
    partsCount: 20,
    requiredTokens: 2,
    singleClientOnly: false
};

const app = express();
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", CORS_ORIGIN);
    res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});
app.use(bodyParser.json());

const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));

app.get("/api/config", (req, res) => {
    const protocol = req.secure ? "https://" : "http://";
    const wsProtocol = req.secure ? "wss://" : "ws://";
    const host = req.headers.host;
    res.json({
        partsCount: config.partsCount,
        requiredTokens: config.requiredTokens,
        singleClientOnly: config.singleClientOnly,
        wsUrl: wsProtocol + host,
        apiBase: protocol + host,
        publicKey: PUBLIC_KEY
    });
});

app.post("/api/config", (req, res) => {
    if (req.body.partsCount) config.partsCount = parseInt(req.body.partsCount);
    if (req.body.requiredTokens) config.requiredTokens = parseInt(req.body.requiredTokens);
    if (typeof req.body.singleClientOnly !== "undefined")
        config.singleClientOnly = !!req.body.singleClientOnly;
    res.json({ status: "ok", config });
    broadcast({ event: "config-update", config });
});

let server;
if (CERT_KEY_PATH && CERT_CRT_PATH) {
    const serverOptions = {
        key: fs.readFileSync(CERT_KEY_PATH),
        cert: fs.readFileSync(CERT_CRT_PATH)
    };
    server = https.createServer(serverOptions, app);
    log(`HTTPS-Server wird auf Port ${PORT} gestartet...`);
} else {
    const http = require("http");
    server = http.createServer(app);
    log(`HTTP-Server wird auf Port ${PORT} gestartet...`);
}

const wss = new WebSocket.Server({ server });

function log(msg) {
    console.log(`[${new Date().toISOString()}] ${msg}`);
}

function broadcast(data) {
    const msg = JSON.stringify(data);
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) client.send(msg);
    });
}

function broadcastSessions() {
    const list = [];
    sessions.forEach((s, id) => {
        list.push({
            sessionId: id,
            clientId: s.clientId,
            sentTokens: s.sentTokens,
            requiredTokens: s.requiredTokens,
            partsCount: s.partsCount
        });
    });
    broadcast({ event: "sessions", sessions: list });
}

wss.on("connection", (ws, req) => {
    log(`Neue WebSocket-Verbindung von ${req.socket.remoteAddress}`);
    ws.on("message", (message) => {
        try {
            const data = JSON.parse(message);

            if (data.action === "init") {

                const clientId = data.clientId || crypto.randomBytes(6).toString("hex");
                const sessionId = crypto.randomBytes(8).toString("hex");
                sessions.set(sessionId, {
                    clientId,
                    partsCount: config.partsCount,
                    requiredTokens: config.requiredTokens,
                    sentTokens: 0,
                    expectedIndex: 1,
                    createdAt: Date.now(),
                    scannedParts: new Set(),
                    lastActivity: Date.now()
                });
                log(`Session erstellt: ${sessionId}, clientId=${clientId}`);
                ws.send(JSON.stringify({ event: "session-init", sessionId }));
                broadcastSessions();

            } else if (data.action === "scan-progress") {

                const session = sessions.get(data.sessionId);
                if (session) session.lastActivity = Date.now();
                
                session.scannedParts.add(data.progress); // Fortschritt aktualisieren
                broadcast({ event: "scan-progress", sessionId: data.sessionId, progress: data.progress, total: data.total });
                log(`Scanfortschritt: ${data.progress}/${data.total} in Session ${data.sessionId}`);

            } else if (data.action === "validate") {

                const { sessionId, fullToken, clientId } = data;
                const session = sessions.get(sessionId);
                if (!session) return ws.send(JSON.stringify({ status: "error", msg: "Session not found" }));
                session.lastActivity = Date.now();

                if (session.clientId !== clientId)
                    return ws.send(JSON.stringify({ status: "error", msg: "Client mismatch" }));
                if (config.singleClientOnly && usedTokens.has(fullToken))
                    return ws.send(JSON.stringify({ status: "error", msg: "Token already used by another session" }));
                if (usedTokens.has(fullToken))
                    return ws.send(JSON.stringify({ status: "error", msg: "Token already used" }));

                usedTokens.add(fullToken);
                session.sentTokens++;
                log(`Session ${sessionId} (Client ${clientId}): FullToken #${session.sentTokens} empfangen.`);
                if (session.sentTokens >= session.requiredTokens) {
                    ws.send(JSON.stringify({ status: "ok", msg: "All required tokens received", sessionId }));

                    // Broadcast vor Löschen
                    broadcast({ event: "validated", sessionId, clientId: session.clientId });
                    log(`Session ${sessionId} validiert!`);

                    // Session entfernen
                    sessions.delete(sessionId);
                    log(`Session ${sessionId} gelöscht!`);

                } else {
                    ws.send(JSON.stringify({ status: "partial", msg: `Token ${session.sentTokens}/${session.requiredTokens} ok`, sessionId }));
                }
                broadcastSessions();
            }
        } catch (e) {
            log(`WS Fehler: ${e.message}`);
            ws.send(JSON.stringify({ status: "error", msg: "Invalid message" }));
        }
    });
    ws.on("close", () => broadcastSessions());
});

setInterval(() => {
    const now = Date.now();
    sessions.forEach((s, id) => {
        const lifetime = now - s.createdAt;
        const inactive = now - s.lastActivity;
        log(`Scan for inactive sessions...`)

        // (A) nie gestartet (noch kein einziger QR-Teil gescannt)
        if (s.scannedParts.size === 0 && lifetime > 30000) {
            sessions.delete(id);
            log(`Session ${id} entfernt (Timeout ohne Scanstart)`);
            broadcast({ event: "session-timeout", sessionId: id, reason: "no-scan-start" });

            // (B) angefangen, aber inaktiv
        } else if (s.scannedParts.size > 0 && inactive > 60000) {
            sessions.delete(id);
            log(`Session ${id} entfernt (Timeout nach Inaktivität)`);
            broadcast({ event: "session-timeout", sessionId: id, reason: "inactivity" });
        }
    });
}, 5000);

server.listen(PORT, () => log(`Server läuft auf ${CERT_KEY_PATH && CERT_CRT_PATH ? 'https' : 'http'}://0.0.0.0:${PORT}`));