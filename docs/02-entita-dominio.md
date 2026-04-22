# 02 — Entità di Dominio

## Diagramma delle Entità Principali

```
Hotel
  ├── Chiosco (1..N)
  ├── Camera (1..N)
  │     └── Documento (0..N)
  ├── Prenotazione (0..N)
  │     ├── Camera (M..N)
  │     ├── Documento (0..N)
  │     └── Pagamento (0..N)
  └── Regola (fissa di piattaforma, valorizzata per hotel)
        └── Documento (0..N, per lingua)

Utente
  ├── Receptionist     → Hotel (M..N)
  ├── ReceptionistLite → Hotel (M..N)
  ├── GestoreHotel     → Hotel (1..N)
  └── Chiosco          → Hotel (1)

CollegamentoAttivo (runtime, non persistito)
  ├── Receptionist
  ├── Chiosco
  └── StatoCollegamento: CHIARO | NASCOSTO | PARLATO | CHIAMATA
```

---

## 1. Hotel

Rappresenta un albergo contrattualizzato con RS MIONI.

| Campo | Tipo | Obbligatorio | Note |
|-------|------|-------------|------|
| id | UUID | sì | |
| nome | string | sì | |
| indirizzo | string | sì | |
| dataInizioContratto | date | sì | |
| dataFineContratto | date | sì | |
| giorniVisibilitaCalendario | int | sì | Limite massimo check-out per receptionist |
| overbookingPermesso | boolean | sì | |
| delegaRsMioni | boolean | sì | Se RS MIONI gestisce FAQ/camere/prenotazioni |
| giorniCancellazioneAutomatica | int | no | Giorni dopo check-out per auto-cancellazione |
| chioschiConcorrentiMax | int | sì | N = chiaro + nascosto + parlato |
| turni | TurnoOrario[] | sì | Orari operativi dell'hotel |
| tipologieCamera | string[] | sì | Lista tipologie disponibili |

### TurnoOrario
| Campo | Tipo | Note |
|-------|------|------|
| oraInizio | time | |
| oraFine | time | |

---

## 2. Chiosco

Terminale fisico installato nell'hotel.

| Campo | Tipo | Obbligatorio | Note |
|-------|------|-------------|------|
| id | UUID | sì | |
| hotelId | UUID | sì | FK Hotel |
| nome | string | sì | Identificativo visivo nella griglia |
| tipo | enum | sì | TOUCH \| ANALOGICO |
| interattivo | boolean | sì | Se falso: solo visione nascosta (telecamera) |
| hasPOS | boolean | sì | |
| tipoPOS | enum | no | INGENICO \| MYPOS |
| hasStampante | boolean | sì | |
| utenzaId | UUID | sì | FK Utente (profilo Chiosco) |
| pathInputPOS | string | no | es. C:\ProgramData\RTSDoremiPos\SRINPF.TXT |
| pathOutputPOS | string | no | es. C:\ProgramData\RTSDoremiPos\SROUTF.TXT |
| pathConfigPOS | string | no | |
| pathLogPOS | string | no | |

### Stato Runtime Chiosco (non persistito)
| Stato | Descrizione |
|-------|-------------|
| OFFLINE | Non connesso |
| IDLE | Connesso, nessun collegamento |
| IN_CHIARO | Collegamento in chiaro attivo |
| IN_NASCOSTO | Collegamento nascosto attivo |
| IN_CHIAMATA | Chiamata in ingresso in attesa |
| IN_PARLATO | Collegamento in parlato attivo |
| MESSAGGIO_ATTESA | Messaggio attesa visualizzato |

---

## 3. Utente

| Campo | Tipo | Obbligatorio | Note |
|-------|------|-------------|------|
| id | UUID | sì | |
| username | string | sì | |
| passwordHash | string | sì | |
| email | string | sì | |
| profilo | enum | sì | RECEPTIONIST \| RECEPTIONIST_LITE \| CHIOSCO \| GESTORE_HOTEL \| GESTORE_RECEPTIONIST \| ADMIN |
| hotelIds | UUID[] | sì | Hotel associati (vuoto per admin) |
| ipWhitelist | string[] | no | Lista IP; vuota = nessun filtro |
| attivo | boolean | sì | |

### Note profilo CHIOSCO
- Un'utenza chiosco è condivisa fra tutti i chioschi dello stesso hotel
- Al primo login si seleziona il chiosco fisico
- I dati vengono memorizzati in locale nel browser

---

## 4. Camera

| Campo | Tipo | Obbligatorio | Note |
|-------|------|-------------|------|
| id | UUID | sì | |
| hotelId | UUID | sì | FK Hotel |
| nome | string | sì | Nome o numero camera |
| tipo | string | sì | Tipologia (da lista hotel) |
| piano | int | sì | |
| bookingConsentito | boolean | sì | Se falso: non appare in fase prenotazione |
| lettiMatrimoniali | int | sì | Default 0 |
| lettiSingoli | int | sì | Default 0 |
| lettiAggiunti | int | no | |
| divaniLettoSingoli | int | no | |
| divaniLettoMatrimoniali | int | no | |
| culle | int | no | |
| doccia | boolean | no | |
| vasca | boolean | no | |
| minibar | boolean | no | |
| minibarPieno | boolean | no | |
| ariaCondizionata | boolean | no | |
| quadroElettrico | string | no | Note posizione e utilizzo |
| prezzi | PrezzoCamera[] | no | |
| codiceChiave | string | no | Codice porta o cassettiera |
| mq | decimal | no | |
| documenti | Documento[] | no | |

### PrezzoCamera
| Campo | Tipo | Note |
|-------|------|------|
| tipoOccupazione | string | es. "singola", "doppia", "tripla" |
| prezzo | decimal | |
| valuta | string | default EUR |

### Enum Letto (per tooltip)
`M` = Matrimoniale, `S` = Singolo, `A` = Aggiunto, `DS` = Divano Letto Singolo, `DM` = Divano Letto Matrimoniale, `C` = Culla

---

## 5. Prenotazione

| Campo | Tipo | Obbligatorio | Note |
|-------|------|-------------|------|
| id | UUID | sì | |
| hotelId | UUID | sì | FK Hotel |
| codice | string | no | Codice esterno (es. Booking.com) |
| checkIn | date | sì | |
| checkOut | date | sì | checkOut > checkIn |
| pax | PaxDettaglio | sì | |
| nome | string | cond. | Almeno uno fra nome/cognome/gruppo |
| cognome | string | cond. | |
| gruppo | string | cond. | |
| tipoPagamento | enum | sì | GIA_PAGATO \| DA_PAGARE |
| documentoIdentita | enum | sì | GIA_FORNITO \| DA_ACQUISIRE |
| checkinConfermato | boolean | sì | Default false; immutabile dopo primo set |
| checkinConfermatoAt | datetime | no | Data/ora conferma check-in |
| prezzo | decimal | no | Aggiornato manualmente dal receptionist |
| overbooking | boolean | sì | Default false |
| camere | UUID[] | sì | FK Camera[] |
| documenti | Documento[] | no | |
| pagamenti | Pagamento[] | no | |
| inseritoDa | UUID | sì | FK Utente (per regole cancellazione) |
| inseritoDaProfilo | enum | sì | Per distinguere albergatore da receptionist |
| createdAt | datetime | sì | |
| updatedAt | datetime | sì | |

### PaxDettaglio
| Campo | Tipo | Note |
|-------|------|------|
| adulti | int | Almeno 1 se ragazzi/bambini = 0 |
| ragazzi | int | |
| bambini | int | |

### Stato Visibilità Date (calcolato runtime)
- Se `checkOut > today + giorniVisibilitaCalendario`: checkout non mostrato al receptionist
- Se `checkIn > today + giorniVisibilitaCalendario`: intera prenotazione non visibile

---

## 6. Documento

Entità polivalente: può appartenere a Prenotazione, Camera o Regola.

| Campo | Tipo | Obbligatorio | Note |
|-------|------|-------------|------|
| id | UUID | sì | |
| contestoTipo | enum | sì | PRENOTAZIONE \| CAMERA \| REGOLA |
| contestoId | UUID | sì | FK entità padre |
| titolo | string | no | |
| lingua | string | no | ISO 639-1, es. "it", "en" |
| tipoDocumento | string | no | es. "documento identità", "foto", "planimetria" |
| estensione | enum | sì | PDF \| PNG \| JPG \| JPEG |
| url | string | sì | Path storage interno |
| inseritoDa | UUID | sì | FK Utente |
| inseritoDaProfilo | enum | sì | |
| createdAt | datetime | sì | |

### Origine Documento
| Origine | Descrizione |
|---------|-------------|
| UPLOAD_LOCALE | File caricato dal PC dell'utente |
| ACQUISIZIONE_WEBCAM | Foto scattata dalla webcam del chiosco |

---

## 7. Pagamento

Traccia ogni transazione POS associata a una prenotazione.

| Campo | Tipo | Obbligatorio | Note |
|-------|------|-------------|------|
| id | UUID | sì | |
| prenotazioneId | UUID | sì | FK Prenotazione |
| chioscoId | UUID | sì | FK Chiosco (POS fisico usato) |
| importoRichiesto | decimal | sì | Importo impostato sul POS |
| valuta | string | sì | Default EUR |
| esito | enum | sì | PENDING \| OK \| KO \| NO_FILE |
| importoEffettivo | decimal | no | Solo se esito OK |
| tipoPOS | enum | sì | INGENICO \| MYPOS |
| eseguito | boolean | sì | |
| dataOperazione | datetime | no | Data/ora dal POS in formato AAAAMMGG_HHMMSS |
| eseguiDa | UUID | sì | FK Utente receptionist |
| createdAt | datetime | sì | |

### Esiti POS
- `KO-NO_FILE`: il POS non ha ancora prodotto il file di esito
- `KO-COMMAND_KO TIME: ...`: transazione rifiutata
- `OK-90.0EUR TIME: ...`: transazione completata con importo e data

---

## 8. Regola (Regolamento)

Predefinita dalla piattaforma, valorizzata per hotel.

| Campo | Tipo | Obbligatorio | Note |
|-------|------|-------------|------|
| id | UUID | sì | |
| codice | string | sì | Identificativo univoco della regola |
| categoria | enum | sì | GENERALE \| TURISTICA \| SUPPORTO \| SICUREZZA |
| ordine | int | sì | Ordine di visualizzazione |

### ValorizzazioneRegola

| Campo | Tipo | Obbligatorio | Note |
|-------|------|-------------|------|
| id | UUID | sì | |
| regolaId | UUID | sì | FK Regola |
| hotelId | UUID | sì | FK Hotel |
| lingua | string | sì | ISO 639-1 |
| testo | text | no | Risposta alla domanda |
| documenti | Documento[] | no | Condivisi fra tutte le lingue della regola |
| updatedAt | datetime | sì | |

---

## 9. LinkTemporaneo

Generato per l'invio documento via email.

| Campo | Tipo | Obbligatorio | Note |
|-------|------|-------------|------|
| id | UUID | sì | |
| documentoId | UUID | sì | FK Documento |
| token | string | sì | UUID random, non indovinabile |
| destinatarioEmail | string | sì | |
| testoReceptionist | text | no | |
| hotelId | UUID | sì | Usato come oggetto email |
| scadenzaAt | datetime | sì | |
| createdAt | datetime | sì | |
| usato | boolean | sì | |

---

## 10. CollegamentoAttivo (Runtime)

Non persistito in DB. Gestito in memoria/realtime (es. Redis o WebSocket state).

| Campo | Tipo | Note |
|-------|------|------|
| id | UUID | |
| receptionistId | UUID | |
| chioscoId | UUID | |
| stato | enum | CHIARO \| NASCOSTO \| PARLATO |
| messaggioAttesaAttivo | boolean | |
| condivisioneSchermoAttiva | boolean | |
| iniziatoAt | datetime | |

---

## 11. LogPagamento (Tooltip Prezzo)

Storico dei pagamenti POS associati a una prenotazione, visualizzato come tooltip.

Derivato da: `Pagamento[]` filtrati per `prenotazioneId`.

---

## Relazioni Principali

```
Hotel          1 ──< N  Chiosco
Hotel          1 ──< N  Camera
Hotel          1 ──< N  Prenotazione
Hotel          1 ──< N  ValorizzazioneRegola
Camera         1 ──< N  Documento (CAMERA)
Prenotazione   1 ──< N  Documento (PRENOTAZIONE)
Prenotazione   1 ──< N  Pagamento
Prenotazione   M ──< N  Camera
Regola         1 ──< N  ValorizzazioneRegola
Documento      1 ──< N  LinkTemporaneo
Utente         M ──< N  Hotel (associazione utente-hotel)
Chiosco        1 ──  1  Utente (profilo CHIOSCO)
```

---

## Regole di Business Critiche

1. **Visibilità calendario**: `maxCheckOut = today + hotel.giorniVisibilitaCalendario`
2. **Concorrenza chioschi**: `N = count(CHIARO) + count(NASCOSTO) + count(PARLATO) ≤ hotel.chioschiConcorrentiMax`
3. **Cancellazione prenotazione**: blocked se `inseritoDaProfilo == GESTORE_HOTEL` OR (`inseritoDa == currentUser AND pagamenti.length > 0`)
4. **Cancellazione camera**: cascade su prenotazioni e documenti
5. **Stampa/POS**: richiede `stato == PARLATO` nel collegamento attivo
6. **Acquisizione documento**: richiede `stato == PARLATO` nel collegamento attivo
7. **Check-in confermato**: immutabile dopo prima valorizzazione
8. **Cancellazione documento**: receptionist non può cancellare documenti di albergatore
9. **Link temporaneo**: ha scadenza; dopo scadenza non funzionante
10. **Auto-cancellazione prenotazioni**: job schedulato per `today > checkOut + hotel.giorniCancellazioneAutomatica`
