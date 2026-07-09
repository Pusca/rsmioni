# Worker AI receptionist — immagine di produzione.
# Compatibile con VPS (docker run), Railway, Render, Fly.io.
#
# Build:  docker build -t rsmioni-ai .
# Run:    docker run --env-file .env rsmioni-ai
# Le variabili d'ambiente sono quelle di .env.example (mai nell'immagine).

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY agent.py .
COPY checkin/ checkin/

# Scarica i modelli locali (VAD, turn-detector) dentro l'immagine:
# l'avvio in produzione non dipende da download esterni.
RUN python agent.py download-files

CMD ["python", "agent.py", "start"]
