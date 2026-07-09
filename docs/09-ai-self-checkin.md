# 09 — AI Self Check-in (Receptionist AI)

> Stato: **proposta architetturale approvata nelle decisioni di base** — da dettagliare fase per fase.
> Decisioni prese: worker **Python** (LiveKit Agents) · pagamento POS **autonomo** (con escalation su KO/anomalia) · attivazione **AI-first con fallback umano** · voce **multilingua automatico**.

---

## 1. Obiettivo

Automatizzare il self check-in tramite un **receptionist AI vocale** che esegue gli stessi passi di un albergatore umano (FLOW 05→12 del manuale), restando **sempre sotto controllo umano**: il receptionist può subentrare in qualsiasi momento e l'AI escala da sola nei casi a rischio.

Vincoli di prodotto dettati dal committente:
- **Nessun avatar.** Solo **voce**.
- La **telecamera del receptionist resta sempre attiva** sullo schermo del chiosco.
- Quando parte l'AI, **l'inquadratura del receptionist si restringe** (PiP) e l'ospite inizia a parlare con l'AI.
- Il **receptionist può intervenire quando vuole**; di base l'AI completa tutto da sola.

---

## 2. Principio architetturale chiave

L'AI **non** è un avatar, **non** è codice nel browser e **non** introduce un nuovo canale media.

> L'AI è un **partecipante in più della stessa stanza LiveKit** già usata da chiosco e receptionist.

Riuso totale dell'infrastruttura esistente:

| Componente esistente | Riuso per l'AI |
|----------------------|----------------|
| LiveKit room (`sessionId`) | L'agent entra come 3° participant |
| `LiveKitTokenService` | Genera anche il token dell'agent (`identity = ai-<sessionId>`) |
| `WebRtcSessionService` (Cache) | Aggiunto campo `gestita_da: 'ai' \| 'umano'` |
| DataChannel topic (`doc_capture_on/off`, `attesa_on/off`) | Aggiunti `ai_mode_on/off`, `ai_state`, sottotitoli |
| Polling `/kiosk/livekit/token` (2s) | Invariato — il chiosco non sa che dall'altra parte c'è l'AI |
| API dominio (prenotazioni, acquisizione, POS, documenti) | L'agent le richiama come farebbe il receptionist |
| Reverb / portineria | Mostra al receptionist transcript live + bottone "Subentra" |

Conseguenza: **tutto ciò che l'AI fa passa dalle stesse API e dalle stesse Policy** già testate. L'AI non ha "poteri speciali": ha gli stessi del receptionist, autenticata come service-account.

---

## 3. Diagramma

```
                         LiveKit Room (= sessionId, tipo='parlato', gestita_da='ai')
   ┌──────────────────────┬───────────────────────────┬──────────────────────────┐
   │  CHIOSCO              │  AI RECEPTIONIST          │  RECEPTIONIST UMANO        │
   │  pubblica audio+video │  (worker Python esterno)  │  monitor + takeover        │
   │  vede video remoto    │  subscribe audio+video K  │  in PiP grande quando      │
   │  sente voce AI        │  publish audio (voce)     │  subentra                  │
   └──────────┬───────────┴─────────────┬─────────────┴────────────┬─────────────┘
              │ media (P2P/SFU)          │ STT → LLM → TTS          │ "Subentra" → AI mute
              │ DataChannel control      │ + tool calls (vision)    │
              ▼                          ▼                          ▼
   UI kiosk: modalità voce        AI AGENT WORKER (Python)    Portineria: transcript
   (waveform + sottotitoli,       │  HTTP firmato (HMAC)       live via Reverb +
    PiP receptionist ristretto)   ▼                            pulsante Subentra
                          LARAVEL  (stesse API del receptionist:
                          ricerca/crea prenotazione · acquisizione
                          documento · POS · stampa/email · camera)
```

L'agent è un **processo separato** (come Reverb, queue worker, kiosk-agent): non gira dentro Laravel né dentro il browser.

---

## 4. Stack tecnologico

| Layer | Tecnologia | Note |
|-------|-----------|------|
| Runtime agente | **LiveKit Agents (Python)** | Implementazione più matura; worker dedicato deployato a parte |
| Cervello / tool calling | **Claude** — default `claude-sonnet-4-6`; `claude-haiku-4-5` per turni semplici; `claude-opus-4-8` per ragionamenti complessi | Tool use per le azioni di dominio |
| STT (voce→testo) | Provider multilingua (es. Deepgram) con language detection | Multilingua automatico |
| TTS (testo→voce) | Voce naturale a bassa latenza (es. ElevenLabs / Cartesia) multilingua | Con **barge-in** |
| Turn detection / VAD | LiveKit VAD + endpointing | Permette interruzione dell'ospite |
| Vision documento | **Claude vision** sui frame del video LiveKit | Leggibilità + estrazione campi; no OCR separato in MVP |
| Stato sessione AI | Redis / Cache (già in uso) | `gestita_da`, fase corrente, handoff |
| Transcript → receptionist | Reverb (broadcast) + DataChannel | Per monitor e takeover |
| Auth agent→Laravel | Service token + firma HMAC | L'agent agisce come receptionist-service |

> Nota: Claude non offre un'API speech-to-speech nativa; la pipeline corretta è **STT → Claude → TTS** con Claude come cervello che decide i tool da chiamare.

---

## 5. Macchina a stati dell'AI (mappata sui FLOW del manuale)

Ogni fase ha un **gate**: condizione che, se non soddisfatta, fa **escalation** al receptionist umano.

| Fase | Azione AI | FLOW | Gate / Escalation |
|------|-----------|------|-------------------|
| 0. `TRIGGER` | Chiamata chiosco instradata all'AI; receptionist notificato | 05 | Se nessun agent disponibile → fallback umano |
| 1. `GREETING` | Rileva lingua, chiede motivo (check-in / info) | — | Richiesta esplicita "voglio una persona" → handoff |
| 2. `PRENOTAZIONE` | Cerca per nome/codice o crea al volo | 15 | Nessuna corrispondenza + dati incompleti → handoff |
| 3. `DOCUMENTO` | `doc_capture_on` → guida inquadratura → cattura → **Claude vision** verifica | 09 | Bassa confidenza dopo N tentativi → handoff |
| 4. `PAGAMENTO` | Imposta importo, guida l'ospite, verifica esito POS **in autonomia** | 12 | **KO / anomalia / mismatch importo o data → handoff**; OK → prosegue |
| 5. `CHIUSURA` | Assegna camera/chiave, stampa/email regolamento, saluto | 11/13 | — |
| * `HANDOFF` | In ogni momento | 06 | AI mute, PiP receptionist torna grande, stato condiviso |

Diagramma stati:

```
TRIGGER ─► GREETING ─► PRENOTAZIONE ─► DOCUMENTO ─► PAGAMENTO ─► CHIUSURA ─► END
   │           │            │             │            │            │
   └───────────┴────────────┴──────► HANDOFF ◄─────────┴────────────┘
                        (escalation o richiesta umano)
```

---

## 6. Controllo umano (human-in-the-loop)

- **AI-first con fallback umano**: la chiamata dal chiosco va subito all'AI; il receptionist riceve comunque la notifica in portineria e può prendere lui prima o durante.
- **Subentro in qualsiasi momento**: un pulsante "Subentra" sulla cella chiosco → `gestita_da = 'umano'`, l'agent va in mute e si ritira dalla room (o resta come osservatore silente). Il PiP del receptionist torna grande.
- **Stato condiviso**: transcript live + fase corrente + dati raccolti (prenotazione, esito documento) visibili al receptionist, così riprende senza ripartire da zero.
- **Escalation automatica** (vedi tabella gate): l'AI chiama il receptionist quando supera soglie di rischio/incertezza.
- **Audit**: ogni azione dell'agent è loggata (chi/cosa/quando/esito) per tracciabilità e per il collaudo.

---

## 7. UI del chiosco in modalità AI

Nuova schermata kiosk attivata dal topic DataChannel `ai_mode_on` (parallela alle esistenti `ParlatoScreen` ecc.):

- **Telecamera receptionist sempre presente**: all'avvio AI passa da grande a **PiP ristretto** (animazione).
- Centro schermo: **waveform / indicatore vocale** dell'AI (nessun avatar).
- **Sottotitoli live** multilingua (trascrizione AI + ospite) — utile e accessibile.
- Indicatore di fase discreto (es. "Documento", "Pagamento").
- Riusa gli overlay già esistenti per `acquisizione` e `pagamento` (l'AI li attiva con gli stessi topic).
- Quando l'umano subentra: PiP torna grande, sottotitoli/voce AI spariscono.

---

## 8. Modifiche per layer (sintesi, non esaustiva)

**Laravel (backend)**
- `WebRtcSessionService`: campo `gestita_da` + helper `assegnaAi()` / `subentroUmano()`.
- Endpoint token agent: `LiveKitTokenService->genera()` con identity `ai-<sessionId>`.
- Controller dispatch: alla chiamata, se chiosco è AI-first e c'è un agent libero → crea sessione `parlato` `gestita_da='ai'` e notifica il worker.
- Endpoint dominio firmati per l'agent (riusano le action esistenti dietro un middleware service-auth).
- Eventi Reverb: `AiTranscriptUpdated`, `AiStateChanged`, `AiHandoffRequested`.

**AI Worker (Python, nuova dir `ai-receptionist/`)**
- Entrypoint LiveKit Agents; pipeline STT→Claude→TTS + VAD/barge-in.
- Tool: `cerca_prenotazione`, `crea_prenotazione`, `avvia_acquisizione`, `valuta_documento` (vision), `avvia_pagamento`, `verifica_pagamento`, `stampa_documento`, `richiedi_umano`.
- Client HTTP firmato verso Laravel.
- Gestione stato/fase + logica di escalation.

**Frontend (React/Inertia)**
- `AiModeScreen` per il chiosco + transizione PiP.
- Portineria: badge "AI", transcript live, pulsante "Subentra".
- Gestione topic DataChannel `ai_mode_on/off`, `ai_state`, sottotitoli.

---

## 9. Fasi di lavoro (verificabili)

- **Fase 0 — Docs & spike**: questo documento + assunzioni; spike worker che entra in room e pronuncia una frase. *Deliverable: agent connesso, una battuta TTS udita sul chiosco.*
- **Fase 1 — Voce base + handoff**: conversazione libera multilingua, `AiModeScreen` con PiP, takeover umano. *Nessuna azione di dominio.*
- **Fase 2 — Prenotazione + documento**: tool ricerca/crea prenotazione + acquisizione con Claude vision. Mock onesti dove serve.
- **Fase 3 — Pagamento autonomo + chiusura**: POS guidato e verificato in autonomia con escalation su KO; stampa/email; assegnazione camera.
- **Fase 4 — Robustezza**: escalation intelligente, rifinitura multilingua, audit log completo, metriche (tasso completamento, % handoff, durata media, KO POS).

Ogni fase chiude con: cosa fatto / file toccati / cosa manca / dubbi.

---

## 10. Rischi e mitigazioni

| Rischio | Impatto | Mitigazione |
|---------|---------|-------------|
| Latenza voce (STT+LLM+TTS) percepibile | UX scadente | Modello veloce per turni semplici (Haiku 4.5), streaming TTS, barge-in, frasi di "filler" |
| Allucinazioni su dati prenotazione/prezzo | Errori operativi | L'AI agisce solo via API con validazione lato Laravel; conferma vocale dei dati chiave |
| Pagamento autonomo con esito ambiguo | Incasso errato | Gate stretto: mismatch importo/data o KO → handoff immediato; audit completo |
| Documento non leggibile / frode | Compliance | Vision con soglia di confidenza; ritenta; sotto soglia → handoff |
| Worker AI giù | Nessun self check-in | Fallback umano automatico (AI-first ma non AI-only) |
| Costi LLM/voce per sessione | Economico | Routing per modello, cap durata, metriche per sessione |
| Privacy audio/video + GDPR | Legale | Informativa sul chiosco, retention configurabile, storage minimo necessario |

---

## 11. Punti aperti

Vedi `assumptions.md` (A21–A25) per le assunzioni AI da validare con il committente.
</content>
</invoke>
