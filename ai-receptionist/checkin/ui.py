"""Pubblicazione dello stato sullo schermo del chiosco (DataChannel, topic ai_ui).

Il kiosk mostra in tempo reale: campi del form, camera, codice prenotazione,
stato del pagamento e fase corrente del processo (stepper).
"""

from __future__ import annotations

import json
import logging

from .fsm import Fase

logger = logging.getLogger("ai-receptionist.ui")


class SchermoChiosco:
    def __init__(self, room) -> None:
        self._room = room

    async def _publish(self, payload: dict) -> None:
        try:
            data = json.dumps({"topic": "ai_ui", **payload}, ensure_ascii=False)
            await self._room.local_participant.publish_data(data.encode(), reliable=True)
        except Exception as e:
            logger.warning("publish ai_ui fallita: %s", e)

    async def form(self, campi: dict) -> None:
        await self._publish({"tipo": "form", "form": campi})

    async def camera(self, camera: dict) -> None:
        await self._publish({"tipo": "camera", "camera": camera})

    async def codice(self, codice: str) -> None:
        await self._publish({"tipo": "codice", "codice": codice})

    async def pagamento(self, importo: float | None, stato: str) -> None:
        await self._publish({"tipo": "pagamento", "pagamento": {"importo": importo, "stato": stato}})

    async def fase(self, fase: Fase) -> None:
        await self._publish({"tipo": "fase", "fase": fase.value, "label": fase.label()})
