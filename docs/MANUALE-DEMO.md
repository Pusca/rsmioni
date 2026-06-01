# RS Mioni — Manuale d'Uso Demo

> Versione: 1.0 — 1 Giugno 2026
> Ambiente: Sviluppo locale (Laravel 13.5 + Inertia/React + SQLite)

---

## 1. Avvio del Sistema

### Prerequisiti
- PHP 8.2+, Node.js 18+, Composer
- Il progetto è già configurato con SQLite (nessun DB esterno necessario)

### Comandi di avvio

Aprire **3 terminali** nella cartella del progetto:

```bash
# Terminale 1 — Backend Laravel
php artisan serve

# Terminale 2 — Frontend Vite (hot reload)
npm run dev

# Terminale 3 — WebSocket Reverb (per realtime)
php artisan reverb:start
```

L'applicazione sarà disponibile su **http://localhost:8000**

### Reset dati demo (se necessario)

```bash
php artisan migrate:fresh --seed
```

Questo ricrea il database con tutti i dati di esempio.

---

## 2. Credenziali di Accesso

| Utente | Username | Email | Password | Profilo | Destinazione post-login |
|--------|----------|-------|----------|---------|------------------------|
| Receptionist | `receptionist` | receptionist@demo.rsmioni.it | `password` | Receptionist | `/portineria` |
| Receptionist Lite | `receptionist_lite` | lite@demo.rsmioni.it | `password` | Receptionist Lite | `/portineria` |
| Gestore Hotel | `gestore` | gestore@demo.rsmioni.it | `password` | Gestore Hotel | `/prenotazioni` |
| Chiosco | `chiosco_demo` | chiosco@demo.rsmioni.it | `password` | Chiosco | `/kiosk` |

---

## 3. Dati Demo Precaricati

| Entita | Quantita | Dettagli |
|--------|----------|----------|
| Hotel | 1 | "Hotel Demo Mioni" |
| Chioschi | 2 | "Chiosco Ingresso", "Chiosco Sala" |
| Camere | 10 | Varie tipologie e piani |
| Prenotazioni | 8 | Periodi vari con dati ospite |
| Regole regolamento | 25+ | Categorie: accoglienza, servizi, sicurezza, ecc. |
| Valorizzazioni regole | Multi-lingua | Testi in italiano per ogni regola |

---

## 4. Flussi Dimostrabili per Profilo

### 4.1 RECEPTIONIST (login: `receptionist` / `password`)

Dopo il login si atterra sulla **Portineria** — la dashboard principale.

#### Griglia Chioschi
- Visualizzazione di tutti i chioschi con stato in tempo reale
- Icone di stato: online/offline, occupato, in chiamata
- Ogni chiosco mostra il suo stato corrente nella griglia

#### Collegamento Video (WebRTC)
- Cliccare su un chiosco per aprire il collegamento
- **Collegamento in chiaro**: videochiamata bidirezionale con il chiosco
- **Collegamento nascosto**: il receptionist vede il chiosco senza che l'ospite lo sappia
- Supporto TURN server (Metered.ca) per connettivita cross-device
- Pulsanti: avvia/chiudi sessione video

#### Gestione Documenti
- Upload documenti per il chiosco selezionato
- Acquisizione documento (da webcam del chiosco)
- Download, invio via email, cancellazione
- Viewer documenti integrato
- Link temporaneo per condivisione esterna

#### Pagamento POS
- Avvio richiesta pagamento verso il chiosco
- Monitoraggio stato pagamento
- Annullamento pagamento in corso

#### Stampa Remota
- Invio documento in stampa al chiosco
- Monitoraggio stato stampa
- Annullamento stampa in corso

#### Comandi Demo (solo ambiente sviluppo)
- **Simula chiamata**: simula una chiamata in arrivo da un chiosco
- **Reset demo**: riporta tutti i chioschi allo stato iniziale

### 4.2 GESTORE HOTEL (login: `gestore` / `password`)

#### Prenotazioni (`/prenotazioni`)
- **Lista prenotazioni**: tabella con filtri, ricerca, paginazione
- **Nuova prenotazione**: form completo con dati ospite, date, camera, tipo pagamento
- **Dettaglio prenotazione**: vista completa con tutte le informazioni
- **Modifica prenotazione**: aggiornamento dati esistenti
- **Cancellazione prenotazione**: con conferma
- **Assegnazione camere**: associazione camera a prenotazione

#### Camere (`/camere`)
- **Lista camere**: tutte le camere dell'hotel con dettagli
- **Nuova camera**: form con nome, tipo, piano, dotazioni, prezzo
- **Modifica camera**: aggiornamento dati
- **Cancellazione camera**: con conferma

#### Regolamento (`/regolamento`)
- **Lista regole**: tutte le regole organizzate per categoria
- **Dettaglio regola**: visualizzazione testo multi-lingua
- **Modifica valorizzazione**: editing del testo della regola per lingua

#### Configurazioni (`/configurazioni`)
- **Hotel**: modifica dati generali dell'hotel
- **Chioschi**: lista chioschi con stato
  - **Modifica chiosco**: nome, tipo, configurazioni hardware
  - **Installazione chiosco**: procedura guidata di setup
  - **Collaudo chiosco**: test di tutti i componenti (video, audio, POS, stampante)
  - **Diagnostica chiosco**: stato connessione, heartbeat, azioni di reset

### 4.3 CHIOSCO (login: `chiosco_demo` / `password`)

#### Selezione Chiosco (`/kiosk/seleziona`)
- Al primo accesso: scegliere quale chiosco fisico associare alla sessione

#### Schermata Kiosk (`/kiosk`)
- Interfaccia fullscreen per l'ospite
- **Chiama reception**: avvia chiamata verso la portineria
- **Annulla chiamata**: durante l'attesa
- **Stato**: visualizzazione stato corrente (idle, in chiamata, collegato)

#### Funzioni passive (attivate dalla reception)
- Ricezione videochiamata
- Acquisizione documento (webcam)
- Pagamento POS (interfaccia pagamento)
- Stampa remota (notifica stampa in corso)

#### Collaudo (`/kiosk/collaudo`)
- Test webcam, microfono, altoparlanti
- Test connessione POS
- Test stampante
- Report risultati

#### Diagnostica (`/kiosk/diagnostica`)
- Stato connessione realtime
- Heartbeat attivo
- Informazioni di sistema

---

## 5. Percorso Demo Consigliato (per la call)

### Scenario 1: "La giornata del receptionist" (~10 min)

1. **Login** come `receptionist` / `password`
2. Mostrare la **dashboard portineria** con la griglia chioschi
3. Aprire una **seconda finestra browser** e fare login come `chiosco_demo`
4. Selezionare "Chiosco Ingresso"
5. Dal chiosco: premere **"Chiama reception"**
6. Dalla portineria: mostrare la notifica e **accettare la chiamata**
7. Mostrare il **collegamento video** bidirezionale
8. Dalla portineria: mostrare le azioni disponibili (documenti, POS, stampa)
9. **Chiudere la sessione** dalla portineria

### Scenario 2: "Gestione prenotazioni" (~5 min)

1. **Login** come `gestore` / `password`
2. Mostrare la **lista prenotazioni** esistenti
3. **Creare una nuova prenotazione** con dati di esempio
4. Mostrare il **dettaglio** della prenotazione appena creata
5. Navigare alle **Camere** e mostrare la lista
6. Mostrare il **Regolamento** con le regole configurate

### Scenario 3: "Configurazione sistema" (~5 min)

1. Rimanere come `gestore`
2. Andare in **Configurazioni > Chioschi**
3. Mostrare la **diagnostica** di un chiosco
4. Mostrare la pagina di **collaudo**
5. Mostrare la pagina di **installazione**

---

## 6. Note Tecniche per la Demo

### Cosa funziona completamente
- Login/logout per tutti i profili
- Routing basato su profilo con redirect automatico
- Dashboard portineria con griglia chioschi
- CRUD completo prenotazioni
- CRUD completo camere
- Regolamento con valorizzazioni
- Configurazioni hotel e chioschi
- Installazione, collaudo e diagnostica chioschi
- Gestione documenti (upload, download, invio, cancellazione)
- Pagamento POS (flusso completo con mock)
- Stampa remota (flusso completo con mock)
- WebRTC videochiamata (con TURN server Metered.ca)
- WebSocket realtime via Laravel Reverb
- Interfaccia chiosco fullscreen
- Selezione chiosco al primo login
- Comandi demo (simula/reset)

### Elementi in modalita mock/simulazione
- **POS**: il pagamento viene simulato (nessun POS hardware collegato)
- **Stampante**: la stampa viene simulata (nessuna stampante collegata)
- **Webcam chiosco**: utilizza la webcam del browser come mock
- **Kiosk Agent**: lo stub Node.js non e' attivo — le funzioni hardware sono simulate via API

### Avvertenze per la demo
- Usare **Chrome o Edge** per la migliore compatibilita WebRTC
- Se il video non parte, verificare i permessi del browser per webcam/microfono
- Il WebSocket (Reverb) deve essere attivo per lo stato realtime dei chioschi
- Per testare la videochiamata tra 2 dispositivi diversi, serve HTTPS o localhost

---

## 7. Architettura (panoramica veloce)

```
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  Browser     │────►│  Laravel 13  │────►│   SQLite     │
│  React/TS    │◄────│  + Inertia   │     │   Database   │
└─────────────┘     └──────┬───────┘     └──────────────┘
                           │
                    ┌──────▼───────┐
                    │   Reverb     │  WebSocket realtime
                    │   (porta     │  (stati chioschi,
                    │    8080)     │   segnali WebRTC)
                    └──────────────┘
```

- **Frontend**: React + TypeScript + Tailwind CSS (via Inertia.js)
- **Backend**: Laravel 13.5 (PHP)
- **Database**: SQLite (dev) — migrabile a PostgreSQL per produzione
- **Realtime**: Laravel Reverb (WebSocket)
- **Video**: WebRTC peer-to-peer con TURN via Metered.ca
- **92 route** registrate (CRUD + API + WebRTC + Kiosk)

---

## 8. Prossimi Sviluppi Previsti

Riferimento: `docs/08-backlog-mvp.md`

| Milestone | Stato |
|-----------|-------|
| M0 — Fondamenta | Completato |
| M1 — Portineria Core | Completato |
| M2 — Kiosk | Completato |
| M3 — Dati e Prenotazioni | Completato |
| M4 — Documenti | Completato |
| M5 — Camere e Regolamento | Completato |
| M6 — POS e Stampa | Completato |
| M7 — Kiosk Agent | Stub (mock attivi) |
| M8 — Produzione | Da fare |

Il passaggio a produzione (M8) include: deploy su server, HTTPS, PostgreSQL, configurazioni avanzate, collaudo su hardware reale.
