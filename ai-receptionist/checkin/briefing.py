"""Briefing per il receptionist umano.

Quando l'AI chiama un receptionist (o l'ospite tocca «Parla con il
receptionist»), chi subentra deve sapere in un colpo d'occhio chi ha davanti
e a che punto è il check-in: dati raccolti, documenti, perché serve lui, i
punti salienti della conversazione e la trascrizione. Qui si costruisce quel
pacchetto a partire dallo stato FSM e dalla cronologia della sessione; i
punti salienti li scrive il modello (stessa cascata di provider del cervello),
e se il modello non risponde il briefing parte lo stesso, senza punti.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

import anthropic as anthropic_sdk
import httpx

from .config import Impostazioni
from .fsm import StatoConversazione

logger = logging.getLogger("ai-receptionist.briefing")

MAX_TURNI = 40          # ultimi turni inviati in portineria
MAX_CHAR_TURNO = 320    # taglio per turno (le trascrizioni STT possono essere lunghe)
TIMEOUT_PUNTI = 12.0    # oltre, il briefing parte senza punti salienti

PROMPT_PUNTI = (
    "Sei l'assistente vocale di un hotel e stai passando la chiamata a un receptionist umano. "
    "Dalla conversazione e dallo stato qui sotto scrivi da 3 a 5 punti BREVISSIMI in italiano "
    "(massimo 12 parole ciascuno) per il collega: cosa è già stato fatto, cosa manca, richieste "
    "o particolarità dell'ospite, perché serve una persona. Niente saluti, niente premesse. "
    "Rispondi SOLO con un punto per riga, senza numeri, trattini o asterischi."
)


def trascrizione(history) -> list[dict]:
    """Cronologia della sessione → [{chi: 'ospite'|'alice', testo}] (ultimi turni)."""
    turni: list[dict] = []
    items = getattr(history, "items", None) or []
    for item in items:
        if getattr(item, "type", None) != "message":
            continue
        ruolo = getattr(item, "role", None)
        if ruolo not in ("user", "assistant"):
            continue
        testo = getattr(item, "text_content", None)
        if not testo or not str(testo).strip():
            continue
        testo = " ".join(str(testo).split())
        if len(testo) > MAX_CHAR_TURNO:
            testo = testo[: MAX_CHAR_TURNO - 1] + "…"
        turni.append({"chi": "ospite" if ruolo == "user" else "alice", "testo": testo})
    return turni[-MAX_TURNI:]


def dati_briefing(stato: StatoConversazione, lingua: str, motivo: str | None) -> dict:
    d = stato.dati
    ospite = {"nome": d.get("nome"), "cognome": d.get("cognome")}
    camera = getattr(stato, "camera", None) or {}
    soggiorno = {
        "check_in":  d.get("check_in"),
        "check_out": d.get("check_out"),
        "adulti":    d.get("adulti"),
        "ragazzi":   d.get("ragazzi"),
        "bambini":   d.get("bambini"),
        "camera":    camera.get("nome"),
        "piano":     camera.get("piano"),
        "codice":    stato.codice or d.get("codice"),
    }
    return {
        "scopo":      stato.scopo,
        "fase":       stato.fase.value,
        "fase_label": stato.fase.label(),
        "lingua":     lingua,
        "ospite":     ospite,
        "soggiorno":  soggiorno,
        "documenti":  {"acquisiti": stato.documenti_acquisiti, "attesi": stato.documenti_attesi,
                       "rinunciato": bool(getattr(stato, "documento_rinunciato", False))},
        "motivo":     motivo,
        "aggiornato_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def _testo_stato(dati: dict) -> str:
    o, s, doc = dati["ospite"], dati["soggiorno"], dati["documenti"]
    righe = [
        f"Scopo: {dati['scopo']} · fase: {dati['fase_label']}",
        f"Ospite: {o.get('nome') or '?'} {o.get('cognome') or ''}".strip(),
        f"Soggiorno: {s.get('check_in') or '?'} → {s.get('check_out') or '?'}, adulti {s.get('adulti') or '?'}"
        + (f", ragazzi {s['ragazzi']}" if s.get("ragazzi") else "") + (f", bambini {s['bambini']}" if s.get("bambini") else ""),
        f"Camera: {s.get('camera') or 'non assegnata'} · codice: {s.get('codice') or '—'}",
        f"Documenti: {doc['acquisiti']}/{doc['attesi']}" + (" (ospite senza documento)" if doc["rinunciato"] else ""),
    ]
    if dati.get("motivo"):
        righe.append(f"Motivo del passaggio al receptionist: {dati['motivo']}")
    return "\n".join(righe)


async def punti_salienti(config: Impostazioni, dati: dict, turni: list[dict]) -> list[str]:
    """3-5 punti per il collega, scritti dal modello. [] se nessun provider risponde."""
    if not config.llm_providers or not turni:
        return []
    conversazione = "\n".join(f"{'Ospite' if t['chi'] == 'ospite' else 'Alice'}: {t['testo']}" for t in turni)
    testo = f"{PROMPT_PUNTI}\n\nSTATO:\n{_testo_stato(dati)}\n\nCONVERSAZIONE:\n{conversazione}"
    for provider in config.llm_providers:
        try:
            if provider == "anthropic":
                risposta = await asyncio.wait_for(_anthropic(config, testo), TIMEOUT_PUNTI)
            else:
                risposta = await asyncio.wait_for(_openrouter(config, testo), TIMEOUT_PUNTI)
            punti = [r.strip(" -•*0123456789.)\t") for r in risposta.splitlines()]
            punti = [p for p in punti if p][:6]
            if punti:
                return punti
        except Exception as e:
            logger.warning("punti salienti (%s) falliti: %s", provider, e)
    return []


async def _anthropic(config: Impostazioni, testo: str) -> str:
    client = anthropic_sdk.AsyncAnthropic(api_key=config.anthropic_api_key, timeout=TIMEOUT_PUNTI)
    msg = await client.messages.create(
        model=config.anthropic_model, max_tokens=300,
        messages=[{"role": "user", "content": testo}],
    )
    return "".join(b.text for b in msg.content if b.type == "text")


async def _openrouter(config: Impostazioni, testo: str) -> str:
    async with httpx.AsyncClient(timeout=TIMEOUT_PUNTI) as http:
        r = await http.post(
            "https://openrouter.ai/api/v1/chat/completions",
            headers={"Authorization": f"Bearer {config.openrouter_api_key}"},
            json={"model": config.openrouter_model, "max_tokens": 300,
                  "messages": [{"role": "user", "content": testo}]},
        )
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
