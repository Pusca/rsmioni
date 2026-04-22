# 08 — Backlog e Roadmap MVP

## Stack di riferimento

Laravel 12 + Inertia + React + TypeScript + Tailwind + PostgreSQL + Redis + Laravel Reverb + WebRTC + Node.js Kiosk Agent

---

## Struttura Milestone

| Milestone | Nome | Obiettivo |
|-----------|------|-----------|
| M0 | Fondamenta | Progetto avviabile, auth funzionante, routing per profilo |
| M1 | Portineria Core | Griglia chioschi, stati realtime, videochat completa |
| M2 | Kiosk | Schermata chiosco fullscreen, chiamata, ricezione video |
| M3 | Dati e Prenotazioni | Sezione DATI con tutte le operazioni CRUD prenotazioni |
| M4 | Documenti | Upload, acquisizione webcam, download, email, viewer |
| M5 | Camere e Regolamento | CRUD camere (albergatore), regolamento multi-lingua |
| M6 | POS e Stampa | Pagamento POS remoto, stampa remota su chiosco |
| M7 | Kiosk Agent | Node.js agent Windows: POS reale, stampante, campanello |
| M8 | Produzione | Deploy, collaudo, configurazioni, risoluzione problemi |

---

## M0 — Fondamenta

**Goal**: `php artisan serve` funziona, il login indirizza al profilo corretto, lo schema DB è completo.

### M0.1 — Setup Progetto
- [ ] `laravel new rsmioni` con Inertia + React + TypeScript + Tailwind
- [ ] Configurazione PostgreSQL (`.env`, `database.php`)
- [ ] Configurazione Redis (cache, queue, session)
- [ ] Installazione e configurazione Laravel Reverb
- [ ] Vite configurato con HMR per React TSX
- [ ] Docker Compose per sviluppo locale (PHP, PostgreSQL, Redis)
- [ ] `.env.example` documentato

### M0.2 — Schema DB
- [ ] Migration: `hotels` (id, nome, indirizzo, giorni_visibilita_calendario, overbooking_permesso, delega_rs_mioni, giorni_cancellazione_automatica, chioschi_concorrenti_max, data_inizio_contratto, data_fine_contratto)
- [ ] Migration: `turni_orario` (hotel_id, ora_inizio, ora_fine)
- [ ] Migration: `chioschi` (id, hotel_id, nome, tipo, interattivo, has_pos, tipo_pos, has_stampante, path_input_pos, path_output_pos, path_config_pos)
- [ ] Migration: `users` (id, username, email, password, profilo, ip_whitelist json, active)
- [ ] Migration: `hotel_user` (pivot hotel ↔ utente con hotel_ids array o tabella pivot)
- [ ] Migration: `camere` (id, hotel_id, nome, tipo, piano, booking_consentito, letti*, dotazioni*, codice_chiave, mq, quadro_elettrico)
- [ ] Migration: `prezzi_camera` (camera_id, tipo_occupazione, prezzo, valuta)
- [ ] Migration: `prenotazioni` (id, hotel_id, codice, check_in, check_out, pax json, nome, cognome, gruppo, tipo_pagamento, documento_identita, checkin_confermato, checkin_confermato_at, prezzo, overbooking, inserito_da, inserito_da_profilo, camere json)
- [ ] Migration: `documenti` (id, contesto_tipo, contesto_id, titolo, lingua, tipo_documento, estensione, storage_path, inserito_da, inserito_da_profilo)
- [ ] Migration: `pagamenti` (id, prenotazione_id, chiosco_id, importo_richiesto, valuta, esito, importo_effettivo, tipo_pos, data_operazione, eseguito_da)
- [ ] Migration: `regole` (id, codice, categoria, ordine)
- [ ] Migration: `valorizzazioni_regola` (id, regola_id, hotel_id, lingua, testo)
- [ ] Migration: `links_temporanei` (id, documento_id, token, destinatario_email, testo_receptionist, hotel_id, scadenza_at, usato)
- [ ] Seeder: `RegoleSeeder` — 25+ regole predefinite con categorie
- [ ] Seeder: `DemoSeeder` — 1 hotel, 2 chioschi, 3 camere, 1 receptionist, 1 albergatore
- [ ] Eloquent Models per ogni tabella con relazioni

### M0.3 — Autenticazione
- [ ] Controller `Auth/LoginController` (form login → sessione Laravel)
- [ ] Middleware `RoleGuard` — verifica profilo per route group
- [ ] Middleware `IpWhitelist` — controlla IP per profilo RECEPTIONIST
- [ ] Route group per profilo: receptionist, albergatore, chiosco
- [ ] Post-login redirect basato su profilo:
  - R/RL → `/portineria`
  - H → `/prenotazioni`
  - K → `/kiosk`
- [ ] Logout (`/logout` → invalida sessione)
- [ ] Autologin chiosco: token crittografato in localStorage + verifica al boot
- [ ] Selezione chiosco al primo login (K): form con lista chioschi dell'hotel
- [ ] Logout kiosk via ESC: JS event listener → dialog conferma → invalida token → reload

### M0.4 — Pagina Login (UI)
- [ ] Dark screen centrata, logo RS Mioni
- [ ] Form: username, password, bottone ACCEDI
- [ ] Errori: credenziali errate, IP bloccato
- [ ] Form selezione chiosco (primo login K)

---

## M1 — Portineria Core

**Goal**: Un receptionist logga, vede la griglia chioschi in realtime, può aprire/chiudere collegamenti chiaro e nascosto.

### M1.1 — Layout Portineria
- [ ] Pagina Inertia `/portineria` (React)
- [ ] Header con navigazione (icone portineria, DATI toggle, profilo, logout)
- [ ] Split screen: area video sinistra 55% + griglia chioschi destra 45%
- [ ] Componente `CellaChiosco` (nome hotel, nome chiosco, icone stato)
- [ ] Griglia responsive CSS grid per N chioschi

### M1.2 — Presenza Chioschi via Reverb
- [ ] Channel authorization: `presence-hotel.{hotelId}` (receptionist dell'hotel)
- [ ] Channel authorization: `private-kiosk.{chioscoId}` (chiosco specifico)
- [ ] Evento `ChioscoStatoChanged` — broadcasta su `presence-hotel.{hotelId}`
- [ ] Frontend: `useReverb.ts` hook — sottoscrive canale, aggiorna stato locale
- [ ] Redis: struttura stato per chiosco (vedi architettura)
- [ ] Icone stato dinamiche in `CellaChiosco` basate su stato Redis

### M1.3 — Signaling WebRTC
- [ ] Channel `signaling.{sessionId}` privato
- [ ] Evento `SignalingMessage` (tipo: offer/answer/ice/state-change)
- [ ] `VideoSignalingService`: forward SDP/ICE tramite Broadcasting
- [ ] Frontend: `useWebRTC.ts` hook — gestisce RTCPeerConnection, ICE, SDP
- [ ] Configurazione STUN (Google public: stun.l.google.com:19302)
- [ ] Mock TURN locale (dev only)

### M1.4 — Collegamento Nascosto
- [ ] `ConcurrencyService::canConnect(chioscoId, hotelId, tipo)` — verifica N ≤ max (con Redis lock)
- [ ] `TurnoService::isOperativo(hotelId)` — controlla orari contrattuali
- [ ] Controller action: `POST /portineria/collegamento/nascosto/{chiosco}`
- [ ] Aggiornamento stato Redis: `IN_NASCOSTO`, push utente in lista nascosti
- [ ] Broadcast `ChioscoStatoChanged` a tutti i receptionist dell'hotel
- [ ] Frontend: click 🟡 → WebRTC offer → stream video unidirezionale (R vede K)
- [ ] Icona gialla sottolineata quando attivo
- [ ] Azione: chiudi collegamento → `DELETE /portineria/collegamento/{chiosco}`
- [ ] Disponibile per Receptionist Lite

### M1.5 — Collegamento in Chiaro
- [ ] Verifica vincolo: nessun altro `IN_CHIARO` già attivo su quel chiosco
- [ ] Controller action: `POST /portineria/collegamento/chiaro/{chiosco}`
- [ ] WebRTC stream bidirezionale (video only, senza microfono — `audio: false`)
- [ ] Kiosk riceve stream receptionist e mostra video
- [ ] Icona verde sottolineata con barra rossa
- [ ] Azioni disponibili in `CellaChiosco`: 🟡 passa a nascosto, ✉️ messaggio attesa, 📵 chiudi, 🗣️ parla

### M1.6 — Collegamento in Parlato
- [ ] Upgrade stream: aggiunge tracce audio (`getUserMedia({ audio: true, video: true })`)
- [ ] Video chiosco si sposta nel pannello sinistro grande
- [ ] Aggiornamento stato Redis: `IN_PARLATO`
- [ ] Icone disponibili: 🖥️ condivisione, 📵 chiudi, ↩️ ritorna a chiaro
- [ ] Attivabile da: click 🗣️ da chiaro/nascosto, risposta a chiamata

### M1.7 — Chiamata dal Chiosco
- [ ] Evento `ChiamataInArrivo` — broadcasta su `presence-hotel.{hotelId}`
- [ ] Frontend: receive evento → mostra cornetta lampeggiante in `CellaChiosco`
- [ ] Persistenza chiamata in Redis finché non risponde qualcuno
- [ ] Notifica banner in alto sx se pannello DATI aperto
- [ ] Click cornetta → avvia PARLATO (come risposta)
- [ ] Alla risposta: broadcast `ChiamataRisolta` → rimuove cornetta da tutti i receptionist
- [ ] Receptionist Lite: icona cornetta visiva, non cliccabile

### M1.8 — Messaggio Attesa
- [ ] Azione disponibile: in `IN_CHIARO` o in `IN_CHIAMATA`
- [ ] Broadcast `MessaggioAttesaChanged` al chiosco + a tutti i receptionist dell'hotel
- [ ] Toggle on/off con stato in Redis
- [ ] Sincronizzazione icona sottolineata su tutti i client dell'hotel
- [ ] Disattivazione automatica quando qualcuno risponde alla chiamata

### M1.9 — Condivisione Schermo
- [ ] `getDisplayMedia()` nel browser receptionist
- [ ] Sostituzione video track nella RTCPeerConnection verso chiosco
- [ ] Toggle: attiva/disattiva con ripristino webcam
- [ ] Disponibile solo in `IN_PARLATO`

---

## M2 — Kiosk

**Goal**: Il chiosco si connette, il receptionist lo vede, il cliente può chiamare.

### M2.1 — Layout Kiosk
- [ ] Route `/kiosk` — Inertia page React fullscreen
- [ ] CSS: 100vw × 100vh, dark, nessun header
- [ ] Icona stato connessione in alto sx (verde = OK)
- [ ] Area video centrale (receptionist)

### M2.2 — Boot e Autologin
- [ ] Al load: legge token da localStorage → verifica → join canale Reverb
- [ ] Se token invalido: redirect a login
- [ ] Join `presence-hotel.{hotelId}`: annuncia presenza chiosco
- [ ] Aggiornamento stato Redis: `IDLE`

### M2.3 — Chiamata Touch
- [ ] Messaggio multilingua: "Tocca lo schermo per chiamare" (IT, EN, FR, DE, ES)
- [ ] Handler touchstart/click → emit evento `chiamata_in_arrivo` via canale Reverb
- [ ] Animazione circolare pulsante per ~20 sec
- [ ] Testo "Connessione in corso..."

### M2.4 — Chiamata Analogica (Mock)
- [ ] Accesso microfono: `getUserMedia({ audio: true })`
- [ ] Web Audio API: `AnalyserNode` con threshold configurabile
- [ ] Soglia letta da query param o localStorage
- [ ] Bottone "Simula campanello" visibile solo in dev mode

### M2.5 — Visualizzazioni Kiosk
- [ ] Ricezione stream video receptionist (da WebRTC)
- [ ] Messaggio attesa: testo lampeggiante multilingua (evento Reverb)
- [ ] Condivisione schermo: stream ricevuto prende il posto del video receptionist
- [ ] Stato IDLE: schermata neutra con indicatore connessione

---

## M3 — Dati e Prenotazioni

**Goal**: Receptionist apre DATI, vede lista prenotazioni, può creare/modificare/cancellare rispettando tutti i vincoli.

### M3.1 — Pannello DATI
- [ ] Toggle apertura/chiusura: sovrappone la griglia destra
- [ ] Selezione hotel (dropdown; default: hotel del PARLATO attivo da Redis)
- [ ] Sub-navigazione: Prenotazioni, Regolamento

### M3.2 — Lista Prenotazioni
- [ ] `PrenotazioneController@index` — query con filtri, paginazione
- [ ] `CalendarService::maskDate(date, hotel)` — restituisce null se fuori visibilità
- [ ] Tabella densa: INFO⚠️, CODICE, CHECK-IN, CHECK-OUT*, PAX, NOME, CAMERE, PAGAMENTO, DOCUMENTO, AZIONI
- [ ] Icone stato pagamento (✅ / 💳) e documento (✅ / 📷)
- [ ] Tooltip su ⚠️ INFO
- [ ] Paginazione: selettore 10/25/30/50 + navigazione pagine
- [ ] Colonna AZIONI: appaiono al hover (cestino, matita, occhio)
- [ ] Icone extra in PARLATO: 📷 acquisizione, 💳 POS (solo se chiosco ha POS)

### M3.3 — Dettaglio Prenotazione (sola lettura)
- [ ] Pannello modale/side panel
- [ ] Tutti i campi in sola lettura
- [ ] Lista camere con icona 👁 per dettaglio camera
- [ ] Sezione DOCUMENTI: lista doc con azioni

### M3.4 — Inserimento Prenotazione
- [ ] Form React con tutti i campi (vedi entità)
- [ ] Validazione client: campi obbligatori, date
- [ ] `PrenotazioneRequest::authorize()` — verifica profilo
- [ ] `PrenotazioneRequest::rules()` — validazione date con `CalendarService`
- [ ] Pannello "Aggiungi camere": `GET /camere/disponibili?hotel_id&check_in&check_out`
  - `CameraService::disponibili()` — filtra per prenotazioni esistenti nel periodo
- [ ] Selezione multi-camera
- [ ] `ConcurrencyService` — verifica overbooking se non permesso
- [ ] Risposta errori espliciti per ogni vincolo violato

### M3.5 — Modifica Prenotazione
- [ ] Stessa form pre-popolata
- [ ] Regole modifica date: `CalendarService::validateDateModifica()`
- [ ] `checkin_confermato`: campo immutabile dopo primo set → read-only in form
- [ ] Sezione DOCUMENTI nel pannello modifica

### M3.6 — Cancellazione Prenotazione
- [ ] `PrenotazionePolicy::delete()`: blocca se albergatore o se ha pagamento POS
- [ ] Dialog conferma
- [ ] Cascade delete documenti (storage + DB)
- [ ] Soft delete opzionale (assumption: hard delete per ora)

### M3.7 — Auto-Cancellazione Prenotazioni
- [ ] `AutoCancelPrenotazioni` Job
- [ ] `schedule()->daily()` nel Kernel
- [ ] Query: `check_out + hotel.giorni_cancellazione_automatica < today`
- [ ] Cascade delete documenti

---

## M4 — Documenti

**Goal**: Upload, download, email e acquisizione webcam funzionanti.

### M4.1 — Upload Documento
- [ ] `DocumentoController@store` — multipart/form-data
- [ ] Validazione: `mimes:pdf,png,jpg,jpeg`, `max:10240` (10MB)
- [ ] `DocumentService::store()` → `Storage::put()` su disco configurato
- [ ] Salvataggio metadata in DB

### M4.2 — Download / Apertura
- [ ] `DocumentoController@show` — verifica auth + policy
- [ ] Apertura in nuovo tab: `Content-Type` appropriato
- [ ] Download: `Content-Disposition: attachment`
- [ ] Signed URL (se S3): `Storage::temporaryUrl()`

### M4.3 — Invio Email (Link Temporaneo)
- [ ] `DocumentoController@inviaEmail`
- [ ] Genera `LinkTemporaneo` con token UUID + scadenza 48h
- [ ] Dispatcha Job `SendDocumentLinkEmail` in coda
- [ ] `Mailable`: mittente `noreply@rsmioni.it`, oggetto nome hotel, body con link
- [ ] Route pubblica: `GET /documento/{token}` → verifica scadenza → serve file
- [ ] Job `CleanupExpiredLinks` giornaliero

### M4.4 — Cancellazione Documento
- [ ] `DocumentoPolicy::delete()`: blocca receptionist su doc di albergatore
- [ ] Dialog conferma UI
- [ ] `Storage::delete()` + hard delete DB

### M4.5 — Acquisizione Documento via Webcam (Kiosk)
- [ ] Kiosk: `getUserMedia({ video: true })` — stream webcam
- [ ] Canvas: `drawImage()` + `toBlob()` — cattura frame
- [ ] Invio Blob al backend via POST come file upload
- [ ] Frontend receptionist: vede preview della cattura
- [ ] Form: tipo documento (select), titolo (opzionale), bottone CARICA
- [ ] Dopo carico: documento appare in lista DOCUMENTI della prenotazione

### M4.6 — Viewer Documenti
- [ ] Componente `ViewerDocumenti`
- [ ] Aggregazione lato controller: doc prenotazione + doc camere + doc regolamento
- [ ] Checkbox selezione multi-documento
- [ ] Bottone "VEDI IMMAGINI" (visibile con almeno 1 selezionato)
- [ ] Viewer: dropdown selezione documento in alto, area visualizzazione (iframe PDF / img)

---

## M5 — Camere e Regolamento

**Goal**: Albergatore gestisce camere e valorizza il regolamento.

### M5.1 — Lista e CRUD Camere
- [ ] `CameraController@index` — lista con paginazione
- [ ] Tabella densa con tutte le colonne (vedi specifica UI)
- [ ] Tooltip LETTI (testo esteso)
- [ ] Icone dotazioni
- [ ] Colonna AZIONI: cestino, matita, occhio
- [ ] `CameraController@store/@update` — con `CameraRequest`
- [ ] `CameraController@destroy` — cascade: prenotazioni + documenti camera
- [ ] Dialog conferma cancellazione con avviso cascade
- [ ] `CameraPolicy`: solo albergatore può modificare/cancellare

### M5.2 — Lista Camere (Receptionist — ridotta)
- [ ] Scope: solo camere con `booking_consentito = true` dell'hotel
- [ ] Visibile nella selezione camere delle prenotazioni

### M5.3 — Lista Regolamento
- [ ] `RegolamentoController@index` — lista regole per hotel + lingua
- [ ] Seed DB: 25+ regole predefinite con categoria e ordine
- [ ] Indicatore "valorizzata / non valorizzata" per hotel selezionato
- [ ] Azioni albergatore: matita (valorizza)
- [ ] Azioni receptionist: occhio (sola lettura), email su documenti

### M5.4 — Valorizzazione Regola
- [ ] `RegolamentoController@update`
- [ ] Form: selezione lingua, textarea testo, sezione documenti con +
- [ ] Documenti condivisi fra tutte le lingue della stessa regola per hotel
- [ ] `RegolamentoPolicy`: solo albergatore può valorizzare

---

## M6 — POS e Stampa

**Goal**: Il receptionist in PARLATO può avviare il pagamento POS e stampare documenti.

### M6.1 — Pannello POS (UI)
- [ ] Componente `PannnelloPagamento` (disponibile solo in PARLATO + chiosco hasPOS)
- [ ] Campo importo + "Imposta prezzo"
- [ ] Istruzioni passo-passo visive (① ② ③)
- [ ] Bottone "Verifica pagamento"
- [ ] Display esito formattato
- [ ] Tooltip storico pagamenti sul campo prezzo prenotazione

### M6.2 — API POS (Mock → Real)
- [ ] `PagamentoController@impostaPrezzo` — salva record Pagamento con esito PENDING
- [ ] `PagamentoController@verificaEsito` — legge risultato dal kiosk agent
- [ ] Comunicazione con kiosk agent: `fetch('http://localhost:3500/pos/...')` dal browser kiosk
- [ ] Mock: risposta simulata con delay configurabile
- [ ] Traccia pagamenti in DB con tooltip

### M6.3 — Stampa Remota
- [ ] Icona stampa su documenti (visibile solo se IN_PARLATO + chiosco hasStampante)
- [ ] Click → invia evento Reverb al chiosco: `{ type: 'print', url: signedDocumentUrl }`
- [ ] Kiosk riceve evento → fetch kiosk agent: `POST /printer/print { url }`
- [ ] Agent: scarica file, lo apre in iframe nascosto, `window.print()`
- [ ] Chrome `--kiosk-printing`: stampa senza dialog di conferma

---

## M7 — Kiosk Agent Node.js

**Goal**: Il kiosk agent Windows gestisce POS reale, stampante, campanello analogico.

### M7.1 — Setup Agent
- [ ] Express server su porta 3500 (localhost only)
- [ ] CORS: `origin: ['https://rsmioni.it', 'http://localhost']`
- [ ] Struttura adapter con interfaccia comune

### M7.2 — POS INGENICO
- [ ] `INGENICOAdapter`: scrittura `SRINPF.TXT`, lettura `SROUTF.TXT`
- [ ] Parsing formato esito: `OK-90.0EUR TIME:...`, `KO-COMMAND_KO TIME:...`, `KO-NO_FILE`
- [ ] Config path via `config.json` locale

### M7.3 — POS myPOS
- [ ] `MyPOSAdapter`: comunicazione con `myPOSK.exe` via file interscambio su COM port
- [ ] Config: PORT = COM? in `config.txt`

### M7.4 — Stampante
- [ ] `PrinterAdapter`: iframe + `window.print()` su URL firmato
- [ ] Test con Chrome `--kiosk-printing`

### M7.5 — Campanello Analogico
- [ ] `BellAdapter`: `getUserMedia({ audio: true })` + `AnalyserNode`
- [ ] Threshold configurabile via `config.json`
- [ ] Debounce per evitare falsi positivi
- [ ] Endpoint `GET /bell/status` per polling

### M7.6 — Risoluzione Problemi
- [ ] Endpoint `POST /system/logout` → notifica all'app React → invalida token → reload
- [ ] Endpoint `POST /system/restart` → `require('child_process').exec('shutdown /r /t 0')`

---

## M8 — Produzione

**Goal**: Sistema deployato, collaudato, documentato.

### M8.1 — Deploy
- [ ] Configurazione Nginx (proxy PHP-FPM + WebSocket Reverb)
- [ ] Supervisor per queue worker + Reverb
- [ ] Crontab per scheduler
- [ ] `.env` produzione (SMTP, S3/storage, Redis, DB, STUN/TURN)
- [ ] SSL/HTTPS su rsmioni.it + rsmioni.com

### M8.2 — Cambio Password
- [ ] `Auth/CambioPasswordController`
- [ ] Form con validazione (vecchia pwd, nuova, conferma)
- [ ] Non disponibile per profilo CHIOSCO (rotta bloccata da middleware)

### M8.3 — Configurazioni Hotel (Admin)
- [ ] Seed o pannello minimale per creare hotel, chioschi, utenti
- [ ] Procedura documentata per onboarding nuovo hotel

### M8.4 — Collaudo Chiosco
- [ ] Checklist collaudo (vedi Flow 20 in docs/04)
- [ ] Script seed prenotazione di test
- [ ] Verifica: videochat, POS, stampa, campanello, autologin

### M8.5 — Risoluzione Problemi (UI Receptionist)
- [ ] Menu `...` in cella chiosco: Logout/Login, Restart PC
- [ ] Azioni inviate via evento Reverb al canale privato chiosco
- [ ] Kiosk agent risponde ai comandi

### M8.6 — Profili Futuri (post-v1.0)
- [ ] Gestore Receptionist: gestione utenze, associazione hotel, IP whitelist
- [ ] Amministratore: CRUD hotel, contratti, configurazioni piattaforma

---

## Ordine di Esecuzione Suggerito

```
M0 (2-3 settimane) → M1 (3-4 settimane) → M2 (1-2 settimane)
    └─ M3 (2-3 settimane) → M4 (2 settimane) → M5 (1-2 settimane)
        └─ M6 (1-2 settimane) → M7 (2-3 settimane, su HW reale) → M8 (1-2 settimane)
```

M0 + M1 + M2 costituiscono il **nucleo dimostrabile** del sistema (la videochat funziona, i chioschi si vedono in griglia, le chiamate arrivano).

M3 + M4 + M5 completano la **parte gestionale** (dati operativi del receptionist e dell'albergatore).

M6 + M7 richiedono **hardware reale** e vanno sviluppati in parallelo con il testing su kiosk fisico.

M8 è il **collaudo e go-live**.
