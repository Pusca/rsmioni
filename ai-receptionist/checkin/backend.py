"""Client HTTP verso le API di dominio di Laravel (/agent/*).

Tutte le chiamate sono legate alla sessione WebRTC in corso: il backend
rifiuta qualsiasi azione fuori da una sessione AI viva. Un errore di rete
viene ritentato una volta; il risultato è sempre un EsitoApi uniforme,
mai un'eccezione verso i tool.
"""

from __future__ import annotations

import asyncio
import logging
from dataclasses import dataclass, field
from typing import Any

import httpx

logger = logging.getLogger("ai-receptionist.backend")


@dataclass(frozen=True)
class EsitoApi:
    ok: bool
    dati: dict[str, Any] = field(default_factory=dict)
    errore: str | None = None

    def __getitem__(self, chiave: str) -> Any:  # comodo nei tool: esito["codice"]
        return self.dati[chiave]

    def get(self, chiave: str, default: Any = None) -> Any:
        return self.dati.get(chiave, default)


class BackendRsmioni:
    def __init__(self, base_url: str, token: str, session_id: str) -> None:
        self._session_id = session_id
        self._http = httpx.AsyncClient(
            base_url=base_url,
            headers={"X-Agent-Token": token, "Accept": "application/json"},
            timeout=10.0,
        )

    async def chiudi(self) -> None:
        await self._http.aclose()

    async def _post(self, path: str, payload: dict | None = None) -> EsitoApi:
        corpo = {"session_id": self._session_id, **(payload or {})}
        for tentativo in (1, 2):
            try:
                r = await self._http.post(path, json=corpo)
                ct = r.headers.get("content-type", "")
                dati = r.json() if ct.startswith("application/json") else {}
                if r.status_code >= 400:
                    errore = dati.get("error") or dati.get("message") or f"errore HTTP {r.status_code}"
                    logger.info("POST %s → %s (%s)", path, r.status_code, errore)
                    return EsitoApi(ok=False, dati=dati, errore=errore)
                return EsitoApi(ok=True, dati=dati)
            except Exception as e:  # rete giù, timeout: un solo retry
                logger.warning("POST %s tentativo %d fallito: %s", path, tentativo, e)
                if tentativo == 1:
                    await asyncio.sleep(0.5)
        return EsitoApi(ok=False, errore="il gestionale non risponde, riprova tra poco")

    # ── API di dominio ──────────────────────────────────────────────────

    async def aggiorna_form(self, campi: dict) -> EsitoApi:
        return await self._post("/agent/form", campi)

    async def crea_prenotazione(self) -> EsitoApi:
        return await self._post("/agent/prenotazione")

    async def assegna_camera(self) -> EsitoApi:
        return await self._post("/agent/camera")

    async def avvia_acquisizione(self, lingua: str = "it") -> EsitoApi:
        return await self._post("/agent/acquisizione", {"lingua": lingua})

    async def stato_acquisizione(self) -> EsitoApi:
        return await self._post("/agent/acquisizione/stato")

    async def cerca_prenotazione(self, cognome: str | None, codice: str | None) -> EsitoApi:
        campi = {k: v for k, v in {"cognome": cognome, "codice": codice}.items() if v}
        return await self._post("/agent/prenotazione/cerca", campi)

    async def avvia_pagamento(self) -> EsitoApi:
        return await self._post("/agent/pagamento")

    async def stato_pagamento(self) -> EsitoApi:
        return await self._post("/agent/pagamento/stato")

    async def termina_sessione(self) -> EsitoApi:
        return await self._post("/agent/termina")
