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

## ASSUNZIONE A21 — Identità e autorizzazione dell'AI verso il dominio

**Punto ambiguo**: Il manuale non prevede un attore AI. Non è definito con quali permessi l'AI esegue azioni (creazione prenotazione, pagamento, ecc.).

**Assunzione adottata**: L'AI agisce come un **service-account con i permessi di un Receptionist** dell'hotel della sessione. Ogni azione passa dalle stesse action/Policy del receptionist umano, autenticata con un service token + firma HMAC. L'AI non ha permessi superiori a quelli di un receptionist.

**Impatto**: Middleware service-auth, audit log, eventuale modello `AiAgent`/service user.

---

## ASSUNZIONE A22 — Pagamento POS gestito autonomamente dall'AI

**Punto ambiguo**: Il manuale assume un operatore umano che verifica l'esito POS leggendo il file di output. Non è previsto che lo faccia un'AI.

**Assunzione adottata** (decisione committente): L'AI gestisce il pagamento **in autonomia** (imposta importo, guida l'ospite, verifica esito). Escala al receptionist umano **solo** in caso di: esito KO, assenza file dopo timeout, mismatch fra importo richiesto ed esito, o data transazione non coerente. Ogni tentativo è loggato.

**Impatto**: Tool `avvia_pagamento`/`verifica_pagamento` nel worker, soglie di anomalia, audit. Da rivalutare se il rischio operativo risulta alto in collaudo.

---

## ASSUNZIONE A23 — Attivazione AI-first con fallback umano

**Punto ambiguo**: Non definito chi risponde alla chiamata del chiosco quando l'AI è attiva.

**Assunzione adottata** (decisione committente): La chiamata va **subito all'AI**; il receptionist riceve comunque la notifica in portineria e può subentrare. Se nessun worker AI è disponibile (down/saturazione), la chiamata ricade sul comportamento umano standard (FLOW 05).

**Impatto**: Logica di dispatch chiamata, health-check worker, flag su chiosco/hotel.

---

## ASSUNZIONE A24 — Voce multilingua automatica

**Punto ambiguo**: Lingue supportate dalla voce AI non specificate (il manuale cita solo il messaggio attesa multilingua, A17).

**Assunzione adottata** (decisione committente): L'AI **rileva automaticamente** la lingua dell'ospite e risponde nella stessa (STT con language detection + TTS multilingua). Set iniziale allineato ad A17 (IT/EN/FR/ES/DE) con possibilità di estensione.

**Impatto**: Scelta provider STT/TTS multilingua, prompt di sistema, test per lingua.

---

## ASSUNZIONE A25 — Privacy e retention audio/video della sessione AI

**Punto ambiguo**: Il manuale non tratta registrazione/retention della conversazione con un'AI (rilevante GDPR).

**Assunzione adottata**: Sul chiosco viene mostrata un'informativa sulla presenza di assistente automatico. Audio/video non vengono registrati in modo persistente salvo necessità (es. frame documento, che segue la retention documenti A09/A20). Il transcript è conservato per audit con retention configurabile. Da validare con DPO/committente.

**Impatto**: Informativa UI kiosk, configurazione retention, audit log.

---

## A26 — Autenticazione worker AI: bearer statico in MVP (no HMAC per-richiesta)

**Contesto**: docs/09 §4 prevede "Service token + firma HMAC" per le chiamate agent→Laravel.

**Assunzione adottata**: In FASE 2 (MVP) il worker si autentica con un segreto condiviso statico nell'header `X-Agent-Token` (`AGENT_SERVICE_TOKEN` lato Laravel = `RSMIONI_AGENT_HMAC_SECRET` lato worker), confrontato con `hash_equals`. La firma HMAC per-richiesta (anti-replay) è rimandata all'hardening pre-produzione. Ogni endpoint agent è comunque vincolato a una sessione WebRTC viva con `gestita_da='ai'`: l'hotel di destinazione viene sempre dalla sessione, mai dal payload.

**Impatto**: `AgentServiceAuth` middleware, rotazione segreto manuale, hardening da pianificare.

---

## A27 — Scaletta self check-in AI e campi prenotazione

**Contesto**: il committente chiede che l'AI faccia "domande semplici da albergatore" e salvi una prenotazione reale.

**Assunzione adottata**: La scaletta raccoglie solo i campi del form prenotazione esistente: nome, cognome, check-in/check-out, pax (adulti/ragazzi/bambini). Il modello non ha campi contatto (telefono/email), quindi non vengono chiesti. La prenotazione nasce con `tipo_pagamento=da_pagare`, `documento_identita=da_acquisire`, codice `AI-XXXXXX`, `inserito_da` = account chiosco con profilo Chiosco. Acquisizione documento e pagamento POS in sessione AI arrivano con la FASE 3.

**Impatto**: `AgentCheckinController`, prompt dell'agent, filtri/ricerca prenotazioni (codice AI-*).

---

## A28 — Scelta camera nel self check-in: prezzo a notte e descrizione sulla camera

**Contesto**: il committente chiede che l'AI proponga all'ospite le camere libere con costi e caratteristiche distintive (es. "vista mare", "terrazzo") e lo faccia scegliere, raggruppando le camere equivalenti.

**Assunzione adottata**: Il manuale non prevede prezzi per camera (la tabella `prezzi_camera` esisteva ma non era usata da nessun modulo). Sono stati aggiunti alla camera due campi fuori manuale: `prezzo_notte` (decimal, nullable) e `descrizione` (testo libero per l'ospite, nullable), gestiti dal form camere. L'endpoint `/agent/camere` raggruppa le camere libere per equivalenza (tipo + prezzo + descrizione + capienza) e propone una opzione per gruppo, ordinata per capienza adeguata e prezzo; le opzioni appaiono sullo schermo del chiosco e l'ospite sceglie a voce. Senza prezzo impostato l'opzione è proposta come "prezzo da definire col receptionist". La logica tariffaria avanzata (stagionalità, occupazione — tabella `prezzi_camera`) resta da progettare.

**Impatto**: migration `add_prezzo_descrizione_to_camere`, `CameraForm`, `AgentCheckinController::listaCamere/assegnaCamera`, tool `lista_camere` del worker, pannello opzioni sul kiosk.

---

## A29 — Self check-in AI: nome ufficiale dal documento (vision), non dalla voce

**Contesto**: la cattura vocale di nomi propri è lenta e inaffidabile (parole fuori vocabolario per lo speech-to-text). Il committente chiede un flusso più rapido: disponibilità camere verificata prima del salvataggio, nome ufficiale letto dal documento.

**Assunzione adottata**: Il nome sentito a voce è solo un SEGNAPOSTO conversazionale (l'AI si rivolge all'ospite col primo nome, un solo tentativo, mai mostrato sullo schermo né riletto). Flusso: intro → persone → date → `lista_camere` (disponibilità dal form, PRIMA del salvataggio) → scelta → salva+assegna (codice non annunciato) → documenti (uno per adulto) → `leggi_documento`: la vision AI (modello `VISION_MODEL`, default Sonnet via OpenRouter) estrae nome/cognome dal fronte del documento, aggiorna la prenotazione (`POST /agent/intestatario`) e fa comparire il riepilogo finale sul kiosk (nome ufficiale, soggiorno, camera, codice). Se la lettura fallisce resta il nome vocale e il receptionist verifica.

**Impatto**: `AgentCheckinController::listaCamere` (date dal form), nuovi endpoint `documentoImmagine`/`aggiornaIntestatario`, tool `leggi_documento` + chiamata vision nel worker, schermata riepilogo sul kiosk, riscrittura CHECKIN_SCRIPT.

---

## A30 — Marketing: costo di un receptionist usato come claim nelle inserzioni Meta

**Contesto**: la sponsorizzata «Demo gratuita 20 min» (doc 13) è centrata sul risparmio. Serve un numero in euro, difendibile, senza listino pubblico di RS Mioni.

**Assunzione adottata**: costo azienda di un receptionist a tempo pieno ≈ 31.000 €/anno (CCNL Turismo liv. 4, ≈ 1.700 € lordi × 14 mensilità + ≈ 30 % di contributi e TFR); presidio notturno 7/7 ≈ 1,7 FTE ≈ 50.000 €/anno. Nelle inserzioni si usa solo la versione conservativa «un receptionist di notte costa più di 30.000 € l'anno» e mai un risparmio in euro: la stima la fa Edoardo in demo. Niente prezzi RS Mioni e niente POS (A22) negli annunci.

**Impatto**: testi in `marketing/meta/campagna-demo-risparmio.json`; da validare con Edoardo prima di attivare la campagna.

---

## A31 — Scheda demo: briefing prima della presentazione, fuori manuale

**Contesto**: prima di una demo con un cliente, Edoardo deve poter inserire i fatti dell'hotel di scena (nome, numero camere, check-in, check-out, colazione, autobus, taxi, ristoranti, luoghi). Il manuale non ha questa schermata.

**Assunzione adottata**: la pagina `/demo` vale solo per gli hotel con `demo=true` (oggi «Hotel Demo Mioni» / «Hotel Demo»). Se la scheda non è mai stata personalizzata, al primo accesso (login, scheda o avvio dell'assistente) si scrive un hotel generico già completo: nome Hotel Demo, 15 camere (si aggiungono quelle mancanti, non si cancellano), check-in fino alle 15, check-out alle 10, colazione 7–10, autobus davanti, taxi lì vicino, tre ristoranti e tre luoghi inventati per la scena. Quei locali non sono indirizzi reali. Salvare dalla scheda marca la scheda come personalizzata e allinea le camere verso l'alto fino al numero indicato. Dalla stessa pagina si entra negli account receptionist e chiosco di quell'hotel (`POST /demo/prova`) e si torna con `POST /demo/torna`. Un hotel reale (`demo=false`) non viene rinominato né riempito.

**Impatto**: migration `scheda_demo` e `demo`, `SchedaDemoService`, pagina Demo (voce di menu solo per chi ha un hotel `demo=true`). Una modifica manuale di «Informazioni per l'assistente vocale» in Configurazioni viene riscritta al salvataggio successivo della scheda. Gli account receptionist/chiosco creati in automatico nascono con password casuale (nessuna credenziale di comodo in produzione): si entra con «Prova…», e per una demo su due dispositivi la scheda permette di impostare una password comune ai due account. `rsmioni:rimuovi-demo` riconosce gli hotel demo anche dal flag, non solo dal nome.

## A32 — Scheda demo: orari e dintorni letti da fonti pubbliche

**Contesto**: se Edoardo scrive il nome di un hotel vero, la scheda non deve restare sui testi generici. Il manuale non prevede una ricerca.

**Assunzione adottata**: «Recupera informazioni» interroga OpenStreetMap (Nominatim per l'hotel, Overpass per ristoranti, luoghi, fermata e taxi nel raggio). Il numero di camere si usa solo se la scheda OSM ha il tag `rooms`. Check-in, check-out e colazione si leggono solo dal sito indicato su OSM, se la pagina li scrive in chiaro. I campi non trovati restano vuoti e la pagina elenca cosa manca. Niente viene salvato finché non si preme Salva. L'hotel generico resta il punto di partenza quando non si fa una ricerca.

**Impatto**: `RicercaHotelDemo`, `POST /demo/cerca`. Dipende dalla rete e dai limiti di Nominatim/Overpass; un sito solo JavaScript può non mostrare gli orari.

## A33 — Assistente vocale: conosce anche il Regolamento dell'hotel

**Contesto**: in demo (29/10/2026) Alice non sapeva nulla della regola sugli animali scritta nel menu Regolamento: all'agent arrivava solo il testo composto dalla scheda demo (`istruzioni_ai`). Il manuale descrive il regolamento come documento da stampare/inviare, non come conoscenza dell'assistente.

**Assunzione adottata**: ogni regola valorizzata per l'hotel (`valorizzazioni_regola`) viene passata all'agent nel metadata del dispatch (`regolamento_hotel`, `RegolamentoAiService`), una voce per regola con l'etichetta leggibile del codice («Politica Animali: …»). Per ogni regola si usa la lingua della conversazione, poi la lingua di default dell'hotel, poi l'italiano; il modello traduce. Testo oltre 12.000 caratteri troncato con avviso. Le regole vuote non compaiono. In parallelo la scheda demo ha un campo libero «Altre informazioni per Alice» (`note`) che finisce in coda a `istruzioni_ai`, per chi preferisce scrivere tutto in un posto.

**Impatto**: il prompt dell'agent cresce con il regolamento (coperto dal prompt caching: identico a ogni turno). Chi scrive prezzi nel regolamento li espone a voce: Alice li ripete così come sono scritti.

## A34 — Chiamata dal chiosco sempre a portata di tocco; cornice documento identica sulle due parti

**Contesto**: in demo (29/10/2026) «Parla con il receptionist» non funzionava: il pulsante stava solo nel riquadro della presenza, che compare quando la webcam del receptionist è in onda; senza presenza l'ospite non aveva alcun modo di chiamare, e un rifiuto del server restava muto. Inoltre il chiosco mostrava la propria camera ritagliata a schermo pieno con una cornice calcolata sullo schermo, mentre il receptionist vede il fotogramma intero: il documento che riempiva la cornice sul chiosco arrivava piccolo in portineria.

**Assunzione adottata**: la «chiamata dal chiosco» del manuale è una quarta azione della schermata di attesa (sempre visibile, disabilitata solo durante una sessione), oltre al pulsante nel riquadro presenza; un rifiuto del server (`/kiosk/chiama` 422) si mostra per 8 secondi e lo stato viene riletto. Per i documenti, chiosco e portineria usano la stessa inquadratura (`InquadraturaDocumento`): fotogramma intero nel suo rapporto reale e cornice larga il 72 % del fotogramma con proporzioni ID-1 (1,586). Vale per acquisizione dal collegamento (parlato/chiaro), acquisizione sul chiosco e anteprima in portineria. La cattura resta il fotogramma intero, nessun ritaglio.

**Impatto**: su un totem verticale il fotogramma (orizzontale) occupa una fascia centrale, non tutto lo schermo: è voluto, è ciò che vede il receptionist.

Stesso giorno, conversazione a voce dalla presenza: spegnere il microfono del receptionist silenzia la track LiveKit senza toglierla, e il chiosco restava su «La reception ti parla» / «Microfono in attivazione…». Ora il chiosco considera «parla» solo una track audio non muta e riceve un messaggio esplicito `{type:'parla', on}`; in portineria, mentre si parla, compare un pulsante rosso «Chiudi la chiamata» sul video del chiosco.

## A35 — Hotel demo: il documento si accetta senza leggerlo

**Contesto**: in demo (29/10/2026) la lettura vision del documento rallentava e a volte rifiutava la foto («non è un documento», «illeggibile») davanti al cliente, e sostituiva il nome dato a voce con quello letto. Nelle demo il documento è spesso finto o mostrato male.

**Assunzione adottata**: per gli hotel con `demo=true` Laravel passa `documento_verifica=false` nel dispatch; l'agent accetta la foto così com'è (è già salvata sulla prenotazione dall'acquisizione), non chiama la vision, non sostituisce il nome e mostra subito il riepilogo. I copioni del check-in in quel caso non promettono la lettura del nome e non prevedono il «non è un documento». Il worker può forzare con `DOC_VERIFICA=on|off`. Gli hotel reali restano con lettura e verifica.

**Impatto**: in demo il nome sulla prenotazione è quello sentito a voce (trascrizione), non quello ufficiale.

---

## A36 — Voce dell'assistente: Cartesia/Inworld via LiveKit Inference, voci italiane da ascoltare

**Contesto**: la voce italiana Deepgram Aura-2 in produzione (30/10/2026, abbonamento ElevenLabs sospeso) è giudicata insufficiente e non accetta la velocità. Il manuale non prescrive il motore vocale; serve un'alternativa senza nuovi account né costi fissi.

**Assunzione adottata**: si usano le voci di terzi servite da LiveKit Cloud (LiveKit Inference) con le credenziali già in uso: Cartesia Sonic-3 e Inworld TTS-2, entrambe con italiano e velocità regolabile, pagate a minuto sulla fattura LiveKit (credito gratuito del piano Build per le prove). La scelta è esplicita in `TTS_PROVIDER` (il default `auto` non cambia), Deepgram resta in cascata come riserva. Le voci italiane di default («Italian Narrator Woman» per Cartesia, «Orietta» per Inworld) vengono da cataloghi pubblici e **non sono ancora state ascoltate**: si confrontano con `ai-receptionist/prova_voce.py` prima di cambiare la produzione; se un ID non è valido, l'errore va in log e la frase passa a Deepgram.

**Impatto**: `livekit-agents` aggiornato alla 1.8 sull'host del worker; costo a consumo da tenere d'occhio nel pannello LiveKit; ElevenLabs resta la strada se nessuna delle due voci convince.

---

## A37 — Self check-in AI: un documento per OGNI adulto, pipeline che avanza da sola

**Contesto**: in produzione (30/10/2026) con due ospiti bastava il documento di chi parlava, e dopo la foto la conversazione restava ferma (nessun tool richiamato dal modello, trascrizioni in ebraico/croato dal rilevamento automatico della lingua, ospite che chiudeva da solo). Il manuale chiede i documenti degli ospiti ma non dice come al chiosco.

**Assunzione adottata**: i documenti sono obbligatori per tutti gli adulti della prenotazione (`pax.adulti`), non per ragazzi/bambini. Il worker numera le richieste («ospite 2 di 3» sullo schermo e sul documento salvato) e dopo ogni foto riapre DA SOLO la schermata per l'adulto successivo; dopo l'ultima la lettura e il riepilogo partono da soli, senza aspettare che il modello richiami il tool. Se un ospite non ha il documento si passa al receptionist (`senza_documento`), non si prosegue con meno documenti. L'intestatario letto dalla vision è l'ospite 1 (l'ultima sua foto, se rifatta); gli altri documenti sono salvati ma non verificati dalla vision. Se il turno generato dopo una foto fallisce, Alice pronuncia una frase fissa nella lingua della conversazione (mai silenzio). La trascrizione è nella lingua scelta sul chiosco (`STT_LANGUAGE=chiosco`), non più in rilevamento automatico.

**Impatto**: `/agent/acquisizione` con `numero`/`totale`/`richiesta_id`, l'annulla del chiosco vale solo per la propria richiesta; il pulsante verde «Parla con il receptionist» funziona anche durante la sessione AI (`/kiosk/ai/aiuto` → campanella, e l'agent lo dice a voce). Un ospite che cambia lingua a metà conversazione viene trascritto peggio: per hotel con lingue fuori dalle bandierine usare `STT_LANGUAGE=auto`.

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
| A21 | Identità/permessi dell'AI verso il dominio | Alta |
| A22 | Pagamento POS gestito autonomamente dall'AI | Alta |
| A23 | Attivazione AI-first con fallback umano | Media |
| A24 | Voce multilingua automatica | Media |
| A25 | Privacy/retention audio-video sessione AI | Alta |
| A30 | Claim «receptionist di notte > 30.000 €/anno» nelle inserzioni Meta | Alta (prima di attivare la campagna) |
| A36 | Voce Cartesia/Inworld via LiveKit Inference: voci italiane di default da ascoltare | Media (prima di cambiare TTS_PROVIDER in produzione) |
| A37 | Documenti obbligatori per tutti gli adulti; vision solo sull'ospite 1; STT nella lingua del chiosco | Media (confermare con Edoardo la regola «uno per adulto») |
