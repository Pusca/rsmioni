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

| # | Decisione | Raccomandazione |
|---|-----------|-----------------|
| A | **Come consegna la chiave il chiosco?** | Key box a codice per camera (o smart lock): rsMioni ha già `codice_chiave` per camera/prenotazione e lo mostra a fine check-in. Da verificare con l'hotel cosa esiste già. |
| B | **AI: solo prenotazioni esistenti o anche walk-in?** | Solo esistenti al go-live. Walk-in → escalation al receptionist. |
| C | **POS al go-live?** | No. Incassi restano in Slope (VCC, Slope Pay link). Rivalutare con l'hardware reale (kiosk-agent). |
| D | **Chi è il receptionist remoto, in che fascia (es. 22:00–08:00), e chi fa Alloggiati la mattina?** | Va nominato: senza umano dietro, l'AI non deve andare online. |
| E | **Ponte dati con Slope** | Export CSV 2 volte al giorno dal gestore (mattina + pomeriggio prima degli arrivi) caricato in rsMioni. In parallelo, chiedere **subito** a Slope l'attivazione API. |
| F | **Hardware chiosco** | Mini PC Windows + monitor touch 21–24" + webcam 1080p ad altezza volto + **speakerphone USB con cancellazione eco** (la voce AI dagli altoparlanti rientra nel microfono) + ethernet + piccolo UPS. Cosa c'è già in struttura? |

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
