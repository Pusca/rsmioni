# 03 — Ruoli e Permessi

## Profili della Piattaforma

| Sigla | Nome | Disponibile v1.0 |
|-------|------|-----------------|
| R | Receptionist | SÌ |
| RL | Receptionist Lite | SÌ |
| K | Chiosco | SÌ |
| H | Gestore Hotel (Albergatore) | SÌ |
| GR | Gestore Receptionist | NO (previsto) |
| ADMIN | Amministratore (K-SOL) | NO (previsto) |

---

## Descrizione Ruoli

### Receptionist (R)
- Collegato a uno o più hotel
- Gestisce videochat interattive con i chioschi dei propri hotel
- Accede a prenotazioni degli hotel assegnati (crea/modifica/cancella con restrizioni)
- NON può cancellare prenotazioni create dall'albergatore
- NON può cancellare prenotazioni proprie se hanno un pagamento POS
- Sottoposto a vincoli di visibilità calendario imposti dall'albergatore
- Può essere filtrato per IP (whitelist configurata dal Gestore Receptionist)
- Utenze consigliate per turno (es. `u01t0815`)

### Receptionist Lite (RL)
- Collegato a uno o più hotel
- **Nessuna interattività** con il chiosco
- Può solo vedere i chioschi in modalità nascosta (telecamera)
- NON risponde a chiamate
- NON accede alla sezione DATI
- NON ha messaggio attesa
- Icona cornetta in sola lettura (documentativa)

### Chiosco (K)
- Un'utenza per hotel, seleziona il chiosco fisico al primo login
- Nessuna funzionalità visiva propria
- Permette la videochat con il receptionist (se interattivo)
- Gestisce interazione POS su comando receptionist
- Gestisce stampa su comando receptionist
- Autologin dopo primo accesso
- Logout tramite tasto ESC
- Cambio password: solo via assistenza K-SOL
- Schermata full-screen senza menu né toolbar (Chrome kiosk)

### Gestore Hotel / Albergatore (H)
- Accede a: PRENOTAZIONI, CAMERE, REGOLAMENTO
- NON ha portineria né videochat
- Piena gestione camere (insert/update/delete)
- Piena gestione prenotazioni (incluse quelle create dai receptionist)
- Gestione e valorizzazione regolamento (testo + documenti)
- Può cancellare qualsiasi documento (anche del receptionist)
- Vede documenti identità caricati dai receptionist
- Configura indirettamente: visibilità calendario, overbooking, cancellazione automatica (via assistenza)

### Gestore Receptionist (GR) — previsto
- Gestisce utenze receptionist, le collega agli hotel
- Vede tutti gli hotel configurati (alcune modifiche)
- Vede camere e prenotazioni di tutti gli hotel in sola lettura
- Non disponibile in v1.0

### Amministratore (ADMIN) — previsto
- Controllo totale del sistema
- Solo uso K-SOL
- Non disponibile in v1.0

---

## Matrice Permessi Funzionalità

La tabella usa: ✅ = abilitato, ❌ = non abilitato, ⚠️ = abilitato con restrizioni, 👁 = sola lettura

| Funzionalità | R | RL | K | H | GR | ADMIN |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| **LOGIN** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **CAMBIO PASSWORD** | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| **PORTINERIA — Griglia chioschi** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **PORTINERIA — Collegamento in chiaro** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **PORTINERIA — Collegamento nascosto** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **PORTINERIA — Risposta chiamata** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **PORTINERIA — Icona chiamata (visiva)** | ✅ | 👁 | ❌ | ❌ | ❌ | ❌ |
| **PORTINERIA — Collegamento in parlato** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **PORTINERIA — Messaggio attesa** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **PORTINERIA — Condivisione schermo** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **DATI — Sezione** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **ACQUISIZIONE DOCUMENTO** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **STAMPA REMOTA** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **GESTIONE PAGAMENTO POS** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **INVIO DOCUMENTO (email)** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **VIEWER DOCUMENTI** | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| **LISTA PRENOTAZIONI** | ⚠️ | ❌ | ❌ | ✅ | 👁 | ✅ |
| **DETTAGLIO PRENOTAZIONE** | ⚠️ | ❌ | ❌ | ✅ | 👁 | ✅ |
| **INSERIMENTO PRENOTAZIONE** | ⚠️ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **MODIFICA PRENOTAZIONE** | ⚠️ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **CANCELLAZIONE PRENOTAZIONE** | ⚠️ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **AGGIUNTA DOCUMENTO A PRENOTAZIONE** | ✅ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **CANCELLAZIONE DOCUMENTO PRENOTAZIONE** | ⚠️ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **LISTA CAMERE** | 👁 | ❌ | ❌ | ✅ | 👁 | ✅ |
| **INSERIMENTO CAMERA** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **MODIFICA CAMERA** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **CANCELLAZIONE CAMERA** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **LISTA REGOLAMENTO** | 👁 | ❌ | ❌ | ✅ | ❌ | ✅ |
| **VALORIZZAZIONE REGOLA** | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| **INVIO DOCUMENTO REGOLAMENTO** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **CONFIGURAZIONI HOTEL** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **GESTIONE UTENTI** | ❌ | ❌ | ❌ | ❌ | ✅ | ✅ |
| **INSTALLAZIONE CHIOSCO** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## Restrizioni Dettagliate per Ruolo

### Receptionist — Restrizioni Prenotazioni

| Operazione | Condizione abilitante | Condizione bloccante |
|------------|----------------------|---------------------|
| Vedere lista | Sempre | Date oltre visibilità calendario: checkout non mostrato |
| Inserire | check-out ≤ today + giorniVisibilitaCalendario | Overbooking se non abilitato |
| Modificare date | Nuove date ≤ today + giorniVisibilitaCalendario | Overbooking se non abilitato |
| Cancellare | Propria prenotazione senza pagamento POS | Prenotazione di albergatore; propria con pagamento POS |
| Cancellare documento | Documento inserito da se stesso | Documento inserito da albergatore |

### Receptionist — Restrizioni Videochat

| Azione | Stato richiesto | Vincolo hardware |
|--------|----------------|-----------------|
| Collegamento in chiaro | Chiosco idle/nascosto | Chiosco interattivo |
| Collegamento nascosto | Sempre | Qualsiasi chiosco |
| Risposta chiamata | In chiamata dal chiosco | Chiosco interattivo |
| Parlato | Da chiaro/nascosto o chiamata | Chiosco interattivo |
| Acquisizione documento | In parlato | Chiosco con webcam |
| Stampa remota | In parlato | Chiosco con stampante |
| Gestione POS | In parlato | Chiosco con POS |
| Condivisione schermo | In parlato | — |
| Messaggio attesa | In chiaro o in chiamata | — |

### Chiosco — Comportamenti

| Situazione | Comportamento |
|------------|--------------|
| Primo login | Selezione chiosco da lista |
| Login successivi | Autologin con dati locali |
| Logout | Tasto ESC; rimuove dati locali |
| Chiamata analogica | Intercetta campanello via microfono |
| Chiamata touch | Tap su schermo; messaggio multilingua |
| Chiamata in corso | Animazione circolare; 20 sec poi scompare |
| Messaggio attesa | Testo multilingua lampeggiante |
| Condivisione schermo | Mostra schermo del receptionist |
| Stamp remota | Stampa su stampante predefinita |
| POS | Mostra importo e processa carta |
| Non interattivo | Solo visione nascosta; nessun audio/video bidirezionale |

---

## Routing Post-Login

```
login success
    ├── profilo == RECEPTIONIST      → /portineria
    ├── profilo == RECEPTIONIST_LITE → /portineria (no interactivity)
    ├── profilo == CHIOSCO           → /kiosk (fullscreen)
    ├── profilo == GESTORE_HOTEL     → /prenotazioni
    ├── profilo == GESTORE_RECEPTIONIST → /gestione-receptionist (v1.1+)
    └── profilo == ADMIN             → /admin (v1.1+)
```

---

## Visibilità Navigazione per Profilo

| Sezione Nav | R | RL | K | H |
|-------------|:---:|:---:|:---:|:---:|
| Portineria (icona) | ✅ | ✅ | ❌ | ❌ |
| DATI (toggle) | ✅ | ❌ | ❌ | ❌ |
| Prenotazioni | ❌ | ❌ | ❌ | ✅ |
| Camere | ❌ | ❌ | ❌ | ✅ |
| Regolamento | ❌ | ❌ | ❌ | ✅ |
| Cambio password | ✅ | ✅ | ❌ | ✅ |
| Logout | ✅ | ✅ | ESC | ✅ |

---

## Modello Multi-Hotel

- Un receptionist può essere associato a più hotel
- Ogni hotel ha una o più utenze receptionist per turno
- Utenza `hall01` (RS MIONI): utenza multi-albergo per deleghe operative
- Il sistema preimposta l'hotel del COLLEGAMENTO IN PARLATO attivo nella selezione lista prenotazioni

---

## IP Whitelist (Gestore Receptionist)

- Lista IP statici per ogni receptionist
- Se lista vuota: nessun filtro (firewall disabilitato)
- Receptionist non può fare login da IP non in whitelist
- Configurabile solo via assistenza K-SOL (non dall'interfaccia in v1.0)
