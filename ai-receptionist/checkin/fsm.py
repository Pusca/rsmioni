"""Macchina a stati del check-in/check-out vocale (docs/09 §5).

La FSM è la fonte di verità del PROCESSO: i tool dell'agent la consultano
prima di agire (gate) e la fanno avanzare dopo. Il modello linguistico guida
la conversazione, ma non può saltare passi: un tool chiamato fuori ordine
viene rifiutato con un messaggio correttivo, non eseguito.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field
from datetime import date, datetime
from enum import Enum


class Fase(str, Enum):
    # check-in
    ACCOGLIENZA = "accoglienza"   # saluto, primo contatto
    DATI        = "dati"          # raccolta anagrafica / date / ospiti
    CONFERMA    = "conferma"      # dati completi, riepilogo e attesa del sì
    SALVATA     = "salvata"       # prenotazione creata
    CAMERA      = "camera"        # camera assegnata
    DOCUMENTO   = "documento"     # documento acquisito
    CONGEDO     = "congedo"       # domande finali / saluto
    # check-out
    RICERCA     = "ricerca"       # identificazione prenotazione
    TROVATA     = "trovata"       # prenotazione individuata
    PAGAMENTO   = "pagamento"     # pagamento POS completato

    def label(self) -> str:
        return {
            Fase.ACCOGLIENZA: "Accoglienza", Fase.DATI: "Dati",
            Fase.CONFERMA: "Conferma", Fase.SALVATA: "Prenotazione",
            Fase.CAMERA: "Camera", Fase.DOCUMENTO: "Documento",
            Fase.CONGEDO: "Fine", Fase.RICERCA: "Ricerca",
            Fase.TROVATA: "Prenotazione", Fase.PAGAMENTO: "Pagamento",
        }[self]


# Ordine canonico per scopo: una fase può avanzare solo lungo questa scala.
ORDINE_CHECKIN  = [Fase.ACCOGLIENZA, Fase.DATI, Fase.CONFERMA, Fase.SALVATA,
                   Fase.CAMERA, Fase.DOCUMENTO, Fase.CONGEDO]
ORDINE_CHECKOUT = [Fase.RICERCA, Fase.TROVATA, Fase.PAGAMENTO, Fase.CONGEDO]

# Nome e cognome NON sono qui: il nome vocale è solo un segnaposto e quello
# ufficiale arriva dal documento (A29) — disponibilità e salvataggio non
# devono mai bloccarsi in attesa di un cognome capito male a voce.
CAMPI_OBBLIGATORI = ("check_in", "check_out", "adulti")

# Oltre questa soglia di errori nella stessa fase l'agent deve proporre
# il passaggio al receptionist umano (gate di escalation, docs/09 §5).
SOGLIA_ESCALATION = 2


class AzioneFuoriFase(Exception):
    """Il tool è stato chiamato in una fase in cui non è consentito.

    Il messaggio è pensato per il MODELLO: gli spiega cosa fare invece.
    """


@dataclass
class StatoConversazione:
    scopo: str = "checkin"                       # checkin | checkout | info
    fase: Fase = Fase.ACCOGLIENZA
    dati: dict = field(default_factory=dict)     # campi del form raccolti
    errori: Counter = field(default_factory=Counter)  # errori per fase
    codice: str | None = None
    camera: dict | None = None
    documento_letto: bool = False                # leggi_documento eseguita (o fallback tecnico)

    def __post_init__(self) -> None:
        if self.scopo == "checkout":
            self.fase = Fase.RICERCA

    # ── Ordine e avanzamento ────────────────────────────────────────────

    @property
    def ordine(self) -> list[Fase]:
        return ORDINE_CHECKOUT if self.scopo == "checkout" else ORDINE_CHECKIN

    def indice(self, fase: Fase) -> int:
        try:
            return self.ordine.index(fase)
        except ValueError:
            return -1

    def avanza_a(self, fase: Fase) -> None:
        """Avanza solo in avanti: mai retrocedere per un retry."""
        if self.indice(fase) > self.indice(self.fase):
            self.fase = fase

    def richiedi_almeno(self, fase: Fase, istruzione: str) -> None:
        """Gate: solleva AzioneFuoriFase se il processo non è ancora a `fase`."""
        if self.indice(self.fase) < self.indice(fase):
            raise AzioneFuoriFase(istruzione)

    # ── Dati e validazione ──────────────────────────────────────────────

    def registra(self, campi: dict) -> None:
        self.dati.update({k: v for k, v in campi.items() if v is not None})
        if self.fase == Fase.ACCOGLIENZA:
            self.avanza_a(Fase.DATI)
        if self.dati_completi:
            self.avanza_a(Fase.CONFERMA)

    @property
    def dati_completi(self) -> bool:
        return all(self.dati.get(c) for c in CAMPI_OBBLIGATORI)

    @property
    def dati_mancanti(self) -> list[str]:
        return [c for c in CAMPI_OBBLIGATORI if not self.dati.get(c)]

    @staticmethod
    def valida_campi(campi: dict) -> list[str]:
        """Validazione locale (prima ancora del server): errori actionable."""
        errori: list[str] = []
        for chiave in ("check_in", "check_out"):
            valore = campi.get(chiave)
            if valore is not None:
                try:
                    datetime.strptime(str(valore), "%Y-%m-%d")
                except ValueError:
                    errori.append(f"{chiave}='{valore}' non è una data ISO (YYYY-MM-DD): riconvertila.")
        ci, co = campi.get("check_in"), campi.get("check_out")
        if ci and str(ci) < date.today().isoformat():
            errori.append(f"check_in {ci} è nel passato: richiedi la data di arrivo.")
        if ci and co and str(co) <= str(ci):
            errori.append("check_out deve essere dopo check_in: verifica le date con l'ospite.")
        adulti = campi.get("adulti")
        if adulti is not None and not (1 <= int(adulti) <= 10):
            errori.append("adulti deve essere tra 1 e 10: richiedi il numero di persone.")
        return errori

    # ── Escalation ──────────────────────────────────────────────────────

    def registra_errore(self) -> bool:
        """Conta un errore nella fase corrente; True se è ora di escalare."""
        self.errori[self.fase] += 1
        return self.errori[self.fase] >= SOGLIA_ESCALATION

    # ── Introspezione (log / UI) ────────────────────────────────────────

    def descrivi(self) -> dict:
        return {
            "scopo": self.scopo,
            "fase": self.fase.value,
            "dati": dict(self.dati),
            "codice": self.codice,
            "errori": dict(self.errori),
        }
