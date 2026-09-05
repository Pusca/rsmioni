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
| B | **AI: solo prenotazioni esistenti o anche walk-in?** | **Decisione del committente (1 set, sera): anche walk-in** — l'AI cerca prima la prenotazione esistente e, se non c'è, ne crea una nuova. Attivato in produzione (`ai_walkin_abilitato = true`). ⚠️ Rischio accettato: una prenotazione creata dall'AI **non esiste in Slope** finché il gestore non la inserisce a mano (la camera resta vendibile online). Mitigazione: codice `AI-*` ben visibile in Prenotazioni; Edoardo la ricopia in Slope la mattina insieme ad Alloggiati. Il toggle in Configurazioni → Receptionist AI permette di tornare a "solo esistenti" in un click. |
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

- **L'AI non parlava**: nel `.env` del worker `ELEVENLABS_API_KEY` conteneva l'**ID** della chiave (64 caratteri hex), non la chiave (`sk_…`). ElevenLabs risponde `api_key_id_used_as_api_key`, la pipeline voce si chiude e la sessione termina subito. Fix fatto la sera stessa: chiave `sk_…` in produzione e in locale, worker riavviato, sintesi di prova via API → HTTP 200. La chiave è **a permessi limitati** (solo text-to-speech: `/v1/user` e `/v1/voices` rispondono 401 `missing_permissions`) — va bene per il worker. Il worker segnala all'avvio una chiave dal formato sbagliato. ⚠️ La chiave è passata in chat: da **ruotare** dopo il go-live insieme alle altre.
- **Voce più spigliata**: regola di RITMO nel prompt (risposta immediata; prima di ogni tool lento una frase breve tipo "un attimo, controllo", poi ripresa naturale), voce meno "piatta" (`TTS_STABILITY` 0.5, `TTS_SPEED` 1.08, regolabili da `.env`). Da ascoltare dal vivo e tarare: la voce di default (`Xb7hH8MSUJpSbSDYk0k2`) è una voce inglese multilingua — vale la pena provare una voce italiana nativa dalla libreria ElevenLabs e mettere l'id in `ELEVENLABS_VOICE_ID`.
- **L'AI non riconosceva le prenotazioni importate**: la ricerca era per cognome **esatto** e solo su arrivi ieri..domani. Ora: ricerca tollerante (accenti, errori di trascrizione, nome/cognome invertiti, nome di chi ha prenotato, codice Slope), finestra ieri → +30 giorni con aggancio automatico solo ieri..domani; una prenotazione di un altro giorno viene riconosciuta e comunicata ("risulta per il 4 settembre") ma passata al receptionist. Nuovo campo `prenotante` (chi ha prenotato ≠ ospite) riempito dall'import.
- **Campanella in Portineria**: nuovo tool `richiedi_receptionist(motivo)` che l'AI chiama ogni volta che passa la mano (prenotazione non trovata, documento illeggibile, pagamento KO, ospite che vuole una persona). Laravel `POST /agent/handoff` → evento `ai.handoff` sul canale portineria → cella del chiosco viola pulsante "L'AI CHIEDE AIUTO", banner in alto, suoneria WebAudio (rispetta `suoneria_attiva`/`volume_suoneria` dell'hotel, finalmente usati). Si spegne al Subentra o a fine sessione. La suoneria suona anche per le chiamate in arrivo.
- **Finestra ricerca**: aggancio automatico −3 → +2 giorni (arrivo in ritardo con soggiorno in corso, o in anticipo di poco), precedenza a oggi; riconoscimento fino a +30 giorni. Con walk-in attivo, una prenotazione "di un altro giorno" non blocca: l'AI può proporre una camera per queste notti come nuova prenotazione.
- **Prezzi camere**: erano tutti vuoti → l'AI diceva "prezzo da definire" e tendeva a rimandare al receptionist. Inseriti prezzi a notte **indicativi** = mediana per notte dell'export Slope (Economy 69 €, standard 89 €, superior 99 €, Junior Suite 110 €). **Il gestore li corregge in Camere.**
- **Canale "sempre acceso" (richiesta del committente, 1 set sera)**: la stanza LiveKit `presenza-{hotel}` diventa il canale principale. Chiosco: quando un receptionist è online la sua webcam è **grande e centrale, muta**, sopra i tre bottoni; quando il receptionist accende il microfono verso quel chiosco il riquadro si illumina ("La reception ti sta parlando") e si sente la voce; il chiosco pubblica sempre la propria webcam a bassa risoluzione. Portineria: la griglia a destra mostra il **video live di ogni chiosco**; il receptionist seleziona un chiosco e preme **"Parla col chiosco"** (microfono verso UN solo chiosco, con permessi LiveKit per track: gli altri non lo sentono); cambiare chiosco spegne il microfono; su una sessione AI il bottone equivale a **Subentra**. I collegamenti classici (chiaro/nascosto/parlato) restano disponibili sotto, come da manuale. Il chiosco non pubblica la camera in presenza mentre è in una sessione media (chiaro/parlato/AI): in quel caso la miniatura in griglia mostra il placeholder.
- **Schermata che "ballava" (tre bottoni ↔ check-in)**: dai log nginx il chiosco era aperto su **3 dispositivi/tab** con lo stesso account → stessa identità LiveKit → ogni connessione buttava fuori l'altra ogni 2 s. Regola operativa: **un chiosco = un solo schermo aperto**. Robustezza aggiunta: su identità duplicata il chiosco si ferma con la schermata «aperto su un altro dispositivo» e il bottone «Usa questo dispositivo»; una sessione AI senza agent in stanza per 40 s viene chiusa dal chiosco stesso; «Esegui il check-in» riparte anche da una sessione AI rimasta appesa; il worker termina il job (e la sessione lato server) appena la sessione agent si chiude.
- **Chiosco da smartphone**: misure spostate in CSS (`.kiosk-*`, `.ai-orb-*`) con media query ≤ 760 px: azioni impilate, orb e recap ridotti, autoritratto e "Termina" che non si sovrappongono, altezza `100dvh`.

## 2-ter. Interventi del 4 settembre — lingua, Slope, stabilità chiosco

- **Lingua scelta dall'ospite**: sulla schermata di attesa del chiosco compaiono le bandierine delle lingue abilitate per l'hotel (Configurazioni → Hotel → lingue). L'AI apre e risponde nella lingua toccata (`POST /kiosk/ai/avvia` accetta `lingua`; se non abilitata si usa il default dell'hotel). Le etichette dei tre bottoni seguono la lingua scelta; a fine sessione si torna al default. Il rilevamento automatico durante la conversazione resta attivo.
- **Import Slope e cancellazioni**: una prenotazione già importata che nel nuovo file risulta *Cancellata* viene **tolta** da rsMioni (camera liberata), salvo check-in già confermato (solo avviso). Le prenotazioni Slope presenti in rsMioni ma **sparite dal file**, con arrivo nel periodo coperto dal file, vengono **segnalate** nel riepilogo (non cancellate da sole: l'export potrebbe essere filtrato). Le prenotazioni `AI-*` non sono toccate.
- **Chiosco — schermata guidata dalla sessione, non da Reverb**: la schermata AI/parlato/chiaro segue la sessione scoperta dal poll del token LiveKit (2 s). Prima serviva anche lo stato Portineria via websocket: un evento perso lasciava i bottoni a schermo con l'AI che parlava, e un secondo tocco faceva ripartire tutto. Lo stato via Reverb viene comunque riallineato con una GET ogni 15 s.
- **Subentra senza schermo nero**: le track video (receptionist e condivisione) restano in stato e vengono riattaccate quando la schermata cambia (AI → parlato). Prima il video del receptionist dopo il Subentra poteva non comparire perché l'elemento `<video>` era stato rimontato.
- **Avvio più rapido**: dopo il tocco il chiosco fa subito il poll della sessione (senza aspettare il giro da 2 s) e l'agent saluta 0,6 s dopo l'ingresso del chiosco (era 1 s).

## 2-quater. Interventi del 5 settembre — via il passaggio "in chiaro", chiosco ridisegnato

- **Collegarsi al chiosco = voce e video subito.** In Portineria i bottoni "Collegamento in chiaro", "Rispondi in chiaro", "Passa in chiaro" e "Riprendi in chiaro" sono diventati **"Parla col chiosco"** / **"Rispondi"**: creano direttamente la sessione parlato. `POST /portineria/webrtc/sessione` parte ora da idle, chiamata in arrivo, nascosto e messaggio di attesa (lo stato attraversa `in_chiaro` solo come tappa interna; regole per profilo e limite concorrenti invariati) e chiude l'eventuale sessione nascosto precedente. "Chiudi parlato" riporta il chiosco a disponibile, senza tornare in chiaro. Lo stato `in_chiaro` resta nella state machine (manuale, demo, test) ma non è più un passaggio del flusso.
- **Receptionist in un riquadro piccolo in alto a destra** su tutte le schermate del chiosco (attesa, AI, documenti, POS), tranne i collegamenti pieni. Quando parla verso il chiosco il riquadro si illumina in blu e compare lo stato del microfono dell'ospite.
- **"Parla con il receptionist" sul chiosco**: pulsante sotto il riquadro del receptionist (solo in attesa, solo se un receptionist è online). Usa la chiamata dal chiosco: `in_chiamata`, suoneria in portineria, "Rispondi" → parlato, "Ignora" → attesa.
- **Ascolto nascosto dalla portineria** (pulsante "Ascolta" in alto, giallo): con una sessione AI in corso riproduce l'audio della stanza (ospite + assistente) — è solo una sottoscrizione, non interferisce con la conversazione; senza sessione chiede al chiosco di accendere il microfono via canale presenza senza pubblicare la voce del receptionist (sul chiosco non compare nulla). Un chiosco alla volta; cambiare chiosco spegne l'ascolto; se parte una sessione AI mentre si ascolta, l'ascolto passa da solo alla stanza della chiamata. In griglia la cella mostra "ASCOLTO".
- **Schermata di attesa rifatta**: benvenuto con nome hotel, bandierine **SVG** (le emoji non si vedono su Windows), tre card grandi con icona, titolo e sottotitolo tradotti nella lingua scelta.

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
