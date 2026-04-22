# 04 — User Flows

## Convenzioni
- **[R]** = Receptionist, **[RL]** = Receptionist Lite, **[K]** = Chiosco, **[H]** = Gestore Hotel
- `→` = navigazione/azione, `⬌` = interazione bidirezionale, `✗` = errore/blocco

---

## FLOW 01 — Login (tutti i profili)

```
Utente apre browser su https://app.receptionh24.com/
    → Pagina login: form user/password
    → Click ACCEDI
    
    ├── Credenziali errate → Messaggio errore → riprova
    ├── IP non in whitelist (R) → Accesso bloccato
    └── Credenziali OK:
        ├── profilo R/RL → PORTINERIA
        ├── profilo H    → PRENOTAZIONI
        ├── profilo K    → 
        │       ├── Primo login: selezione chiosco da lista
        │       │       → Salva dati in locale
        │       │       → KIOSK fullscreen
        │       └── Login successivo: autologin → KIOSK fullscreen
```

---

## FLOW 02 — Portineria (Receptionist)

```
[R] entra in PORTINERIA
    → Visualizza griglia chioschi (destra)
    → Parte sinistra: area videochat vuota
    
    Per ogni chiosco nella griglia:
        ├── Chiosco OFFLINE: nessuna icona operativa
        ├── Chiosco IDLE interattivo:
        │       ├── Icona occhiolino verde (collegamento chiaro)
        │       └── Icona occhiolino giallo (collegamento nascosto)
        ├── Chiosco IDLE non interattivo:
        │       └── Solo icona occhiolino giallo
        └── Chiosco IN CHIAMATA:
                └── Icona cornetta verde lampeggiante
```

---

## FLOW 03 — Collegamento in Chiaro

```
[R] in PORTINERIA, chiosco IDLE
    → Click icona occhiolino verde sul chiosco
    
    Sistema verifica:
    ├── Chiosco non attivo → errore
    ├── Contratto fuori orario → errore
    ├── N concorrenti raggiunto → errore
    ├── Già un collegamento chiaro su quel chiosco → errore
    └── OK:
        → Icona occhiolino verde sottolineata (barra rossa)
        → Videochat avviata (senza microfono)
        → [K] vede il receptionist, [R] vede il chiosco
        
        Azioni disponibili sul chiosco:
        ├── Icona messaggio attesa → FLOW 07
        ├── Icona occhiolino giallo → passa a COLLEGAMENTO NASCOSTO (FLOW 04)
        ├── Icona chiudi collegamento → chiude, torna IDLE
        └── Icona parla → passa a COLLEGAMENTO IN PARLATO (FLOW 06)
```

---

## FLOW 04 — Collegamento Nascosto

```
[R] o [RL] in PORTINERIA, chiosco IDLE
    → Click icona occhiolino giallo sul chiosco
    
    Sistema verifica:
    ├── Chiosco non attivo → errore
    ├── N concorrenti raggiunto → errore (NB: più nascosti sullo stesso chiosco OK)
    └── OK:
        → Icona occhiolino giallo sottolineata
        → Stream video avviato: [R] vede [K], [K] NON vede [R]
        → Nessun microfono attivo
        
        Azioni disponibili (R):
        ├── Icona occhiolino verde → passa a COLLEGAMENTO IN CHIARO (FLOW 03)
        ├── Icona chiudi collegamento → chiude, torna IDLE
        └── Icona parla → passa direttamente a COLLEGAMENTO IN PARLATO (FLOW 06)
        
        Nota: icona messaggio attesa NON disponibile in nascosto
```

---

## FLOW 05 — Chiamata dal Chiosco

```
[Cliente] in hotel, davanti al chiosco:
    ├── Chiosco analogico: colpisce campanello fisico
    │       → Il chiosco intercetta frequenza campanello via microfono
    └── Chiosco touch: tap sullo schermo
            → Messaggio multilingua mostrato

[K] invia segnale di chiamata
    → Animazione circolare sul chiosco (~20 sec poi scompare)
    → Notifica a tutti i [R] abilitati per quell'hotel:
        ├── Se griglia visibile: icona cornetta verde lampeggiante sul chiosco
        └── Se pannello DATI aperto: notifica in alto a sinistra

[R] riceve chiamata:
    ├── [RL]: solo icona visiva (non operativa), nessuna azione
    ├── [R] — può rispondere → Click cornetta → COLLEGAMENTO IN PARLATO (FLOW 06)
    ├── [R] — vuole avvertire → Click messaggio attesa → FLOW 07
    └── Nessuno risponde per ~20 sec:
            → Animazione chiosco scompare
            → Cornetta rimane lampeggiante sul receptionist
            → [R] deve comunque rispondere per eliminare segnalazione

[R] risponde alla chiamata:
    → Videochat avviata con microfono (PARLATO)
    → Messaggio attesa eventuale disattivato automaticamente
    → Icona cornetta scompare da tutti i receptionist abilitati
```

---

## FLOW 06 — Collegamento in Parlato

```
Ingresso da:
    ├── Risposta a chiamata (FLOW 05)
    ├── Click "parla" da COLLEGAMENTO IN CHIARO
    └── Click "parla" da COLLEGAMENTO NASCOSTO

→ Video chiosco si sposta nella parte SINISTRA GRANDE dello schermo
→ Microfono [R] e [K] entrambi aperti
→ [K] vede [R], [R] vede [K]
→ Altri chioschi restano visibili in griglia (possono avere chiaro/nascosto ma microfono muto)

Azioni disponibili in PARLATO:
    ├── Condivisione schermo → FLOW 08
    ├── Chiudi collegamento → torna IDLE, video torna in griglia
    ├── Ritorno a collegamento in chiaro → torna CHIARO (microfono chiuso)
    └── Nella sezione DATI (si apre sovrapposta alla griglia):
        ├── Acquisizione documento → FLOW 09
        ├── Stampa remota → FLOW 11
        └── Gestione pagamento POS → FLOW 12
```

---

## FLOW 07 — Messaggio Attesa

```
Disponibile in: COLLEGAMENTO IN CHIARO o CHIAMATA IN ARRIVO

[R] click icona messaggio attesa
    → Messaggio multilingua lampeggiante su [K]: "Attendere..."
    → Icona sottolineata su tutti i receptionist (inclusi altri)
    
[R] click nuovamente → messaggio nascosto (toggle)

Se [R] risponde alla chiamata mentre messaggio attivo:
    → Messaggio disattivato automaticamente su chiosco
    → Icona disattivata per tutti i receptionist
```

---

## FLOW 08 — Condivisione Schermo

```
Disponibile solo in: COLLEGAMENTO IN PARLATO

[R] click icona condivisione schermo
    → Browser chiede quale schermo/finestra/scheda condividere
    → [R] seleziona (consigliato: solo finestra documento, non intero schermo)
    → Lo schermo selezionato appare su [K]
    
[R] click nuovamente → condivisione terminata

Caso d'uso tipico:
    [R] apre documento (planimetria, cartina)
    → Condivide solo quella finestra
    → [K] vede il documento
    → [R] spiega verbalmente
```

---

## FLOW 09 — Acquisizione Documento

```
Prerequisito: COLLEGAMENTO IN PARLATO attivo

[R]:
1. Invita cliente a preparare documento identità
2. Apre sezione DATI
3. Trova prenotazione del cliente in lista prenotazioni
4. Click icona macchina fotografica (colonna azioni)

Sistema:
    → Attiva webcam chiosco in modalità acquisizione
    → [R] vede preview della webcam

[Cliente] posiziona documento davanti alla webcam
    → [R] guida avvicinamento/allontanamento per migliore leggibilità

[R] esegue scatto (click)
    → Sistema mostra l'acquisizione
    → [R] valuta qualità:
        ├── Non leggibile → ripete scatto
        └── OK:
            → Seleziona tipo documento (da lista)
            → Inserisce titolo (opzionale)
            → Click CARICA
            → Documento salvato in DOCUMENTI della prenotazione

Ripete per retro documento o altri documenti

Per vedere documenti acquisiti:
    → Click icona occhio sulla prenotazione (DETTAGLIO)
    → Sezione DOCUMENTI
    → Lista documenti acquisiti

Alternative per allegare documenti:
    ├── Da PC locale: prenotazione in modifica → DOCUMENTI → + → upload file
    └── Webcam da telefono: cliente mostra biglietto/doc sul telefono
```

---

## FLOW 10 — Cancellazione Documento

```
[R] o [H] in prenotazione in modifica:
    → Sezione DOCUMENTI
    → Click icona cestino su documento
    
    Sistema verifica:
    ├── Documento inserito da albergatore, utente è R → cestino NON visibile
    └── OK:
        → Dialog conferma: "Sei sicuro di voler cancellare?"
        ├── Annulla → nessuna azione
        └── Conferma → documento eliminato
```

---

## FLOW 11 — Stampa Remota Documento

```
Prerequisito: COLLEGAMENTO IN PARLATO attivo + chiosco con stampante

[R] in DATI:
    → Entra in una delle sezioni:
        ├── Dettaglio Prenotazione → sezione DOCUMENTI
        ├── Dettaglio Camera (da prenotazione) → sezione DOCUMENTI
        └── Regolamento → sezione DOCUMENTI
    
    → Click icona stampante sul documento
    → Il documento viene inviato alla stampante predefinita del chiosco
    → La stampa viene eseguita fisicamente sul chiosco

Caso d'uso documento personale del cliente:
    Opzione 1 (webcam):
        → Acquisizione doc da telefono cliente (FLOW 09)
        → Stampa (questo flow)
        → Cancellazione documento (FLOW 10)
    
    Opzione 2 (email):
        → Cliente invia doc via email al receptionist
        → Receptionist salva su PC → upload su prenotazione (FLOW 09 alternativa)
        → Stampa (questo flow)
        → Cancellazione documento (FLOW 10)
```

---

## FLOW 12 — Gestione Pagamento POS

```
Prerequisito: COLLEGAMENTO IN PARLATO attivo + chiosco con POS

[R] in DATI → Lista Prenotazioni:
    → Click icona gestione pagamento (colonna azioni) sulla prenotazione cliente

Sistema apre pannello pagamento:

FASE 1 — Impostazione importo:
    [R] digita importo → click "Imposta prezzo"
    → Sistema invia importo al POS del chiosco
    → Dopo ~secondi il POS fisico mostra l'importo
    
    ⚠️ Importo impostabile UNA SOLA VOLTA per tentativo:
        Se errato: cliente preme ROSSO sul POS
        → Attesa annullamento POS
        → Reimpostazione importo

FASE 2 — Invio al pagamento:
    [R] guida cliente:
        → Passare carta
        → Digitare PIN
        → Premere VERDE per conferma

FASE 3 — Verifica esito:
    [R] click "Verifica pagamento"
    Sistema legge file output POS:
    ├── KO-NO_FILE → POS non ha ancora elaborato (~20 sec da PIN) → ripeti
    ├── KO-COMMAND_KO TIME: 20210415_163028 → transazione fallita
    └── OK-90.0EUR TIME: 20210415_183521 → OK
            ⚠️ Verificare data per assicurarsi che sia la transazione corrente
    
    ✅ Esito OK:
        → Sistema registra Pagamento
        → Tooltip su prezzo prenotazione aggiornato
        → [R] aggiorna MANUALMENTE il campo prezzo della prenotazione

Più pagamenti possibili sulla stessa prenotazione:
    (camera, minibar, altri servizi, tassa di soggiorno)
```

---

## FLOW 13 — Invio Documento via Email

```
Disponibile in qualsiasi momento (nessun collegamento richiesto)
Disponibile in: qualsiasi sezione con documenti

[R] o [H]:
    → Trova documento (prenotazione, camera, regolamento)
    → Click icona email sul documento

Sistema apre pannello invio:
    → Campo email destinatario (obbligatorio)
    → Campo testo (opzionale)
    → Click OK

Sistema:
    → Genera token univoco
    → Crea LinkTemporaneo con scadenza
    → Invia email:
        Mittente: noreply@receptionh24.com
        Oggetto: [Nome Hotel]
        Corpo: testo receptionist + link temporaneo
    
[Cliente] riceve email:
    → Click link temporaneo
    → Browser: richiesta download file
    → Apertura documento

Dopo scadenza:
    → Link non più funzionante
```

---

## FLOW 14 — Viewer Documenti

```
[R] in prenotazione (DETTAGLIO o MODIFICA):
    → Sezione DOCUMENTI
    → Sistema aggrega automaticamente:
        ├── Documenti della prenotazione
        ├── Documenti delle camere pertinenti
        └── Documenti del regolamento (hotel/turistiche)
    
    → [R] seleziona uno o più documenti (checkbox)
    → Appare bottone "VEDI IMMAGINI"
    → Click → si apre il Viewer

Viewer:
    → Parte alta: selezione documento da lista
    → Area principale: visualizzazione documento
    → [R] naviga fra i documenti selezionati

Uso tipico con condivisione schermo:
    → [R] apre Viewer con documenti rilevanti
    → Condivide finestra Viewer su [K]
    → Cliente vede i documenti in tempo reale
    → [R] spiega verbalmente
```

---

## FLOW 15 — Gestione Prenotazioni (Receptionist)

### Lista

```
[R] in DATI:
    → Click PRENOTAZIONI (sottosezione di DATI)
    → Se più hotel: selezione hotel (default: hotel del PARLATO attivo)
    → Lista prenotazioni con paginazione (10/25/30/50)
    
    Colonne visibili: INFO, CODICE, CHECK-IN, CHECK-OUT*, PAX, NOME, CAMERE, PAGAMENTO, DOCUMENTO, AZIONI
    * CHECK-OUT nascosto se eccede visibilità calendario
```

### Inserimento (prenotazione al volo)

```
[R] click icona + nella lista prenotazioni
    → Pannello inserimento:
        ├── Check-in (obbligatorio)
        ├── Check-out (obbligatorio, > check-in, ≤ oggi + giorni visibilità)
        ├── Tipo pagamento (obbligatorio)
        ├── Documento identità (obbligatorio)
        ├── Nome/Cognome/Gruppo (almeno uno)
        ├── Adulti/Ragazzi/Bambini (almeno uno)
        └── Aggiungi camere (obbligatorio) o flag overbooking

    → Click "Aggiungi camere":
        → Sistema mostra camere libere nel periodo selezionato
        → [R] seleziona una o più camere
    
    → Click "Crea prenotazione"
    
    Sistema verifica:
    ├── Date fuori visibilità → errore
    ├── Overbooking non permesso e camere occupate → errore
    └── OK → prenotazione creata
    
    Post-creazione:
        → [R] può ora acquisire documento e/o gestire pagamento
```

### Modifica

```
[R] click icona matita sulla prenotazione
    → Stesso pannello di inserimento, dati pre-popolati
    → Modifica dati → click "Modifica"
    
    Regole date:
    ├── Nuove date ≤ oggi + giorni visibilità
    └── No overbooking se non abilitato
    
    Modifica documenti:
        → Sezione DOCUMENTI nel pannello
        → Aggiunta: click + → upload file
        → Cancellazione: click cestino (solo doc propri)
```

### Cancellazione

```
[R] click icona cestino sulla prenotazione
    → Dialog conferma
    
    Sistema verifica:
    ├── Prenotazione di albergatore → cestino non visibile
    ├── Prenotazione propria con pagamento POS → cestino non visibile
    └── OK:
        → Conferma utente
        → Eliminata prenotazione + tutti i documenti associati
```

---

## FLOW 16 — Gestione Camere (Albergatore)

```
[H] → CAMERE → Lista camere
    ├── Click + → Pannello inserimento (FLOW 16a)
    ├── Click matita → Pannello modifica + documenti (FLOW 16b)
    ├── Click occhio → Dettaglio sola lettura
    └── Click cestino → Cancellazione (FLOW 16c)
```

### 16a — Inserimento Camera
```
[H] compila: nome, tipo, piano, booking consentito, letti (min: matrimoniali + singoli)
    → Opzionale: altri letti, dotazioni, prezzo, codice chiave, mq
    → Click "Salva"
```

### 16b — Modifica Camera
```
[H] modifica dati e/o aggiunge documenti (pdf/png/jpg/jpeg)
    → Click "Salva"
```

### 16c — Cancellazione Camera
```
[H] click cestino
    → Dialog conferma: "Questa operazione cancellerà tutte le prenotazioni e documenti associati"
    → Conferma → cascade delete: documenti camera + prenotazioni + documenti prenotazioni
```

---

## FLOW 17 — Regolamento (Albergatore)

```
[H] → REGOLAMENTO → Lista regole (stessa per tutti gli hotel, predefinita)
    → Click matita su una regola → Pannello valorizzazione

Pannello:
    → Seleziona lingua (default: italiano)
    → Testo risposta (textarea)
    → Sezione DOCUMENTI:
        → Click + → Titolo, lingua, tipo, selezione file → OK → allegato aggiunto
    → Salva

Documenti disponibili (albergatore): cancellazione, apertura, download
```

```
[R] → DATI → REGOLAMENTO → Lista regole (sola lettura)
    → Click icona occhio su regola → testo e documenti in sola lettura
    → Click icona email su documento → invio via email (FLOW 13)
```

---

## FLOW 18 — Cambio Password

```
Qualsiasi utente (eccetto Chiosco):
    → Click icona profilo utente (in header)
    → Pannello cambio password
    → Inserisce: password attuale, nuova password, conferma
    → Click Salva

[K] non può cambiare password → contattare assistenza K-SOL
```

---

## FLOW 19 — Installazione Chiosco

```
Tecnico/Assistenza K-SOL:
1. Installare Windows 10 + Chrome + driver stampante (se presente)
2. Configurare auto-login Windows (regedit)
3. Installare POS software (DoremiPos o myPOS)
4. Installare NodeJS + CORS + pos.js/pos.bat (POS INGENICO)
   OPPURE .NET 4.7.2 + driver USB + myPOSK.exe (myPOS)
5. Creare collegamento Chrome in kiosk mode su Desktop
6. Copiare collegamento Chrome in shell:startup
7. Primo avvio: fare login manuale, selezionare chiosco, verificare OK (icona verde)
8. Chiudere Chrome, riaprire: verificare autologin
9. Configurare stampante come predefinita (se presente)
10. Comunicare path file POS all'assistenza per configurazione portale

→ Procedere con COLLAUDO (FLOW 20)
```

---

## FLOW 20 — Collaudo Chiosco

```
Prerequisiti: hotel configurato, chiosco installato, FAQ e camere configurate, receptionist associato
Prerequisito operativo: avvisare assistenza K-SOL dell'orario di collaudo

1. Restart chiosco da zero → verifica avvio automatico applicazione
2. Eseguire chiamata (analogico: campanello; touch: tap schermo)
3. Receptionist risponde → verifica videochat
4. Receptionist crea prenotazione di test
5. Acquisizione documento via webcam
6. Test POS: imposta 0,10€ → passare carta → verifica esito OK
7. Stampa documento (FAQ o acquisito) → verifica stampa fisica
8. Login albergatore → cancellazione prenotazione di test
9. Comunicare fine collaudo ad assistenza K-SOL
```

---

## FLOW 21 — Risoluzione Problemi Chiosco

```
[R] nota problema sul chiosco:

Livello 1 — LOGOUT/LOGIN:
    → [R] usa opzione "..." nell'interfaccia receptionist (non dettagliata nel manuale)
    → Il chiosco esegue logout
    → Autologin automatico
    → Tutte le strutture app vengono reinizializzate
    → Verificare risoluzione

Livello 2 — PC RESTART:
    → [R] usa opzione restart (non dettagliata nel manuale)
    → Il PC del chiosco si spegne e riavvia
    → Attesa ~2 minuti per connettività
    → Tutte le componenti (Chrome, POS, ...) ripartono automaticamente
    → Verificare risoluzione
```
