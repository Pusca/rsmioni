<?php

namespace App\Services;

/** Esito di un import Slope: contatori + avvisi leggibili dal gestore. */
class SlopeImportReport
{
    public int $create      = 0;
    public int $aggiornate  = 0;
    public int $cancellate  = 0; // righe con stato cancellato nel file
    public int $rimosse     = 0; // cancellate in Slope E già presenti in rsMioni → tolte
    public int $assenti     = 0; // presenti in rsMioni ma sparite dal file (solo segnalate)
    public int $confermate  = 0; // già con check-in confermato in rsMioni, non toccate
    public int $saltate     = 0;

    /** @var string[] */
    public array $avvisi = [];

    /** @var array<string,bool> */
    private array $unaVolta = [];

    public function avvisa(string $messaggio): void
    {
        $this->avvisi[] = $messaggio;
    }

    public function avvisaUnaVolta(string $chiave, string $messaggio): void
    {
        if (! isset($this->unaVolta[$chiave])) {
            $this->unaVolta[$chiave] = true;
            $this->avvisi[]          = $messaggio;
        }
    }

    public function salta(string $motivo): void
    {
        $this->saltate++;
        $this->avvisi[] = 'Saltata — ' . $motivo;
    }

    public function riepilogo(): string
    {
        $parti = ["{$this->create} nuove", "{$this->aggiornate} aggiornate"];
        if ($this->rimosse)     $parti[] = "{$this->rimosse} cancellate in Slope e tolte da rsMioni";
        if ($this->cancellate - $this->rimosse > 0) $parti[] = ($this->cancellate - $this->rimosse) . ' cancellate ignorate';
        if ($this->assenti)     $parti[] = "{$this->assenti} sparite dal file (da verificare)";
        if ($this->confermate)  $parti[] = "{$this->confermate} già confermate non toccate";
        if ($this->saltate)     $parti[] = "{$this->saltate} saltate";
        $testo = 'Import Slope: ' . implode(', ', $parti) . '.';
        if ($this->avvisi) {
            $testo .= ' ' . count($this->avvisi) . ' avvisi.';
        }
        return $testo;
    }

    public function toArray(): array
    {
        return [
            'create'     => $this->create,
            'aggiornate' => $this->aggiornate,
            'cancellate' => $this->cancellate,
            'rimosse'    => $this->rimosse,
            'assenti'    => $this->assenti,
            'confermate' => $this->confermate,
            'saltate'    => $this->saltate,
            'avvisi'     => $this->avvisi,
        ];
    }
}
