# 07 — Architettura

## Identità del Progetto

| Campo | Valore |
|-------|--------|
| Nome prodotto | RS Mioni |
| Sviluppato da | Smartera Group |
| URL target | rsmioni.it / rsmioni.com |
| Ispirato a | Manuale RH24 (K-SOL S.r.l.) |

---

## Confronto Architetture

Sono state valutate due opzioni prima di scegliere quella finale.

---

### Opzione A — React SPA + Node.js API (proposta iniziale)

```
Browser (React SPA) ──REST/JSON──► Node.js API ──► PostgreSQL
                    ──Socket.IO──► Socket.IO Server ──► Redis
```

**Struttura**: due applicazioni distinte (frontend SPA, backend API), comunicate via JSON su HTTP e WebSocket.

#### Pro
| Punto | Dettaglio |
|-------|-----------|
| Linguaggio unico | TypeScript ovunque (frontend + backend) |
| API-first | Possibilità futura di esposizione API pubblica o mobile |
| Ecosistema realtime maturo | Socket.IO gestisce rooms, namespaces, reconnect |
| Flessibilità deploy | Frontend su CDN, backend su server separato |

#### Contro
| Punto | Dettaglio |
|-------|-----------|
| Due codebase, due runtime | Setup, deploy, monitoring doppio |
| Glue code abbondante | Ogni form richiede endpoint REST + serializzazione + deserializzazione + type guards |
| Auth complessa | JWT cross-origin, CORS, gestione token refresh su SPA |
| Nessun framework backend maturo | Express/Fastify non hanno: ORM robusto, mail, job scheduler, policy/gate auth — si costruisce a mano |
| Overhead operativo | Due processi da tenere vivi, due set di env vars, due CI/CD |
| Node.js non è il punto di forza per logica relazionale pesante | Le regole business di RS Mioni (concorrenza N, visibilità calendario, cascade, permessi granulari) si esprimono meglio in un framework con ORM ricco |

---

### Opzione B — Laravel + Inertia + React + Laravel Reverb (proposta nuova)

```
Browser (React via Inertia) ──Inertia protocol──► Laravel ──► PostgreSQL
                             ──WebSocket──────────► Laravel Reverb ──► Redis
                                                   └──► Queue Worker ──► Redis
```

**Struttura**: un'unica applicazione Laravel che serve sia la logica server che le pagine React tramite Inertia. Reverb gestisce WebSocket nello stesso processo (o processo secondario leggero). Node.js è isolato al solo kiosk agent Windows.

#### Pro
| Punto | Dettaglio |
|-------|-----------|
| Un solo framework, un solo processo principale | Un deploy, un set di env vars, un monitoring |
| Inertia elimina l'API layer | Le pagine React ricevono i dati come props dall'action Laravel, nessun endpoint JSON da mantenere per il frontend |
| Eloquent ORM | Relazioni complesse (prenotazioni↔camere↔documenti↔pagamenti), scope, policy, query builder — tutto in PHP tipizzato |
| Laravel Policies + Gates | I 35+ permessi della matrice ruoli si esprimono in modo dichiarativo, testabile e centrale |
| Laravel Queues + Scheduler | Auto-cancellazione prenotazioni, cleanup link scaduti, invio email — `php artisan schedule:run` è tutto |
| Laravel Mail | Invio link temporaneo documentale con template Mailable, coda, retry automatico |
| Laravel Reverb | WebSocket server first-party, basato su ReactPHP (event loop, non bloccante), integrato con Broadcasting di Laravel — i canali presenza gestiscono la presenza chioschi nativamente |
| Redis unico | Usato da cache, queue, broadcaster Reverb — un'istanza per tutto |
| Performance PHP 8.3 + OPcache | Per workload database-heavy con logica relazionale, PHP compilato con OPcache è più veloce di Node.js Express/Fastify |
| Scaffolding maturo | Migrations, seeders, factories, Telescope, Horizon per monitoring queue |

#### Contro
| Punto | Dettaglio |
|-------|-----------|
| PHP non è JavaScript | Il team deve padroneggiare due linguaggi (PHP backend, TypeScript React frontend) — ma questa separazione è netta e pulita con Inertia |
| Inertia curva di apprendimento | Richiede comprensione del modello Inertia (no fetch manuale, navigazione gestita) — documentazione eccellente, learning curve bassa |
| Non API-first di default | Se in futuro serve un'API pubblica o mobile, si aggiunge Laravel Sanctum + API routes separatamente — non è un limite, è una scelta differita |
| WebRTC signaling in PHP | Reverb gestisce il WebSocket, ma il forwarding SDP/ICE è puro message passing — nessun problema reale, funziona allo stesso modo |

---

## Scelta Finale: Opzione B — Laravel + Inertia + React + Reverb

### Motivazione per criterio

#### Leggerezza operativa
Laravel è **un processo** (php-fpm + Reverb come processo secondario). Non ci sono due server da deployare, due set di variabili d'ambiente, due pipeline CI/CD, due log da monitorare. Il kiosk agent Node.js è isolato sul PC Windows del chiosco — non è parte del server applicativo.

#### Performance
PHP 8.3 + OPcache per logica relazionale e HTTP è **comparabile o superiore** a Node.js Express per questo tipo di workload (non I/O bound puro, ma misto: query DB, autorizzazione, serializzazione). Laravel Reverb è basato su ReactPHP (event loop non bloccante) — non è un server PHP sincrono tradizionale, gestisce migliaia di connessioni WebSocket concorrenti senza blocco. Redis elimina ogni latenza di stato condiviso.

#### Manutenibilità
Le regole business di RS Mioni sono dense: 35+ permessi, visibilità calendario per hotel, concorrenza N, cascade delete, stati videochat. Con Eloquent + Policies + Form Requests tutto questo è **codice dichiarativo, testabile e centralizzato**. Con Node.js la stessa logica si disperde in middleware, route guards e service classes senza framework di riferimento.

#### Coerenza con il manuale RH24
Il manuale descrive un sistema centrato su **dati relazionali complessi** (prenotazioni ↔ camere ↔ documenti ↔ pagamenti ↔ hotel) con **regole di accesso granulari per profilo**. Laravel è nato per esattamente questo pattern. Inertia permette di costruire l'interfaccia densa e reattiva del manuale senza la complessità di una SPA separata.

---

## Stack Definitivo

| Layer | Tecnologia | Versione target | Ruolo |
|-------|-----------|----------------|-------|
| Backend | Laravel | 12.x | Framework principale: routing, auth, ORM, mail, queue, policy |
| Frontend rendering | Inertia.js | 2.x | Bridge Laravel ↔ React (no REST API layer per UI) |
| Frontend UI | React + TypeScript | React 19 | Componenti, state management, WebRTC |
| Styling | Tailwind CSS | 4.x | Dark dashboard, componenti densi |
| Database | PostgreSQL | 16+ | Persistenza relazionale |
| ORM | Eloquent (Laravel) | — | Query, relazioni, migrazione schema |
| Cache | Redis | 7+ | Cache query, sessioni |
| Queue | Laravel Queues + Redis | — | Jobs: email, auto-cancel, cleanup link |
| Scheduler | Laravel Scheduler | — | Cron: auto-cancel prenotazioni, cleanup token scaduti |
| WebSocket | Laravel Reverb | 1.x | Signaling WebRTC, stati chiosco, notifiche realtime |
| Pub/Sub | Laravel Broadcasting + Redis | — | Canali presenza chioschi, eventi dominio |
| Video/Audio | WebRTC (nativo browser) | — | P2P media stream tra receptionist e chiosco |
| Email | Laravel Mail + SMTP/Mailgun | — | Link temporanei documenti |
| Storage documenti | Laravel Storage (S3 o local) | — | Upload/download documenti |
| Kiosk Agent | Node.js (separato, Windows) | 22 LTS | POS, stampante, webcam, campanello, restart/logout |

---

## Architettura a Strati

```
┌──────────────────────────────────────────────────────────────────────┐
│                    BROWSER — React (via Inertia)                     │
│                                                                      │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Inertia Pages (React TSX)                                   │   │
│  │  ├── /login                                                  │   │
│  │  ├── /portineria          ← stato chioschi via Reverb        │   │
│  │  ├── /portineria/dati/*   ← prenotazioni, documenti          │   │
│  │  ├── /kiosk               ← fullscreen, kiosk mode           │   │
│  │  ├── /prenotazioni/*      ← albergatore                      │   │
│  │  ├── /camere/*                                               │   │
│  │  └── /regolamento/*                                          │   │
│  │                                                              │   │
│  │  WebRTC layer (hooks React)                                  │   │
│  │  └── RTCPeerConnection + getDisplayMedia + getUserMedia      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│         │  Inertia (HTTP full-page / XHR partial)                   │
│         │  Laravel Echo + Reverb (WebSocket)                        │
└─────────┼────────────────────────────────────────────────────────────┘
          │
┌─────────▼────────────────────────────────────────────────────────────┐
│                         LARAVEL SERVER                               │
│                                                                      │
│  HTTP Layer (Routes + Controllers + Middleware)                      │
│  ├── Middleware: Auth, RoleGuard, IpWhitelist                        │
│  ├── Controllers: Portineria, Prenotazione, Camera, Regolamento...   │
│  ├── Form Requests: validazione + autorizzazione per ogni form       │
│  └── Inertia::render() → props passate a React                      │
│                                                                      │
│  Domain Services                                                     │
│  ├── ConcurrencyService    → vincoli N per hotel (Redis)             │
│  ├── CalendarService       → visibilità date per receptionist        │
│  ├── DocumentService       → upload, link temporanei, email          │
│  ├── POSService            → coordinamento pagamenti POS             │
│  └── VideoSignalingService → forward SDP/ICE via Reverb             │
│                                                                      │
│  Eloquent Models + Policies                                          │
│  └── Hotel, Chiosco, Utente, Camera, Prenotazione, Documento...     │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │  Laravel Reverb (WebSocket server — processo secondario)    │    │
│  │  ├── Channel: presence-hotel.{id}  → presenza chioschi      │    │
│  │  ├── Channel: private-kiosk.{id}   → comandi al chiosco     │    │
│  │  ├── Channel: private-receptionist.{id} → notifiche         │    │
│  │  └── Channel: signaling.{session} → SDP/ICE WebRTC          │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  Laravel Queue Worker (processo separato)                            │
│  ├── Job: SendDocumentLinkEmail                                       │
│  ├── Job: AutoCancelPrenotazioni                                      │
│  └── Job: CleanupExpiredLinks                                        │
└──────┬──────────────────────┬──────────────────┬─────────────────────┘
       │                      │                  │
┌──────▼───┐          ┌───────▼──┐      ┌────────▼───────────────┐
│PostgreSQL│          │  Redis   │      │  Storage (S3 / locale) │
│ dati app │          │cache/    │      │  documenti upload       │
│          │          │queue/    │      └────────────────────────┘
└──────────┘          │reverb    │
                      └──────────┘

═══════════════════════════════════════════════════════════════════════

KIOSK PC (Windows 10 — separato, sul posto)

┌──────────────────────────────────────────────────────────────────┐
│  Google Chrome — kiosk mode                                      │
│  └── Stessa React app (rsmioni.it) — route /kiosk               │
│       ├── WebRTC (getUserMedia, RTCPeerConnection)               │
│       ├── Laravel Echo (Reverb WebSocket)                        │
│       └── Fetch locale → http://localhost:PORT (kiosk agent)    │
│                                                                  │
│  Node.js Kiosk Agent (processo locale Windows)                   │
│  ├── /pos/set-amount         → scrive SRINPF.TXT (INGENICO)      │
│  ├── /pos/get-result         → legge SROUTF.TXT                  │
│  ├── /pos/mypos/*            → interfaccia COM myPOS             │
│  ├── /printer/print          → stampa via default printer        │
│  ├── /system/restart         → shutdown /r /t 0                  │
│  └── /bell/listen            → Web Audio threshold (mock/real)  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Realtime: Reverb + Laravel Echo + WebRTC

### Canali Broadcasting

| Canale | Tipo | Scopo |
|--------|------|-------|
| `presence-hotel.{hotelId}` | Presence | Presenza e stato di tutti i chioschi dell'hotel visibile a tutti i receptionist connessi |
| `private-kiosk.{chioscoId}` | Private | Comandi dal server al chiosco specifico (messaggio attesa, comando stampa, logout, restart) |
| `private-receptionist.{userId}` | Private | Notifiche al receptionist (chiamata in arrivo, aggiornamento stato) |
| `signaling.{sessionId}` | Private | Forwarding messaggi WebRTC SDP/ICE tra receptionist e chiosco |

### Flusso Signaling WebRTC tramite Reverb

```
Receptionist                  Reverb (Laravel)               Chiosco
     │                              │                             │
     │── Join signaling.{sid} ─────►│◄── Join signaling.{sid} ───│
     │                              │                             │
     │── sdp_offer ────────────────►│── broadcast to kiosk ──────►│
     │◄───────────────── sdp_answer ─── broadcast to receptionist ─│
     │── ice_candidate ────────────►│── broadcast to kiosk ──────►│
     │◄──────────────── ice_candidate ─ broadcast to receptionist ─│
     │                              │                             │
     │════════════════ WebRTC P2P media stream ══════════════════│
```

Reverb fa solo **message forwarding** — non tocca il media. La connessione audio/video è P2P tra i due browser.

### Stato Chioschi in Redis

```json
{
  "kiosk_state:{chioscoId}": {
    "stato": "IN_PARLATO",
    "receptionist_id": "uuid",
    "nascosti": ["uuid-r2", "uuid-r3"],
    "messaggio_attesa": false,
    "condivisione_schermo": false,
    "updated_at": "2026-04-21T10:30:00Z"
  }
}
```

Il `ConcurrencyService` legge Redis atomicamente (lock Lua script) prima di ogni connessione per verificare N ≤ hotel.chioschi_concorrenti_max.

---

## Struttura Directory Progetto

```
rsmioni/                           ← root Laravel
├── app/
│   ├── Http/
│   │   ├── Controllers/
│   │   │   ├── Auth/
│   │   │   ├── PortineriaController.php
│   │   │   ├── PrenotazioneController.php
│   │   │   ├── CameraController.php
│   │   │   ├── RegolamentoController.php
│   │   │   ├── DocumentoController.php
│   │   │   └── PagamentoController.php
│   │   ├── Middleware/
│   │   │   ├── RoleGuard.php
│   │   │   └── IpWhitelist.php
│   │   └── Requests/              ← Form Requests (validazione + auth)
│   ├── Models/
│   │   ├── Hotel.php
│   │   ├── Chiosco.php
│   │   ├── Utente.php
│   │   ├── Camera.php
│   │   ├── Prenotazione.php
│   │   ├── Documento.php
│   │   ├── Pagamento.php
│   │   ├── Regola.php
│   │   └── ValorizzazioneRegola.php
│   ├── Policies/                  ← Auth policies per ruolo
│   ├── Services/
│   │   ├── ConcurrencyService.php
│   │   ├── CalendarService.php
│   │   ├── DocumentService.php
│   │   ├── POSService.php
│   │   └── VideoSignalingService.php
│   ├── Events/                    ← Broadcasting events
│   │   ├── ChioscoStatoChanged.php
│   │   ├── ChiamataInArrivo.php
│   │   └── SignalingMessage.php
│   └── Jobs/
│       ├── SendDocumentLinkEmail.php
│       ├── AutoCancelPrenotazioni.php
│       └── CleanupExpiredLinks.php
│
├── resources/
│   ├── js/                        ← React + TypeScript (Inertia pages)
│   │   ├── Pages/
│   │   │   ├── Auth/Login.tsx
│   │   │   ├── Portineria/
│   │   │   │   ├── Index.tsx      ← griglia chioschi + videochat
│   │   │   │   └── Dati/
│   │   │   │       ├── Prenotazioni/
│   │   │   │       └── Regolamento/
│   │   │   ├── Kiosk/Index.tsx    ← fullscreen kiosk
│   │   │   ├── Prenotazioni/      ← albergatore
│   │   │   ├── Camere/
│   │   │   └── Regolamento/
│   │   ├── Components/            ← Shared components
│   │   │   ├── Tabella/
│   │   │   ├── Modali/
│   │   │   ├── Portineria/
│   │   │   └── Kiosk/
│   │   ├── hooks/
│   │   │   ├── useWebRTC.ts
│   │   │   ├── useReverb.ts
│   │   │   ├── useKioskAgent.ts
│   │   │   └── useChioscoStato.ts
│   │   └── types/
│   └── css/
│
├── database/
│   ├── migrations/
│   ├── seeders/
│   │   └── RegoleSeeder.php       ← 25+ regole predefinite
│   └── factories/
│
├── routes/
│   ├── web.php                    ← Inertia routes
│   └── channels.php               ← Reverb channel authorization
│
├── kiosk-agent/                   ← Sottodirectory separata
│   ├── package.json
│   ├── index.js                   ← Express server locale
│   ├── adapters/
│   │   ├── ingenico.js
│   │   ├── mypos.js
│   │   ├── printer.js
│   │   └── bell.js
│   └── README-installazione.md
│
└── docs/
```

---

## Kiosk Agent Node.js

Il kiosk agent è un **server HTTP locale** (Express) che gira sul PC Windows del chiosco. Non è parte del server applicativo — è un sidecar hardware-only.

```
Chrome (React app su rsmioni.it)
    │
    └── fetch('http://localhost:3500/pos/set-amount', { amount: 90 })
    └── fetch('http://localhost:3500/pos/get-result')
    └── fetch('http://localhost:3500/printer/print', { url: '...' })
    └── fetch('http://localhost:3500/system/restart')
```

CORS: configurato per accettare solo origin `rsmioni.it` (o `localhost` in dev).

### Adapter Interface (TypeScript/JS)

```javascript
// adapters/pos.js
class INGENICOAdapter {
  async setAmount(amount) { /* scrive SRINPF.TXT */ }
  async getResult()       { /* legge SROUTF.TXT, parse formato */ }
}

class MyPOSAdapter {
  async setAmount(amount) { /* COM port + myPOSK.exe protocol */ }
  async getResult()       { /* legge file output myPOS */ }
}

class MockPOSAdapter {
  async setAmount(amount) { /* simula delay 20s, risposta OK */ }
  async getResult()       { return { esito: 'OK', importo: amount, data: new Date() } }
}
```

---

## Sicurezza

| Layer | Meccanismo |
|-------|-----------|
| Auth utente | Laravel Session + Sanctum (cookie HttpOnly, CSRF) |
| Autologin chiosco | Token crittografato in localStorage + verifica server a ogni avvio |
| Logout chiosco (ESC) | Invalidazione token lato server + clear localStorage |
| Autorizzazione | Laravel Policies (una policy per modello) + Form Request `authorize()` |
| IP whitelist | Middleware IpWhitelist su login per profilo RECEPTIONIST |
| WebSocket auth | Laravel Echo channel authorization via HTTP endpoint autenticato |
| Documenti | Storage privato + signed URL temporanei (Storage::temporaryUrl) |
| Upload | Validazione MIME + estensione + dimensione in Form Request |
| Kiosk agent | Accetta solo connessioni localhost; CORS origin-locked |
| Link temporanei | Token UUID random, scadenza configurabile, single-use opzionale |

---

## Deployment

```
Server (VPS / Cloud)
├── PHP 8.3 + php-fpm
├── Nginx (proxy + servizio asset Vite builded)
├── Laravel (web + queue worker + scheduler)
├── Laravel Reverb (processo separato: php artisan reverb:start)
├── Redis 7
├── PostgreSQL 16
└── Storage S3 o locale

Kiosk PC (Windows 10 — in loco)
├── Google Chrome (kiosk mode)
├── Node.js 22 LTS (kiosk agent)
└── Software POS (DoremiPos / myPOS driver)
```

### Processi da tenere vivi (Supervisor / systemd)

```
[program:laravel-worker]
command=php artisan queue:work redis --sleep=3 --tries=3

[program:laravel-reverb]
command=php artisan reverb:start --host=0.0.0.0 --port=8080

[program:laravel-scheduler]
# crontab: * * * * * cd /var/www/rsmioni && php artisan schedule:run
```

---

## Punti di Rischio e Mitigazioni

| Rischio | Impatto | Mitigazione |
|---------|---------|------------|
| WebRTC su reti NAT/firewall aziendali | Nessuna videochat | STUN Google pubblico + TURN coturn self-hosted |
| Latenza file interscambio POS INGENICO | Esito non immediato | Polling manuale receptionist (già da manuale) |
| Reverb sotto carico elevato | Ritardo notifiche | Reverb è event-loop; scalabile orizzontalmente con Redis pub/sub adapter |
| Concorrenza N — race condition | Superamento limite hotel | Lock atomico Redis con Lua script nel ConcurrencyService |
| Chrome kiosk + stampa | Dipende da flag --kiosk-printing | Test obbligatorio su Windows 10 reale in fase collaudo |
| Campanello analogico — falsi positivi | Chiamate non volute | Soglia configurabile per installazione |
