# 05 — Stati Portineria

## Macchina a Stati del Chiosco (lato receptionist)

Ogni chiosco visibile nella griglia portineria ha un proprio stato indipendente.
Il sistema gestisce N chioschi simultaneamente, ognuno nella propria cella della griglia.

---

## Diagramma Stati

```
                    ┌─────────────────────────────────────┐
                    │             OFFLINE                  │
                    │   (chiosco non connesso)             │
                    └─────────────┬───────────────────────┘
                                  │ chiosco si connette
                                  ▼
                    ┌─────────────────────────────────────┐
                    │               IDLE                   │
                    │   Icone: 🟢(chiaro) + 🟡(nascosto)   │
                    │   RL: solo 🟡                        │
                    └──────┬──────────────┬───────────────┘
                           │              │
              click 🟢      │              │ click 🟡
                           ▼              ▼
          ┌──────────────────┐    ┌──────────────────┐
          │  IN_CHIARO       │    │   IN_NASCOSTO     │
          │  (bidirezionale  │    │   (R vede K,      │
          │   no microfono)  │    │    K non vede R)  │
          │  Icone: 🟡✉️📵🗣️ │    │   Icone: 🟢📵🗣️  │
          └──┬───────────────┘    └──────┬────────────┘
             │                          │
       click 🗣️                   click 🗣️
             │                          │
             └──────────┬───────────────┘
                        ▼
          ┌─────────────────────────────────┐
          │         IN_PARLATO              │
          │   (video grande a sx,           │
          │    microfono bidirezionale)     │
          │   Icone: 🖥️📵↩️               │
          │   + DATI: 📷🖨️💳              │
          └──────────────┬─────────────────┘
                         │ click chiudi / 📵
                         ▼
                       IDLE

─────────────────────────────────────────────────────────

CHIAMATA IN INGRESSO (evento asincrono da chiosco):

    Qualsiasi stato (eccetto già in PARLATO con quel chiosco):
                         │
              campana/tap dal chiosco
                         ▼
          ┌──────────────────────────────┐
          │      IN_CHIAMATA             │
          │   Icona: 📞 lampeggiante     │
          │   (da tutti i R abilitati)   │
          └──────┬───────────────────────┘
                 │                      │
           click 📞                click ✉️(attesa)
                 │                      │
                 ▼                      ▼
           IN_PARLATO           MESSAGGIO_ATTESA
                                (chiosco: testo
                                 lampeggiante)
```

---

## Definizione Formale degli Stati

### OFFLINE
- **Descrizione**: Il chiosco non è connesso al sistema
- **Icone visibili**: nessuna (o indicatore offline)
- **Transizioni uscita**: connessione chiosco → IDLE
- **Impatto su N concorrenti**: 0

### IDLE
- **Descrizione**: Chiosco connesso, nessun collegamento attivo
- **Icone disponibili** (R): 🟢 collegamento chiaro, 🟡 collegamento nascosto
- **Icone disponibili** (RL): 🟡 collegamento nascosto (solo)
- **Transizioni uscita**:
  - click 🟢 → IN_CHIARO (se vincoli OK)
  - click 🟡 → IN_NASCOSTO (se vincoli OK)
  - evento chiamata → IN_CHIAMATA
- **Impatto su N concorrenti**: 0

### IN_CHIARO
- **Descrizione**: Collegamento video bidirezionale, nessun microfono
- **Chi vede chi**: R vede K, K vede R
- **Microfono**: nessuno
- **Icona**: 🟢 sottolineata con barra rossa
- **Solo 1 per chiosco**: sì (non ammette più IN_CHIARO sullo stesso chiosco)
- **Icone disponibili sul chiosco**:
  - 🟡 passa a nascosto
  - ✉️ messaggio attesa (toggle)
  - 📵 chiudi collegamento
  - 🗣️ passa a parlato
- **Transizioni uscita**:
  - click 🟡 → IN_NASCOSTO
  - click 🗣️ → IN_PARLATO
  - click 📵 → IDLE
- **Impatto su N concorrenti**: +1
- **Nota**: possibile avere contemporaneamente IN_NASCOSTO su ALTRI chioschi

### IN_NASCOSTO
- **Descrizione**: Stream video unidirezionale (solo R vede K)
- **Chi vede chi**: R vede K, K NON vede R
- **Microfono**: nessuno
- **Icona**: 🟡 sottolineata
- **Più connessioni**: sì (più R possono essere in nascosto sullo stesso chiosco contemporaneamente)
- **Icone disponibili sul chiosco**:
  - 🟢 passa a chiaro
  - 📵 chiudi collegamento
  - 🗣️ passa a parlato
- **Transizioni uscita**:
  - click 🟢 → IN_CHIARO
  - click 🗣️ → IN_PARLATO
  - click 📵 → IDLE
- **Impatto su N concorrenti**: +1 per ogni receptionist connesso

### IN_CHIAMATA
- **Descrizione**: Il cliente ha richiesto assistenza, in attesa di risposta
- **Evento generante**: campanello analogico o tap touch dal chiosco
- **Icona**: 📞 verde lampeggiante
- **Durata animazione chiosco**: ~20 secondi (poi l'animazione circolare scompare, cornetta resta)
- **Icone disponibili**:
  - 📞 click → risponde → IN_PARLATO
  - ✉️ messaggio attesa → MESSAGGIO_ATTESA (sovrapposto, non stato distinto)
- **Receptionist Lite**: icona solo visiva, non cliccabile
- **Notifica se DATI aperto**: banner in alto a sinistra
- **Persistenza**: cornetta rimane fino a risposta (anche se animazione chiosco scompare)
- **Impatto su N concorrenti**: 0 (non è ancora un collegamento)

### IN_PARLATO
- **Descrizione**: Videochat completa con microfono bidirezionale
- **Chi vede chi**: R vede K (grande, a sinistra), K vede R
- **Microfono**: entrambi aperti
- **Layout**: video si sposta nella parte SINISTRA GRANDE dello schermo
- **Solo 1 parlato attivo** per il receptionist (ma può avere chiaro/nascosto su altri chioschi)
- **Icone disponibili**:
  - 🖥️ condivisione schermo
  - 📵 chiudi collegamento
  - ↩️ ritorno a collegamento in chiaro
  - Nel pannello DATI: 📷 acquisizione, 🖨️ stampa, 💳 POS
- **Transizioni uscita**:
  - click 📵 → IDLE
  - click ↩️ → IN_CHIARO (microfono chiude, video torna in griglia)
- **Impatto su N concorrenti**: +1
- **Sblocca**: acquisizione documento, stampa remota, gestione POS

### MESSAGGIO_ATTESA (sotto-stato sovrapposto)
- **Descrizione**: Messaggio multilingua lampeggiante visibile sul chiosco
- **Combinabile con**: IN_CHIARO, IN_CHIAMATA
- **Non disponibile in**: IN_NASCOSTO
- **Icona**: ✉️ sottolineata
- **Comportamento multi-receptionist**:
  - Più R possono attivarlo sullo stesso chiosco
  - Disattivato automaticamente per tutti quando qualcuno risponde alla chiamata
- **Testo sul chiosco**: "Attendere…" (multilingua, lampeggiante)

---

## Matrice Transizioni

| Da \ A | IDLE | IN_CHIARO | IN_NASCOSTO | IN_PARLATO | IN_CHIAMATA |
|--------|:----:|:---------:|:-----------:|:----------:|:-----------:|
| IDLE | — | click 🟢 | click 🟡 | — | evento chiamata |
| IN_CHIARO | click 📵 | — | click 🟡 | click 🗣️ | — |
| IN_NASCOSTO | click 📵 | click 🟢 | — | click 🗣️ | — |
| IN_PARLATO | click 📵 | click ↩️ | — | — | — |
| IN_CHIAMATA | — | — | — | click 📞 | — |

---

## Vincoli di Concorrenza (N)

```
N = Σ(IN_CHIARO per hotel) + Σ(IN_NASCOSTO per hotel) + Σ(IN_PARLATO per hotel)

Condizione: N ≤ hotel.chioschiConcorrentiMax

Esempio con N=1:
    - Solo un collegamento (qualsiasi tipo) alla volta per hotel
    - Se R ha IN_CHIARO su Chiosco-A → nessun altro può connettersi a Chiosco-B dello stesso hotel

Esempio con N=2:
    - R1 ha IN_CHIARO su Chiosco-A
    - R2 può avere IN_NASCOSTO su Chiosco-B (N=2)
    - R3 non può connettersi (N sarebbe 3)
    - ECCEZIONE: più IN_NASCOSTO sullo stesso chiosco contano ciascuno +1

Nota importante: N conta per hotel, non per chiosco fisico
```

---

## Comportamenti Speciali

### Sessione DATI aperta durante chiamata
```
Il pannello DATI sovrappone la griglia → i chioschi non sono visibili
Se arriva una chiamata mentre DATI è aperto:
    → Notifica banner in alto a sinistra (sempre visibile)
    → Il receptionist può chiudere DATI per vedere la griglia
    → O rispondere direttamente dalla notifica (se implementato)
```

### Più receptionist sul stesso chiosco
```
Chiosco-A:
    R1: IN_NASCOSTO (vede K)
    R2: IN_NASCOSTO (vede K)
    → Entrambi vedono il chiosco
    → K non vede nessuno
    → N = 2 per quell'hotel

Chiosco-A:
    R1: IN_CHIARO (K vede R1)
    R2: vuole IN_NASCOSTO → BLOCCATO (in chiaro impedisce nascosto?)
    
    Nota: il manuale dice "Non ci sia nessun altro collegamento in chiaro attivo con quel chiosco"
    per il collegamento NASCOSTO come condizione. Questo implica che in chiaro 
    NON si può avere anche nascosto sullo stesso chiosco.
    → Assumption: in chiaro su chiosco = nessun altro può connettersi in nessuna modalità.
    Vedi assumptions.md
```

### Passaggio da IN_CHIARO a IN_PARLATO (lato K)
```
In IN_CHIARO: K vede R (piccolo, in griglia destra)
→ click 🗣️
In IN_PARLATO: K vede R (grande, a sinistra)
K: la visione del receptionist si ingrandisce
R: il video del chiosco si sposta a sinistra (grande)
```

### Timeout chiamata
```
Il chiosco mostra animazione circolare per ~20 secondi
Dopo 20 sec: animazione scompare dal chiosco
La cornetta sul receptionist RIMANE lampeggiante
Il receptionist DEVE rispondere per eliminare la segnalazione
(anche solo per chiudere la "chiamata falsa")
```

---

## Icone di Stato in Griglia (sintesi)

| Icona | Descrizione | Visibile per |
|-------|-------------|-------------|
| 🟢 occhio verde | Attiva collegamento in chiaro | R (chiosco IDLE/NASCOSTO) |
| 🟢 sottolineato | Collegamento in chiaro attivo | R |
| 🟡 occhio giallo | Attiva collegamento nascosto | R, RL (chiosco qualsiasi stato) |
| 🟡 sottolineato | Collegamento nascosto attivo | R, RL |
| 📞 verde lampeggiante | Chiamata in arrivo | R (operativa), RL (visiva) |
| ✉️ | Attiva/disattiva messaggio attesa | R (in chiaro o chiamata) |
| ✉️ sottolineato | Messaggio attesa attivo | R |
| 🗣️ parla | Passa a collegamento parlato | R (da chiaro o nascosto) |
| 📵 chiudi | Chiude qualsiasi collegamento | R |
| 🖥️ schermo | Attiva/disattiva condivisione schermo | R (in parlato) |
| ↩️ ritorno | Torna a collegamento in chiaro | R (da parlato) |
