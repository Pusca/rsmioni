# 01 — Analisi Manuale RH24

## Dati Generali

### Sistema di riferimento (fonte del manuale)

| Campo | Valore |
|-------|--------|
| Prodotto originale | Smart Reception Service |
| Sigla | RH24 |
| Produttore originale | K-SOL S.r.l. |
| URL originale | https://app.receptionh24.com/ |
| Versione manuale | 1.0.0 |
| Data ultima modifica manuale | 23/06/2021 |
| Creazione manuale | 18/03/2021 |

### Nuovo sistema da realizzare

| Campo | Valore |
|-------|--------|
| Nome prodotto | RS Mioni |
| Sviluppato da | Smartera Group |
| URL target | rsmioni.it / rsmioni.com |
| Fonte ispirazione | Manuale RH24 (K-SOL S.r.l.) |

---

## Descrizione del Sistema

RH24 è una piattaforma di recezione remota che permette a receptionist di interagire in videochat con clienti presenti fisicamente presso chioschi installati negli hotel. Il sistema integra:

- Videochat bidirezionale (WebRTC o equivalente)
- Gestione documentale (upload, acquisizione webcam, stampa remota)
- POS remoto (INGENICO / myPOS)
- Gestione prenotazioni e camere
- FAQ/regolamento multilingua
- Dashboard portineria con griglia chioschi

---

## Moduli Funzionali Identificati

Il manuale descrive esplicitamente i seguenti moduli, in ordine di apparizione:

### 1. LOGIN
- Accesso con user/password su https://app.receptionh24.com/
- Utenze create da assistenza K-SOL su richiesta del Gestore Receptionist
- Reset password via K-SOL (eccetto chiosco: solo K-SOL può cambiare)
- Naming convention utenze: `u01t0815` = utenza01, turno 08-15
- **Chiosco**: primo login manuale con selezione chiosco; successivo autologin
- **Autologin chiosco**: dati memorizzati in locale; logout con ESC
- **Logout chiosco**: tasto ESC quando Chrome è in primo piano
- Post-login routing differenziato per profilo:
  - Receptionist → PORTINERIA
  - Receptionist Lite → PORTINERIA (no interattività)
  - Chiosco → schermata full-screen videochat
  - Gestore Hotel → PRENOTAZIONI + CAMERE + REGOLAMENTO

### 2. PORTINERIA
- Schermata principale del receptionist
- **Layout split-screen**:
  - Sinistra: area videochat (inizialmente vuota)
  - Destra: griglia chioschi (uno per hotel/chiosco configurato)
- Ogni cella chiosco nella griglia mostra: nome hotel, nome chiosco, icone di stato
- Sempre attiva in background (non si chiude navigando in DATI)
- Receptionist Lite: solo icona collegamento nascosto (gialla), nessuna interattività

### 3. COLLEGAMENTO IN CHIARO
- Icona: occhiolino verde
- Stato: receptionist vede chiosco, chiosco vede receptionist
- **Nessun microfono attivo**
- Vincoli di attivazione:
  1. Chiosco attivo
  2. Contratto Hotel rispettato (orario + N chioschi concorrenti)
  3. Nessun altro collegamento in chiaro già attivo su quel chiosco
- Quando attivo: icona sottolineata con barra rossa
- Azioni disponibili: messaggio attesa, passa a nascosto, chiudi collegamento, passa a parlato

### 4. COLLEGAMENTO NASCOSTO
- Icona: occhiolino giallo
- Stato: receptionist vede chiosco, **chiosco NON vede receptionist**
- **Nessun microfono attivo**
- Vincoli: chiosco attivo, contratto OK, nessun collegamento in chiaro attivo
- **Differenza chiave**: più receptionist possono essere in visione nascosta sullo stesso chiosco contemporaneamente
- Azioni disponibili: passa a chiaro, chiudi collegamento, passa direttamente a parlato

### 5. CHIAMATA DAL CHIOSCO
- Generata dal cliente:
  - **Analogico**: campanello fisico → il chiosco intercetta la frequenza
  - **Touch**: tap sullo schermo (messaggio multilingua invita il cliente)
- Lato receptionist: icona cornetta verde lampeggiante
- Rimane attiva finché almeno un receptionist risponde
- Animazione circolare sul chiosco per ~20 secondi, poi scompare (cornetta rimane sul receptionist)
- Messaggio attesa disponibile durante la chiamata
- **Receptionist Lite**: icona solo visiva, non operativa; nessun messaggio attesa
- Notifica anche in alto a sinistra se il pannello DATI è aperto (griglia non visibile)

### 6. COLLEGAMENTO IN PARLATO
- Attivabile da:
  1. Click su icona cornetta durante chiamata dal chiosco
  2. Click su icona "parla" da stato chiaro o nascosto
- **Unico stato con microfoni entrambi aperti**
- Video del chiosco si sposta nella **parte sinistra grande** dello schermo
- Altri chioschi possono avere collegamento chiaro/nascosto contemporaneamente, ma il microfono è attivo solo con il parlato
- Azioni disponibili: condivisione schermo, chiudi collegamento, ritorna a collegamento in chiaro
- Sblocca nella sezione DATI: acquisizione documento, stampa documento, gestione pagamento POS

### 7. MESSAGGIO ATTESA
- Disponibile in: stato COLLEGAMENTO IN CHIARO o durante CHIAMATA DAL CHIOSCO
- Mostra messaggio multilingua lampeggiante sul chiosco ("Attendere…")
- Scopo: avvertire il cliente che è stato visto ma il receptionist è occupato
- Icona sottolineata quando attivo
- Se il receptionist risponde alla chiamata: messaggio disattivato automaticamente su tutti i receptionist
- Più receptionist possono avere messaggio attivo sullo stesso chiosco

### 8. CONDIVISIONE SCHERMO
- Disponibile in stato COLLEGAMENTO IN PARLATO
- Mostra lo schermo del receptionist sul chiosco
- Se più monitor: selezione quale schermo condividere
- Alternativa: condividere finestra applicazione o scheda Chrome specifica
- Raccomandazione: non condividere intero schermo (il cliente vedrebbe l'interfaccia del receptionist)
- Uso tipico: planimetria hotel, cartina, documento da spiegare

### 9. APERTURA VIEWER DOCUMENTI
- Accessibile da: prenotazione → sezione DOCUMENTI
- Aggrega automaticamente: documenti prenotazione + documenti camere pertinenti + documenti regolamento
- Selezione multi-documento → bottone "VEDI IMMAGINI"
- Viewer con selezione documento nella parte alta
- Uso tipico: mostrare documenti al cliente via condivisione schermo

### 10. ACQUISIZIONE DOCUMENTO
- Disponibile: stato COLLEGAMENTO IN PARLATO + sezione DATI aperta
- Workflow:
  1. Invitare cliente a preparare documento identità
  2. Aprire DATI → lista prenotazioni → trovare prenotazione cliente
  3. Click icona macchina fotografica nella colonna azioni
  4. Cliente mostra documento davanti a webcam chiosco
  5. Scatto: il receptionist vede l'acquisizione
  6. Se leggibile: scegliere tipo documento e titolo opzionale
  7. Click CARICA: il documento entra nei DOCUMENTI della prenotazione
  8. Ripetere per retro o altri documenti
- Accessibile anche per albergatore in PRENOTAZIONI (per scaricare e adempiere burocrazia)
- Possibilità alternativa: caricare documento dal PC locale (modifica prenotazione → DOCUMENTI → +)
  - Campi: titolo, lingua, tipo documento, file (pdf/png/jpg/jpeg)

### 11. CANCELLAZIONE DOCUMENTO ACQUISITO
- Aprire prenotazione in modifica (icona matita)
- Sezione DOCUMENTI → icona cestino → conferma
- **Receptionist non può cancellare documenti inseriti con profilo albergatore** (cestino non disponibile)
- Albergatore può cancellare qualsiasi documento

### 12. STAMPA REMOTA DOCUMENTO
- Disponibile **solo** in stato COLLEGAMENTO IN PARLATO
- Richiede stampante sul chiosco configurata come predefinita
- Accesso: DATI → [Prenotazione/Camera/Regolamento] → sezione DOCUMENTI → icona stampante
- Formati stampabili: tutti i documenti presenti nel portale
- Caso d'uso aggiuntivo: stampare documento personale del cliente
  - Via acquisizione webcam + stampa + cancellazione
  - Via email cliente → upload su prenotazione → stampa → cancellazione

### 13. GESTIONE PAGAMENTO CON POS
- Disponibile **solo** in stato COLLEGAMENTO IN PARLATO
- Associato sempre a una prenotazione (icona nella lista prenotazioni)
- POS supportati: INGENICO (RTS DoremiPos), myPOS
- Workflow:
  1. Click icona gestione pagamento nella lista prenotazioni
  2. Pannello pagamento: inserire prezzo → "Imposta prezzo" → dopo ~sec appare sul POS fisico
  3. Invitare cliente a passare carta, digitare PIN, premere VERDE
  4. "Verifica pagamento" → possibile ripetere più volte (ritardo ~20 sec post-PIN)
  5. Esito mostrato con valore effettivo e data
- Il prezzo è impostabile **una sola volta** per tentativo; se errato: cliente preme ROSSO, si attende annullamento, poi si reimpostа
- Esiti possibili:
  - `KO-NO_FILE`: file esito non ancora creato, POS non ha ancora eseguito
  - `KO-COMMAND_KO TIME: AAAAMMGG_HHMMSS`: pagamento non eseguito
  - `OK-90.0EUR TIME: AAAAMMGG_HHMMSS`: pagamento completato
- La traccia dei pagamenti è visibile come tooltip sul campo prezzo della prenotazione
- Il receptionist deve aggiornare manualmente il campo prezzo della prenotazione

### 14. INVIO DOCUMENTO
- Disponibile in qualsiasi momento (non richiede collegamento attivo)
- Invia link temporaneo via email che punta al documento nel portale
- Il link scade dopo un periodo configurato
- Workflow: seleziona documento → icona email → inserire email destinatario + testo → OK
- Mittente: noreply@receptionh24.com
- Oggetto: nome Hotel
- Corpo: testo receptionist + link temporaneo generato dal sistema
- Il link se cliccato scarica il documento

### 15. LISTA PRENOTAZIONI
- Accessibile da: PRENOTAZIONI (albergatore) o DATI (receptionist)
- Selezione hotel se più hotel configurati; preimpostato su hotel del COLLEGAMENTO IN PARLATO attivo
- **Campi visualizzati in lista**:
  - INFO (icona warning: nessuna camera, overbooking)
  - CODICE (opzionale, es. da Booking.com)
  - CHECK-IN
  - CHECK-OUT (non visibile se supera visibilità calendario)
  - PAX (totale, tooltip con dettaglio adulti/ragazzi/bambini)
  - NOME
  - CAMERE
  - Icona stato pagamento (OK verde / carta di credito)
  - Icona documento identità (OK verde / macchina fotografica rossa)
  - Colonna AZIONI: cestino, matita, occhio, + se PARLATO: acquisizione documento, gestione POS
- Paginazione: 10/25/30/50 elementi per pagina

### 16. DETTAGLIO PRENOTAZIONE
- Aperto con icona occhio dalla lista
- Tutti i dati in sola lettura
- Lista camere della prenotazione
- Accesso al dettaglio camera con icona occhio (include documenti camera)
- Se PARLATO attivo e chiosco abilitato stampa: icona stampante sui documenti

### 17. INSERIMENTO PRENOTAZIONE
- Receptionist: per clienti imprevisti
- Albergatore: accesso completo
- **Campi obbligatori**:
  - Check-in, Check-out (checkout > checkin)
  - Tipo pagamento (già avvenuto / da pagare)
  - Documento identità (già fornito / da acquisire)
  - Nome, Cognome, Gruppo (almeno uno)
  - Adulti, Ragazzi, Bambini (almeno uno)
  - Aggiungi camere O flag overbooking
- **Campi opzionali**: Codice, altri dati
- Check-in confermato: una volta marcato è immutabile; registra data/ora
- Aggiungi camere: pannello con lista camere libere nel periodo (data check-in/out devono essere valorizzate prima)
- Vincoli receptionist: visibilità calendario, no overbooking se non abilitato

### 18. MODIFICA PRENOTAZIONE
- Icona matita dalla lista
- Stesse regole di inserimento
- Aggiunta/modifica documenti possibile
- **Regole modifica date**:
  - Nuove date devono rientrare nella visibilità di calendario hotel
  - Se receptionist non abilitato a overbooking: nuove date non devono generare overbooking
  - Date non visibili: il receptionist può modificarle ma restano nei vincoli di calendario

### 19. CANCELLAZIONE PRENOTAZIONE
- Icona cestino dalla lista → conferma obbligatoria
- Cancella anche tutti i documenti associati
- **Receptionist NON può cancellare se**:
  - Prenotazione inserita dall'albergatore
  - Prenotazione propria con pagamento POS esistente
- Cancellazione automatica: configurabile per hotel (N giorni dopo check-out)

### 20. LISTA CAMERE
- Accessibile da: CAMERE (albergatore) o parte di gestione prenotazione (receptionist)
- **Campi in lista**:
  - CAMERA (nome/numero)
  - TIPO
  - PIANO
  - PREZZO
  - LETTI (M/S/A/DS/DM/C con tooltip esteso)
  - MQ
  - Icone dotazioni (doccia, vasca, frigo bar pieno/vuoto, aria condizionata)
  - Icona codice chiave (porta o cassettiera)
  - PRENOTABILE (icona sì/no)
  - QUADRO ELETTRICO
  - Azioni: cestino, matita, occhio
- Receptionist: vista ridotta, solo camere rese disponibili dall'albergatore

### 21. INSERIMENTO CAMERA
- Solo profilo albergatore
- **Campi obbligatori**: Camera, Tipo, Piano, Booking consentito, Letto Matrimoniale, Letto Singolo
- **Campi opzionali**: Letto Aggiunto, Divano Letto Singolo/Matrimoniale, Culla, Doccia, Vasca, Minibar, Minibar pieno, Aria condizionata, Quadro elettrico, Prezzo (per tipi occupazione)

### 22. MODIFICA CAMERA
- Solo profilo albergatore
- Include aggiunta documenti camera (pdf, png, jpg, jpeg)

### 23. CANCELLAZIONE CAMERA
- Solo profilo albergatore
- Cascata: cancella tutti i documenti della camera + tutte le prenotazioni + relativi documenti
- Richiede conferma

### 24. REGOLAMENTO
- Lista predefinita di domande/risposte comuni a tutti gli hotel
- Nuove regole: richiedere ad assistenza K-SOL
- **Valorizzazione**: compito albergatore
- **Lettura**: receptionist (tramite DATI)
- Multilingua: italiano + possibilità di aggiungere lingue
- Documenti condivisi fra tutte le lingue della stessa regola
- **Lista regole predefinite**:
  - Generali: descrizione struttura, stelle, piani, camere/piano, planimetria, colazione (luogo/orari), ascensore, raggiungimento hotel
  - Turistiche: ristoranti consigliati, luoghi di interesse
  - Supporto: biancheria bagno/letto, saponi, carta igienica, corrente mancante, chiave supplementare
  - Sicurezza/emergenza: numeri proprietario, carabinieri, CIVIS/sicurezza, manutenzioni (ascensore, condizionamento, caldaia), emergenza (ambulanza, polizia, polizia municipale, pompieri), istruzioni (caldaia, condizionamento, allarme antincendio)

### 25. VALORIZZAZIONE REGOLA
- Solo profilo albergatore
- Icona matita dalla lista regolamento
- Pannello: testo risposta + sezione DOCUMENTI con bottone +
- Aggiunta documento: titolo, lingua, tipo, selezione file
- Documenti disponibili per albergatore: cancellazione, apertura, download
- Documenti disponibili per receptionist: invio via email (extra)

### 26. CAMBIO PASSWORD
- Click su icona profilo utente
- Pannello cambio password
- **Non disponibile per Chiosco**: contattare K-SOL

### 27. CONFIGURAZIONI
- Non accessibili dall'interfaccia: richieste ad assistenza K-SOL

#### Modello Hotel
Dati richiesti all'attivazione:
- Nome Hotel, Indirizzo
- Lista tipologie stanze
- Data inizio/fine contratto
- Numero giorni visibilità calendario
- Overbooking permesso (Sì/No)
- Delega RS MIONI a gestione FAQ/CAMERE/PRENOTAZIONI (Sì/No)
- Giorni dopo check-out per cancellazione automatica prenotazioni
- Turni/Orario
- Numero chioschi concorrenti N
- Tabella chioschi: nome, tipo (touch/analogico), interattivo (Sì/No), POS (Sì/No), stampante (Sì/No)

**N concorrenti** = COLLEGAMENTI IN CHIARO + COLLEGAMENTI NASCOSTI + COLLEGAMENTO IN PARLATO

#### Tabella Receptionist
- Utenze per turno
- Esempio: 2 utenze turno 08-15 per Hotel Padova e Hotel Venezia
- Email da associare

#### Modello Ufficio Gestore Receptionist
- Nome ufficio, indirizzo, telefono, email
- Lista IP statici (firewall receptionist); lista vuota = firewall disabilitato

#### Utenza Multi-Albergo (hall01)
- Uso esclusivo RS MIONI
- Per configurazione hotel quando albergatore delega
- Gestione FAQ, CAMERE, PRENOTAZIONI per conto albergatore

### 28. INSTALLAZIONE CHIOSCO
- Requisiti:
  - Windows 10
  - Google Chrome
  - Driver stampante (se presente)
  - Software POS INGENICO RTS DoremiPos o myPOS
  - Pacchetti interfacciamento chiosco-POS
- Configurazioni:
  - Auto-login Windows 10 via regedit (`DefaultUserName`, `DefaultPassword`, `AutoAdminLogon=1`)
  - Chrome in modalità kiosk: `--kiosk --kiosk-printing --use-fake-ui-for-media-stream --disable-application-cache`
  - Startup Chrome via cartella Windows startup (`shell:startup`)
  - POS INGENICO: NodeJS + pacchetto CORS + `pos.js` + `pos.bat` in `C:\ProgramData\RH24\`
  - POS myPOS: .NET 4.7.2+, driver USB, `config.txt` con porta COM, `myPOSTerminal.dll`, `myPOSK.exe`
  - File interscambio POS: `C:\ProgramData\RTSDoremiPos\SRINPF.TXT` (input), `SROUTF.TXT` (output)
  - Stampante configurata come predefinita

### 29. COLLAUDO CHIOSCO
Procedura:
1. Restart chiosco da zero
2. Chiamata al receptionist (analogico/touch)
3. Attesa e ingresso in videochat
4. Receptionist crea prenotazione
5. Acquisizione documento via webcam
6. Impostazione prezzo dimostrativo (es. 0,10€) → pagamento → verifica esito
7. Stampa documento (FAQ o acquisito)
8. Cancellazione prenotazione di test via login albergatore
- Nota: contattare assistenza preventivamente per abilitazione hotel al collaudo

### 30. RISOLUZIONE PROBLEMI CHIOSCO
- **Livello 1 – LOGOUT/LOGIN**: reinizializza l'applicazione (autologin)
- **Livello 2 – PC RESTART**: attivazione completa di tutte le componenti (~2 min attesa connettività)
- Attivazione da opzione `…` nell'interfaccia receptionist (non specificata nel manuale)

---

## Punti Critici per l'Implementazione

### Realtime / WebRTC
- Videochat bidirezionale con stati: chiaro, nascosto, parlato
- Controllo microfono differenziato (solo in parlato)
- Segnalazione chiamata in arrivo (notifica push/socket)
- Condivisione schermo (Screen Sharing API)
- Più connessioni contemporanee (chiaro/nascosto con diversi chioschi)

### Hardware Integrations
- **Webcam chiosco**: acquisizione foto documento
- **Stampante chiosco**: stampa remota (default printer, kiosk-printing flag Chrome)
- **POS INGENICO**: file interscambio (`SRINPF.TXT`/`SROUTF.TXT`), delay ~20 sec
- **POS myPOS**: USB COM port, `myPOSK.exe` interfaccia
- **Campanello analogico**: intercettazione frequenza microfono

### Permessi e Vincoli
- Visibilità calendario per hotel (N giorni da oggi)
- Overbooking configurable per hotel
- IP whitelist per receptionist
- Contratto hotel: orari operativi, N chioschi concorrenti

### Documenti
- Tipi: pdf, png, jpg, jpeg
- Operazioni: upload locale, acquisizione webcam, open tab, download, email link, stampa chiosco
- Link temporanei con scadenza configurata

### Multilingua
- Interfaccia chiosco: multilingua (messaggio attesa, messaggio chiamata)
- Regolamento: testo e documenti in più lingue
