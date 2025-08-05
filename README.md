# QR Code 2.0 Demo – Token-Splitting & Live Validation

<p align="center">
  <img src="docs/generator.gif" alt="Standardansicht" width="300" style="margin-right: 20px;" />
  <img src="docs/generator2.gif" alt="ColorBlocks-Ansicht" width="300" />
</p>

- **Standardansicht:** Klassische Darstellung mit Standardmodulen.  
- **ColorBlocks-Ansicht:** Darstellung mit runden und farbigen Modulen für moderne Looks.

## Überblick

Dieses Projekt zeigt ein **vollständiges, modernes QR-Code-System**, bestehend aus:

- **Generator**  
  Zeigt kontinuierlich wechselnde QR-Codes an, die ein Token in mehrere Teile aufspalten.  
  So können **lange oder dynamische Daten** über mehrere Frames verteilt werden, die ein Scanner nacheinander einliest.  

- **Scanner**  
  Nutzt eine Kamera (z. B. Smartphone oder Laptop) zum Einlesen der QR-Codes, **rekonstruiert automatisch das vollständige Token** und meldet den Fortschritt an den Server.  

- **Admin-Dashboard**  
  Bietet einen Überblick über alle aktiven Sessions, deren Scan-Fortschritte und erlaubt die **Live-Konfiguration** (z. B. wie viele Teile ein Token hat oder wie viele Tokens insgesamt benötigt werden).

### Warum ist das genial?

- **QR-Codes sind normalerweise statisch** – hier sind sie **dynamisch** und transportieren Daten über mehrere Frames.  
- **Sessions und WebSocket-Livefeedback** ermöglichen interaktive Anwendungen:  
  - Live sehen, wie ein Scanner gerade Teile sammelt.  
  - Automatische Validierung, sobald genug Daten eingelesen wurden.  
- **Konfigurierbar** (z. B. mehrere Tokens pro Prozess oder "Single-Client-only"-Modus).  
- **Sicherheitsaspekt**:  
  - Daten werden signiert (PublicKey-Prüfung im Client).  
  - Ein zentraler Secret-Key bleibt nur auf dem Server.  
- **Dockerbereit** → schnell lokal startbar, oder als Demo im eigenen Netzwerk.

---

## Funktionsweise

1. **Generator** erzeugt Tokens (zufällige Zeichenketten) und teilt sie in mehrere Teile auf (z. B. 5 Teile).  
   Jeder Frame zeigt **nur ein Teil** an, sodass der Scanner mehrere Frames braucht, um den vollständigen Token zu erhalten.

2. **Scanner**:
   - liest nacheinander die QR-Codes ein,
   - prüft jedes Teil (HMAC-Prüfung mit einem PublicKey),
   - setzt die Teile zusammen und sendet das fertige Token an den Server.

3. **Server**:
   - verwaltet **Sessions** (pro Scanner-Client),
   - prüft die empfangenen Tokens (keine Doppelverwendung),
   - meldet **Fortschritt** und **Validierung** per WebSocket an **alle verbundenen Clients** (z. B. auch an das Admin-Dashboard).

4. **Admin-Dashboard**:
   - zeigt **aktive Sessions**, wie viele Tokens bereits gescannt wurden,
   - erlaubt es, **Konfigurationen live zu ändern** (z. B. Anzahl der Token-Teile).

---

## Anwendungsfälle

- **Event-Ticket-Validierung**  
  → Besucher scannen ein sich kontinuierlich änderndes QR-Bild, und der Server prüft es.  
- **Sichere Logins oder Pairing**  
  → Ein Gerät (Generator) zeigt ein zeitlich begrenztes Token an, das nur vor Ort scannbar ist.  
- **Schulungs- oder Spiele-Anwendungen**  
  → QR-Codes als interaktive „Level-Daten“ oder Aufgaben, die nur in Reihenfolge eingelesen werden können.  
- **Gamification**  
  → Teile des QR-Codes sind über Zeit oder Ort verteilt, Scanner müssen alle sammeln.  

---

## Frontend-Komponenten

### Generator (`public/generator.html`)
- Zeigt QR-Codes mit dynamischen Daten an.
- Visualisiert den Scanprozess (Scanbalken, Validierungsanzeige).
- Zeigt an, wie viele Teile gerade angezeigt werden und wie viele Tokens insgesamt benötigt werden.

### Scanner (`public/scanner.html`)
- Nutzt die Kamera des Geräts.
- Erkennt automatisch, welche Teile bereits gelesen wurden.
- Sendet Fortschritts-Updates an den Server.
- Meldet vollständige Tokens, sobald alle Teile eines Tokens eingelesen wurden.
- Zeigt visuelles Feedback (Badge, Fortschrittsübersicht).

### Admin (`public/admin.html`)
- Zeigt alle **aktiven Sessions** mit deren Fortschritt.
- Zeigt Live-Logs (Events vom Server).
- Bietet ein Formular zur Änderung der Konfiguration.

---

## Konfiguration (über `/api/config`)

Das Backend gibt bei jedem Aufruf von `/api/config` folgende Felder zurück:

| Feld              | Typ       | Beschreibung |
|-------------------|----------|--------------|
| `partsCount`      | Zahl     | **Wie viele Teile** ein einzelnes Token hat. Beispiel: `5` bedeutet, dass der Scanner 5 verschiedene QR-Frames benötigt, um ein Token zu vervollständigen. |
| `requiredTokens`  | Zahl     | **Wie viele vollständige Tokens** benötigt werden, bevor der Prozess als abgeschlossen gilt. Beispiel: `2` bedeutet: zwei komplette Token müssen gescannt werden. |
| `singleClientOnly`| Bool     | Wenn `true`, darf ein Token nur von **einer einzigen Session** verwendet werden (z. B. Schutz gegen mehrfaches Scannen desselben Tokens durch verschiedene Geräte). |
| `wsUrl`           | String   | Dynamische WebSocket-URL (automatisch ermittelt). Wird vom Frontend für Live-Kommunikation genutzt. |
| `apiBase`         | String   | Basis-URL für REST-API-Aufrufe. |
| `publicKey`       | String   | Öffentlicher Schlüssel für Client-seitige Integritätsprüfungen. |

### Änderung per POST:
```json
POST /api/config
{
    "partsCount": 5,
    "requiredTokens": 1,
    "singleClientOnly": false
}
```
→ broadcastet automatisch ein `config-update` Event an alle WebSocket-Clients.

---

## Vorteile

1. **Schnelle Integration**  
   → Alles basiert auf **Standard-Webtechnologien** (HTML, JavaScript, WebSocket, REST).

2. **Live Feedback**  
   → Administratoren sehen sofort, wie weit ein Scanner ist.

3. **Token-Splitting**  
   → Lange Daten oder Sicherheits-Tokens können aufgeteilt werden, wodurch das Fälschen oder Abfotografieren schwieriger wird.

4. **Skalierbarkeit**  
   → Mehrere Scanner und Generatoren können parallel arbeiten.  
   → Durch Sessions wird jede Verbindung isoliert verwaltet.

5. **Sicherheit**  
   → Signaturen verhindern Manipulationen.  
   → SecretKey bleibt nur auf dem Server.

6. **Docker-ready**  
   → Mit einem Befehl in jeder Umgebung startbar.

---

## Installation & Start

### Voraussetzungen
- Node.js >= 20
- npm
- (optional) Docker

### Lokale Installation
```bash
cd server
npm install
npm start
```
→ Standard: `http://localhost:8080`

### Docker
```bash
docker build -t SecureQR ./server
docker run -p 8080:8080 SecureQR
```

### Frontend
- `public/generator.html` öffnen → QR-Codes werden angezeigt.
- `public/scanner.html` öffnen → QR-Codes scannen.
- `public/admin.html` öffnen → Sessions und Konfiguration ansehen.

---

## Warum dieses Projekt spannend ist

- **Zeigt moderne Echtzeit-Webtechnologien** (WebSocket, dynamische QR-Codes).
- **Beispiel für sichere Tokenübertragung über QR** – etwas, das in der Praxis oft gebraucht wird (Pairing, Authentifizierung, Ticketing).
- **Einfach erweiterbar**:  
  - Mehr Konfigurationsoptionen (z. B. Ablaufzeiten, Benutzerrechte)  
  - Integration in bestehende Systeme (z. B. Datenbanken, Auth-Server)  
- **Open Source, kostenlos, edukativ** – ideal, um etwas über WebSockets, QR-Codes und Echtzeitkommunikation zu lernen.

---

## Lizenz

MIT License – frei nutzbar, keine Gewährleistung.  
Dieses Projekt ist **nicht kommerziell** gedacht, sondern ein **Open-Source-Beitrag für die Community**.
