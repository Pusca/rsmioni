# RS Mioni — Libretto d'uso rapido

> Aggiornato al 1 settembre 2026 (commit `7f7d381`). Test: **115 passati / 296 asserzioni**.
> Per la demo passo-passo vedi `MANUALE-DEMO.md`; per il deploy `10-deploy-produzione.md`.

---

## 0. Come siamo messi (una pagina)

| Area | Stato | Note |
|------|-------|------|
| Login, profili, redirect per ruolo | ✅ fatto | Receptionist, Receptionist Lite, Gestore hotel, Chiosco. Admin/Gestore Receptionist solo come enum. |
| Portineria (griglia chioschi, stati realtime) | ✅ fatto | Realtime via **Pusher** (Reverb è ancora in composer ma non è usato). |
| Collegamento in chiaro / nascosto / parlato | ✅ fatto | Media su **LiveKit Cloud** (SFU+TURN). Multi-chiamata con IN GESTIONE / IN ATTESA / Riprendi. |
| Chiamata dal chiosco, messaggio attesa (modificabile), condivisione schermo | ✅ fatto | |
| Documenti: upload, viewer, acquisizione live, cancellazione, invio email, link temporaneo | ✅ fatto | La mail parte, ma in prod il driver è ancora `log` → nessuna mail reale. |
| Stampa remota, pagamento POS | ⚠️ flusso completo **mock** | Il chiosco simula esito. Hardware reale = kiosk-agent (vedi sotto). |
| Prenotazioni / Camere / Regolamento (CRUD) | ✅ fatto | Camere hanno `prezzo_notte` + `descrizione` (fuori manuale, A28). |
| Configurazioni hotel + chioschi, installazione, collaudo, diagnostica | ✅ fatto | Alcune impostazioni hotel sono **salvate ma non hanno effetto** (vedi §7). |
| Receptionist AI vocale (self check-in / check-out) | ✅ Fasi 0–3 fatte, Fase 4 parziale | Worker Python separato. Vision documento solo via OpenRouter. Metriche aggregate mancanti. |
| Kiosk agent Node (POS/stampante/campanello reali) | ❌ stub | Codice scheletro in `kiosk-agent/`, **non usato** dal frontend. |
| Cambio password | ✅ fatto (1 set) | Icona chiave in alto a destra → `/password`. Vietato al profilo Chiosco. |
| Ponte Slope (import CSV prenotazioni) | ✅ fatto (1 set) | Bottone "Importa da Slope" in Prenotazioni (gestore) e comando `prenotazioni:importa-slope`. Da validare su un export vero. |
| Turni orario | ❌ manca | Esiste solo il modello `TurnoOrario`, nessuna logica. |
| Risoluzione problemi da portineria (Logout/Restart chiosco) | ❌ manca | Solo azioni soft dalla Diagnostica del gestore. |
| Produzione | ✅ online su VPS Hostinger | URL temporaneo sslip.io, dominio definitivo non collegato. |

**Sicurezza** — chiuse il 1 set: IDOR selezione chiosco, link temporanei (15 min dal primo accesso), lock su assegnazione camere, pulizia documenti solo su soggiorni conclusi. **Restano**: token worker AI statico (A26), password demo `password` sul VPS (→ `rsmioni:rimuovi-demo` + `rsmioni:crea-utente`), chiavi incollate in chat da ruotare, SMTP.

**Non committato**: `docs/marketing/` (brand identity + piano social).

---

## 1. Avvio locale

Doppio click su **`avvia-demo.bat`** → apre 3 finestre:

| Finestra | Comando | Serve a |
|----------|---------|---------|
| Server | `php artisan serve --port=8000` | App su http://localhost:8000 |
| Queue worker | `php artisan queue:work --tries=1 --timeout=0` | **Indispensabile**: gli eventi realtime passano dalla coda (`QUEUE_CONNECTION=database`). Senza, la griglia non si aggiorna. |
| Receptionist AI | `ai-receptionist\.venv\Scripts\python.exe agent.py dev` | Worker vocale. Se manca, i bottoni "Esegui il check-in/out" sul chiosco non rispondono. |

Frontend: gli asset di build sono committati; `npm run dev` serve solo se modifichi il React.

Reset dati demo: `php artisan migrate:fresh --seed`

Primo setup worker AI:
```
cd ai-receptionist
python -m venv .venv && .venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env      (poi compila)
python agent.py download-files
```

---

## 2. Account demo

| Username | Password | Profilo | Atterra su |
|----------|----------|---------|------------|
| `receptionist` | `password` | Receptionist | `/portineria` |
| `receptionist_lite` | `password` | Receptionist Lite | `/portineria` (solo nascosto, cornetta non cliccabile) |
| `gestore` | `password` | Gestore hotel | `/prenotazioni` |
| `chiosco_demo` | `password` | Chiosco | `/kiosk` → "Chiosco Ingresso" (Hotel Demo Mioni) |
| `chiosco_sala` | `password` | Chiosco | `/kiosk` → "Chiosco Sala" (Hotel Prova) |

Due hotel seedati (Demo Mioni, Hotel Prova) per provare il multi-hotel: receptionist e gestore vedono entrambi, il selettore hotel in alto cambia il contesto.

Nuovi utenti: **non esiste una UI** → `php artisan rsmioni:crea-utente <username> <profilo> --hotel="Nome hotel" [--ip=1.2.3.4]` genera e stampa una password (una volta sola); `--reset-password` la rigenera. Hotel e chioschi: seeder dedicato (es. `VillaGaspariniSeeder`) o Configurazioni → Chioschi. Il campo `ip_whitelist` (opzione `--ip`, ripetibile) blocca il Receptionist fuori dagli IP elencati; vuoto = nessun controllo.

**Comandi di produzione**: `rsmioni:rimuovi-demo` (toglie hotel e utenti demo, chiede conferma) · `prenotazioni:importa-slope file.csv --hotel=... [--dry-run]` · `documenti:pulisci-scaduti [--giorni=7] [--dry-run]`.

---

## 3. Portineria (Receptionist)

Layout: video grande a sinistra, griglia chioschi a destra, pannello DATI che si sovrappone alla griglia.

**Stati chiosco** (badge sulla cella): `Offline` · `Idle` · `In chiamata` (cornetta lampeggiante) · `In chiaro` · `In nascosto` · `In parlato` · `Messaggio attesa`.
Un chiosco Offline torna Idle da solo al ricaricamento pagina / heartbeat.

**Azioni sulla cella**
- 🟢 **Collegamento in chiaro** — video bidirezionale senza audio; l'ospite vede il receptionist.
- 🟡 **Collegamento nascosto** — solo il receptionist vede il chiosco. Se attivo e l'ospite chiama o preme check-in, l'azione parte comunque (fix recenti).
- ✉️ **Messaggio attesa** — testo lampeggiante sul chiosco, modificabile dalla barra chiamata.
- Cornetta → risponde = **Parlato** (audio+video).

**In parlato (area video)**
- **Condividi schermo** (`getDisplayMedia` via LiveKit) · **Chiudi collegamento** · **Chiudi parlato**.
- **Acquisizione documento**: cattura frame dal video del chiosco, scegli prenotazione, tipo, CARICA → il documento va sulla prenotazione e la marca "già fornito".
- **POS** (solo chiosco con `has_pos`): imposta importo → istruzioni → Verifica pagamento. Esito registrato in `pagamenti`.
- **Stampa** (solo chiosco con `has_stampante`): dai documenti della prenotazione.
- **Più chiamate**: badge IN GESTIONE / IN ATTESA; "Riprendi" per tornare su un chiosco messo in attesa.

**Con l'AI attiva**: badge **RECEPTIONIST AI** sull'area video, miniatura receptionist sempre visibile sul chiosco, voce AI muta in portineria. Bottone **Subentra** → la sessione diventa umana, l'agent esce, la telecamera del receptionist torna grande.

**Solo in dev** (`APP_ENV=local`): "Simula chiamata" e "Reset demo".

**Pannello DATI**: Prenotazioni (con azioni extra in parlato: 📷 acquisizione, 💳 POS) e Regolamento in sola lettura.

---

## 4. Chiosco

Login con account Chiosco → **Seleziona chiosco** (solo la prima volta, poi resta in sessione) → schermata full screen.

| Schermata | Quando |
|-----------|--------|
| Atteso | idle: "Tocca un pulsante per iniziare" con **Esegui il check-in** / **Esegui il check-out** (AI) e chiamata al receptionist. |
| Chiamata in corso | dopo il tocco, annullabile |
| Collegamento in chiaro / Parlato | vede il receptionist |
| Messaggio attesa | testo lampeggiante |
| Acquisizione | inquadratura documento, la propria camera grande |
| Pagamento POS / Stampa | istruzioni + esito (oggi simulato) |
| AI | waveform, sottotitoli, stepper fasi, opzioni camera, riepilogo finale. "Tocca lo schermo per attivare l'audio" se il browser blocca l'autoplay. |
| Offline | nessun collegamento al server |

Pagine di servizio: `/kiosk/collaudo` (test webcam/mic/audio/POS/stampante → esito Superato/Parziale/Fallito), `/kiosk/diagnostica` (connessione, heartbeat).

**Flusso self check-in AI** (A27–A29): saluto in lingua rilevata → n. persone → date → `lista_camere` propone camere libere raggruppate con prezzo → scelta vocale → prenotazione salvata (codice `AI-XXXXXX`, `da_pagare`, `da_acquisire`) → documento fronte/retro per adulto → vision legge nome/cognome ufficiali → riepilogo. Check-out: cerca prenotazione, pagamento POS autonomo, KO → escalation. Le prenotazioni esistenti vengono riconosciute e il check-in confermato.

---

## 5. Gestionale (Gestore hotel; Receptionist in parte)

**Prenotazioni** `/prenotazioni` — lista densa con filtri, paginazione, badge documento/pagamento; nuova/modifica/dettaglio/cancella; assegnazione camere (solo libere nel periodo, `camere-disponibili`); **Conferma check-in** (irreversibile); sezione DOCUMENTI nel dettaglio.
- `tipo_pagamento`: `gia_pagato` / `da_pagare` · `documento_identita`: `gia_fornito` / `da_acquisire`.
- Overbooking bloccato se l'hotel non lo permette. Date fuori "visibilità calendario" nascoste al receptionist.
- Cancellazione vietata se c'è un pagamento POS.

**Camere** `/camere` (solo gestore) — nome, tipo, piano, booking consentito, letti (matr./singoli/aggiunti/divani/culle), dotazioni (doccia, vasca, minibar, A/C, quadro elettrico), codice chiave, mq, **prezzo a notte**, **descrizione per l'ospite** (usati dall'AI). Cancellare una camera cancella in cascata prenotazioni e documenti collegati.

**Regolamento** `/regolamento` — regole predefinite in 4 categorie (generale, turistica, supporto, sicurezza); il gestore **valorizza** testo per lingua (lingue = quelle abilitate sull'hotel) e allega documenti condivisi fra le lingue; il receptionist legge e invia.

---

## 6. Configurazioni → Hotel (`/configurazioni/hotel`)

| Campo | Cosa fa davvero |
|-------|-----------------|
| Nome hotel, Indirizzo | Anagrafica; il nome compare in griglia e nelle mail. |
| Lingua default | Lingua di partenza chiosco/regolamento. Viene aggiunta in automatico alle abilitate. |
| Lingue abilitate sul chiosco | Determina le lingue valorizzabili nel Regolamento. |
| Giorni visibilità calendario receptionist | Il receptionist non vede prenotazioni oltre N giorni (min fra gli hotel visibili). |
| Overbooking consentito | Se off, il salvataggio prenotazione con camere già occupate viene rifiutato. |
| Numero massimo ospiti per prenotazione | ⚠️ **Salvato ma non applicato** da nessun form. |
| Cancellazione automatica dopo check-out (giorni) | ⚠️ **Salvato ma nessun job lo esegue** (manca `AutoCancelPrenotazioni`). |
| Chioschi concorrenti massimi (1–10) | Limite di collegamenti simultanei per hotel (`PortineriaService`). Mostrato in Diagnostica/Collaudo. |
| Checkout libero / Ora di checkout | Passata all'AI per il check-out (orario da comunicare). |
| Suoneria di chiamata attiva / volume | ⚠️ **Salvati ma non letti** dalla portineria. |
| Logo / sfondo kiosk | Campi in DB, **nessun upload in UI**. |
| **L'AI può creare nuove prenotazioni (walk-in)** | Spento = l'AI fa il check-in solo su prenotazioni già presenti (importate da Slope) e manda i walk-in al receptionist; `/agent/prenotazione` e `/agent/camere` rispondono 403. Consigliato quando il master è un altro PMS. |
| **Informazioni per l'assistente vocale** | Testo libero del gestore (colazione, Wi-Fi, Dépendance, chiavi…): l'AI lo usa come unica fonte per rispondere, tradotto nella lingua dell'ospite. |

## 7. Configurazioni → Chioschi (`/configurazioni/chioschi`)

| Campo | Cosa fa |
|-------|---------|
| Hotel, Nome | Appartenenza e nome in griglia. |
| Tipo `touch` / `analogico` | Touch = tocco sullo schermo; analogico = campanello (mock). |
| Modalità interattiva | Se off il chiosco non propone azioni all'ospite. |
| Chiosco attivo | Off = escluso dalla griglia. |
| Indirizzo IP (kiosk agent) | Solo informativo oggi (l'agent non è collegato). |
| POS remoto abilitato + Tipo POS (`ingenico` / `mypos`) + path input/output/config/log | Abilita l'icona POS in parlato. I path sono i file `SRINPF.TXT` / `SROUTF.TXT` che userà l'agent reale. |
| Stampante remota abilitata | Abilita l'icona stampa. |

Sotto-pagine per chiosco: **Installazione** (checklist, stato `da_installare` → `in_corso` → `installato`, note) · **Collaudo** (registra esito) · **Diagnostica** (stato live, heartbeat, azioni: reset pendenti, forza offline, reset presenza).

---

## 8. `.env` Laravel — tutte le variabili che contano

| Variabile | Dove si prende | Note |
|-----------|----------------|------|
| `APP_URL`, `APP_ENV`, `APP_DEBUG` | — | In prod `APP_ENV=production`, `APP_DEBUG=false`. `local` abilita i comandi demo. |
| `DB_CONNECTION` | — | `sqlite` in dev, `mysql` sul VPS. |
| `QUEUE_CONNECTION=database` | — | Serve il `queue:work` sempre attivo. |
| `CACHE_STORE=database` | — | Qui vivono stati chioschi e sessioni WebRTC. |
| `BROADCAST_CONNECTION=pusher` + `PUSHER_APP_ID/KEY/SECRET/CLUSTER` + `VITE_PUSHER_*` | pusher.com → Channels app, cluster `eu` | Realtime griglia/eventi. Free tier 200k msg/giorno. Cambiando `VITE_*` va rifatta la build. |
| `LIVEKIT_URL/API_KEY/API_SECRET` | cloud.livekit.io → progetto → API Keys | Video/audio. **Stessi valori nel `.env` del worker AI.** |
| `METERED_*` | metered.ca | TURN legacy: oggi il TURN lo fa LiveKit; tenere solo se resta la route `/webrtc/ice-servers`. |
| `AGENT_SERVICE_TOKEN` | `php -r "echo bin2hex(random_bytes(32));"` | Segreto Laravel ↔ worker AI. Prod diverso da dev. |
| `MAIL_MAILER` + `MAIL_*` | SMTP del provider | Oggi `log` anche in prod → **le mail dei documenti non partono**. |
| `SESSION_DRIVER=database` | — | `sessions.user_id` è UUID (fix recente). |

Dopo ogni modifica in prod: `php artisan config:cache`.

## 9. `.env` worker AI (`ai-receptionist/.env`)

| Variabile | Obbl. | Note |
|-----------|-------|------|
| `LIVEKIT_URL/API_KEY/API_SECRET` | sì | Identici a Laravel. |
| `OPENROUTER_API_KEY` | una delle due | Se presente vince su Anthropic. **Necessaria per la vision documento**: senza, il nome non viene letto dal documento. |
| `OPENROUTER_MODEL` | no | default `anthropic/claude-sonnet-4.6` |
| `VISION_MODEL` | no | default `anthropic/claude-sonnet-4.6` |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL` | una delle due | Solo conversazione, niente vision. |
| `LLM_MAX_TOKENS` | no | 600 (risposte brevi per la voce). |
| `DEEPGRAM_API_KEY` | sì | Voce → testo (nova-3, multilingua). |
| `ELEVENLABS_API_KEY` / `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL` | sì / no / no | Testo → voce. Cambiare `VOICE_ID` per cambiare voce. |
| `RSMIONI_API_BASE_URL` | no | `http://localhost:8000` in dev, `https://<dominio>` in prod. |
| `RSMIONI_AGENT_HMAC_SECRET` | sì | = `AGENT_SERVICE_TOKEN`. È un token statico, non HMAC. |
| `AGENT_DEFAULT_LANGUAGE` | no | `it` |

Audit delle azioni AI: `storage/logs/ai-audit-*.log` (30 gg).

---

## 10. Produzione (VPS Hostinger, CloudPanel)

- App: `/home/rsmioni/htdocs/31-97-180-60.sslip.io` (user `rsmioni`, PHP 8.4, MySQL).
- Deploy: `git pull` → `composer install --no-dev --optimize-autoloader` → `php artisan migrate --force` → `config:cache route:cache view:cache`.
- Cron utente `rsmioni` ogni minuto: `schedule:run` e `queue:work --stop-when-empty --max-time=50`.
- Scheduler: `documenti:pulisci-scaduti` alle 03:00.
- Worker AI: `systemctl status rsmioni-ai` (venv, regione LiveKit Germania); log con `journalctl -u rsmioni-ai -f`.
- Verifica post-deploy: login → log worker "registered worker" → dal chiosco "Esegui il check-in" → badge RECEPTIONIST AI → prenotazione `AI-*` → audit log popolato.

---

## 11. Cose da aggiungere — in ordine consigliato

**A. Prima di far entrare un cliente vero**
1. Cambio password (modulo del manuale, oggi assente) + cambiare le password `password` sul VPS.
2. Fix sicurezza rimandati: IDOR selezione chiosco, link temporanei monouso, transazioni/lock su prenotazioni-camere, comando pulizia documenti non distruttivo.
3. Ruotare le chiavi esposte in chat (LiveKit, Pusher, DB, Metered) e generare `AGENT_SERVICE_TOKEN` di prod.
4. SMTP reale (`MAIL_MAILER=smtp`) per invio documenti.
5. Dominio definitivo + `APP_URL` + `RSMIONI_API_BASE_URL`.

**B. Impostazioni "morte" da collegare o togliere**
6. Job `AutoCancelPrenotazioni` per `giorni_cancellazione_automatica`.
7. `numero_massimo_pax` nel form prenotazione e nell'AI.
8. Suoneria/volume in portineria alla chiamata in arrivo.
9. Upload logo/sfondo kiosk (campi esistono, UI no).
10. Turni orario (`TurnoOrario` esiste, nessun `TurnoService`).

**C. Hardware reale (M7)**
11. Kiosk agent: collegare `kiosk-agent/` al browser kiosk, adapter Ingenico (file `SRINPF/SROUTF`) e myPOS, stampa con `--kiosk-printing`, campanello analogico.
12. Risoluzione problemi dalla cella chiosco (Logout/Login, Restart PC) via agent.

**D. AI Fase 4**
13. Metriche per sessione (completamento, % handoff, durata, KO POS).
14. HMAC per-richiesta al posto del token statico (A26).
15. Transcript live in portineria (previsto in docs/09 §6, oggi c'è solo badge + Subentra).

**E. Pulizia documentazione**
16. `08-backlog-mvp.md` ha tutte le checkbox vuote: aggiornarlo o sostituirlo con questo file.
17. `MANUALE-DEMO.md` parla ancora di Reverb (`reverb:start`): il realtime è Pusher.
18. Committare `docs/marketing/`.
19. Validare con il committente le assunzioni aperte A01–A03, A21–A25 (`assumptions.md`).
