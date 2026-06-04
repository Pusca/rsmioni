<?php

namespace App\Console\Commands;

use App\Models\Documento;
use App\Services\DocumentoService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

#[Signature('documenti:pulisci-scaduti {--giorni=7 : Giorni di retention}')]
#[Description('Elimina documenti più vecchi del periodo di retention')]
class PulisciDocumentiScaduti extends Command
{
    public function handle(DocumentoService $documentoService): int
    {
        $giorni = (int) $this->option('giorni');
        $limite = now()->subDays($giorni);

        $documenti = Documento::where('created_at', '<', $limite)->get();

        if ($documenti->isEmpty()) {
            $this->info('Nessun documento scaduto.');
            return self::SUCCESS;
        }

        $count = 0;
        foreach ($documenti as $doc) {
            $documentoService->elimina($doc);
            $count++;
        }

        $this->info("Eliminati {$count} documenti più vecchi di {$giorni} giorni.");
        return self::SUCCESS;
    }
}
