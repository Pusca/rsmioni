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

    # Voce
    elevenlabs_api_key: str | None
    elevenlabs_voice_id: str
    elevenlabs_model: str

    # Conversazione
    llm_max_tokens: int
    lingua_default: str

    problemi: list[str] = field(default_factory=list)

    @classmethod
    def da_ambiente(cls) -> "Impostazioni":
        problemi: list[str] = []

        api_token = os.environ.get("RSMIONI_AGENT_HMAC_SECRET", "")
        if not api_token:
            problemi.append("RSMIONI_AGENT_HMAC_SECRET mancante: le tool call verso Laravel verranno rifiutate (401).")

        if not (os.environ.get("OPENROUTER_API_KEY") or os.environ.get("ANTHROPIC_API_KEY")):
            problemi.append("Nessuna chiave LLM (OPENROUTER_API_KEY o ANTHROPIC_API_KEY): l'agent non può ragionare.")
        if not os.environ.get("DEEPGRAM_API_KEY"):
            problemi.append("DEEPGRAM_API_KEY mancante: niente riconoscimento vocale.")
        if not os.environ.get("ELEVENLABS_API_KEY"):
            problemi.append("ELEVENLABS_API_KEY mancante: niente sintesi vocale.")

        return cls(
            api_base_url=os.environ.get("RSMIONI_API_BASE_URL", "http://localhost:8000"),
            api_token=api_token,
            openrouter_api_key=os.environ.get("OPENROUTER_API_KEY") or None,
            openrouter_model=os.environ.get("OPENROUTER_MODEL", "anthropic/claude-sonnet-4.6"),
            anthropic_model=os.environ.get("ANTHROPIC_MODEL", "claude-sonnet-4-6"),
            vision_model=os.environ.get("VISION_MODEL", "anthropic/claude-sonnet-4.6"),
            elevenlabs_api_key=os.environ.get("ELEVENLABS_API_KEY") or None,
            elevenlabs_voice_id=os.environ.get("ELEVENLABS_VOICE_ID", "Xb7hH8MSUJpSbSDYk0k2"),
            elevenlabs_model=os.environ.get("ELEVENLABS_MODEL", "eleven_flash_v2_5"),
            llm_max_tokens=int(os.environ.get("LLM_MAX_TOKENS", "600")),
            lingua_default=os.environ.get("AGENT_DEFAULT_LANGUAGE", "it"),
            problemi=problemi,
        )
