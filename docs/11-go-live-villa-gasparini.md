# 11 — Go-live Hotel Villa Gasparini (settimana 7–11 settembre 2026)

> Scritto il 1 settembre 2026 dopo analisi del repo (commit `7f7d381`) e del gestionale Slope dell'hotel.
> Nessun dato personale degli ospiti è riportato qui: quello che serve sono struttura, flussi e vincoli.

---

## 0. Cosa ho capito da Slope (e cosa cambia per noi)

**L'hotel.** Hotel Villa Gasparini, Dolo (VE), 15 camere in 4 tipologie su due edifici (villa + Dépendance):

| Tipologia | Camere | Dove |
|-----------|--------|------|
| Camera Economy ×6 | 101, 102 · 112, 113, 114, 115 | piano terra · Dépendance |
| Camera standard ×3 | 103, 108 · 111 | primo piano · Dépendance |
| Camera superior con Jacuzzi ×4 | 104, 106, 107 · 109 | primo · secondo piano |
| Junior Suite con Jacuzzi ×2 | 105 · 110 | primo · secondo piano |

Arrivi previsti 15:30–22:00 (il chiosco serve esattamente per chi arriva dopo). Check-in online nell'area clienti Slope attivo. Nessuna tassa di soggiorno configurata.

**Slope è, e resta, il sistema master.** Ci girano: channel manager (Booking.com dominante, Expedia, Google, GDS Amadeus/Galileo/Sabre/Worldspan), booking engine, Portale Alloggiati, ISTAT, contabilità e fatture, Slope Pay. Le prenotazioni OTA arrivano spesso con carta virtuale o prepagate.

**Non c'è API per noi, oggi.** L'account dell'hotel non ha una sezione integrazioni/API: le API Slope si attivano solo tramite il loro supporto (info@slope.it), a richiesta del cliente. Esiste però **ESPORTA** sull'elenco prenotazioni (CSV).

### Conseguenze concrete

1. **rsMioni non può inventare disponibilità.** Se l'AI crea una prenotazione walk-in e assegna una camera, quella camera potrebbe essere già venduta in Slope da Booking.com. → Al go-live l'AI lavora **solo su prenotazioni esistenti** (importate da Slope); il walk-in passa al receptionist umano.
2. **Le camere in rsMioni devono essere una copia esatta di Slope** (nome = numero, stessa tipologia), altrimenti l'import e la conversazione AI non tornano.
3. **Alloggiati e ISTAT restano in Slope.** rsMioni fotografa i documenti; il receptionist li trascrive in Slope (entro 24 h). Il nostro job è rendere quella foto leggibile e trovabile.
4. **Pagamento: quasi sempre già fatto.** POS è mock e le OTA sono prepagate/VCC → **POS spento al go-live**, `tipo_pagamento` viene dall'import; l'AI salta il passo pagamento se `gia_pagato`.
5. **Dépendance = ospite che deve raggiungere un altro edificio di notte con una chiave.** La consegna chiave è il problema fisico numero uno (vedi decisione A).

---

## 1. Decisioni da prendere adesso (bloccano il resto)

| # | Decisione | Stato (1 set 2026) |
|---|-----------|--------------------|
| A | **Come consegna la chiave il chiosco?** | **Chiavi = tessere.** Modalità di consegna da definire a breve con l'hotel. Ipotesi tecniche: dispenser di tessere collegato al totem, oppure tessere pre-caricate in un contenitore a codice per camera (rsMioni mostra già `codice_chiave` a fine check-in). Finché non è deciso, l'AI dice all'ospite che il receptionist gli indica come ritirare la tessera. |
| B | **AI: solo prenotazioni esistenti o anche walk-in?** | ✅ Solo esistenti (implementato, spento per Villa Gasparini). Walk-in → receptionist. |
| C | **POS al go-live?** | ✅ No. Chiosco seedato senza POS; incassi in Slope. |
| D | **Chi è il receptionist remoto?** | **Edoardo Mioni, part-time la mattina.** Quindi: la mattina fa Alloggiati dai documenti raccolti dall'AI la sera prima. ⚠️ **Gli arrivi serali (dopo le 22, il caso d'uso del chiosco) restano senza umano dietro**: serve decidere chi riceve l'escalation dell'AI la sera — un secondo receptionist a turno, o un numero di telefono reperibile mostrato sul chiosco quando l'AI non ce la fa. Utente `edoardo.mioni` creato in produzione. |
| E | **Ponte dati con Slope** | ✅ Import pronto e **validato sul file reale**: Slope manda via email un **.xlsx** (non CSV) con colonne Numero, Nome/Cognome (prenotante), Ospite principale, Tipologia, Nome alloggio, Arrivo, Partenza, Adulti, Bambini, Importo, Stato. Primo import in produzione fatto il 1 set. Flusso operativo: Esporta → mail → allegato → "Importa da Slope". Richiesta API a Slope da inviare. |
| F | **Hardware chiosco** | **Totem**, modello ancora da scegliere. Requisiti da verificare sul modello: webcam ad altezza volto, microfono/altoparlante con cancellazione eco (o speakerphone USB aggiunto), rete cablata, alimentazione, sistema operativo (Windows/Android) per Chrome in kiosk mode, lettore/dispenser tessere se la consegna chiavi passa dal totem. |

---

## 2. Scaletta giorno per giorno

### Mer 2 set — Sicurezza e account (blocco A del libretto)
- [x] Modulo **cambio password** (rotta + UI, escluso profilo Chiosco). *(commit f786bc0)*
- [x] Fix: selezione chiosco verifica l'hotel (IDOR) · link temporanei a finestra (15 min dal primo accesso) · lock/transazione su assegnazione camere · comando pulizia documenti solo su soggiorni conclusi (+ `--dry-run`). Test `_bug_documentato` sostituiti dai test del comportamento corretto.
- [ ] Rotazione chiavi: LiveKit, Pusher, DB, Metered; nuovo `AGENT_SERVICE_TOKEN` prod. *(manuale, sul VPS)*
- [x] Strumenti per utenti reali: `rsmioni:crea-utente` (password generata) e `rsmioni:rimuovi-demo`. **Da eseguire sul VPS** (vedi docs/10).
- [ ] SMTP reale (`MAIL_MAILER=smtp`) e test invio documento. *(servono le credenziali SMTP)*

### Gio 3 set — Dati reali e ponte Slope
- [x] `VillaGaspariniSeeder`: hotel (lingue IT/EN/DE/ES/FR, 1 chiosco concorrente, overbooking off, walk-in AI spento) + **15 camere = Slope** (numero, tipologia, piano, letti, dotazioni, descrizione con Dépendance; prezzi vuoti: li fa Slope) + "Chiosco Reception" senza POS. *(commit d68eaa0)*
- [x] `prenotazioni:importa-slope` + bottone **Importa da Slope** in Prenotazioni (gestore): upsert per numero Slope, righe multi-camera raggruppate, cancellate ignorate, check-in confermati non toccati, conflitti locali → overbooking + avviso.
- [ ] **Validare l'import su un export CSV vero di Slope**: le colonne sono riconosciute per nome tra più candidati, ma il formato reale non l'ho visto. Serve un file esportato dall'hotel.
- [x] `rsmioni:rimuovi-demo` per togliere i dati demo senza `migrate:fresh`. **Da eseguire sul VPS.**
- [ ] Regolamento valorizzato + "Informazioni per l'assistente vocale" (Configurazioni → Receptionist AI) con i dati veri: colazione (orari e dove), Wi-Fi, come si raggiunge la Dépendance, parcheggio, check-out, chiavi. *(servono le informazioni dall'hotel)*
- [ ] Dominio definitivo: DNS, certificato, `APP_URL`, `RSMIONI_API_BASE_URL`, `config:cache`. *(manuale)*

### Ven 4 set — AI e chiosco
- [x] Modalità **prenotazione esistente** (`hotels.ai_walkin_abilitato = false`): cognome → `cerca_prenotazione` → documenti → riepilogo → indicazioni camera/chiave solo dalle info del gestore. Non trovata: un retry con codice, poi receptionist. Lato Laravel `/agent/prenotazione` e `/agent/camere` rispondono 403. *(commit successivo a d68eaa0)*
- [x] Conoscenza hotel nel prompt: campo `istruzioni_ai` in Configurazioni → Receptionist AI, passato all'agent che lo traduce nella lingua della conversazione. **Il testo lo deve scrivere il gestore.**
- [ ] Postazione chiosco: Chrome `--kiosk`, autostart al boot, permessi webcam/mic persistenti (policy `VideoCaptureAllowedUrls`/`AudioCaptureAllowedUrls`), `--autoplay-policy=no-user-gesture-required`, sospensione disattivata, autologin chiosco.
- [ ] **Informativa privacy** sullo schermo idle + cartello: videochiamata, registrazione documento, assistente vocale AI, retention (`documenti:pulisci-scaduti`).
- [ ] Crediti e quote sui servizi: LiveKit Cloud, Deepgram, ElevenLabs, OpenRouter, Pusher → piani a pagamento con alert di soglia. Un servizio a credito zero = check-in muto alle 23:00.
- [ ] Backup MySQL notturno + `storage/app` (documenti) sul VPS; uptime monitor su `/login` e sul worker.

### Sab–Dom 5–6 set — Prova generale da remoto
- [ ] Import CSV reale → arrivi del giorno in rsMioni.
- [ ] End-to-end: chiamata dal chiosco → parlato → nascosto → AI check-in su prenotazione vera → documento fronte/retro leggibile → Subentra → trascrizione Alloggiati in Slope dalla foto.
- [ ] Test da rete mobile (non LAN) per TURN/LiveKit; test audio con speakerphone (eco, volume, barge-in).
- [ ] Lista fix.

### Lun 7 set — Buffer fix + preparazione hardware
- [ ] Chiudere la lista del weekend; imaging del mini PC; stampa cartelli e istruzioni brevi per gli ospiti (IT/EN).

### Mar 8 (o mer 9) set — Installazione in struttura
Checklist in §3.

### Mer 9 – Ven 11 set — Affiancamento
- [ ] Prime notti con il receptionist **in nascosto su ogni check-in AI**; note su cosa inciampa.
- [ ] Ritmo import CSV (chi, quando) verificato per 3 giorni.
- [ ] Piccoli fix quotidiani; niente feature nuove.

---

## 2-bis. Prima prova in produzione (1 set, sera) — cosa è emerso

- **L'AI non parlava**: nel `.env` del worker `ELEVENLABS_API_KEY` conteneva l'**ID** della chiave (64 caratteri hex), non la chiave (`sk_…`). ElevenLabs risponde `api_key_id_used_as_api_key`, la pipeline voce si chiude e la sessione termina subito. Fix: incollare la chiave vera e `systemctl restart rsmioni-ai`. Il worker ora lo segnala all'avvio (`CONFIG: ELEVENLABS_API_KEY non sembra una API key valida`). Stesso problema nel `.env` locale.
- **Voce più spigliata**: regola di RITMO nel prompt (risposta immediata; prima di ogni tool lento una frase breve tipo "un attimo, controllo", poi ripresa naturale), voce meno "piatta" (`TTS_STABILITY` 0.5, `TTS_SPEED` 1.08, regolabili da `.env`). Da ascoltare dal vivo e tarare: la voce di default (`Xb7hH8MSUJpSbSDYk0k2`) è una voce inglese multilingua — vale la pena provare una voce italiana nativa dalla libreria ElevenLabs e mettere l'id in `ELEVENLABS_VOICE_ID`.
- **Chiosco da smartphone**: misure spostate in CSS (`.kiosk-*`, `.ai-orb-*`) con media query ≤ 760 px: azioni impilate, orb e recap ridotti, autoritratto e "Termina" che non si sovrappongono, altezza `100dvh`.

## 3. Checklist giorno di installazione

1. **Rete**: ethernet o Wi-Fi stabile; test velocità; porte non bloccate (LiveKit WSS/UDP, Pusher).
2. **Posizionamento**: schermo ad altezza volto, luce frontale (non controluce da finestre), area documento illuminata, riservatezza per chi mostra la carta d'identità.
3. **Audio**: volume voce AI udibile in hall, nessun eco, microfono che sente a 50–80 cm.
4. **Collaudo rsMioni** (`/kiosk/collaudo` + Configurazioni → Collaudo): webcam, microfono, altoparlanti, connessione, heartbeat.
5. **Chiamata reale** con il receptionist remoto: chiaro, parlato, messaggio attesa, condivisione schermo.
6. **AI** su una prenotazione di test in IT e in EN: documento letto, riepilogo, codice chiave corretto.
7. **Chiavi**: prova completa key box/serratura con il codice mostrato.
8. **Riavvio** del PC → torna da solo sulla schermata chiosco loggato.
9. **Formazione** (30 min): gestore = export/import CSV, camere, regolamento; receptionist = portineria, Subentra, Alloggiati da foto.
10. **Piano B**: numero di telefono visibile sul chiosco se qualcosa non funziona; procedura "chiosco spento → chiamata al receptionist".

---

## 4. Dopo il go-live (settimane 2–4)
- Richiesta API a Slope inviata il giorno 1 → sostituire il CSV con sync automatico (prenotazioni in ingresso, check-in confermato in uscita).
- Kiosk-agent con POS reale (Ingenico/myPOS) e stampante, se l'hotel li vuole.
- Metriche AI (completamento, handoff, durata), transcript live in portineria, HMAC per richiesta.
- Impostazioni oggi inerti: cancellazione automatica, numero max ospiti, suoneria.

---

## 5. Rischi principali e come li teniamo bassi

| Rischio | Mitigazione |
|---------|-------------|
| Camera assegnata due volte (rsMioni vs Slope) | AI solo su prenotazioni esistenti; import prima degli arrivi; camera già presente nel CSV. |
| Ospite Booking.com che non sa del chiosco | Slope → Notifiche e-mail pre-arrivo con istruzioni + cartello in hall. |
| Voce AI in eco / non capisce | Speakerphone con AEC, test weekend, barge-in. |
| Servizio esterno finito il credito di notte | Piani pagati + alert; fallback: chiamata al receptionist sempre visibile. |
| Documento illeggibile | Illuminazione + guida inquadratura; il receptionist rivede sempre prima di Alloggiati. |
| Connettività notturna | Ethernet, UPS, schermata Offline con numero di telefono. |
