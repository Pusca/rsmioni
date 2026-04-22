# Assumptions — Punti Ambigui del Manuale

Questo file documenta ogni punto ambiguo del manuale RH24 e l'assunzione adottata.
Ogni assunzione deve essere validata con K-SOL / RS MIONI prima dell'implementazione definitiva.

---

## ASSUNZIONE A01 — Collegamento Nascosto e In Chiaro sullo stesso chiosco

**Punto ambiguo**: Il manuale dice che per il collegamento nascosto la condizione è "Non ci sia nessun altro collegamento in chiaro attivo con quel chiosco". Non è chiaro se la condizione valga anche al contrario (se c'è un nascosto, si può fare un chiaro?).

**Assunzione adottata**: I due stati sono mutuamente esclusivi sullo stesso chiosco.
- Se qualcuno ha collegamento in chiaro → nessun altro può connettersi in nascosto su quel chiosco
- Se qualcuno ha collegamento nascosto → nessuno può aprire un in chiaro su quel chiosco (transizione da nascosto a chiaro possibile solo per chi ha già il nascosto)

**Impatto**: Calcolo N, lock Redis, logica autorizzazione connessione.

---

## ASSUNZIONE A02 — Conteggio N con più nascosti sullo stesso chiosco

**Punto ambiguo**: Il manuale dice "N=COLLEGAMENTI IN CHIARO + COLLEGAMENTI NASCOSTI + COLLEGAMENTO IN PARLATO". Ogni receptionist in nascosto conta come +1?

**Assunzione adottata**: Sì, ogni collegamento nascosto conta individualmente.
Esempio: se R1 e R2 sono entrambi in nascosto su Chiosco-A, N=2.

**Impatto**: Hotel con N=1 non può avere due receptionist in nascosto contemporaneamente sullo stesso chiosco.

---

## ASSUNZIONE A03 — Concorrenza N per hotel o per chiosco

**Punto ambiguo**: Il manuale parla di "N chioschi che possono lavorare concorrentemente" ma la formula N = in_chiaro + nascosti + parlato sembra contare connessioni, non chioschi.

**Assunzione adottata**: N è il numero totale di connessioni attive per hotel (non per singolo chiosco).
Se N=2 e l'hotel ha 3 chioschi fisici: possono esserci al massimo 2 connessioni totali fra tutti i chioschi.

**Impatto**: ConcurrencyService deve aggregare per hotel, non per chiosco.

---

## ASSUNZIONE A04 — Autologin chiosco con Refresh Token

**Punto ambiguo**: Il manuale descrive "dati memorizzati in locale" dopo il primo login. Non specifica il meccanismo tecnico.

**Assunzione adottata**: Utilizzo di JWT Refresh Token persistito in localStorage del browser Chrome.
Il kiosk mode di Chrome mantiene il localStorage fra sessioni (a meno di logout esplicito con ESC).

**Impatto**: Backend deve supportare refresh token con lunga scadenza per chioschi.

---

## ASSUNZIONE A05 — Logout Chiosco tramite ESC

**Punto ambiguo**: Il manuale dice "fare il LOGOUT (tasto ESC)" ma non specifica se ESC chiude il browser o torna a una schermata di logout nell'app.

**Assunzione adottata**: Il kiosk registra un event listener su keydown per ESC.
ESC mostra una conferma "Vuoi effettuare il logout?" per evitare logout accidentali.
Se confermato: cancella localStorage, invalida refresh token lato server, ricarica pagina login.

**Impatto**: Kiosk module, auth service.

---

## ASSUNZIONE A06 — Funzione Logout/Login e Restart Chiosco (Risoluzione Problemi)

**Punto ambiguo**: Il manuale descrive queste funzioni come attivabili tramite "opzione …" nell'interfaccia receptionist, senza specificare dove o come appaiono.

**Assunzione adottata**: Le opzioni appaiono come menu contestuale (puntini `…`) nell'intestazione della cella chiosco nella griglia portineria. Visibili solo per il receptionist che ha un collegamento attivo con quel chiosco, o sempre visibili se connesso.

Per il **Restart PC**: il chiosco riceve un comando Socket.IO e lancia `shutdown /r /t 0` tramite Node.js locale (o equivalente). Questa funzionalità è delicata e va confermata.

**Impatto**: Cella chiosco UI, Socket.IO namespace /kiosk, Node.js su kiosk.

---

## ASSUNZIONE A07 — Formato Turni Operativi Hotel

**Punto ambiguo**: Il manuale cita "Turni/Orario" nella configurazione hotel ma non specifica come vengono usati per vincolare i collegamenti.

**Assunzione adottata**: I turni definiscono gli orari in cui il collegamento con i chioschi di quell'hotel è permesso. Fuori dagli orari di turno, il collegamento non può essere avviato (errore: "Contratto Hotel: orario non consentito").

**Impatto**: ConcurrencyService controlla anche i turni dell'hotel prima di autorizzare un collegamento.

---

## ASSUNZIONE A08 — Visibilità Calendario per Receptionist Lite

**Punto ambiguo**: Il manuale non menziona restrizioni di visibilità calendario per il Receptionist Lite (che non ha accesso a DATI).

**Assunzione adottata**: Il Receptionist Lite non ha accesso alla sezione DATI né alle prenotazioni, quindi le restrizioni di visibilità calendario non sono rilevanti per questo profilo.

**Impatto**: Nessuno (conferma comportamento atteso).

---

## ASSUNZIONE A09 — Dimensione Massima Documenti

**Punto ambiguo**: Il manuale specifica le estensioni permesse (pdf, png, jpg, jpeg) ma non la dimensione massima.

**Assunzione adottata**: Limite di 10 MB per file singolo, 50 MB totale per prenotazione.

**Impatto**: Validazione upload lato backend, configurazione storage.

---

## ASSUNZIONE A10 — Scadenza Link Temporaneo Documenti

**Punto ambiguo**: Il manuale dice "il link sarà valido per un certo periodo di tempo" senza specificare quanto.

**Assunzione adottata**: 48 ore dalla generazione. Configurabile a livello di sistema (variabile d'ambiente).

**Impatto**: LinkTemporaneo.scadenzaAt, job scheduler cleanup.

---

## ASSUNZIONE A11 — POS: un solo pagamento attivo alla volta per chiosco

**Punto ambiguo**: Il manuale descrive il processo di pagamento su un singolo POS, ma non specifica se due receptionist possono tentare di usare lo stesso POS contemporaneamente.

**Assunzione adottata**: Solo un receptionist alla volta può avere il pannello pagamento aperto per un dato chiosco. Dato che il PARLATO è unico per chiosco, questo è già garantito implicitamente (solo chi ha il PARLATO con quel chiosco può accedere al POS).

**Impatto**: Nessuno aggiuntivo (la constraint è già nel PARLATO).

---

## ASSUNZIONE A12 — Pagamento POS: aggiornamento prezzo prenotazione

**Punto ambiguo**: Il manuale dice "è compito del receptionist aggiornare il campo prezzo della prenotazione con la cifra del pagamento della camera". Il campo prezzo deve essere aggiornato manualmente?

**Assunzione adottata**: Sì, il receptionist deve aprire la modifica della prenotazione e aggiornare il campo prezzo manualmente. Il sistema NON aggiorna automaticamente il prezzo della prenotazione dopo un pagamento POS (i pagamenti POS vengono solo tracciati nel log). Questa è una scelta operativa del sistema attuale.

**Impatto**: Nessun automatismo richiesto. Il tooltip mostra i pagamenti tracciati.

---

## ASSUNZIONE A13 — Cancellazione automatica prenotazioni — chi la esegue

**Punto ambiguo**: Il manuale dice "su discrezionalità dell'albergatore può essere eseguita una cancellazione automatica delle prenotazioni passati N giorni dal check-out". Non specifica chi configura N né quando viene eseguita.

**Assunzione adottata**:
- N è configurato per hotel in fase di contratto (tramite assistenza K-SOL)
- Un job schedulato giornaliero (es. alle 02:00) scansiona le prenotazioni e cancella quelle con `checkOut + N giorni < oggi`
- La cancellazione automatica cancella anche tutti i documenti associati

**Impatto**: SchedulerService, job cron.

---

## ASSUNZIONE A14 — Overbooking: chi può contrassegnare

**Punto ambiguo**: Il manuale menziona il flag "Overbooking" nell'inserimento prenotazione per il receptionist, ma non è chiaro se solo l'albergatore abilita l'overbooking per l'hotel o se ogni receptionist può decidere caso per caso.

**Assunzione adottata**: L'albergatore configura se l'overbooking è permesso per l'hotel (configurazione hotel). Se `hotel.overbookingPermesso = true`, il receptionist può contrassegnare il flag overbooking nell'inserimento/modifica prenotazione. Se `false`, il flag non è disponibile.

**Impatto**: Form prenotazione, validazione backend.

---

## ASSUNZIONE A15 — Condivisione schermo: impatto su stream video

**Punto ambiguo**: Quando il receptionist condivide lo schermo, il chiosco smette di vedere il video del receptionist o lo vede insieme allo schermo?

**Assunzione adottata**: La condivisione schermo **sostituisce** temporaneamente lo stream video del receptionist sul chiosco. Quando la condivisione viene disattivata, il chiosco torna a vedere il video del receptionist.

**Impatto**: WebRTC: sostituzione track video nella peer connection.

---

## ASSUNZIONE A16 — Campanello analogico: sensibilità

**Punto ambiguo**: Il manuale menziona che "è necessario verificare la sensibilità del microfono per intercettare il campanello analogico" in fase di installazione. Non specifica il meccanismo tecnico.

**Assunzione adottata**: Si usa la Web Audio API per analizzare il segnale in tempo reale. La soglia di volume (threshold) è configurabile tramite un parametro nell'URL o nella configurazione locale del chiosco. L'assistenza può ajustare questo parametro in fase di collaudo.

**Impatto**: BellAdapter, configurazione kiosk.

---

## ASSUNZIONE A17 — Multilingua messaggio attesa

**Punto ambiguo**: Il manuale parla di messaggio multilingua ma non specifica quali lingue.

**Assunzione adottata**: Italiano, Inglese, Francese, Spagnolo, Tedesco (le lingue turistiche più comuni in Italia). Il testo lampeggia alternando le lingue ogni ~2 secondi.

**Impatto**: Testo hardcoded nel frontend kiosk (non configurabile dall'utente in v1.0).

---

## ASSUNZIONE A18 — Dettaglio camera in prenotazione: documenti stampabili

**Punto ambiguo**: Il manuale dice che dal dettaglio camera all'interno di una prenotazione è possibile stampare i documenti. Non è chiaro se questo vale anche per l'invio email.

**Assunzione adottata**: Dal dettaglio camera all'interno di una prenotazione sono disponibili tutte le azioni sui documenti: apri, scarica, email, stampa (se PARLATO + stampante).

**Impatto**: Componente dettaglio camera.

---

## ASSUNZIONE A19 — Utenza hall01 (RS MIONI multi-hotel)

**Punto ambiguo**: L'utenza `hall01` ha un profilo speciale non menzionato nell'elenco profili principale.

**Assunzione adottata**: `hall01` usa il profilo `GESTORE_HOTEL` ma è associata a più hotel contemporaneamente. Non richiede un profilo separato in v1.0: l'associazione multi-hotel è già supportata per tutti i profili nel modello dati.

**Impatto**: Nessuno aggiuntivo in v1.0.

---

## ASSUNZIONE A20 — Storage documenti: accesso diretto vs. signed URL

**Punto ambiguo**: Il manuale non specifica come i documenti sono archiviati o protetti dall'accesso diretto.

**Assunzione adottata**: I documenti sono salvati in storage privato (S3/MinIO). L'accesso avviene sempre tramite API autenticata del backend che genera URL firmati (signed URL) con breve scadenza, oppure serve il file direttamente come proxy.

**Impatto**: DocumentService, endpoint download.

---

## Da Validare Prima dell'Implementazione

| ID | Assunzione | Urgenza |
|----|-----------|---------|
| A01 | Esclusività nascosto/chiaro sullo stesso chiosco | Alta |
| A02 | Conteggio N con più nascosti | Alta |
| A03 | N per hotel vs per chiosco | Alta |
| A06 | Meccanismo Logout/Restart chiosco | Media |
| A07 | Come funzionano i turni operativi | Media |
| A10 | Durata link temporaneo | Bassa |
| A12 | Aggiornamento manuale prezzo dopo POS | Bassa |
| A15 | Condivisione schermo vs video receptionist | Media |
| A17 | Lingue messaggio attesa | Bassa |
