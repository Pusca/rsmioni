"""Impostazioni del worker, lette dall'ambiente e validate all'avvio.

Fallire subito con un messaggio chiaro è meglio di un agent che entra in
stanza e crasha al primo turno di conversazione.
"""

from __future__ import annotations

import os
from dataclasses import dataclass, field


@dataclass(frozen=True)
class Impostazioni:
    # Backend RS Mioni (API di dominio)
    api_base_url: str
    api_token: str

    # Cervello — provider in ordine di preferenza ("anthropic", "openrouter").
    # Più di uno = cascata automatica (FallbackAdapter): credito finito o API
    # giù sul primo → il turno passa al successivo, la sessione non muore.
    llm_providers: tuple[str, ...]
    anthropic_api_key: str | None
    anthropic_model: str
    # Profondità di ragionamento (output_config.effort): "low" per la voce —
    # risposte immediate, il processo è già nei tool e nella FSM.
    llm_effort: str
    openrouter_api_key: str | None
    openrouter_model: str
    # Vision per la lettura documenti (nome ufficiale dal fronte): un modello
    # robusto, separato dal cervello conversazionale — è una chiamata one-shot
    # dove conta l'accuratezza, non la latenza. Un modello per provider.
    anthropic_vision_model: str
    vision_model: str

    # Voce — provider TTS in ordine di preferenza ("elevenlabs", "deepgram").
    # Più di uno = cascata automatica: se il primo fallisce (credito finito,
    # pagamento sospeso, API giù) la frase viene sintetizzata dal successivo.
    tts_providers: tuple[str, ...]
    elevenlabs_api_key: str | None
    elevenlabs_voice_id: str
    elevenlabs_model: str
    # Deepgram Aura-2: una voce per lingua (modello = "aura-2-<nome>-<lingua>").
    deepgram_tts_voci: dict[str, str]
    # Lingue le cui voci Aura-2 accettano `speed`: Deepgram risponde 400
    # «Requested model does not support the 'speed' parameter» sulle altre
    # (verificato 29/10/2026: inglese sì, italiano no) e la sessione cadrebbe.
    deepgram_speed_lingue: frozenset[str]
    # LiveKit Inference — voci di terzi (Cartesia Sonic-3, Inworld TTS-2)
    # servite da LiveKit Cloud: nessun account né chiave in più, autentica con
    # LIVEKIT_API_KEY/SECRET e si paga a minuto sulla fattura LiveKit (il piano
    # Build include un credito gratuito). Una voce per lingua; lingua assente →
    # voce "en" (le voci sono multilingua). Velocità: TTS_SPEED, anche in italiano.
    cartesia_model: str
    cartesia_voci: dict[str, str]
    inworld_model: str
    inworld_voci: dict[str, str]
    # Carattere della voce (regolabili da .env senza toccare il codice):
    # stability bassa = più espressiva/variabile, alta = più piatta e costante.
    tts_stability: float
    tts_similarity: float
    tts_style: float
    tts_speed: float
    # Lettura/verifica del documento acquisito: "auto" (segue l'hotel: gli hotel
    # demo accettano la foto così com'è), "on" (sempre), "off" (mai).
    doc_verifica: str

    # Conversazione
    llm_max_tokens: int
    lingua_default: str

    problemi: list[str] = field(default_factory=list)

    @classmethod
    def da_ambiente(cls) -> "Impostazioni":
        problemi: list[str] = []
        deepgram_key = os.environ.get("DEEPGRAM_API_KEY", "")
        el_key = os.environ.get("ELEVENLABS_API_KEY", "")
        livekit_ok = bool(os.environ.get("LIVEKIT_API_KEY") and os.environ.get("LIVEKIT_API_SECRET"))
        tts_providers = _tts_providers(os.environ.get("TTS_PROVIDER", ""), el_key, deepgram_key, livekit_ok, problemi)

        api_token = os.environ.get("RSMIONI_AGENT_HMAC_SECRET", "")
        if not api_token:
            problemi.append("RSMIONI_AGENT_HMAC_SECRET mancante: le tool call verso Laravel verranno rifiutate (401).")

        anthropic_key = os.environ.get("ANTHROPIC_API_KEY", "")
        openrouter_key = os.environ.get("OPENROUTER_API_KEY", "")
        llm_providers = _llm_providers(os.environ.get("LLM_PROVIDER", ""), anthropic_key, openrouter_key, problemi)
        llm_effort = os.environ.get("LLM_EFFORT", "low").strip().lower() or "low"
        if llm_effort not in LLM_EFFORT_VALIDI:
            problemi.append(f"LLM_EFFORT '{llm_effort}' non valido (validi: {', '.join(LLM_EFFORT_VALIDI)}): uso 'low'.")
            llm_effort = "low"
        if not deepgram_key:
            problemi.append("DEEPGRAM_API_KEY mancante: niente riconoscimento vocale.")
        if el_key and not el_key.startswith("sk_"):
            # Errore visto in produzione: incollato l'ID della chiave invece della chiave
            problemi.append("ELEVENLABS_API_KEY non sembra una API key valida (le chiavi ElevenLabs iniziano con 'sk_'): "
                            "probabilmente è stato copiato l'ID della chiave. La voce NON funzionerà.")

        return cls(
            tts_providers=tts_providers,
            deepgram_tts_voci=_voci_per_lingua(os.environ.get("DEEPGRAM_TTS_VOICES", ""), DEEPGRAM_VOCI_DEFAULT,
                                               "DEEPGRAM_TTS_VOICES", problemi),
            cartesia_model=os.environ.get("CARTESIA_MODEL", "cartesia/sonic-3").strip() or "cartesia/sonic-3",
            cartesia_voci=_voci_per_lingua(os.environ.get("CARTESIA_VOICES", ""), CARTESIA_VOCI_DEFAULT,
                                           "CARTESIA_VOICES", problemi),
            inworld_model=os.environ.get("INWORLD_MODEL", "inworld/inworld-tts-2").strip() or "inworld/inworld-tts-2",
            inworld_voci=_voci_per_lingua(os.environ.get("INWORLD_VOICES", ""), INWORLD_VOCI_DEFAULT,
                                          "INWORLD_VOICES", problemi),
            deepgram_speed_lingue=frozenset(
                l.strip().lower() for l in os.environ.get("DEEPGRAM_SPEED_LANGS", "en,es").split(",") if l.strip()),
            api_base_url=os.environ.get("RSMIONI_API_BASE_URL", "http://localhost:8000"),
            api_token=api_token,
            llm_providers=llm_providers,
            anthropic_api_key=anthropic_key or None,
            anthropic_model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-5-5"),
            llm_effort=llm_effort,
            doc_verifica=_doc_verifica(os.environ.get("DOC_VERIFICA", "auto"), problemi),
            openrouter_api_key=openrouter_key or None,
            openrouter_model=os.environ.get("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.6"),
            anthropic_vision_model=os.environ.get("ANTHROPIC_VISION_MODEL", "claude-sonnet-5-5"),
            vision_model=os.environ.get("VISION_MODEL", "anthropic/claude-sonnet-4.6"),
            elevenlabs_api_key=os.environ.get("ELEVENLABS_API_KEY") or None,
            elevenlabs_voice_id=os.environ.get("ELEVENLABS_VOICE_ID", "Xb7hH8MSUJpSbSDYk0k2"),
            elevenlabs_model=os.environ.get("ELEVENLABS_MODEL", "eleven_flash_v2_5"),
            tts_stability=float(os.environ.get("TTS_STABILITY", "0.5")),
            tts_similarity=float(os.environ.get("TTS_SIMILARITY", "0.8")),
            tts_style=float(os.environ.get("TTS_STYLE", "0.0")),
            tts_speed=float(os.environ.get("TTS_SPEED", "1.2")),
            llm_max_tokens=int(os.environ.get("LLM_MAX_TOKENS", "600")),
            lingua_default=os.environ.get("AGENT_DEFAULT_LANGUAGE", "it"),
            problemi=problemi,
        )


# Ordine = ordine di "auto" fra quelli disponibili (vedi _tts_providers).
TTS_PROVIDER_NOTI = ("elevenlabs", "cartesia", "inworld", "deepgram")
# Provider serviti da LiveKit Inference: bastano le credenziali LiveKit Cloud.
TTS_PROVIDER_INFERENCE = ("cartesia", "inworld")
LLM_PROVIDER_NOTI = ("anthropic", "openrouter")
LLM_EFFORT_VALIDI = ("low", "medium", "high")


def _llm_providers(raw: str, anthropic_key: str, openrouter_key: str, problemi: list[str]) -> tuple[str, ...]:
    """Ordine dei provider del cervello da LLM_PROVIDER.

    "" / "auto": API Anthropic diretta (se c'è la chiave) e poi OpenRouter
    come riserva. Altrimenti lista esplicita separata da virgole, es.
    "anthropic" o "openrouter,anthropic". Ogni provider scelto deve avere
    la sua chiave.
    """
    chiavi = {"anthropic": anthropic_key, "openrouter": openrouter_key}
    raw = raw.strip().lower()
    if raw in ("", "auto"):
        providers = tuple(p for p in LLM_PROVIDER_NOTI if chiavi[p])
        if not providers:
            problemi.append("Nessuna chiave LLM (ANTHROPIC_API_KEY o OPENROUTER_API_KEY): l'agent non può ragionare.")
        return providers

    scelti: list[str] = []
    for p in (x.strip() for x in raw.split(",")):
        if not p:
            continue
        if p not in LLM_PROVIDER_NOTI:
            problemi.append(f"LLM_PROVIDER '{p}' sconosciuto (validi: {', '.join(LLM_PROVIDER_NOTI)}): ignorato.")
        elif p not in scelti:
            scelti.append(p)
    for p in list(scelti):
        if not chiavi[p]:
            problemi.append(f"LLM_PROVIDER include {p} ma la sua chiave API manca: {p} escluso.")
            scelti.remove(p)
    if not scelti:
        problemi.append("Nessun provider LLM utilizzabile: l'agent non può ragionare.")
    return tuple(scelti)

# Voci Deepgram Aura-2 di default per lingua: femminili, tono accogliente
# (https://developers.deepgram.com/docs/tts-models). Sovrascrivibili con
# DEEPGRAM_TTS_VOICES="it=aura-2-cinzia-it,en=aura-2-helena-en".
DEEPGRAM_VOCI_DEFAULT: dict[str, str] = {
    "it": "aura-2-livia-it",
    "en": "aura-2-thalia-en",
    "de": "aura-2-viktoria-de",
    "es": "aura-2-celeste-es",
    "fr": "aura-2-agathe-fr",
}

# Voci Cartesia Sonic-3 di default per lingua: ID della libreria Cartesia
# (LiveKit Inference accetta tutte le voci di libreria, non quelle clonate).
# ID presi da integrazioni pubbliche (SignalWire/LiveKit), NON ancora ascoltati
# da noi (30/10/2026): il confronto si fa con `python prova_voce.py`. Altre
# voci italiane in libreria (Alessandra, Francesca, Liv, Marco…): copiare
# l'ID da play.cartesia.ai in CARTESIA_VOICES="it=<uuid>".
CARTESIA_VOCI_DEFAULT: dict[str, str] = {
    "it": "0e21713a-5e9a-428a-bed4-90d410b87f13",  # Italian Narrator Woman
    "en": "9626c31c-bec5-4cca-baa8-f8ba9e84c8bc",  # Jacqueline — en-US, giovane, sicura
    "es": "5c5ad5e7-1020-476b-8b91-fdcbe9cc313c",  # Daniela — es-MX, calma
}

# Voci Inworld TTS-2 di default per lingua: si indicano per NOME. Sono
# multilingua (la stessa voce parla 100+ lingue), quindi la voce "en" fa da
# riserva per le lingue senza voce dedicata. Nomi da verificare all'ascolto.
INWORLD_VOCI_DEFAULT: dict[str, str] = {
    "it": "Orietta",   # femminile, italiana
    "en": "Ashley",    # femminile, en-US, calda
    "es": "Diego",     # maschile, es-MX
}


def _tts_providers(raw: str, el_key: str, deepgram_key: str, livekit_ok: bool,
                   problemi: list[str]) -> tuple[str, ...]:
    """Ordine dei provider TTS da TTS_PROVIDER.

    "" / "auto": ElevenLabs (se c'è la chiave) e poi Deepgram come riserva —
    invariato: Cartesia e Inworld (LiveKit Inference) si scelgono in modo
    ESPLICITO, es. "cartesia,deepgram" o "inworld,deepgram", così la voce in
    produzione non cambia da sola a un aggiornamento. Ogni provider scelto
    deve avere le sue credenziali (per cartesia/inworld quelle LiveKit).
    """
    raw = raw.strip().lower()
    if raw in ("", "auto"):
        providers: tuple[str, ...] = (("elevenlabs",) if el_key else ()) + (("deepgram",) if deepgram_key else ())
        if not providers:
            problemi.append("Nessuna chiave TTS (ELEVENLABS_API_KEY o DEEPGRAM_API_KEY): niente sintesi vocale.")
        return providers

    scelti: list[str] = []
    for p in (x.strip() for x in raw.split(",")):
        if not p:
            continue
        if p not in TTS_PROVIDER_NOTI:
            problemi.append(f"TTS_PROVIDER '{p}' sconosciuto (validi: {', '.join(TTS_PROVIDER_NOTI)}): ignorato.")
        elif p not in scelti:
            scelti.append(p)
    if "elevenlabs" in scelti and not el_key:
        problemi.append("TTS_PROVIDER include elevenlabs ma ELEVENLABS_API_KEY manca: ElevenLabs escluso.")
        scelti.remove("elevenlabs")
    if "deepgram" in scelti and not deepgram_key:
        problemi.append("TTS_PROVIDER include deepgram ma DEEPGRAM_API_KEY manca: Deepgram escluso.")
        scelti.remove("deepgram")
    for p in TTS_PROVIDER_INFERENCE:
        if p in scelti and not livekit_ok:
            problemi.append(f"TTS_PROVIDER include {p} (LiveKit Inference) ma LIVEKIT_API_KEY/LIVEKIT_API_SECRET "
                            f"mancano: {p} escluso.")
            scelti.remove(p)
    if not scelti:
        problemi.append("Nessun provider TTS utilizzabile: niente sintesi vocale.")
    return tuple(scelti)


def _voci_per_lingua(raw: str, default: dict[str, str], nome_var: str, problemi: list[str]) -> dict[str, str]:
    """Mappa lingua → voce (modello Aura-2, ID Cartesia o nome Inworld):
    default più eventuali override da env nel formato "it=voce,en=voce"."""
    voci = dict(default)
    for coppia in (x.strip() for x in raw.split(",")):
        if not coppia:
            continue
        lingua, sep, voce = coppia.partition("=")
        lingua, voce = lingua.strip().lower(), voce.strip()
        if not sep or not lingua or not voce:
            problemi.append(f"{nome_var}: voce '{coppia}' non valida (atteso lingua=voce): ignorata.")
            continue
        voci[lingua] = voce
    return voci


def _doc_verifica(raw: str, problemi: list[str]) -> str:
    """DOC_VERIFICA: auto (default) | on | off."""
    valore = (raw or "auto").strip().lower()
    if valore not in ("auto", "on", "off"):
        problemi.append(f"DOC_VERIFICA '{raw}' non valido (auto|on|off): uso auto.")
        return "auto"
    return valore
