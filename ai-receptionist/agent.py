"""
ai-receptionist — Receptionist AI vocale per il self check-in/out di RS Mioni.

Entrypoint del worker LiveKit Agents. Viene dispacciato ESPLICITAMENTE da
Laravel (agent_name='ai-receptionist') sulla stanza della sessione quando
l'ospite tocca "Esegui il check-in", "Esegui il check-out" o "Richiedi
informazioni" sul chiosco.

Il processo è governato dalla macchina a stati del package `checkin`
(fasi, gate, escalation — docs/09 §5); qui si fa solo il cablaggio:
configurazione → pipeline voce → agent → saluto iniziale.

Avvio (sviluppo):   python agent.py dev
Avvio (produzione): python agent.py start
"""

import asyncio
import json
import logging
from datetime import date

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, RoomInputOptions
from livekit.plugins import anthropic, deepgram, elevenlabs, openai, silero
from livekit.plugins.turn_detector.multilingual import MultilingualModel

from checkin import prompts
from checkin.agents import ReceptionistAgent
from checkin.backend import BackendRsmioni
from checkin.config import Impostazioni
from checkin.fsm import StatoConversazione
from checkin.ui import SchermoChiosco

# In produzione le variabili arrivano dall'ambiente; in dev da ai-receptionist/.env.
# override=True: il .env del worker VINCE su eventuali variabili globali di sistema.
load_dotenv(override=True)

logger = logging.getLogger("ai-receptionist")

AGENT_NAME = "ai-receptionist"  # deve combaciare con LiveKitDispatchService::AGENT_NAME

CONFIG = Impostazioni.da_ambiente()
for problema in CONFIG.problemi:
    logger.warning("CONFIG: %s", problema)


def crea_llm():
    """Cervello dell'agent: Claude — via OpenRouter se configurato, altrimenti
    API Anthropic nativa."""
    if CONFIG.openrouter_api_key:
        return openai.LLM(
            model=CONFIG.openrouter_model,
            base_url="https://openrouter.ai/api/v1",
            api_key=CONFIG.openrouter_api_key,
            # Tetto per risposta: le battute vocali sono brevi; senza questo
            # OpenRouter pre-autorizza il massimo del modello e rifiuta la
            # richiesta se il saldo non copre il caso peggiore.
            max_completion_tokens=CONFIG.llm_max_tokens,
        )
    return anthropic.LLM(model=CONFIG.anthropic_model)


async def entrypoint(ctx: agents.JobContext) -> None:
    await ctx.connect()

    # Contesto di dominio dal dispatch esplicito di Laravel
    try:
        meta = json.loads(ctx.job.metadata or "{}")
    except json.JSONDecodeError:
        meta = {}
    scopo      = meta.get("scopo", "checkin")
    session_id = meta.get("session_id") or ctx.room.name  # la stanza È il sessionId
    lingua     = meta.get("lingua", CONFIG.lingua_default)

    logger.info("receptionist AI su stanza %s (scopo=%s, hotel=%s)",
                ctx.room.name, scopo, meta.get("hotel_nome"))

    stato   = StatoConversazione(scopo=scopo)
    backend = BackendRsmioni(CONFIG.api_base_url, CONFIG.api_token, session_id)
    schermo = SchermoChiosco(ctx.room)

    async def chiudi_backend() -> None:
        # Chiusura best-effort della sessione lato Laravel: senza, una sessione
        # interrotta (ospite andato via, errore, restart) resta in_parlato e
        # blocca il check-in successivo. Idempotente e no-op se nel frattempo
        # è subentrato un receptionist umano (gestita_da != 'ai').
        try:
            await backend.termina_sessione()
        except Exception:
            pass
        await backend.chiudi()
    ctx.add_shutdown_callback(chiudi_backend)

    istruzioni, apertura = prompts.componi(scopo, meta, date.today().isoformat(), lingua)

    session = AgentSession(
        # STT multilingua con rilevamento lingua.
        stt=deepgram.STT(model="nova-3", language="multi"),
        # Cervello: Claude (tool calling + ragionamento).
        llm=crea_llm(),
        # TTS naturale multilingua a bassa latenza.
        tts=elevenlabs.TTS(
            api_key=CONFIG.elevenlabs_api_key,
            voice_id=CONFIG.elevenlabs_voice_id,
            model=CONFIG.elevenlabs_model,
            # Senza stability fissata, flash v2.5 ogni tanto cambia tono/voce
            # tra una battuta e l'altra. speed>1: parlato un filo più svelto.
            voice_settings=elevenlabs.VoiceSettings(
                stability=0.7, similarity_boost=0.8, style=0.0,
                speed=1.05, use_speaker_boost=False,
            ),
        ),
        # Rilevamento attività vocale → barge-in (interruzione).
        vad=silero.VAD.load(),
        # Fine turno "semantico" multilingua: meno interruzioni e pause.
        turn_detection=MultilingualModel(),
        # NIENTE preemptive_generation: in produzione causava speech appesi
        # dopo un'interruzione ("speech not done in time"), con conversazione
        # bloccata a metà check-in. Costa ~300ms di latenza in più a turno.
        min_endpointing_delay=0.25,
        max_endpointing_delay=2.0,
    )

    # L'agent si aggancia ESPLICITAMENTE al partecipante del chiosco: senza,
    # si lega al primo partecipante remoto — che può essere il receptionist
    # entrato in osservazione nascosta (muto). In quel caso l'AI non sente
    # l'ospite e la sua uscita chiude la sessione (close_on_disconnect).
    # Con l'identity fissata, entrata/uscita del receptionist sono ininfluenti
    # e la sessione si chiude solo quando si scollega il CHIOSCO.
    chiosco_id = meta.get("chiosco_id")
    await session.start(
        room=ctx.room,
        agent=ReceptionistAgent(
            instructions=istruzioni, stato=stato,
            backend=backend, schermo=schermo, lingua=lingua, config=CONFIG,
        ),
        room_input_options=RoomInputOptions(
            participant_identity=f"kiosk-{chiosco_id}" if chiosco_id else None,
        ),
    )

    # Guasto non recuperabile della pipeline voce (es. TTS senza credito):
    # meglio chiudere subito la sessione che lasciare l'ospite davanti a un
    # assistente muto. La shutdown callback riporta il chiosco a idle.
    @session.on("error")
    def _on_session_error(ev) -> None:
        err = getattr(ev, "error", None)
        if err is not None and getattr(err, "recoverable", True):
            return  # transitorio: la pipeline riprova da sola
        logger.error("errore non recuperabile nella pipeline voce, chiudo la sessione: %s", err)
        ctx.shutdown(reason="pipeline_voce_guasta")

    # Il saluto DEVE aspettare che il chiosco sia nella stanza: il chiosco
    # scopre la sessione via polling (~2s) e si aggancia dopo — parlare prima
    # significa salutare una stanza vuota, con l'ospite che poi aspetta una
    # voce già passata. Piccolo margine extra per la sottoscrizione audio.
    if chiosco_id:
        try:
            await asyncio.wait_for(
                ctx.wait_for_participant(identity=f"kiosk-{chiosco_id}"), timeout=30
            )
            await asyncio.sleep(1.0)
        except asyncio.TimeoutError:
            logger.warning("chiosco non entrato in stanza entro 30s: saluto comunque")

    # Stepper di fase iniziale + saluto proattivo (l'ospite non parla per primo)
    await schermo.fase(stato.fase)
    await session.generate_reply(instructions=apertura)


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint, agent_name=AGENT_NAME))
