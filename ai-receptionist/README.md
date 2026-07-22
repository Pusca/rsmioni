# ai-receptionist — Worker AI Self Check-in

Receptionist AI vocale per il self check-in di RS Mioni. È un **processo Python
separato** (come Laravel Reverb / queue / kiosk-agent): si unisce alla stanza
LiveKit della sessione come terzo partecipante, ascolta l'ospite, ragiona con
**Claude** e risponde **a voce** (nessun avatar).

Architettura completa: [`../docs/09-ai-self-checkin.md`](../docs/09-ai-self-checkin.md).

## Stack

| Ruolo | Tecnologia |
|-------|-----------|
| Framework agente | LiveKit Agents (Python) |
| Cervello / tool calling / vision | Claude (`claude-sonnet-4-6` default) |
| STT (voce→testo) | Deepgram `nova-3` multilingua |
| TTS (testo→voce) | ElevenLabs |
| VAD / barge-in | Silero |

## Setup

Richiede **Python 3.9+**.

```bash
cd ai-receptionist
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -r requirements.txt

# Configura le chiavi (NON committare .env)
cp .env.example .env   # poi compila .env con i valori reali

# Scarica i modelli dei plugin (VAD, turn-detector)
python agent.py download-files
```

## Avvio

```bash
# Sviluppo (hot reload)
python agent.py dev

# Produzione
python agent.py start
```

## Architettura del worker

```
agent.py            entrypoint sottile: config → pipeline voce → agent
checkin/
  config.py         impostazioni da ambiente, validate all'avvio
  backend.py        client HTTP tipato verso /agent/* di Laravel (retry, EsitoApi)
  fsm.py            macchina a stati (fasi, gate, escalation) — docs/09 §5
  prompts.py        istruzioni per scopo (checkin / checkout / info)
  ui.py             pubblicazione stato su schermo chiosco (topic ai_ui)
  agents.py         ReceptionistAgent: tool di dominio governati dalla FSM
```

Il processo è governato dalla FSM, non dal prompt: un tool chiamato fuori
sequenza viene rifiutato con l'istruzione correttiva; errori ripetuti nella
stessa fase fanno scattare il suggerimento di escalation al receptionist.
Ogni azione è auditata lato Laravel su `storage/logs/ai-audit-*.log`.

## Stato / Roadmap

- **FASE 0/1 — fatta:** connessione, voce multilingua, handoff.
- **FASE 2/3 — fatte:** dispatch esplicito da Laravel; check-in completo
  (dati → conferma → prenotazione reale → camera per capienza → documento
  fronte/retro); check-out con pagamento POS; subentro receptionist;
  audit; test PHPUnit su tutte le API agent.
- **FASE 4 — parziale:** escalation a soglia per fase; restano metriche
  aggregate e Claude vision sul documento.

## Variabili d'ambiente

Elenco completo (con default e commenti) in [`.env.example`](./.env.example);
la fonte di verità è `checkin/config.py`.

| Variabile | Obbligatoria | Note |
|-----------|--------------|------|
| `LIVEKIT_URL` / `LIVEKIT_API_KEY` / `LIVEKIT_API_SECRET` | sì | Stessi valori del `.env` Laravel (stesso progetto LiveKit) |
| `OPENROUTER_API_KEY` | una tra le due chiavi LLM | Se presente **vince** su Anthropic nativo; **necessaria per la vision documenti** (senza, l'estrazione dati dal documento viene saltata) |
| `OPENROUTER_MODEL` | no | Modello conversazione via OpenRouter (default `anthropic/claude-sonnet-4.6`) |
| `VISION_MODEL` | no | Modello OpenRouter per la lettura documento (default `anthropic/claude-sonnet-4.6`) |
| `ANTHROPIC_API_KEY` | una tra le due chiavi LLM | Usata solo se `OPENROUTER_API_KEY` è assente; non abilita la vision |
| `ANTHROPIC_MODEL` | no | Default `claude-sonnet-4-6` |
| `LLM_MAX_TOKENS` | no | Token max per risposta (default `600`) |
| `DEEPGRAM_API_KEY` | sì | STT — senza, niente riconoscimento vocale |
| `ELEVENLABS_API_KEY` | sì | TTS — senza, niente sintesi vocale |
| `ELEVENLABS_VOICE_ID` | no | Default `Xb7hH8MSUJpSbSDYk0k2` |
| `ELEVENLABS_MODEL` | no | Default `eleven_flash_v2_5` |
| `RSMIONI_API_BASE_URL` | no | Base URL Laravel (default `http://localhost:8000`) |
| `RSMIONI_AGENT_HMAC_SECRET` | sì | Token condiviso **statico** inviato come header `X-Agent-Token` (= `AGENT_SERVICE_TOKEN` lato Laravel). Nonostante il nome non è una firma HMAC: l'hardening HMAC per-richiesta è pianificato (assumptions A26) |
| `AGENT_DEFAULT_LANGUAGE` | no | Lingua di partenza prima del rilevamento (default `it`) |

## Segreti

Le chiavi stanno **solo** in `ai-receptionist/.env` (gitignorato) o nelle
variabili d'ambiente del processo in produzione. Mai in file versionati.
`LIVEKIT_*` deve combaciare con il `.env` di Laravel (stesso progetto LiveKit).
