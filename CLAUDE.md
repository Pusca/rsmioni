# rsMioni - Istruzioni di progetto per Claude

## Obiettivo
Realizzare una nuova applicazione ispirata al manuale RH24 contenuto nel file `RH24-Manuale-Utente.pdf`.

## Regola fondamentale
Prima di scrivere codice, studia tutto il PDF a fondo.
Non iniziare a implementare finché non hai:
1. analizzato completamente il manuale
2. estratto ruoli, moduli, flussi, entità, vincoli e stati
3. prodotto documentazione tecnica iniziale dentro `docs/`

## Priorità assolute
1. Fedeltà funzionale al manuale
2. Fedeltà grafica il più possibile vicina al manuale
3. Architettura moderna, pulita e mantenibile
4. Nessuna semplificazione arbitraria dei flussi chiave

## Vincoli di analisi
Devi trattare come moduli obbligatori:
- login
- portineria
- collegamento in chiaro
- collegamento nascosto
- chiamata dal chiosco
- collegamento in parlato
- messaggio attesa
- condivisione schermo
- viewer documenti
- acquisizione documento
- cancellazione documento acquisito
- stampa remota documento
- gestione pagamento con POS
- invio documento
- lista/dettaglio/inserimento/modifica/cancellazione prenotazione
- lista/inserimento/modifica/cancellazione camera
- regolamento
- valorizzazione regola
- cambio password
- configurazioni
- installazione chiosco
- collaudo chiosco
- risoluzione problemi sul chiosco

## Ruoli obbligatori
- Receptionist
- Receptionist Lite
- Chiosco
- Gestore hotel
Prevedi estendibilità per Admin e Gestore Receptionist.

## Regole UI/UX
L'interfaccia deve essere il più possibile simile al manuale:
- estetica dark dashboard
- header e pannelli in stile gestionale
- split view con area video grande a sinistra e griglia chioschi a destra
- tabelle dense con colonna AZIONI sulla destra
- forte uso di icone di stato
- modali e pannelli laterali coerenti
- terminologia italiana allineata al manuale
- schermate kiosk full screen per il profilo chiosco
- palette e proporzioni ispirate al manuale, senza copiare asset proprietari se non disponibili

## Regole di implementazione
- Non dichiarare mai “completato” qualcosa che è solo mockato
- Per webcam, POS, stampa, chiamata, realtime e condivisione schermo crea adapter/interfacce pulite e mock realistici se l’hardware non è disponibile
- Mantieni separati dominio, UI e integrazioni hardware
- Documenta ogni assunzione in `docs/assumptions.md`
- Se un punto del manuale è ambiguo, non inventare: segnalo e proponi l’assunzione migliore
- Procedi a piccoli step verificabili
- Dopo ogni step, mostra:
  - cosa hai fatto
  - file creati/modificati
  - cosa manca
  - eventuali dubbi

## Fase obbligatoria iniziale
Prima di creare il progetto, genera questi file:
- docs/01-analisi-manuale.md
- docs/02-entita-dominio.md
- docs/03-ruoli-permessi.md
- docs/04-user-flows.md
- docs/05-stati-portineria.md
- docs/06-specifica-ui.md
- docs/07-architettura.md
- docs/08-backlog-mvp.md
- docs/assumptions.md

## Regola di lavoro
Non partire in autonomia con refactor concettuali o cambi nome ai moduli del manuale.
Usa gli stessi nomi funzionali del manuale, salvo necessità tecniche ben motivate.
