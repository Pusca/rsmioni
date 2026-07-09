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
php artisan migrate --force          # oggi è un no-op: nessuna migration nuova
php artisan config:cache && php artisan route:cache
```

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

**Audit AI**: le azioni dell'agent finiscono in `storage/logs/ai-audit-*.log` (30 gg).

## 2. Worker AI — deploy

Il worker si configura SOLO via variabili d'ambiente (vedi
`ai-receptionist/.env.example`). Valori di produzione:

```
LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET   # stessi del .env Laravel
OPENROUTER_API_KEY (o ANTHROPIC_API_KEY)             # cervello
DEEPGRAM_API_KEY                                     # voce → testo
ELEVENLABS_API_KEY / ELEVENLABS_VOICE_ID             # testo → voce
RSMIONI_API_BASE_URL=https://rsmioni.it              # ← non più localhost!
RSMIONI_AGENT_HMAC_SECRET=<stesso AGENT_SERVICE_TOKEN del server>
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
