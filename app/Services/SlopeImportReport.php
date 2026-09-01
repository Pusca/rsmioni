<?php

namespace App\Services;

/** Esito di un import Slope: contatori + avvisi leggibili dal gestore. */
class SlopeImportReport
{
    public int $create      = 0;
    public int $aggiornate  = 0;
    public int $cancellate  = 0; // righe con stato cancellato, ignorate
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
        if ($this->cancellate)  $parti[] = "{$this->cancellate} cancellate ignorate";
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
            'confermate' => $this->confermate,
            'saltate'    => $this->saltate,
            'avvisi'     => $this->avvisi,
        ];
    }
}
