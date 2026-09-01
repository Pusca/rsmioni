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
import json
import logging

import httpx
from livekit.agents import Agent, RunContext, function_tool

from .backend import BackendRsmioni
from .config import Impostazioni
from .fsm import AzioneFuoriFase, Fase, StatoConversazione
from .ui import SchermoChiosco

logger = logging.getLogger("ai-receptionist.agent")

ESCALATION = ("ATTENZIONE: troppi tentativi falliti in questa fase. Proponi "
              "all'ospite di proseguire con il receptionist, che vede già la conversazione.")

NO_WALKIN = ("In questo hotel le nuove prenotazioni NON si fanno al chiosco: non creare "
             "nulla e non proporre camere. Se cerca_prenotazione non trova l'ospite, chiedi "
             "codice o nome di chi ha prenotato e riprova una volta; poi rimanda al "
             "receptionist, che vede già la conversazione.")


class ReceptionistAgent(Agent):
    def __init__(self, *, instructions: str, stato: StatoConversazione,
                 backend: BackendRsmioni, schermo: SchermoChiosco, lingua: str,
                 config: Impostazioni, walkin: bool = True) -> None:
        super().__init__(instructions=instructions)
        self.stato = stato
        self._backend = backend
        self._schermo = schermo
        self._lingua = lingua
        self._config = config
        # docs/11: False → check-in solo su prenotazioni esistenti (PMS esterno master)
        self._walkin = walkin
        # Anti chiusura prematura: il primo termina con passi pendenti viene
        # respinto con l'istruzione correttiva; il secondo chiude davvero.
        self._termina_avvisato = False

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
        Passa ESCLUSIVAMENTE i campi che l'ospite ha pronunciato in questa
        conversazione: MAI date presunte, valori di default o deduzioni.
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
        if not self._walkin:
            return self._fallimento(NO_WALKIN)
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
        return await self._successo(
            Fase.SALVATA,
            "Prenotazione salvata. NON dire il codice: comparirà nel riepilogo finale. "
            "Ora chiama SUBITO assegna_camera con la camera_id scelta dall'ospite.")

    @function_tool
    async def lista_camere(self, context: RunContext) -> str:
        """Verifica la disponibilità: elenca le camere libere per le date e le
        persone raccolte, con prezzo e caratteristiche, e le mostra sullo
        schermo. Chiamalo appena hai persone e date, PRIMA di salvare."""
        # Senza walk-in le camere in vendita non si propongono; resta lecito
        # solo per una prenotazione esistente rimasta senza camera.
        if not self._walkin and self.stato.indice(self.stato.fase) < self.stato.indice(Fase.SALVATA):
            return self._fallimento(NO_WALKIN)
        try:
            if not self.stato.dati_completi:
                raise AzioneFuoriFase(
                    "Per verificare la disponibilità mancano ancora: "
                    + ", ".join(self.stato.dati_mancanti) + ". Chiedili all'ospite e registrali.")
        except AzioneFuoriFase as e:
            return self._fallimento(str(e))

        esito = await self._backend.lista_camere()
        if not esito.ok:
            return self._fallimento(f"Lista camere non disponibile: {esito.errore}")

        opzioni = esito.get("opzioni", [])
        if not opzioni:
            return self._fallimento(
                "Nessuna camera libera per queste date. Informa l'ospite e invitalo al receptionist.")

        await self._schermo.camere_opzioni(opzioni)

        righe = []
        for o in opzioni:
            prezzo = (f"{o['prezzo_notte']:g} euro/notte (totale {o['prezzo_totale']:g})"
                      if o.get("prezzo_notte") is not None else "prezzo da definire col receptionist")
            extra = f" — {o['descrizione']}" if o.get("descrizione") else ""
            simili = f" [{o['quante_simili']} equivalenti]" if o.get("quante_simili", 1) > 1 else ""
            capienza = "" if o.get("capienza_ok") else " (ATTENZIONE: posti insufficienti per il gruppo)"
            righe.append(
                f"- camera_id={o['camera_id']}: {o['tipo']}, piano {o['piano']}, "
                f"{o['posti']} posti, {prezzo}{extra}{simili}{capienza}")

        if len(opzioni) == 1:
            return await self._successo(
                None, "Una sola tipologia disponibile (già sullo schermo): proponila con il prezzo "
                "ESATTO. Se l'ospite accetta: salva_prenotazione e SUBITO assegna_camera con la "
                f"camera_id.\n{righe[0]}")
        return await self._successo(
            None, "Opzioni disponibili (tutte già sullo schermo, non leggere gli id ad alta voce). "
            "Proponi a voce SOLO le 2-3 più adatte al gruppo, con i prezzi letti ESATTAMENTE "
            "da questo elenco (mai a memoria). Quando l'ospite sceglie: salva_prenotazione e "
            "SUBITO assegna_camera con la camera_id scelta:\n" + "\n".join(righe))

    @function_tool
    async def assegna_camera(self, context: RunContext, camera_id: str | None = None) -> str:
        """Assegna una camera alla prenotazione salvata. Passa la camera_id
        dell'opzione scelta dall'ospite (da lista_camere); senza camera_id
        il gestionale sceglie in automatico la prima libera adatta.

        Args:
            camera_id: Id della camera scelta, preso dall'elenco di lista_camere.
        """
        try:
            self.stato.richiedi_almeno(
                Fase.SALVATA, "Prima salva la prenotazione (salva_prenotazione), poi la camera.")
        except AzioneFuoriFase as e:
            return self._fallimento(str(e))

        esito = await self._backend.assegna_camera(camera_id)
        if not esito.ok:
            return self._fallimento(f"Assegnazione non riuscita: {esito.errore}")

        await self._schermo.camere_opzioni(None)  # nasconde le opzioni: scelta fatta

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
                    Fase.DOCUMENTO,
                    "Documento acquisito (fronte e retro). Se ci sono altri adulti con documenti "
                    "da acquisire, ripeti acquisisci_documento; altrimenti chiama leggi_documento "
                    "per leggere il nome ufficiale e mostrare il riepilogo.")
            if stato.get("stato") == "nessuna":
                return self._fallimento(
                    "L'ospite ha annullato l'acquisizione. Chiedi se vuole riprovare o farlo alla reception.")
        return self._fallimento("Tempo scaduto: documento non acquisito. Rassicura: potrà farlo alla reception.")

    @function_tool
    async def leggi_documento(self, context: RunContext) -> str:
        """Legge nome e cognome UFFICIALI dal documento appena acquisito
        (vision AI sul fronte) e mostra il riepilogo finale sullo schermo.
        Chiamalo DOPO l'acquisizione dell'ultimo documento."""
        try:
            self.stato.richiedi_almeno(
                Fase.DOCUMENTO, "Prima acquisisci il documento (acquisisci_documento), poi la lettura.")
        except AzioneFuoriFase as e:
            return self._fallimento(str(e))

        esito = await self._backend.documento_immagine()
        if not esito.ok:
            return self._fallimento(f"Immagine documento non disponibile: {esito.errore}")

        visione = await self._vision_estrai(esito["immagine"], esito.get("mime", "image/jpeg"))

        if visione is None:  # errore tecnico (rete/servizio), non colpa dell'ospite
            self.stato.documento_letto = True  # non insistere: verificherà il receptionist
            await self._mostra_riepilogo()
            return self._fallimento(
                "Lettura automatica non disponibile: resta il nome dato a voce (riepilogo "
                "comunque sullo schermo). Rassicura: il receptionist verificherà i dati.")

        if not visione.get("documento"):
            cosa = visione.get("descrizione") or "un oggetto diverso"
            return self._fallimento(
                f"L'immagine acquisita NON è un documento d'identità (sembra: {cosa}). "
                "Dillo all'ospite con gentilezza e chiedigli di appoggiare il documento vero "
                "nel riquadro: chiama di nuovo acquisisci_documento e poi leggi_documento.")

        if not (visione.get("nome") and visione.get("cognome")):
            return self._fallimento(
                "È un documento, ma nome e cognome non sono leggibili (riflessi, sfocato o "
                "fuori riquadro). Chiedi all'ospite di riposizionarlo bene e rifai: "
                "acquisisci_documento e poi leggi_documento.")

        nome, cognome = str(visione["nome"]).strip(), str(visione["cognome"]).strip()
        agg = await self._backend.aggiorna_intestatario(nome, cognome)
        if not agg.ok:
            return self._fallimento(f"Aggiornamento intestatario non riuscito: {agg.errore}")

        self.stato.registra({"nome": nome, "cognome": cognome})
        self.stato.documento_letto = True
        await self._mostra_riepilogo()
        return await self._successo(
            None,
            f"Documento letto: l'intestatario ufficiale è {nome} {cognome}. Il riepilogo completo "
            "(nome, date, camera, codice) è già sullo schermo: presentalo in UNA frase e chiedi "
            "se è tutto corretto. Non scandire il codice.")

    async def _mostra_riepilogo(self) -> None:
        d = self.stato.dati
        cam = self.stato.camera or {}
        await self._schermo.riepilogo({
            "nome": d.get("nome"), "cognome": d.get("cognome"),
            "check_in": d.get("check_in"), "check_out": d.get("check_out"),
            "adulti": d.get("adulti"), "ragazzi": d.get("ragazzi"), "bambini": d.get("bambini"),
            "camera": cam.get("nome"), "piano": cam.get("piano"),
            "codice": self.stato.codice,
        })

    async def _vision_estrai(self, immagine_b64: str, mime: str) -> dict | None:
        """Analizza l'immagine acquisita: valida che sia un documento vero e
        ne estrae nome/cognome. None solo su errore tecnico (rete/servizio)."""
        if not self._config.openrouter_api_key:
            logger.warning("vision: OPENROUTER_API_KEY assente, estrazione saltata")
            return None
        prompt = (
            "Sei il controllo documenti di un hotel. Analizza l'immagine e rispondi SOLO "
            'con JSON: {"documento": true/false, "descrizione": "...", "nome": "...", "cognome": "..."}.\n'
            '- "documento": true SOLO se l\'immagine mostra un documento d\'identità fisico '
            "reale (carta d'identità, passaporto, patente) con dati anagrafici visibili. "
            "Telefoni, schermi, mani, volti, stanze, fogli qualsiasi: false.\n"
            '- "descrizione": in 3-5 parole cosa mostra davvero l\'immagine (es. "uno smartphone").\n'
            '- "nome"/"cognome": del titolare, con la sola iniziale maiuscola, SOLO se '
            "chiaramente leggibili sul documento; altrimenti null. Non inventare mai."
        )
        try:
            async with httpx.AsyncClient(timeout=30.0) as http:
                r = await http.post(
                    "https://openrouter.ai/api/v1/chat/completions",
                    headers={"Authorization": f"Bearer {self._config.openrouter_api_key}"},
                    json={
                        "model": self._config.vision_model,
                        "max_tokens": 300,
                        "messages": [{"role": "user", "content": [
                            {"type": "image_url",
                             "image_url": {"url": f"data:{mime};base64,{immagine_b64}"}},
                            {"type": "text", "text": prompt},
                        ]}],
                    },
                )
                r.raise_for_status()
                testo = r.json()["choices"][0]["message"]["content"].strip()
            testo = testo.removeprefix("```json").removeprefix("```").removesuffix("```").strip()
            dati = json.loads(testo)
            logger.info("vision: documento=%s descrizione=%s nomi=%s",
                        dati.get("documento"), dati.get("descrizione"),
                        bool(dati.get("nome") and dati.get("cognome")))
            return dati
        except Exception as e:
            logger.warning("vision estrazione fallita: %s", e)
        return None

    # ── Tool: check-out ─────────────────────────────────────────────────

    @function_tool
    async def cerca_prenotazione(
        self,
        context: RunContext,
        cognome: str | None = None,
        codice: str | None = None,
    ) -> str:
        """Cerca la prenotazione dell'ospite nel gestionale, per cognome e/o
        codice. Nel CHECK-OUT trova il soggiorno in corso; nel CHECK-IN trova
        una prenotazione già esistente in arrivo (fatta al telefono, dal
        gestore o online) così da NON crearne una doppia. Se trovata, i dati
        appaiono sullo schermo.

        Args:
            cognome: Cognome dell'ospite.
            codice: Codice prenotazione (es. AI-ABC123), se il cognome non basta.
        """
        if self.stato.scopo == "info":
            return "La ricerca prenotazione non serve nella modalità informazioni."
        if not cognome and not codice:
            return "Serve almeno il cognome o il codice: chiedili all'ospite."

        ambito = "arrivo" if self.stato.scopo == "checkin" else "soggiorno"
        esito = await self._backend.cerca_prenotazione(cognome, codice, ambito)
        if not esito.ok:
            if self.stato.scopo == "checkin" and self._walkin:
                # Nessuna prenotazione in arrivo: NON è un errore — si crea da zero
                return ("Nessuna prenotazione esistente a questo nome: procedi con il "
                        "check-in normale (raccogli date e persone e creane una nuova).")
            if self.stato.scopo == "checkin":
                # Solo prenotazioni esistenti: un tentativo con codice/prenotante, poi receptionist
                return self._fallimento(
                    f"Prenotazione non trovata ({esito.errore}). Chiedi il codice di prenotazione "
                    "o il nome di chi ha prenotato e riprova UNA volta; se ancora nulla, spiega che "
                    "il receptionist la sistema lui e resta a disposizione.")
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

        if self.stato.scopo == "checkin":
            # Prenotazione del gestionale agganciata: si salta la creazione.
            pax = p.get("pax") or {}
            self.stato.registra({
                "nome": p.get("nome"), "cognome": p.get("cognome"),
                "check_in": p.get("check_in"), "check_out": p.get("check_out"),
                "adulti": pax.get("adulti"),
            })
            self.stato.avanza_a(Fase.SALVATA)
            await self._schermo.fase(self.stato.fase)
            if p.get("camera"):
                camera = f"camera già assegnata: {p['camera']}"
            elif self._walkin:
                camera = "nessuna camera ancora assegnata: proponila con lista_camere e assegna_camera"
            else:
                camera = ("nessuna camera ancora assegnata: NON sceglierla tu, di' all'ospite che "
                          "il receptionist gliela comunica")
            return await self._successo(
                None,
                f"Prenotazione esistente trovata e agganciata: {p.get('nome')} {p.get('cognome')}, "
                f"arrivo {p.get('check_in')}, partenza {p.get('check_out')}, {camera}. "
                "Conferma i dati in UNA frase e prosegui con i documenti "
                "(acquisisci_documento) — NON creare una nuova prenotazione.")

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
        # Gate anti chiusura prematura (una volta sola): se nel check-in
        # restano passi essenziali, il primo termina viene convertito in
        # un'istruzione correttiva. Il secondo chiude comunque (l'ospite può
        # essersene andato o aver rifiutato).
        if self.stato.scopo == "checkin" and not self._termina_avvisato:
            if self.stato.fase in (Fase.SALVATA, Fase.CAMERA):
                self._termina_avvisato = True
                return ("NON chiudere ancora: manca il documento d'identità. Proponi "
                        "all'ospite di acquisirlo ora (acquisisci_documento). Solo se "
                        "rifiuta o se ne è andato, richiama termina_conversazione.")
            if self.stato.fase == Fase.DOCUMENTO and not self.stato.documento_letto:
                self._termina_avvisato = True
                return ("NON chiudere ancora: il documento è acquisito ma non letto. "
                        "Chiama leggi_documento per registrare l'intestatario ufficiale "
                        "e mostrare il riepilogo. Se l'ospite se n'è andato, richiama "
                        "termina_conversazione.")
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
