"""L'Agent LiveKit del receptionist AI, con i tool di dominio.

Ogni tool è governato dalla macchina a stati (fsm.StatoConversazione):
1. GATE   — l'azione è consentita solo nella fase giusta; fuori sequenza il
            tool NON esegue e risponde al modello con l'istruzione correttiva.
2. VALIDA — i dati passano una validazione locale prima ancora del server.
3. ESEGUE — la chiamata reale va a Laravel (che rivalida e fa audit).
4. AVANZA — a successo la FSM avanza e lo schermo del chiosco si aggiorna
            (recap + stepper di fase).

Errori ripetuti nella stessa fase superano la soglia di escalation: il tool
istruisce il modello a proporre il receptionist umano (docs/09 §5).
"""

from __future__ import annotations

import asyncio
import logging

from livekit.agents import Agent, RunContext, function_tool

from .backend import BackendRsmioni
from .fsm import AzioneFuoriFase, Fase, StatoConversazione
from .ui import SchermoChiosco

logger = logging.getLogger("ai-receptionist.agent")

ESCALATION = ("ATTENZIONE: troppi tentativi falliti in questa fase. Proponi "
              "all'ospite di proseguire con il receptionist, che vede già la conversazione.")


class ReceptionistAgent(Agent):
    def __init__(self, *, instructions: str, stato: StatoConversazione,
                 backend: BackendRsmioni, schermo: SchermoChiosco, lingua: str) -> None:
        super().__init__(instructions=instructions)
        self.stato = stato
        self._backend = backend
        self._schermo = schermo
        self._lingua = lingua

    # ── Helpers di processo ─────────────────────────────────────────────

    def _fallimento(self, messaggio: str) -> str:
        """Registra l'errore nella fase corrente; aggiunge l'escalation a soglia."""
        logger.info("fase=%s esito=errore: %s", self.stato.fase.value, messaggio)
        if self.stato.registra_errore():
            return f"{messaggio}\n{ESCALATION}"
        return messaggio

    async def _successo(self, fase: Fase | None, messaggio: str) -> str:
        if fase:
            self.stato.avanza_a(fase)
            await self._schermo.fase(self.stato.fase)
        logger.info("fase=%s esito=ok: %s", self.stato.fase.value, messaggio)
        return messaggio

    # ── Tool: raccolta dati (check-in) ──────────────────────────────────

    @function_tool
    async def registra_dati(
        self,
        context: RunContext,
        nome: str | None = None,
        cognome: str | None = None,
        check_in: str | None = None,
        check_out: str | None = None,
        adulti: int | None = None,
        ragazzi: int | None = None,
        bambini: int | None = None,
    ) -> str:
        """Registra nel form di prenotazione i dati appena raccolti a voce.
        Chiamalo subito dopo OGNI risposta dell'ospite, anche con un solo campo.
        Le date vanno in formato ISO YYYY-MM-DD.

        Args:
            nome: Nome dell'ospite.
            cognome: Cognome dell'ospite.
            check_in: Data di arrivo (YYYY-MM-DD).
            check_out: Data di partenza (YYYY-MM-DD).
            adulti: Numero di adulti (minimo 1).
            ragazzi: Numero di ragazzi.
            bambini: Numero di bambini.
        """
        campi = {k: v for k, v in {
            "nome": nome, "cognome": cognome, "check_in": check_in,
            "check_out": check_out, "adulti": adulti, "ragazzi": ragazzi,
            "bambini": bambini,
        }.items() if v is not None}
        if not campi:
            return "Nessun campo da registrare: estrai i dati dalla risposta dell'ospite."

        # Validazione locale sui campi RISULTANTI (nuovi + già raccolti)
        errori = StatoConversazione.valida_campi({**self.stato.dati, **campi})
        if errori:
            return self._fallimento(" ".join(errori))

        esito = await self._backend.aggiorna_form(campi)
        if not esito.ok:
            return self._fallimento(f"Registrazione rifiutata dal gestionale: {esito.errore}")

        self.stato.registra(campi)
        await self._schermo.form(esito.get("form", self.stato.dati))
        await self._schermo.fase(self.stato.fase)

        if self.stato.dati_completi:
            return await self._successo(None, "Registrato. Dati completi: fai il riepilogo e chiedi conferma.")
        return await self._successo(None, f"Registrato. Manca ancora: {', '.join(self.stato.dati_mancanti)}.")

    # ── Tool: salvataggio e camera (check-in) ───────────────────────────

    @function_tool
    async def salva_prenotazione(self, context: RunContext) -> str:
        """Crea la prenotazione reale con i dati registrati nel form.
        Chiamalo SOLO dopo che l'ospite ha confermato il riepilogo a voce."""
        try:
            if not self.stato.dati_completi:
                raise AzioneFuoriFase(
                    "Non puoi ancora salvare: mancano " + ", ".join(self.stato.dati_mancanti)
                    + ". Chiedili all'ospite e registrali prima.")
        except AzioneFuoriFase as e:
            return self._fallimento(str(e))

        esito = await self._backend.crea_prenotazione()
        if not esito.ok:
            return self._fallimento(f"Salvataggio non riuscito: {esito.errore}")

        self.stato.codice = esito.get("codice")
        await self._schermo.codice(self.stato.codice)
        return await self._successo(
            Fase.SALVATA,
            f"Prenotazione salvata, codice {self.stato.codice} (già sullo schermo: non "
            "scandirlo). Ora chiama assegna_camera.")

    @function_tool
    async def assegna_camera(self, context: RunContext) -> str:
        """Assegna alla prenotazione salvata una camera libera per le date
        richieste. Chiamalo subito dopo salva_prenotazione."""
        try:
            self.stato.richiedi_almeno(
                Fase.SALVATA, "Prima salva la prenotazione (salva_prenotazione), poi la camera.")
        except AzioneFuoriFase as e:
            return self._fallimento(str(e))

        esito = await self._backend.assegna_camera()
        if not esito.ok:
            return self._fallimento(f"Assegnazione non riuscita: {esito.errore}")

        cam = esito.get("camera", {})
        self.stato.camera = cam
        await self._schermo.camera(cam)
        piano = f", piano {cam['piano']}" if cam.get("piano") is not None else ""
        return await self._successo(
            Fase.CAMERA,
            f"Camera assegnata: {cam.get('nome')}{piano} (già sullo schermo). "
            "Comunicala all'ospite, poi passa al documento.")

    # ── Tool: documento (check-in) ──────────────────────────────────────

    @function_tool
    async def acquisisci_documento(self, context: RunContext) -> str:
        """Avvia la foto del documento d'identità sul chiosco: appare un
        riquadro guida e l'ospite scatta fronte e retro toccando lo schermo.
        Chiamalo DOPO aver spiegato all'ospite cosa fare. Attende gli scatti
        (fino a 2 minuti) e riferisce l'esito."""
        try:
            self.stato.richiedi_almeno(
                Fase.SALVATA, "Prima salva la prenotazione: il documento va agganciato a una prenotazione esistente.")
        except AzioneFuoriFase as e:
            return self._fallimento(str(e))

        esito = await self._backend.avvia_acquisizione(self._lingua)
        if not esito.ok:
            return self._fallimento(f"Avvio acquisizione non riuscito: {esito.errore}")

        for _ in range(60):  # poll ogni 2s, max 2 minuti
            await asyncio.sleep(2)
            stato = await self._backend.stato_acquisizione()
            if stato.get("stato") == "completata":
                return await self._successo(
                    Fase.DOCUMENTO, "Documento acquisito (fronte e retro). Ringrazia e chiudi il check-in.")
            if stato.get("stato") == "nessuna":
                return self._fallimento(
                    "L'ospite ha annullato l'acquisizione. Chiedi se vuole riprovare o farlo alla reception.")
        return self._fallimento("Tempo scaduto: documento non acquisito. Rassicura: potrà farlo alla reception.")

    # ── Tool: check-out ─────────────────────────────────────────────────

    @function_tool
    async def cerca_prenotazione(
        self,
        context: RunContext,
        cognome: str | None = None,
        codice: str | None = None,
    ) -> str:
        """Cerca la prenotazione dell'ospite per il check-out, per cognome
        e/o codice. Se trovata, i dati appaiono sullo schermo.

        Args:
            cognome: Cognome dell'ospite.
            codice: Codice prenotazione (es. AI-ABC123), se il cognome non basta.
        """
        if self.stato.scopo != "checkout":
            return "La ricerca prenotazione serve solo nel check-out."
        if not cognome and not codice:
            return "Serve almeno il cognome o il codice: chiedili all'ospite."

        esito = await self._backend.cerca_prenotazione(cognome, codice)
        if not esito.ok:
            return self._fallimento(f"Ricerca fallita: {esito.errore}")

        p = esito.get("prenotazione", {})
        await self._schermo.form({
            "nome": p.get("nome"), "cognome": p.get("cognome"),
            "check_in": p.get("check_in"), "check_out": p.get("check_out"),
        })
        if p.get("camera"):
            await self._schermo.camera({"nome": p["camera"]})
        if p.get("codice"):
            await self._schermo.codice(p["codice"])
            self.stato.codice = p["codice"]

        pagato = "GIÀ PAGATA" if p.get("pagato") else (
            f"da saldare {p['prezzo']} euro" if p.get("prezzo") else "senza importo impostato (receptionist)")
        return await self._successo(
            Fase.TROVATA,
            f"Trovata: {p.get('nome')} {p.get('cognome')}, camera {p.get('camera') or 'n/d'}, "
            f"partenza {p.get('check_out')}, {pagato}. Dati già sullo schermo.")

    @function_tool
    async def avvia_pagamento_pos(self, context: RunContext) -> str:
        """Avvia il pagamento con carta sul POS del chiosco per la prenotazione
        trovata. Chiamalo dopo aver annunciato l'importo. Attende l'esito
        (fino a 3 minuti) e lo riferisce."""
        try:
            self.stato.richiedi_almeno(
                Fase.TROVATA, "Prima individua la prenotazione (cerca_prenotazione), poi il pagamento.")
        except AzioneFuoriFase as e:
            return self._fallimento(str(e))

        esito = await self._backend.avvia_pagamento()
        if not esito.ok:
            return self._fallimento(f"Avvio pagamento non riuscito: {esito.errore}")

        importo = esito.get("importo")
        await self._schermo.pagamento(importo, "in_corso")

        for _ in range(90):  # poll ogni 2s, max 3 minuti
            await asyncio.sleep(2)
            stato = await self._backend.stato_pagamento()
            s = stato.get("stato")
            if s == "ok":
                await self._schermo.pagamento(importo, "ok")
                return await self._successo(
                    Fase.PAGAMENTO, f"Pagamento di {importo} euro riuscito. Conferma e chiudi il check-out.")
            if s in ("ko", "annullato"):
                await self._schermo.pagamento(importo, "ko")
                return self._fallimento(f"Pagamento {s}. Offri UNA nuova possibilità o indirizza al receptionist.")
        await self._schermo.pagamento(importo, "ko")
        return self._fallimento("Tempo scaduto: pagamento non completato. Indirizza al receptionist.")

    # ── Tool: chiusura ──────────────────────────────────────────────────

    @function_tool
    async def termina_conversazione(self, context: RunContext) -> str:
        """Chiude la sessione al chiosco. Chiamalo nello stesso turno del
        saluto finale: la chiusura attende comunque che tu abbia finito di parlare."""
        self.stato.avanza_a(Fase.CONGEDO)
        # Non troncare il saluto: aspetta la fine dell'audio + margine
        try:
            speech = context.session.current_speech
            if speech:
                await speech.wait_for_playout()
        except Exception:
            pass
        await asyncio.sleep(1.5)
        await self._backend.termina_sessione()
        logger.info("sessione terminata; stato finale: %s", self.stato.descrivi())
        return "Sessione chiusa."
