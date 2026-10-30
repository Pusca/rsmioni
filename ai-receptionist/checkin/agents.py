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

import anthropic as anthropic_sdk
import httpx
from livekit.agents import Agent, RunContext, function_tool

from .backend import BackendRsmioni
from .config import Impostazioni
from .fsm import AzioneFuoriFase, Fase, StatoConversazione
from .ui import SchermoChiosco
from . import briefing as briefing_mod

logger = logging.getLogger("ai-receptionist.agent")

ESCALATION = ("ATTENZIONE: troppi tentativi falliti in questa fase. Proponi "
              "all'ospite di proseguire con il receptionist, che vede già la conversazione.")

# Frasi pronunciate SENZA modello (session.say) agli snodi del documento,
# quando il turno generato dal watcher fallisce o mentre la vision lavora:
# l'ospite davanti al chiosco non deve mai restare nel silenzio.
FRASI_RISERVA: dict[str, dict[str, str]] = {
    "prossimo": {
        "it": "Perfetto, grazie. Ora il documento del prossimo ospite, per favore: prima il fronte, poi il retro.",
        "en": "Perfect, thank you. Now the next guest's document, please: front first, then back.",
        "de": "Perfekt, danke. Jetzt bitte den Ausweis des nächsten Gastes: zuerst die Vorderseite, dann die Rückseite.",
        "fr": "Parfait, merci. Maintenant la pièce d'identité du prochain client, s'il vous plaît : le recto puis le verso.",
        "es": "Perfecto, gracias. Ahora el documento del siguiente huésped, por favor: primero el frente y luego el dorso.",
    },
    "lettura": {
        "it": "Grazie, un attimo: leggo il documento.",
        "en": "Thank you, one moment: I'm reading the document.",
        "de": "Danke, einen Moment: ich lese den Ausweis.",
        "fr": "Merci, un instant : je lis le document.",
        "es": "Gracias, un momento: leo el documento.",
    },
    "riepilogo": {
        "it": "Grazie. Sullo schermo trova il riepilogo della prenotazione: è tutto corretto?",
        "en": "Thank you. The booking summary is on the screen: is everything correct?",
        "de": "Danke. Auf dem Bildschirm sehen Sie die Zusammenfassung der Buchung: ist alles richtig?",
        "fr": "Merci. Le récapitulatif de la réservation est à l'écran : tout est correct ?",
        "es": "Gracias. En la pantalla tiene el resumen de la reserva: ¿está todo correcto?",
    },
    "receptionist": {
        "it": "Ho avvisato il receptionist: arriva subito. Intanto resto qui con lei.",
        "en": "I've notified the receptionist: they're coming right away. I'll stay with you in the meantime.",
        "de": "Ich habe die Rezeption benachrichtigt: jemand kommt sofort. Ich bleibe solange bei Ihnen.",
        "fr": "J'ai prévenu la réception : quelqu'un arrive tout de suite. Je reste avec vous en attendant.",
        "es": "He avisado a recepción: vienen enseguida. Mientras tanto me quedo con usted.",
    },
}

NO_WALKIN = ("In questo hotel le nuove prenotazioni NON si fanno al chiosco: non creare "
             "nulla e non proporre camere. Se cerca_prenotazione non trova l'ospite, chiedi "
             "codice o nome di chi ha prenotato e riprova una volta; poi rimanda al "
             "receptionist, che vede già la conversazione.")


class ReceptionistAgent(Agent):
    def __init__(self, *, instructions: str, stato: StatoConversazione,
                 backend: BackendRsmioni, schermo: SchermoChiosco, lingua: str,
                 config: Impostazioni, walkin: bool = True, verifica_documento: bool = True) -> None:
        super().__init__(instructions=instructions)
        self.stato = stato
        self._backend = backend
        self._schermo = schermo
        self._lingua = lingua
        self._config = config
        # docs/11: False → check-in solo su prenotazioni esistenti (PMS esterno master)
        self._walkin = walkin
        # False (hotel demo o DOC_VERIFICA=off): la foto si accetta così com'è,
        # niente vision, il nome resta quello dato a voce (A35).
        self._verifica_documento = verifica_documento
        # Anti chiusura prematura: il primo termina con passi pendenti viene
        # respinto con l'istruzione correttiva; il secondo chiude davvero.
        self._termina_avvisato = False
        # Attesa foto documento in background: l'agent resta in ascolto e
        # viene svegliato dal watcher quando la foto arriva (o viene annullata).
        self._acquisizione_task: asyncio.Task | None = None
        # Briefing per il receptionist umano: parte in background a ogni fase
        # e, con i punti salienti, quando serve un umano. Motivo e punti
        # restano negli aggiornamenti successivi.
        self._briefing_task: asyncio.Task | None = None
        self._ultimo_motivo: str | None = None
        self._ultimi_punti: list[str] = []

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
            self._avvia_briefing()
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
    async def acquisisci_documento(self, context: RunContext, ospite: int | None = None) -> str:
        """Apre la foto del documento d'identità sul chiosco: appare un
        riquadro guida e l'ospite scatta fronte e retro toccando lo schermo.
        Serve un documento per OGNI adulto: dopo ogni foto la schermata si
        riapre DA SOLA per l'adulto successivo e, dopo l'ultima, la lettura e
        il riepilogo partono da soli. Chiamalo UNA volta, DOPO aver spiegato
        all'ospite cosa fare. Torna SUBITO: tu resti in ascolto e vieni
        avvisata a ogni foto. Se un ospite non ha il documento, chiama
        senza_documento.

        Args:
            ospite: Numero dell'adulto da fotografare (1 = primo). Di default
                il prossimo mancante; indicalo solo per RIFARE una foto.
        """
        try:
            self.stato.richiedi_almeno(
                Fase.SALVATA, "Prima salva la prenotazione: il documento va agganciato a una prenotazione esistente.")
        except AzioneFuoriFase as e:
            return self._fallimento(str(e))

        attesi = self.stato.documenti_attesi
        numero = ospite if ospite and 1 <= ospite <= attesi else min(self.stato.documenti_acquisiti + 1, attesi)
        esito = await self._apri_foto(numero)
        if not esito.ok:
            return self._fallimento(f"Avvio acquisizione non riuscito: {esito.errore}")

        chi = f" per l'ospite {numero} di {attesi}" if attesi > 1 else ""
        return await self._successo(
            None,
            f"Schermata foto aperta sul chiosco{chi}. Resta in ascolto: ti avviso io a ogni foto, e "
            "le schermate successive si aprono da sole. Se l'ospite dice che NON ha il documento "
            "(o non vuole farlo), chiama SUBITO senza_documento. Se chiede come si fa, spiegaglielo: "
            "documento nel riquadro, tocca lo schermo per scattare, fronte poi retro.")

    async def _apri_foto(self, numero: int):
        """Apre (o riapre) la schermata foto per l'ospite `numero` e mette in
        ascolto il watcher. NON bloccante: il vecchio tool aspettava fino a 2
        minuti dentro la chiamata e intanto l'ospite non veniva ascoltato."""
        esito = await self._backend.avvia_acquisizione(self._lingua, numero, self.stato.documenti_attesi)
        if esito.ok:
            self._ferma_watcher()
            self._acquisizione_task = asyncio.create_task(self._attendi_foto(numero))
            logger.info("fase=%s: schermata foto aperta per l'ospite %d/%d",
                        self.stato.fase.value, numero, self.stato.documenti_attesi)
        return esito

    def _ferma_watcher(self) -> None:
        # Mai cancellare il task corrente: _apri_foto viene chiamata anche DAL
        # watcher (foto fatta → schermata per il prossimo ospite) e cancellando
        # sé stesso l'annuncio a voce non partirebbe più.
        task = self._acquisizione_task
        if task and not task.done() and task is not asyncio.current_task():
            task.cancel()
        self._acquisizione_task = None

    async def _attendi_foto(self, numero: int) -> None:
        """Watcher in background: segue la foto dell'ospite `numero` e fa
        avanzare il processo DA SOLO — riapre la schermata per l'adulto
        successivo o, dopo l'ultimo, legge il documento e mostra il riepilogo —
        e poi fa parlare l'agent. Così il check-in non resta appeso se il
        modello non richiama il tool giusto (visto in produzione il 30/10)."""
        try:
            for _ in range(60):  # poll ogni 2s, max 2 minuti
                await asyncio.sleep(2)
                stato = (await self._backend.stato_acquisizione()).get("stato")
                if stato == "completata":
                    await self._foto_fatta(numero)
                    return
                if stato == "nessuna":
                    logger.info("fase=%s: acquisizione annullata dal chiosco (watcher)", self.stato.fase.value)
                    await self._sveglia(
                        "L'ospite ha annullato la foto dallo schermo. Chiedi con calma se vuole "
                        "riprovare (acquisisci_documento) o se non ha il documento con sé "
                        "(senza_documento).", "annullata")
                    return
            logger.info("fase=%s: acquisizione scaduta senza foto (watcher)", self.stato.fase.value)
            await self._sveglia(
                "Sono passati due minuti senza foto. Chiedi se ha bisogno di aiuto con la foto "
                "(acquisisci_documento per riaprirla) o se non ha il documento (senza_documento).",
                "scaduta")
        except asyncio.CancelledError:
            pass
        except Exception as e:  # mai far cadere la sessione per il watcher
            logger.warning("watcher acquisizione: %s", e)

    async def _foto_fatta(self, numero: int) -> None:
        """Foto (fronte+retro) dell'ospite `numero` arrivata: prossimo ospite
        o, se era l'ultimo, lettura + riepilogo. Tutto senza aspettare il modello."""
        self.stato.documenti_acquisiti = max(self.stato.documenti_acquisiti, numero)
        attesi = self.stato.documenti_attesi
        logger.info("fase=%s esito=ok: documento %d/%d acquisito (watcher)",
                    self.stato.fase.value, numero, attesi)

        if not self.stato.documenti_completi:
            prossimo = self.stato.documenti_acquisiti + 1
            esito = await self._apri_foto(prossimo)
            if esito.ok:
                await self._sveglia(
                    f"Foto del documento {numero} di {attesi} fatta. La schermata foto è GIÀ riaperta "
                    f"per l'ospite {prossimo} di {attesi}: chiedi a QUELL'adulto di appoggiare il SUO "
                    "documento nel riquadro (fronte poi retro). NON chiamare acquisisci_documento, è "
                    "già aperta. Se non ha il documento con sé, chiama senza_documento.", "prossimo")
            else:
                await self._sveglia(
                    f"Foto {numero} di {attesi} fatta, ma non sono riuscita a riaprire la schermata "
                    f"per l'ospite successivo ({esito.errore}). Chiama acquisisci_documento per riprovare.",
                    "errore")
            return

        self.stato.avanza_a(Fase.DOCUMENTO)
        await self._schermo.fase(self.stato.fase)
        if self._verifica_documento:
            await self._di_riserva("lettura")  # la vision impiega qualche secondo: niente silenzio
        ok, istruzione = await self._leggi_e_riepiloga()
        prefisso = f"Tutti i {attesi} documenti sono acquisiti. " if attesi > 1 else "Documento acquisito. "
        await self._sveglia(prefisso + istruzione, "riepilogo" if ok else "errore")

    async def _sveglia(self, istruzione: str, evento: str = "") -> None:
        """Fa generare all'agent un nuovo turno spontaneo (evento esterno).
        Se la generazione fallisce (modello giù, sessione in pausa) l'ospite
        non deve restare nel silenzio: parte una frase di riserva già pronta
        nella lingua della conversazione."""
        try:
            handle = self.session.generate_reply(instructions=istruzione)
            await handle
            errore = handle.exception() if hasattr(handle, "exception") else None
            if errore is None:
                return
            logger.warning("turno dal watcher (%s) fallito: %s", evento, errore)
        except Exception as e:
            logger.warning("generate_reply dal watcher (%s) fallita: %s", evento, e)
        await self._di_riserva(evento)

    async def _di_riserva(self, evento: str) -> None:
        """Frase fissa (senza modello) per gli snodi del documento."""
        frasi = FRASI_RISERVA.get(evento)
        if not frasi:
            return
        try:
            await self.session.say(frasi.get(self._lingua) or frasi["en"])
        except Exception as e:
            logger.error("frase di riserva (%s) non pronunciata: %s", evento, e)

    # ── Briefing per il receptionist umano ──────────────────────────────

    def _avvia_briefing(self, motivo: str | None = None, con_punti: bool = False) -> None:
        """Manda in portineria lo stato della pratica, in background (la voce
        non deve aspettare). Con `con_punti` il modello scrive anche i punti
        salienti della conversazione: si usa quando serve un umano."""
        if motivo:
            self._ultimo_motivo = motivo
        if self._briefing_task and not self._briefing_task.done():
            if not con_punti:
                return  # un aggiornamento leggero alla volta: il prossimo arriva alla fase dopo
            self._briefing_task.cancel()
        self._briefing_task = asyncio.create_task(self._invia_briefing(con_punti))

    async def _invia_briefing(self, con_punti: bool) -> None:
        try:
            dati = briefing_mod.dati_briefing(self.stato, self._lingua, self._ultimo_motivo)
            turni = briefing_mod.trascrizione(getattr(self.session, "history", None))
            if con_punti:
                self._ultimi_punti = await briefing_mod.punti_salienti(self._config, dati, turni)
            esito = await self._backend.briefing({**dati, "punti": self._ultimi_punti, "trascrizione": turni})
            if esito.ok:
                logger.info("briefing inviato: fase=%s punti=%d turni=%d",
                            dati["fase"], len(self._ultimi_punti), len(turni))
            else:
                logger.warning("briefing rifiutato dal backend: %s", esito.errore)
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("briefing non inviato: %s", e)

    async def comando_ospite(self, tipo: str) -> None:
        """Comandi toccati dall'ospite sullo schermo del chiosco (DataChannel, topic ai_cmd)."""
        if tipo == "receptionist":
            logger.info("l'ospite ha toccato «Parla con il receptionist» sul chiosco")
            self._avvia_briefing("L'ospite ha toccato «Parla con il receptionist» sul chiosco", con_punti=True)
            await self._sveglia(
                "L'ospite ha appena toccato sullo schermo il pulsante «Parla con il receptionist»: "
                "il receptionist è GIÀ stato avvisato (campanella in portineria), NON serve "
                "richiedi_receptionist. Diglielo in UNA frase, rassicuralo che arriva subito e resta "
                "in linea e a disposizione finché non subentra; NON chiudere la sessione.",
                "receptionist")
        else:
            logger.info("comando dal chiosco ignorato: %s", tipo)

    @function_tool
    async def senza_documento(self, context: RunContext, motivo: str | None = None) -> str:
        """Un ospite NON ha il documento d'identità con sé (o non vuole
        fotografarlo). Chiude la schermata foto sul chiosco e passa la
        chiamata al receptionist (campanella in portineria), che completa
        la registrazione di persona. Chiamalo appena l'ospite lo dice: non
        insistere con la foto.

        Args:
            motivo: In poche parole cosa ha detto l'ospite (lo legge il receptionist).
        """
        self._ferma_watcher()
        await self._backend.annulla_acquisizione()  # best-effort: chiude la schermata foto
        self.stato.documento_rinunciato = True

        testo = motivo or "non ha il documento con sé"
        quanti = (f" (documenti acquisiti {self.stato.documenti_acquisiti} su {self.stato.documenti_attesi})"
                  if self.stato.documenti_attesi > 1 else "")
        motivo_handoff = (f"Ospite senza documento d'identità ({testo}){quanti}: "
                          "serve il receptionist per completare il check-in.")
        esito = await self._backend.richiedi_receptionist(motivo_handoff)
        logger.info("fase=%s: ospite senza documento, passaggio al receptionist", self.stato.fase.value)
        if esito.ok:
            await self._schermo.receptionist(True, motivo_handoff)  # il chiosco mostra «Richiesta inviata»
            self._avvia_briefing(motivo_handoff, con_punti=True)
        if not esito.ok:
            return ("Schermata foto chiusa, ma non sono riuscita ad avvisare il receptionist "
                    f"({esito.errore}). Di' all'ospite di rivolgersi alla reception per il documento "
                    "e resta a disposizione.")
        return ("Schermata foto chiusa e receptionist avvisato (campanella in portineria). Di' "
                "all'ospite, in UNA frase, che non c'è problema: un receptionist prende in carico "
                "la chiamata e completa il check-in con lui. Resta in linea e a disposizione finché "
                "non subentra; NON chiudere la sessione e NON riproporre la foto.")

    @function_tool
    async def leggi_documento(self, context: RunContext) -> str:
        """Ripete la lettura del documento del primo ospite (vision AI sul
        fronte) e mostra il riepilogo finale sullo schermo. Dopo l'ultima foto
        la lettura parte DA SOLA: chiamalo solo se l'esito automatico non è
        arrivato o dopo una foto rifatta."""
        try:
            self.stato.richiedi_almeno(
                Fase.DOCUMENTO, "Prima acquisisci il documento (acquisisci_documento), poi la lettura.")
        except AzioneFuoriFase as e:
            return self._fallimento(str(e))
        if not self.stato.documenti_completi and not self.stato.documento_rinunciato:
            return self._fallimento(
                f"Mancano ancora {self.stato.documenti_mancanti} documenti su {self.stato.documenti_attesi} "
                "(uno per ogni adulto): la schermata foto si riapre da sola per il prossimo ospite, "
                "chiedigli di appoggiare il suo documento. Se non ce l'ha, senza_documento.")

        ok, istruzione = await self._leggi_e_riepiloga()
        return istruzione

    async def _leggi_e_riepiloga(self) -> tuple[bool, str]:
        """Legge (se la verifica è attiva) il documento dell'intestatario e fa
        comparire il riepilogo. Restituisce (riuscita, istruzione per il modello)."""
        if not self._verifica_documento:
            # Demo: la foto è già salvata sulla prenotazione dall'acquisizione;
            # si accetta senza guardarla e il nome resta quello dato a voce.
            self.stato.documento_letto = True
            await self._mostra_riepilogo()
            logger.info("fase=%s esito=ok: documento accettato senza verifica", self.stato.fase.value)
            return True, await self._successo(
                None,
                "Documento salvato così com'è (in questa configurazione non si legge né si "
                "verifica). Il riepilogo (nome dato a voce, date, camera, codice) è già sullo "
                "schermo: presentalo in UNA frase e chiedi se è tutto corretto. Non scandire il codice.")

        esito = await self._backend.documento_immagine()
        if not esito.ok:
            return False, self._fallimento(f"Immagine documento non disponibile: {esito.errore}")

        visione = await self._vision_estrai(esito["immagine"], esito.get("mime", "image/jpeg"))

        if visione is None:  # errore tecnico (rete/servizio), non colpa dell'ospite
            self.stato.documento_letto = True  # non insistere: verificherà il receptionist
            await self._mostra_riepilogo()
            return False, self._fallimento(
                "Lettura automatica non disponibile: resta il nome dato a voce (riepilogo "
                "comunque sullo schermo). Rassicura: il receptionist verificherà i dati.")

        rifai = ("chiama acquisisci_documento con ospite=1 (la lettura poi riparte da sola)"
                 if self.stato.documenti_attesi > 1 else
                 "chiama di nuovo acquisisci_documento (la lettura poi riparte da sola)")
        if not visione.get("documento"):
            cosa = visione.get("descrizione") or "un oggetto diverso"
            return False, self._fallimento(
                f"L'immagine acquisita per il primo ospite NON è un documento d'identità (sembra: {cosa}). "
                f"Dillo all'ospite con gentilezza e chiedigli di appoggiare il documento vero nel riquadro: {rifai}.")

        if not (visione.get("nome") and visione.get("cognome")):
            return False, self._fallimento(
                "È un documento, ma nome e cognome non sono leggibili (riflessi, sfocato o "
                f"fuori riquadro). Chiedi all'ospite di riposizionarlo bene e {rifai}.")

        nome, cognome = str(visione["nome"]).strip(), str(visione["cognome"]).strip()
        agg = await self._backend.aggiorna_intestatario(nome, cognome)
        if not agg.ok:
            return False, self._fallimento(f"Aggiornamento intestatario non riuscito: {agg.errore}")

        self.stato.registra({"nome": nome, "cognome": cognome})
        self.stato.documento_letto = True
        await self._mostra_riepilogo()
        return True, await self._successo(
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
        if not self._config.llm_providers:
            logger.warning("vision: nessun provider LLM, estrazione saltata")
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
        # Stessa cascata del cervello: il primo provider che risponde vince.
        for provider in self._config.llm_providers:
            try:
                if provider == "anthropic":
                    testo = await self._vision_anthropic(immagine_b64, mime, prompt)
                else:
                    testo = await self._vision_openrouter(immagine_b64, mime, prompt)
                testo = testo.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
                dati = json.loads(testo)
                logger.info("vision (%s): documento=%s descrizione=%s nomi=%s", provider,
                            dati.get("documento"), dati.get("descrizione"),
                            bool(dati.get("nome") and dati.get("cognome")))
                return dati
            except Exception as e:
                logger.warning("vision (%s) fallita: %s", provider, e)
        return None

    async def _vision_anthropic(self, immagine_b64: str, mime: str, prompt: str) -> str:
        client = anthropic_sdk.AsyncAnthropic(api_key=self._config.anthropic_api_key, timeout=30.0)
        msg = await client.messages.create(
            model=self._config.anthropic_vision_model,
            max_tokens=300,
            messages=[{"role": "user", "content": [
                {"type": "image", "source": {"type": "base64", "media_type": mime, "data": immagine_b64}},
                {"type": "text", "text": prompt},
            ]}],
        )
        return "".join(b.text for b in msg.content if b.type == "text")

    async def _vision_openrouter(self, immagine_b64: str, mime: str, prompt: str) -> str:
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
            return r.json()["choices"][0]["message"]["content"]

    # ── Tool: check-out ─────────────────────────────────────────────────

    @function_tool
    async def cerca_prenotazione(
        self,
        context: RunContext,
        cognome: str | None = None,
        nome: str | None = None,
        codice: str | None = None,
    ) -> str:
        """Cerca la prenotazione dell'ospite nel gestionale per cognome (e nome)
        così come li hai SENTITI — la ricerca è tollerante a errori di
        trascrizione e cerca anche tra chi ha prenotato — oppure per codice.
        Nel CHECK-OUT trova il soggiorno in corso; nel CHECK-IN trova una
        prenotazione già esistente in arrivo (fatta al telefono, dal gestore o
        online) così da NON crearne una doppia. Se trovata, i dati appaiono
        sullo schermo.

        Args:
            cognome: Cognome dell'ospite come lo hai capito (anche approssimativo).
            nome: Nome dell'ospite, se lo ha detto: aiuta a distinguere omonimi.
            codice: Codice prenotazione (es. AI-ABC123 o 7725229), se il nome non basta.
        """
        if self.stato.scopo == "info":
            return "La ricerca prenotazione non serve nella modalità informazioni."
        if not cognome and not codice and not nome:
            return "Serve almeno il cognome o il codice: chiedili all'ospite."

        ambito = "arrivo" if self.stato.scopo == "checkin" else "soggiorno"
        esito = await self._backend.cerca_prenotazione(cognome, codice, ambito, nome=nome)
        if not esito.ok:
            if esito.get("fuori_finestra"):
                # Riconosciuta, ma l'arrivo è previsto un altro giorno: non si aggancia
                coda = (" Se l'ospite vuole comunque una camera per queste notti, procedi come NUOVA "
                        "prenotazione (persone, date, lista_camere): quella futura resta valida."
                        if self._walkin else " NON creare una nuova prenotazione.")
                return self._fallimento(
                    f"{esito.errore} (prenotazione a nome {esito.get('cognome')}, arrivo {esito.get('check_in')})."
                    + coda)
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

    # ── Tool: passaggio al receptionist umano ───────────────────────────

    @function_tool
    async def richiedi_receptionist(self, context: RunContext, motivo: str) -> str:
        """Chiama un receptionist umano: suona la campanella in portineria e
        segnala il chiosco. Chiamalo OGNI volta che dici all'ospite che passa
        al receptionist (prenotazione non trovata, documento illeggibile,
        pagamento fallito, richiesta esplicita di una persona, situazione
        fuori dal tuo processo). Poi resta in linea finché l'umano non subentra.

        Args:
            motivo: In poche parole perché serve un umano (lo legge il receptionist).
        """
        esito = await self._backend.richiedi_receptionist(motivo)
        if not esito.ok:
            return ("Non sono riuscita ad avvisare il receptionist automaticamente. Di' all'ospite "
                    f"di rivolgersi alla reception o di attendere. ({esito.errore})")
        logger.info("handoff richiesto: %s", motivo)
        await self._schermo.receptionist(True, motivo)
        self._avvia_briefing(motivo, con_punti=True)
        return esito.get("istruzione") or "Receptionist avvisato: resta a disposizione finché non subentra."

    # ── Tool: chiusura ──────────────────────────────────────────────────

    @function_tool
    async def termina_conversazione(self, context: RunContext) -> str:
        """Chiude la sessione al chiosco. Chiamalo nello stesso turno del
        saluto finale: la chiusura attende comunque che tu abbia finito di parlare."""
        # Gate anti chiusura prematura (una volta sola): se nel check-in
        # restano passi essenziali, il primo termina viene convertito in
        # un'istruzione correttiva. Il secondo chiude comunque (l'ospite può
        # essersene andato o aver rifiutato).
        if self.stato.scopo == "checkin" and not self._termina_avvisato and not self.stato.documento_rinunciato:
            if self.stato.fase in (Fase.SALVATA, Fase.CAMERA) or not self.stato.documenti_completi:
                self._termina_avvisato = True
                attesi, mancanti = self.stato.documenti_attesi, self.stato.documenti_mancanti
                cosa = (f"mancano {mancanti} documenti d'identità su {attesi} (uno per ogni adulto)"
                        if attesi > 1 else "manca il documento d'identità")
                return (f"NON chiudere ancora: {cosa}. Proponi all'ospite di acquisirli ora "
                        "(acquisisci_documento). Solo se rifiuta o se ne è andato, richiama "
                        "termina_conversazione.")
            if self.stato.fase == Fase.DOCUMENTO and not self.stato.documento_letto:
                self._termina_avvisato = True
                return ("NON chiudere ancora: il documento è acquisito ma non letto. "
                        "Chiama leggi_documento per registrare l'intestatario ufficiale "
                        "e mostrare il riepilogo. Se l'ospite se n'è andato, richiama "
                        "termina_conversazione.")
        self._ferma_watcher()
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
