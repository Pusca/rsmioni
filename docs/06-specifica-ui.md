# 06 — Specifica UI / UX

## Principi Generali

- **Estetica**: dark dashboard professionale (gestionale)
- **Densità**: alta — tabelle dense, icone di stato, poco whitespace
- **Lingua**: italiano (terminologia allineata al manuale)
- **Schermate kiosk**: full screen, nessun menu, nessuna toolbar Chrome
- **Palette**: dark (sfondo scuro, elementi chiari, accenti colorati per icone di stato)
- **Proporzioni**: ispirate al manuale RH24 senza copiare asset proprietari

---

## Palette Colori (Derivata dal Manuale)

| Uso | Colore / Descrizione |
|-----|---------------------|
| Sfondo principale | Grigio scuro / nero (#1a1a2e o simile) |
| Header / nav | Blu scuro o grigio molto scuro |
| Pannelli / card | Grigio scuro (#2d2d44 o simile) |
| Testo primario | Bianco / grigio chiaro |
| Testo secondario | Grigio medio |
| Accento positivo / OK | Verde (#28a745) |
| Accento attenzione / chiamata | Verde brillante lampeggiante |
| Collegamento chiaro (idle) | Verde |
| Collegamento nascosto (idle) | Giallo / arancio |
| Icone azioni in chiaro attivo | Sottolineato/barra rossa |
| Icone azioni nascosto attivo | Sottolineato |
| Warning / attenzione | Arancione / giallo |
| Errore / KO | Rosso |
| Documento da acquisire | Rosso (icona macchina fotografica) |
| Pagamento da eseguire | Icona carta di credito (neutro) |
| Pagamento OK | Verde (icona OK) |
| Documento OK | Verde (icona OK) |
| Bordi / separatori | Grigio scuro |
| Hover su riga lista | Grigio medio (evidenzia icone AZIONI) |

---

## Layout Globale

### Header (sempre visibile, eccetto kiosk)

```
┌────────────────────────────────────────────────────────────────────┐
│ [Logo RH24]  [🏨 Portineria]  [Dati toggle]          [👤] [⏻]    │
└────────────────────────────────────────────────────────────────────┘
```

- Logo a sinistra
- Navigazione principale con icone grandi (portineria, apertura/chiusura DATI, camere, regolamento)
- A destra: icona profilo utente (cambio password), icona logout

Per albergatore:
```
┌────────────────────────────────────────────────────────────────────┐
│ [Logo RH24]  [📅 Prenotazioni]  [🛏️ Camere]  [📋 Regolamento]  [👤] [⏻] │
└────────────────────────────────────────────────────────────────────┘
```

---

## Schermata PORTINERIA (Receptionist)

### Layout Principale

```
┌─────────────────────────────┬──────────────────────────────────────┐
│                             │  ┌──────────┐  ┌──────────┐         │
│                             │  │ Hotel A  │  │ Hotel A  │         │
│    AREA VIDEOCHAT           │  │ Chiosco1 │  │ Chiosco2 │         │
│    (inizialmente vuota)     │  │ 🟢 🟡    │  │ 🟢 🟡    │         │
│                             │  └──────────┘  └──────────┘         │
│    In PARLATO:              │  ┌──────────┐  ┌──────────┐         │
│    → Video chiosco grande   │  │ Hotel B  │  │          │         │
│                             │  │ Chiosco1 │  │          │         │
│                             │  │ 🟡       │  │          │         │
│                             │  └──────────┘  └──────────┘         │
└─────────────────────────────┴──────────────────────────────────────┘
         ~50-60% larghezza                    ~40-50% larghezza
```

### Cella Chiosco (Griglia Destra)

```
┌────────────────────────────────────┐
│ Hotel Padova — Chiosco Ingresso    │  ← Testata: nome hotel + nome chiosco
│ ┌────────────────────────────────┐ │
│ │   [stream video / placeholder] │ │  ← Preview o placeholder
│ └────────────────────────────────┘ │
│  🟢  🟡                            │  ← Icone azioni (stato IDLE)
└────────────────────────────────────┘
```

**Stato IN_CHIARO** (icone cambiano):
```
│  🟢̲  🟡  ✉️  📵  🗣️              │  ← 🟢 sottolineato con barra rossa
```

**Stato IN_PARLATO** (video si sposta a sinistra):
```
Griglia destra: cella rimane in griglia, ma video è nel pannello sinistro
```

**Stato IN_CHIAMATA**:
```
│  📞(lampeggia)  ✉️               │  ← Cornetta lampeggiante verde
```

**Receptionist Lite** (IDLE):
```
│  🟡                               │  ← Solo icona nascosto
```

### Notifica Chiamata con DATI aperto
```
┌────────────────────────────────────────────────────────┐
│ ⚠️ Chiamata in arrivo — Hotel Padova / Chiosco Ingresso │  ← Banner top-left
└────────────────────────────────────────────────────────┘
```

---

## Schermata PORTINERIA — Stato IN_PARLATO

```
┌───────────────────────────────────┬─────────────────────────────────┐
│                                   │  ┌──────────┐  ┌──────────┐    │
│   ╔═════════════════════════════╗ │  │ Chiosco2 │  │ Chiosco3 │    │
│   ║   VIDEO CHIOSCO GRANDE     ║ │  │ 🟢 🟡    │  │ 🟡       │    │
│   ║   (Hotel A / Chiosco 1)    ║ │  └──────────┘  └──────────┘    │
│   ║                             ║ │  ┌──────────┐                  │
│   ║   [🖥️]  [📵]  [↩️]         ║ │  │ Chiosco4 │                  │
│   ╚═════════════════════════════╝ │  │ 🟡       │                  │
│                                   │  └──────────┘                  │
└───────────────────────────────────┴─────────────────────────────────┘
```

---

## Schermata KIOSK (Profilo Chiosco)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                                                                      │
│                  [ AREA VIDEO RECEPTIONIST ]                        │
│                   (o placeholder quando idle)                       │
│                                                                      │
│                                                                      │
│                                                                      │
│   ┌────────────────────────────────────────────────────────────┐   │
│   │  Tocca lo schermo per chiamare il receptionist              │   │
│   │  (Touch) — solo quando idle e chiosco touch                 │   │
│   └────────────────────────────────────────────────────────────┘   │
│                                                                      │
│  ● STATO: icona connessione in alto sx (verde = OK)                 │
└──────────────────────────────────────────────────────────────────────┘
```

**Durante chiamata in corso** (animazione circolare):
```
│           ◯ ◯ ◯ (animazione cerchi pulsanti)                       │
│    "Connessione in corso con il receptionist..."                    │
```

**Messaggio attesa** (lampeggiante, multilingua):
```
│                                                                      │
│    🕐 Attendere...  /  Please wait...  /  Bitte warten...          │
│         (testo lampeggiante, multilingua alternante)               │
│                                                                      │
```

**Durante condivisione schermo**:
```
│                                                                      │
│         [ SCHERMO RECEPTIONIST ]                                   │
│         (documento/pagina condivisa)                               │
│                                                                      │
```

---

## Schermata DATI (pannello sovrapposto alla griglia, lato receptionist)

```
┌─────────────────────────────┬──────────────────────────────────────┐
│                             │ ┌────────────────────────────────┐   │
│   AREA VIDEOCHAT            │ │  PANNELLO DATI                 │   │
│   (rimane attiva)           │ │                                │   │
│                             │ │  [Hotel: ▼ Padova]             │   │
│                             │ │                                │   │
│                             │ │  PRENOTAZIONI  REGOLAMENTO     │   │
│                             │ │                                │   │
│                             │ │  [Lista prenotazioni...]       │   │
│                             │ │                                │   │
│                             │ └────────────────────────────────┘   │
└─────────────────────────────┴──────────────────────────────────────┘
```

---

## Schermate GESTORE HOTEL

### Layout (no portineria)

```
┌────────────────────────────────────────────────────────────────────┐
│ [Logo RH24]  [📅 Prenotazioni]  [🛏️ Camere]  [📋 Regolamento]  [👤] [⏻] │
└────────────────────────────────────────────────────────────────────┘
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│   [Contenuto sezione corrente]                                     │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

---

## Componente: Lista Densa (Tabella)

Usata per: Prenotazioni, Camere, Regolamento.

```
┌────────┬───────────┬───────────┬─────┬────────────┬────────┬──────┬──────────────┐
│ INFO   │ CODICE    │ CHECK-IN  │ OUT │ PAX        │ NOME   │ CAM. │     AZIONI   │
├────────┼───────────┼───────────┼─────┼────────────┼────────┼──────┼──────────────┤
│        │ BK001     │ 22/04/26  │ 24/ │ 2 (🧑2)    │ Rossi  │ 101  │  [hover →]   │
│   ⚠️   │ BK002     │ 23/04/26  │  *  │ 3 (🧑2👧1) │ Bianchi│ 102  │              │
│        │           │ 25/04/26  │ 28/ │ 1 (🧑1)    │ Verdi  │ 201  │              │
└────────┴───────────┴───────────┴─────┴────────────┴────────┴──────┴──────────────┘
*  = data non visibile (eccede visibilità calendario)
⚠️ = warning (tooltip: nessuna camera assegnata / overbooking / ...)
```

### Icone Stato in Lista Prenotazioni

| Colonna | Stato | Icona |
|---------|-------|-------|
| Pagamento | Già pagato | ✅ verde |
| Pagamento | Da pagare all'arrivo | 💳 carta di credito |
| Documento | Già fornito | ✅ verde |
| Documento | Da acquisire | 📷 rossa |
| Info | Warning attivo | ⚠️ arancione (tooltip al hover) |
| Info | Nessuno | vuoto |

### Colonna AZIONI (visibile al hover sulla riga)

**Per receptionist** (normale):
```
[🗑️]  [✏️]  [👁]
```

**Per receptionist** (in parlato, chiosco con POS):
```
[🗑️]  [✏️]  [👁]  [📷]  [💳]
```

**Per albergatore**:
```
[🗑️]  [✏️]  [👁]
```

### Paginazione
```
Righe per pagina: [10 ▼]  |  < 1  2  3 >  |  Totale: 27 elementi
```

---

## Componente: Pannello Modale / Laterale

Usato per: inserimento/modifica prenotazione, inserimento camera, cambio password, ecc.

```
┌──────────────────────────────────────────────────────────┐
│  Inserimento Prenotazione                          [✕]   │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  Check-in: [📅 gg/mm/aaaa]   Check-out: [📅 gg/mm/aaaa]│
│                                                          │
│  Tipo pagamento: (●) Già avvenuto  ( ) Da pagare        │
│                                                          │
│  Documento identità: ( ) Già fornito  (●) Da acquisire  │
│                                                          │
│  Nome: [_____________]  Cognome: [_____________]         │
│                                                          │
│  Adulti: [1]  Ragazzi: [0]  Bambini: [0]                │
│                                                          │
│  ─────── CAMERE ─────────────────────────────────────   │
│  [+ Aggiungi camere]                                     │
│                                                          │
│  ─────── DOCUMENTI ──────────────────────────────────   │
│  [+] (disponibile solo dopo creazione)                   │
│                                                          │
├──────────────────────────────────────────────────────────┤
│                    [Annulla]  [Crea prenotazione]        │
└──────────────────────────────────────────────────────────┘
```

---

## Componente: Pannello Aggiungi Camere

```
┌─────────────────────────────────────────────────────────────────┐
│  Seleziona camere disponibili (22/04 - 24/04)           [✕]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────┬───────────┬───────┬───────────────────┬──────────┐   │
│  │  ☐   │ CAMERA    │ TIPO  │ LETTI             │ MQ       │   │
│  ├──────┼───────────┼───────┼───────────────────┼──────────┤   │
│  │  ☐   │ 101       │ Doppia│ M:1               │ 22       │   │
│  │  ☑   │ 201       │ Singola│ S:1              │ 15       │   │
│  └──────┴───────────┴───────┴───────────────────┴──────────┘   │
│                                                                 │
│  [□ Overbooking]                                                │
├─────────────────────────────────────────────────────────────────┤
│                                    [Annulla]  [Aggiungi]        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Componente: Gestione Pagamento POS

```
┌────────────────────────────────────────────────┐
│  Gestione Pagamento                     [✕]   │
│  Hotel Padova — Prenotazione: Rossi            │
├────────────────────────────────────────────────┤
│                                                │
│  Importo da pagare: [_________€]              │
│                                                │
│  [Imposta prezzo]                              │
│                                                │
│  ─────────────────────────────────────────    │
│  ① Il POS mostrerà l'importo                   │
│  ② Invita il cliente a passare la carta        │
│  ③ Il cliente digita il PIN e preme VERDE      │
│                                                │
│  [Verifica pagamento]                          │
│                                                │
│  Esito ultimo pagamento:                       │
│  ┌──────────────────────────────────────────┐ │
│  │ OK — 90.00€ — 15/04/2021 18:35:21       │ │
│  └──────────────────────────────────────────┘ │
│                                                │
└────────────────────────────────────────────────┘
```

---

## Componente: Acquisizione Documento (Popup)

```
┌───────────────────────────────────────────────────────────┐
│  Acquisizione Documento                            [✕]   │
├───────────────────────────────────────────────────────────┤
│                                                           │
│  ┌───────────────────────────────────────────────────┐   │
│  │           [IMMAGINE ACQUISITA DALLA WEBCAM]       │   │
│  │                                                   │   │
│  │           (anteprima documento cliente)           │   │
│  └───────────────────────────────────────────────────┘   │
│                                                           │
│  Tipo documento: [Carta d'identità ▼]                    │
│  Titolo (opz.):  [_________________________]             │
│                                                           │
│  [Ripeti scatto]           [CARICA]                      │
└───────────────────────────────────────────────────────────┘
```

---

## Componente: Viewer Documenti

```
┌──────────────────────────────────────────────────────────────────────┐
│  Viewer Documenti                                             [✕]   │
├───────────────────────────────────────────────────────────────────── │
│  Documento: [Planimetria Hotel ▼]   [Regolamento Incendio ▼]  ...   │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│                                                                      │
│              [ VISUALIZZAZIONE DOCUMENTO ]                          │
│              (pdf inline o immagine)                                │
│                                                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Componente: Invio Documento Email

```
┌────────────────────────────────────────────────┐
│  Invia Documento                        [✕]   │
├────────────────────────────────────────────────┤
│                                                │
│  Email: [_________________________________]   │
│                                                │
│  Messaggio:                                    │
│  ┌──────────────────────────────────────────┐ │
│  │                                          │ │
│  │  (testo opzionale del receptionist)      │ │
│  │                                          │ │
│  └──────────────────────────────────────────┘ │
│                                                │
│                     [Annulla]  [OK]            │
└────────────────────────────────────────────────┘
```

---

## Componente: Lista Camere (Albergatore)

```
┌──────┬────────────┬───────────┬───────┬───────────────┬───────┬─────┬──────────┬───────────┐
│ CAM. │ TIPO       │ PIANO     │PREZZO │ LETTI         │ MQ    │ ... │ PRENOT.  │  AZIONI   │
├──────┼────────────┼───────────┼───────┼───────────────┼───────┼─────┼──────────┼───────────┤
│ 101  │ Doppia     │ 1°        │€90/n  │ M:1 S:0       │ 22    │🚿🌡️│ ✅       │[🗑️][✏️][👁]│
│ 201  │ Singola    │ 2°        │€60/n  │ M:0 S:1       │ 15    │🚿   │ ✅       │           │
│ 301  │ Suite      │ 3°        │€150/n │ M:2           │ 40    │🛁🌡️🍸│ ❌      │           │
└──────┴────────────┴───────────┴───────┴───────────────┴───────┴─────┴──────────┴───────────┘
```

Icone dotazioni visibili nella colonna `...`:
- 🚿 Doccia, 🛁 Vasca, 🍸 Minibar vuoto, 🍾 Minibar pieno, 🌡️ Aria condizionata

---

## Componente: Lista Regolamento

```
┌──────────────────────────────────────────────────┬────────────┐
│ REGOLA                                           │  AZIONI    │
├──────────────────────────────────────────────────┼────────────┤
│ DESCRIZIONE STRUTTURA                            │  [✏️]      │
│ NUMERO STELLE                    ● valorizzata   │  [✏️]      │
│ PRIMA COLAZIONE: LUOGO ED ORARI  ● valorizzata   │  [✏️]      │
│ RISTORANTI CONSIGLIATI                           │  [✏️]      │
│ NUMERI TELEFONICI EMERGENZA: AMBULANZA           │  [✏️]      │
└──────────────────────────────────────────────────┴────────────┘
Lingua: [Italiano ▼]
```

Per receptionist (sola lettura):
```
│ AZIONI: [👁]  [📧 doc1]  [📧 doc2]                              │
```

---

## Componente: Pannello Camera (Dettaglio/Modifica)

```
┌────────────────────────────────────────────────────────────┐
│  Inserimento Camera                                 [✕]   │
├────────────────────────────────────────────────────────────┤
│                                                            │
│  Camera*: [___]   Tipo*: [Doppia ▼]   Piano*: [1°]       │
│                                                            │
│  Letto Matrimoniale*: [1]  Letto Singolo*: [0]            │
│  Letto Aggiunto: [0]  Divano Singolo: [0]  Matrimon: [0] │
│  Culla: [0]                                               │
│                                                            │
│  [☐] Doccia  [☐] Vasca  [☐] Minibar  [☐] Minibar pieno  │
│  [☐] Aria condizionata                                    │
│                                                            │
│  Quadro elettrico: [________________________________]     │
│  Codice chiave: [____________]   MQ: [____]               │
│                                                            │
│  [☑] Booking consentito                                   │
│                                                            │
│  Prezzi:                                                  │
│  Singola: [___€]  Doppia: [___€]  Tripla: [___€]  ...    │
│                                                            │
│  ─── DOCUMENTI ──────────────────────────────────────    │
│  [+]                                                      │
│  • Planimetria.pdf  [🔗] [⬇️] [🗑️]                       │
│  • Foto101.jpg      [🔗] [⬇️] [🗑️]                       │
│                                                            │
├────────────────────────────────────────────────────────────┤
│                          [Annulla]  [Salva]               │
└────────────────────────────────────────────────────────────┘
```

---

## Componente: Dettaglio Prenotazione (Sola Lettura)

```
┌────────────────────────────────────────────────────────────┐
│  Prenotazione BK001                                 [✕]   │
├────────────────────────────────────────────────────────────┤
│  Check-in: 22/04/2026    Check-out: 24/04/2026            │
│  Nome: Marco Rossi       PAX: 2 adulti                    │
│  Tipo pag.: Già pagato   Documento: Già fornito           │
│  Check-in confermato: ✅ 22/04/2026 14:30                 │
│                                                            │
│  ─── CAMERE ─────────────────────────────────────────    │
│  ┌───────────┬───────┬─────────────┬──────────────────┐  │
│  │ CAMERA    │ TIPO  │ LETTI       │        AZIONI    │  │
│  ├───────────┼───────┼─────────────┼──────────────────┤  │
│  │ 101       │ Doppia│ M:1         │  [👁]  [🖨️]     │  │
│  └───────────┴───────┴─────────────┴──────────────────┘  │
│                                                            │
│  ─── DOCUMENTI ──────────────────────────────────────    │
│  [☑] CartaIdentita_fronte.jpg   [🔗] [⬇️] [📧] [🖨️]    │
│  [☑] CartaIdentita_retro.jpg    [🔗] [⬇️] [📧] [🖨️]    │
│                                                            │
│  [VEDI IMMAGINI] (se almeno un documento selezionato)     │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

## Componente: Cambio Password

```
┌────────────────────────────────────┐
│  Cambio Password               [✕]│
├────────────────────────────────────┤
│                                    │
│  Password attuale: [__________]    │
│  Nuova password:   [__________]    │
│  Conferma:         [__________]    │
│                                    │
│                  [Annulla]  [Salva]│
└────────────────────────────────────┘
```

---

## Schermata LOGIN

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                    [Logo Smart Reception Service]                   │
│                           RH24                                      │
│                                                                      │
│              ┌────────────────────────────────────┐                │
│              │  Username                          │                │
│              ├────────────────────────────────────┤                │
│              │  Password                          │                │
│              └────────────────────────────────────┘                │
│                                                                      │
│                          [ ACCEDI ]                                 │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Selezione chiosco** (primo login chiosco):
```
│  Seleziona il chiosco:                                              │
│  (●) Chiosco Ingresso                                               │
│  ( ) Chiosco Lobby                                                  │
│                      [ Continua ]                                   │
```

---

## Icone Sistema — Riferimento Completo

| Icona | Azione / Significato |
|-------|---------------------|
| 🏨 | Portineria |
| 📂 | Apertura sezione DATI |
| 📁 | Chiusura sezione DATI |
| 🛏️ | Camere |
| 📋 | Regolamento |
| ⏻ | Logout dal sistema |
| ➕ | Inserimento nuovo elemento |
| 🗑️ | Cancellazione (con conferma) |
| ✏️ | Modifica (apre pannello) |
| 👁 | Visualizzazione sola lettura |
| 🔗 | Apri documento in nuovo tab |
| ⬇️ | Scarica documento su PC |
| 📧 | Invia documento via email |
| 📷 | Acquisizione documento via webcam chiosco |
| 🖨️ | Stampa documento su stampante chiosco |
| 💳 | Gestione pagamento POS |
| ✅ | OK (pagamento effettuato / documento fornito) |
| 📸 rossa | Documento identità da acquisire |
| 💳 | Pagamento da eseguire all'arrivo |
| ⚠️ | Attenzione (tooltip al hover) |
| ℹ️ | Informazione |
| 🔑 | Codice chiave camera |
| 🟢 | Collegamento in chiaro (idle) |
| 🟢̲ | Collegamento in chiaro attivo |
| 🟡 | Collegamento nascosto (idle) |
| 🟡̲ | Collegamento nascosto attivo |
| 📵 | Chiusura collegamento |
| ↩️ | Ritorno a collegamento in chiaro da parlato |
| 🖥️ | Condivisione schermo |
| ✉️ | Messaggio attesa |
| ✉️̲ | Messaggio attesa attivo |
| 📞 | Chiamata in arrivo (lampeggiante) |
| 🗣️ | Collegamento in parlato |
| 🚿 | Doccia presente |
| 🛁 | Vasca presente |
| 🍸 | Minibar vuoto |
| 🍾 | Minibar pieno |
| 🌡️ | Aria condizionata |
| ✅ | Prenotabile |
| ❌ | Non prenotabile |

---

## Comportamenti UX Notevoli

### Hover su righe lista
- Le icone della colonna AZIONI appaiono **solo al passaggio del mouse** sulla riga
- Default: celle azioni vuote
- Hover: icone appaiono sulla destra della riga

### Icone sottolineate
- Quando un collegamento è attivo, l'icona corrispondente viene sottolineata (con barra colorata sotto)
- Collegamento in chiaro: barra rossa sotto l'occhio verde
- Collegamento nascosto: sottolineatura sotto l'occhio giallo
- Messaggio attesa: sottolineatura

### Tooltip
- ⚠️ Info nella lista prenotazioni: tooltip al hover con messaggio (es. "Nessuna camera assegnata")
- Campo PAX: tooltip con dettaglio (es. "2 adulti, 1 ragazzo")
- Campo LETTI: tooltip con descrizione estesa (es. "M: matrimoniale, S: singolo")
- Campo prezzo prenotazione: tooltip con storico pagamenti POS

### Conferme obbligatorie
- Ogni operazione di cancellazione richiede dialog di conferma esplicita
- Cancellazione camera: warning aggiuntivo su cascade (cancella prenotazioni e documenti)

### Paginazione
- Selettore righe: 10, 25, 30, 50
- Se righe > altezza pagina: scrollbar verticale a destra della tabella

### Notifica chiamata (DATI aperto)
- Banner persistente in alto a sinistra (non oscura contenuto)
- Click sul banner: apre portineria con focus sul chiosco in chiamata

### Lingua interfaccia
- Kiosk: multilingua (messaggi di chiamata e attesa)
- Interfaccia receptionist/albergatore: italiano
