<?php

namespace App\Console\Commands;

use App\Models\Hotel;
use App\Services\SlopeImportService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('prenotazioni:importa-slope
    {file : Percorso del CSV esportato da Slope (Prenotazioni → Elenco → Esporta)}
    {--hotel= : Nome (o id) dell\'hotel di destinazione; obbligatorio se ce n\'è più di uno}
    {--dry-run : Mostra cosa succederebbe senza scrivere nulla}')]
#[Description('Importa/aggiorna le prenotazioni da un export CSV di Slope')]
class ImportaSlope extends Command
{
    public function handle(SlopeImportService $importer): int
    {
        $hotel = $this->option('hotel')
            ? Hotel::where('nome', $this->option('hotel'))->orWhere('id', $this->option('hotel'))->first()
            : (Hotel::count() === 1 ? Hotel::first() : null);

        if (! $hotel) {
            $this->error('Hotel non determinato: usa --hotel="Nome hotel".');
            return self::FAILURE;
        }

        $report = $importer->importaFile((string) $this->argument('file'), $hotel, null, (bool) $this->option('dry-run'));

        $this->info(($this->option('dry-run') ? '[dry-run] ' : '') . $report->riepilogo());
        foreach ($report->avvisi as $a) {
            $this->warn('  • ' . $a);
        }

        return self::SUCCESS;
    }
}
