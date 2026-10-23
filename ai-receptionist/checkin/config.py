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

    # Cervello — OpenRouter (se presente) vince sull'API Anthropic nativa
    openrouter_api_key: str | None
    openrouter_model: str
    anthropic_model: str
    # Vision per la lettura documenti (nome ufficiale dal fronte): un modello
    # robusto, separato dal cervello conversazionale — è una chiamata one-shot
    # dove conta l'accuratezza, non la latenza.
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
    # Carattere della voce (regolabili da .env senza toccare il codice):
    # stability bassa = più espressiva/variabile, alta = più piatta e costante.
    tts_stability: float
    tts_similarity: float
    tts_style: float
    tts_speed: float

    # Conversazione
    llm_max_tokens: int
    lingua_default: str

    problemi: list[str] = field(default_factory=list)

    @classmethod
    def da_ambiente(cls) -> "Impostazioni":
        problemi: list[str] = []
        deepgram_key = os.environ.get("DEEPGRAM_API_KEY", "")
        el_key = os.environ.get("ELEVENLABS_API_KEY", "")
        tts_providers = _tts_providers(os.environ.get("TTS_PROVIDER", ""), el_key, deepgram_key, problemi)

        api_token = os.environ.get("RSMIONI_AGENT_HMAC_SECRET", "")
        if not api_token:
            problemi.append("RSMIONI_AGENT_HMAC_SECRET mancante: le tool call verso Laravel verranno rifiutate (401).")

        if not (os.environ.get("OPENROUTER_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")):
            problemi.append("Nessuna chiave LLM (OPENROUTER_API_KEY o ANTHROPIC_API_KEY): l'agent non può ragionare.")
        if not deepgram_key:
            problemi.append("DEEPGRAM_API_KEY mancante: niente riconoscimento vocale.")
        if el_key and not el_key.startswith("sk_"):
            # Errore visto in produzione: incollato l'ID della chiave invece della chiave
            problemi.append("ELEVENLABS_API_KEY non sembra una API key valida (le chiavi ElevenLabs iniziano con 'sk_'): "
                            "probabilmente è stato copiato l'ID della chiave. La voce NON funzionerà.")

        return cls(
            tts_providers=tts_providers,
            deepgram_tts_voci=_deepgram_voci(os.environ.get("DEEPGRAM_TTS_VOICES", ""), problemi),
            api_base_url=os.environ.get("RSMIONI_API_BASE_URL", "http://localhost:8000"),
            api_token=api_token,
            openrouter_api_key=os.environ.get("OPENROUTER_API_KEY") or None,
            openrouter_model=os.environ.get("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.6"),
            anthropic_model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
            vision_model=os.environ.get("VISION_MODEL", "anthropic/claude-sonnet-4.6"),
            elevenlabs_api_key=os.environ.get("ELEVENLABS_API_KEY") or None,
            elevenlabs_voice_id=os.environ.get("ELEVENLABS_VOICE_ID", "Xb7hH8MSUJpSbSDYk0k2"),
            elevenlabs_model=os.environ.get("ELEVENLABS_MODEL", "eleven_flash_v2_5"),
            tts_stability=float(os.environ.get("TTS_STABILITY", "0.5")),
            tts_similarity=float(os.environ.get("TTS_SIMILARITY", "0.8")),
            tts_style=float(os.environ.get("TTS_STYLE", "0.0")),
            tts_speed=float(os.environ.get("TTS_SPEED", "1.08")),
            llm_max_tokens=int(os.environ.get("LLM_MAX_TOKENS", "600")),
            lingua_default=os.environ.get("AGENT_DEFAULT_LANGUAGE", "it"),
            problemi=problemi,
        )


TTS_PROVIDER_NOTI = ("elevenlabs", "deepgram")

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


def _tts_providers(raw: str, el_key: str, deepgram_key: str, problemi: list[str]) -> tuple[str, ...]:
    """Ordine dei provider TTS da TTS_PROVIDER.

    "" / "auto": ElevenLabs (se c'è la chiave) e poi Deepgram come riserva.
    Altrimenti lista esplicita separata da virgole, es. "deepgram" o
    "deepgram,elevenlabs". Ogni provider scelto deve avere la sua chiave.
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
    if not scelti:
        problemi.append("Nessun provider TTS utilizzabile: niente sintesi vocale.")
    return tuple(scelti)


def _deepgram_voci(raw: str, problemi: list[str]) -> dict[str, str]:
    """Mappa lingua → modello Aura-2, default più eventuali override da env."""
    voci = dict(DEEPGRAM_VOCI_DEFAULT)
    for coppia in (x.strip() for x in raw.split(",")):
        if not coppia:
            continue
        lingua, sep, modello = coppia.partition("=")
        lingua, modello = lingua.strip().lower(), modello.strip()
        if not sep or not lingua or not modello:
            problemi.append(f"DEEPGRAM_TTS_VOICES: voce '{coppia}' non valida (atteso lingua=modello): ignorata.")
            continue
        voci[lingua] = modello
    return voci
