# 10 — Deploy in produzione (rsmioni.it)

L'applicativo è in due pezzi con esigenze diverse:

| Pezzo | Dove gira | Come si aggiorna |
|-------|-----------|------------------|
| App Laravel + frontend | Hosting condiviso (rsmioni.it) | `git pull` (gli asset di build sono committati) |
| Worker AI (`ai-receptionist/`) | **Serve un host a parte** — processo Python sempre acceso | Docker (`ai-receptionist/Dockerfile`) o systemd su VPS |

> Su hosting condiviso il worker AI **non può girare**: niente processi
> long-running. Opzioni: VPS economico (consigliato), Railway/Render,
> LiveKit Cloud Agents, o un PC sempre acceso in struttura (solo demo).

---

## 1. App Laravel — checklist sul server

```bash
git pull origin main
composer install --no-dev --optimize-autoloader
php artisan migrate --force          # 19/10/2026: hotels.demo + hotels.scheda_demo (scheda demo, A31); 10/10/2026: tabelle marketing_* (docs/12); 2026-09-01: links_temporanei.primo_accesso_at, hotels.ai_walkin_abilitato/istruzioni_ai
php artisan marketing:importa        # se è cambiato database/data/marketing.json

php artisan config:cache && php artisan route:cache
```

### Primo go-live in una struttura reale (docs/11)

Sequenza da eseguire UNA volta sul server, dopo il deploy:

```bash
# 1. Struttura reale (idempotente): hotel, 15 camere, chiosco — walk-in AI spento
php artisan db:seed --class=VillaGaspariniSeeder

# 2. Utenti reali: la password viene generata e stampata una volta sola
php artisan rsmioni:crea-utente gasparini_gestore  gestore_hotel --hotel="Hotel Villa Gasparini" --email=...
php artisan rsmioni:crea-utente gasparini_reception receptionist --hotel="Hotel Villa Gasparini" --email=...
php artisan rsmioni:crea-utente gasparini_chiosco   chiosco       --hotel="Hotel Villa Gasparini"

# 3. Via i dati demo (chiede conferma; --force per saltarla)
php artisan rsmioni:rimuovi-demo
php artisan cache:clear

# 4. Prime prenotazioni da Slope (Prenotazioni → Elenco → Esporta → CSV)
php artisan prenotazioni:importa-slope /percorso/export.csv --hotel="Hotel Villa Gasparini" --dry-run
php artisan prenotazioni:importa-slope /percorso/export.csv --hotel="Hotel Villa Gasparini"
```

Da lì in avanti l'import lo fa il gestore dal bottone **Importa da Slope** in Prenotazioni.

### Hotel demo per le presentazioni ai clienti (scheda `/demo`, A31)

La scheda demo lavora solo su un hotel con `demo = true`. Se `rsmioni:rimuovi-demo` è già stato
eseguito, sul server non c'è più nessun hotel demo: ricrearlo UNA volta e cambiare subito le
password di comodo del seeder (sono `password`):

```bash
php artisan db:seed --class=DemoSeeder --force            # Hotel Demo Mioni + account receptionist/gestore/chiosco_demo
php artisan rsmioni:crea-utente gestore gestore_hotel --reset-password   # stampa la nuova password del gestore
```

Le password di `receptionist` e `chiosco_demo` si impostano dalla scheda `/demo` (campo «Account di prova»);
senza impostarle si entra comunque con «Prova portineria» / «Prova chiosco». Chi deve fare le demo va
collegato all'hotel demo (`hotel_user`), non serve un account a parte.
Il regolamento e le "Informazioni per l'assistente vocale" (Configurazioni → Hotel → Receptionist AI)
vanno compilati dal gestore con i dati veri della struttura.

**Variabili nuove nel `.env` di produzione** (poi ri-eseguire `config:cache`):

```
# Segreto condiviso con il worker AI — genera un valore NUOVO per la produzione:
#   php -r "echo bin2hex(random_bytes(32));"
AGENT_SERVICE_TOKEN=<valore-generato>
```

**Queue worker (indispensabile per il realtime)**: con `QUEUE_CONNECTION=database`
gli eventi broadcast passano dalla coda. Su hosting condiviso: cron ogni minuto

```
* * * * * cd /path/app && php artisan queue:work --stop-when-empty --tries=1 >/dev/null 2>&1
```

**Scheduler Laravel (indispensabile per i task pianificati)**: cron ogni minuto
accanto a quello della coda — esegue i comandi schedulati, tra cui
`documenti:pulisci-scaduti` (cancellazione automatica dei documenti acquisiti scaduti).

```
* * * * * cd /path/app && php artisan schedule:run >/dev/null 2>&1
```

**Audit AI**: le azioni dell'agent finiscono in `storage/logs/ai-audit-*.log` (30 gg).

## 2. Worker AI — deploy

Il worker si configura SOLO via variabili d'ambiente (vedi
`ai-receptionist/.env.example`). Valori di produzione:

```
LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET   # stessi del .env Laravel
LLM_PROVIDER                                         # opz., default auto = API Anthropic diretta se c'è la chiave,
                                                     #   poi OpenRouter di riserva (cascata automatica, 23/10/2026)
ANTHROPIC_API_KEY                                    # cervello principale (diretto: meno latenza, prompt caching)
ANTHROPIC_MODEL / ANTHROPIC_VISION_MODEL             # opz., default claude-sonnet-5-5 (conversazione / lettura documenti)
LLM_EFFORT                                           # opz., default low (velocità in voce); medium|high
OPENROUTER_API_KEY / OPENROUTER_MODEL / VISION_MODEL # opz., riserva via OpenRouter (default anthropic/claude-sonnet-4.6)
LLM_MAX_TOKENS                                       # opz., default 600
DEEPGRAM_API_KEY                                     # voce → testo (e testo → voce con Aura-2)
TTS_PROVIDER                                         # opz., default auto = ElevenLabs se c'è la chiave, poi Deepgram
                                                     #   di riserva; "deepgram" = solo Deepgram (23/10/2026: in prod
                                                     #   finché l'abbonamento ElevenLabs resta sospeso per pagamento)
DEEPGRAM_TTS_VOICES                                  # opz., voci Aura-2 per lingua: it=aura-2-cinzia-it,en=...
TTS_SPEED                                            # opz., default 1.2 — velocità della voce su ENTRAMBI i provider
                                                     #   (ElevenLabs 0.7–1.2, Aura-2 0.7–1.5); 29/10/2026: in demo a 1.0 troppo lenta.
                                                     #   Su Deepgram richiede livekit-plugins-deepgram recente (pip install -U)
                                                     #   e vale SOLO per le lingue in DEEPGRAM_SPEED_LANGS (default en,es):
                                                     #   la voce italiana Aura-2 NON accetta speed (400) → velocità naturale.
                                                     #   Per l'italiano più svelto serve ElevenLabs (TTS_PROVIDER=auto con abbonamento attivo).
ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID             # testo → voce (voice id opz., ha default)
ELEVENLABS_MODEL                                     # opz., default eleven_flash_v2_5
RSMIONI_API_BASE_URL=https://rsmioni.it              # ← non più localhost!
RSMIONI_AGENT_HMAC_SECRET=<stesso AGENT_SERVICE_TOKEN del server>
                                                     # token statico inviato come X-Agent-Token
                                                     #   (non è una firma HMAC; hardening pianificato, A26)
AGENT_DEFAULT_LANGUAGE                               # opz., default it
DOC_VERIFICA                                         # opz., auto (default: hotel demo → foto accettata senza lettura) | on | off
```

### Con Docker (VPS, Railway, Render)

```bash
cd ai-receptionist
docker build -t rsmioni-ai .
docker run -d --restart unless-stopped --env-file .env --name rsmioni-ai rsmioni-ai
```

Su Railway/Render: nuovo servizio dal repo GitHub, root directory
`ai-receptionist/`, rileva il Dockerfile da solo; variabili d'ambiente dal
pannello. Deploy automatico a ogni push.

### Senza Docker (VPS con systemd)

```ini
# /etc/systemd/system/rsmioni-ai.service
[Unit]
Description=RS Mioni - Receptionist AI
After=network-online.target

[Service]
WorkingDirectory=/opt/rsmioni/ai-receptionist
EnvironmentFile=/opt/rsmioni/ai-receptionist/.env
ExecStart=/opt/rsmioni/ai-receptionist/.venv/bin/python agent.py start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## 3. Verifica post-deploy

1. `https://rsmioni.it/login` → login receptionist OK.
2. Log del worker: riga `registered worker` con l'URL LiveKit del progetto.
3. Dal chiosco: "Esegui il check-in" → l'AI risponde; in Portineria appare
   il badge RECEPTIONIST AI; la prenotazione `AI-*` compare in Prenotazioni.
4. `storage/logs/ai-audit-*.log` si popola con le azioni.

## 4. Note di sicurezza

- `AGENT_SERVICE_TOKEN` di produzione DIVERSO da quello di sviluppo.
- Le chiavi incollate in chat durante lo sviluppo vanno **ruotate**
  (LiveKit secret, Pusher secret, password DB, Metered) prima del go-live.
- Il worker parla con Laravel solo in HTTPS; hardening HMAC per-richiesta
  pianificato (assumptions A26).
