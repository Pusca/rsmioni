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
import inspect
import json
import logging
from datetime import date

from dotenv import load_dotenv
from livekit import agents
from livekit.agents import AgentSession, RoomInputOptions, llm, tts
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
for orfana in prompts.verifica_sostituzioni():
    logger.warning("PROMPT: sostituzione 'senza verifica' orfana (copione cambiato?): %s…", orfana)

# Lingue che Deepgram nova-3 trascrive con modello dedicato: per le altre si
# resta sul rilevamento automatico ("multi").
STT_LINGUE_DEEPGRAM = {"it", "en", "de", "fr", "es", "pt", "nl"}


class ClaudeLLM(anthropic.LLM):
    """Claude via API Anthropic diretta, tarato per la voce.

    - `effort` fisso (output_config) a ogni turno: "low" = risposta immediata,
      il processo è già garantito da FSM e tool, non serve ragionare a lungo.
    - prompt caching (`caching="ephemeral"`): istruzioni e tool sono identici a
      ogni turno, la parte ripetuta costa ~1/10 e il primo token arriva prima.
    """

    def __init__(self, *, effort: str, **kw) -> None:
        super().__init__(**kw)
        self._effort = effort

    def chat(self, *, extra_kwargs=None, **kw):
        extra = dict(extra_kwargs) if isinstance(extra_kwargs, dict) else {}
        extra.setdefault("output_config", {"effort": self._effort})
        return super().chat(extra_kwargs=extra, **kw)


def crea_llm():
    """Cervello dell'agent secondo CONFIG.llm_providers (vedi LLM_PROVIDER in .env).

    Con più provider è un FallbackAdapter: se il primo non risponde (credito
    finito → 402, API giù) il turno passa al successivo e la sessione continua.
    """
    motori = []
    for provider in CONFIG.llm_providers:
        if provider == "anthropic":
            motori.append(ClaudeLLM(
                effort=CONFIG.llm_effort,
                model=CONFIG.anthropic_model,
                api_key=CONFIG.anthropic_api_key,
                max_tokens=CONFIG.llm_max_tokens,
                caching="ephemeral",
            ))
        elif provider == "openrouter":
            motori.append(openai.LLM(
                model=CONFIG.openrouter_model,
                base_url="https://openrouter.ai/api/v1",
                api_key=CONFIG.openrouter_api_key,
                # Tetto per risposta: le battute vocali sono brevi; senza questo
                # OpenRouter pre-autorizza il massimo del modello e rifiuta la
                # richiesta se il saldo non copre il caso peggiore.
                max_completion_tokens=CONFIG.llm_max_tokens,
            ))
    if not motori:
        raise RuntimeError("Nessun provider LLM configurato (LLM_PROVIDER / chiavi API).")
    logger.info("LLM: %s (effort=%s)", " → ".join(CONFIG.llm_providers), CONFIG.llm_effort)
    return motori[0] if len(motori) == 1 else llm.FallbackAdapter(motori)


def _tts_inference(provider: str, lingua: str):
    """Voce via LiveKit Inference: Cartesia Sonic-3 o Inworld TTS-2.

    Nessuna chiave del fornitore: autentica con LIVEKIT_API_KEY/SECRET del
    progetto e si paga a minuto sulla fattura LiveKit Cloud. A differenza di
    Aura-2, entrambe accettano la velocità (TTS_SPEED) anche in italiano:
    Cartesia 0.6–1.5 (`speed`), Inworld 0.5–1.5 (`speaking_rate`).
    """
    try:
        from livekit.agents import inference
    except ImportError as e:  # livekit-agents < 1.2: niente modulo inference
        raise RuntimeError(
            f"TTS_PROVIDER include {provider} ma questo livekit-agents non ha LiveKit Inference: "
            "aggiornare con `pip install -U -r requirements.txt`") from e
    if provider == "cartesia":
        modello, voci = CONFIG.cartesia_model, CONFIG.cartesia_voci
        extra = {"speed": max(0.6, min(1.5, CONFIG.tts_speed))}
    else:
        modello, voci = CONFIG.inworld_model, CONFIG.inworld_voci
        extra = {"speaking_rate": max(0.5, min(1.5, CONFIG.tts_speed))}
    # Voce della lingua scelta sul chiosco; senza, quella inglese (multilingua).
    voce = voci.get(lingua) or voci.get("en") or next(iter(voci.values()))
    logger.info("TTS %s: %s, voce %s, lingua %s, %s", provider, modello, voce, lingua, extra)
    return inference.TTS(model=modello, voice=voce, language=lingua, extra_kwargs=extra)


def crea_tts(lingua: str, providers: tuple[str, ...] | None = None):
    """Voce dell'agent secondo CONFIG.tts_providers (vedi TTS_PROVIDER in .env);
    `providers` lo sovrascrive (usato da prova_voce.py per confrontare le voci).

    Con più provider la voce è un FallbackAdapter: se il primo non produce
    audio (es. ElevenLabs con pagamento sospeso → 401) la frase passa al
    successivo invece di lasciare l'ospite davanti a un assistente muto.
    """
    motori = []
    for provider in (providers or CONFIG.tts_providers):
        if provider in ("cartesia", "inworld"):
            motori.append(_tts_inference(provider, lingua))
        elif provider == "elevenlabs":
            motori.append(elevenlabs.TTS(
                api_key=CONFIG.elevenlabs_api_key,
                voice_id=CONFIG.elevenlabs_voice_id,
                model=CONFIG.elevenlabs_model,
                # Carattere della voce da .env (TTS_STABILITY/SIMILARITY/STYLE/SPEED):
                # stability ~0.5 = spigliata ed espressiva senza cambiare voce tra
                # una battuta e l'altra; speed>1: parlato un filo più svelto.
                voice_settings=elevenlabs.VoiceSettings(
                    stability=CONFIG.tts_stability, similarity_boost=CONFIG.tts_similarity,
                    style=CONFIG.tts_style, speed=min(CONFIG.tts_speed, 1.2),  # ElevenLabs: 0.7–1.2
                    use_speaker_boost=False,
                ),
            ))
        elif provider == "deepgram":
            # Aura-2 ha una voce per lingua: quella della lingua scelta sul
            # chiosco, inglese se la lingua non è coperta.
            voce = CONFIG.deepgram_tts_voci.get(lingua) or CONFIG.deepgram_tts_voci["en"]
            # Stessa TTS_SPEED di ElevenLabs (Aura-2 accetta 0.7–1.5) ma SOLO
            # per le lingue che la supportano (DEEPGRAM_SPEED_LANGS, default
            # en,es): sull'italiano Deepgram risponde 400 e la sessione cade
            # («pipeline_voce_guasta», 29/10/2026). Per l'italiano la velocità
            # oggi si regola solo con ElevenLabs.
            extra = {}
            if "speed" not in inspect.signature(deepgram.TTS.__init__).parameters:
                logger.warning("plugin Deepgram senza parametro speed: TTS_SPEED ignorata, "
                               "aggiornare con `pip install -U livekit-plugins-deepgram`")
            elif lingua in CONFIG.deepgram_speed_lingue:
                extra["speed"] = max(0.7, min(1.5, CONFIG.tts_speed))
            else:
                logger.info("Deepgram %s: la voce %s non accetta `speed`, velocità naturale", lingua, voce)
            motori.append(deepgram.TTS(model=voce, **extra))
    if not motori:
        raise RuntimeError("Nessun provider TTS configurato (TTS_PROVIDER / chiavi API).")
    logger.info("TTS: %s", " → ".join(providers or CONFIG.tts_providers))
    return motori[0] if len(motori) == 1 else tts.FallbackAdapter(motori)


async def entrypoint(ctx: agents.JobContext) -> None:
    await ctx.connect()

    # Contesto di dominio dal dispatch esplicito di Laravel
    try:
        meta = json.loads(ctx.job.metadata or "{}")
    except json.JSONDecodeError:
        meta = {}
    scopo      = meta.get("scopo", "checkin")
    session_id = meta.get("session_id") or ctx.room.name  # la stanza È il sessionId
    # Lingua scelta dall'ospite sul chiosco (bandierine) o default dell'hotel
    lingua     = (meta.get("lingua") or CONFIG.lingua_default or "it").lower()

    walkin     = prompts.walkin_abilitato(meta)
    # Verifica vision del documento: DOC_VERIFICA on/off vince, altrimenti
    # decide Laravel per hotel (demo → False). Il prompt segue la scelta.
    if CONFIG.doc_verifica == "on":
        meta["documento_verifica"] = True
    elif CONFIG.doc_verifica == "off":
        meta["documento_verifica"] = False
    verifica_documento = prompts.documento_verificato(meta)

    logger.info("receptionist AI su stanza %s (scopo=%s, hotel=%s, walkin=%s, lingua=%s, verifica_doc=%s)",
                ctx.room.name, scopo, meta.get("hotel_nome"), walkin, lingua, verifica_documento)

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

    # STT: nella lingua scelta sul chiosco (default). Il rilevamento automatico
    # ("multi") in produzione trascriveva rumore e italiano come ebraico/croato
    # e il turn detector si spegneva ("does not support language hr").
    stt_lingua = lingua if CONFIG.stt_lingua == "chiosco" and lingua in STT_LINGUE_DEEPGRAM else "multi"
    logger.info("STT: nova-3 lingua=%s", stt_lingua)

    session = AgentSession(
        stt=deepgram.STT(model="nova-3", language=stt_lingua),
        # Cervello: Claude (tool calling + ragionamento).
        llm=crea_llm(),
        # Voce: ElevenLabs, Cartesia/Inworld (LiveKit Inference) e/o Deepgram
        # Aura-2 secondo TTS_PROVIDER, in cascata.
        tts=crea_tts(lingua),
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
    agent = ReceptionistAgent(
        instructions=istruzioni, stato=stato,
        backend=backend, schermo=schermo, lingua=lingua, config=CONFIG,
        walkin=walkin, verifica_documento=verifica_documento,
    )

    # Comandi toccati dall'ospite sullo schermo del chiosco (topic ai_cmd),
    # es. «Parla con il receptionist»: Laravel ha già fatto suonare la
    # campanella, qui l'agent lo dice a voce e resta in linea.
    @ctx.room.on("data_received")
    def _on_data(pkt) -> None:
        try:
            mittente = getattr(getattr(pkt, "participant", None), "identity", "") or ""
            if chiosco_id and mittente and mittente != f"kiosk-{chiosco_id}":
                return
            if getattr(pkt, "topic", None) not in (None, "", "ai_cmd"):
                return
            msg = json.loads(bytes(pkt.data).decode("utf-8"))
        except Exception:
            return
        if isinstance(msg, dict) and msg.get("topic") == "ai_cmd":
            asyncio.create_task(agent.comando_ospite(str(msg.get("tipo") or "")))

    await session.start(
        room=ctx.room,
        agent=agent,
        room_input_options=RoomInputOptions(
            participant_identity=f"kiosk-{chiosco_id}" if chiosco_id else None,
        ),
    )

    # Diario della conversazione nel log (prima si vedevano solo i tool: dopo
    # una foto non si capiva se Alice avesse parlato o fosse rimasta muta).
    @session.on("conversation_item_added")
    def _on_item(ev) -> None:
        item = getattr(ev, "item", None)
        testo = (getattr(item, "text_content", None) or "").replace("\n", " ").strip()
        if testo:
            chi = "ospite" if getattr(item, "role", "") == "user" else "alice"
            logger.info("%s: %s", chi, testo[:300])

    # Sessione chiusa (ospite/chiosco scollegato, close_on_disconnect): il job
    # deve terminare SUBITO così la shutdown callback chiude la sessione lato
    # Laravel e il chiosco torna idle. Senza, il processo restava vivo e il
    # chiosco appeso in "in_parlato" senza nessun agent in stanza.
    @session.on("close")
    def _on_session_close(ev) -> None:
        logger.info("sessione agent chiusa (%s): shutdown del job", getattr(ev, "reason", "?"))
        ctx.shutdown(reason="sessione_chiusa")

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
    # scopre la sessione subito dopo il tocco (poll immediato) e si aggancia —
    # parlare prima significa salutare una stanza vuota, con l'ospite che poi
    # aspetta una voce già passata. Piccolo margine per la sottoscrizione audio.
    if chiosco_id:
        try:
            await asyncio.wait_for(
                ctx.wait_for_participant(identity=f"kiosk-{chiosco_id}"), timeout=30
            )
            await asyncio.sleep(0.6)
        except asyncio.TimeoutError:
            logger.warning("chiosco non entrato in stanza entro 30s: saluto comunque")

    # Stepper di fase iniziale + saluto proattivo (l'ospite non parla per primo)
    await schermo.fase(stato.fase)
    await session.generate_reply(instructions=apertura)


if __name__ == "__main__":
    agents.cli.run_app(agents.WorkerOptions(entrypoint_fnc=entrypoint, agent_name=AGENT_NAME))
