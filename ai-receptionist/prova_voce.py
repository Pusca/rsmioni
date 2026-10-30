"""Confronto delle voci: le stesse frasi di check-in con ogni provider TTS.

Per ogni provider sintetizza le frasi qui sotto e salva un WAV per frase in
prova_voce_out/<provider>-<n>.wav, stampando il tempo al primo audio e la
durata. Si ascoltano alla cieca e si imposta TTS_PROVIDER (ed eventualmente
CARTESIA_VOICES / INWORLD_VOICES) di conseguenza. Usa lo stesso .env e la
stessa funzione `crea_tts` del worker: ciò che si sente qui è ciò che parla
sul chiosco.

Uso (dalla cartella ai-receptionist, con il .env compilato):
    python prova_voce.py                      # tutti i provider con credenziali
    python prova_voce.py cartesia inworld     # solo questi
    python prova_voce.py --lingua en inworld  # frasi in un'altra lingua
    python prova_voce.py --velocita 1.0       # velocità naturale (default: TTS_SPEED)
"""

import argparse
import asyncio
import os
import sys
import time
import wave
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(override=True)

FRASI = {
    "it": [
        "Buongiorno e benvenuto all'Hotel Dolomiti! Sono Alice, la receptionist virtuale. Mi dice il cognome della prenotazione?",
        "Perfetto, ho trovato la prenotazione a nome Rossi: due notti in camera doppia, dal 30 ottobre al primo novembre. Confermo?",
        "La sua camera è la 214, al secondo piano. Le chiedo ora di appoggiare il documento sul lettore, con la foto rivolta verso l'alto.",
    ],
    "en": [
        "Good morning and welcome to Hotel Dolomiti! I'm Alice, the virtual receptionist. May I have the surname on the booking?",
        "Perfect, I found the booking under Rossi: two nights in a double room, from October 30th to November 1st. Shall I confirm?",
        "Your room is 214, on the second floor. Please place your ID document on the reader, photo side up.",
    ],
}


def _provider_disponibili(config) -> list[str]:
    """Provider con credenziali presenti, nell'ordine di confronto."""
    livekit_ok = bool(os.environ.get("LIVEKIT_API_KEY") and os.environ.get("LIVEKIT_API_SECRET"))
    scelti: list[str] = []
    if livekit_ok:
        scelti += ["cartesia", "inworld"]
    if config.elevenlabs_api_key:
        scelti.append("elevenlabs")
    if os.environ.get("DEEPGRAM_API_KEY"):
        scelti.append("deepgram")
    return scelti


async def prova(agent, provider: str, lingua: str, frasi: list[str], out: Path) -> None:
    print(f"\n=== {provider} ({lingua}) ===")
    try:
        tts = agent.crea_tts(lingua, providers=(provider,))
    except Exception as e:  # provider non configurabile (credenziali, versione libreria)
        print(f"  non disponibile: {e}")
        return
    try:
        for n, frase in enumerate(frasi, 1):
            t0 = time.perf_counter()
            primo_audio = None
            frames = []
            stream = tts.synthesize(frase)
            try:
                async for ev in stream:
                    if primo_audio is None:
                        primo_audio = time.perf_counter() - t0
                    frames.append(ev.frame)
            except Exception as e:
                print(f"  frase {n}: ERRORE {type(e).__name__}: {e}")
                continue
            finally:
                await stream.aclose()
            if not frames:
                print(f"  frase {n}: nessun audio ricevuto")
                continue
            sr, ch = frames[0].sample_rate, frames[0].num_channels
            campioni = sum(f.samples_per_channel for f in frames)
            percorso = out / f"{provider}-{lingua}-{n}.wav"
            with wave.open(str(percorso), "wb") as wf:
                wf.setnchannels(ch)
                wf.setsampwidth(2)  # PCM 16 bit
                wf.setframerate(sr)
                for f in frames:
                    wf.writeframes(bytes(f.data))
            print(f"  frase {n}: primo audio {primo_audio * 1000:5.0f} ms · durata {campioni / sr:4.1f} s → {percorso.name}")
    finally:
        await tts.aclose()


async def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("provider", nargs="*", help="cartesia | inworld | elevenlabs | deepgram (default: tutti i disponibili)")
    ap.add_argument("--lingua", default="it", choices=sorted(FRASI), help="lingua delle frasi (default it)")
    ap.add_argument("--velocita", type=float, help="sovrascrive TTS_SPEED per questa prova")
    ap.add_argument("--out", default="prova_voce_out", help="cartella dei WAV (default prova_voce_out)")
    args = ap.parse_args()

    if args.velocita is not None:
        os.environ["TTS_SPEED"] = str(args.velocita)
    # Importato qui: agent.py legge l'ambiente (CONFIG) al caricamento.
    import agent

    provider = args.provider or _provider_disponibili(agent.CONFIG)
    if not provider:
        sys.exit("Nessun provider con credenziali: compilare .env (LIVEKIT_*, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY).")
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    print(f"Provider: {', '.join(provider)} · lingua {args.lingua} · velocità {agent.CONFIG.tts_speed} · WAV in {out}/")
    # Fuori dal worker (nessun job LiveKit) i plugin non hanno una sessione HTTP:
    # va aperta a mano, altrimenti ogni sintesi fallisce con "Attempted to use
    # an http session outside of a job context".
    from livekit.agents.utils import http_context
    async with http_context.open():
        for p in provider:
            await prova(agent, p, args.lingua, FRASI[args.lingua], out)
    print("\nAscoltare i WAV e impostare TTS_PROVIDER nel .env (es. cartesia,deepgram).")


if __name__ == "__main__":
    asyncio.run(main())
