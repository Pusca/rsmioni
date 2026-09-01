<?php

namespace App\Console\Commands;

use App\Enums\ContestoDocumento;
use App\Models\Documento;
use App\Models\Prenotazione;
use App\Services\DocumentoService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;

/**
 * Retention dei documenti d'identità acquisiti al check-in (GDPR).
 *
 * Cancella SOLO i documenti legati a una prenotazione, e solo quando il
 * soggiorno è finito da almeno N giorni (check_out + N < oggi). Documenti
 * orfani (prenotazione cancellata) seguono la stessa regola sulla loro data
 * di caricamento.
 *
 * Non tocca MAI documenti di camere o del regolamento: sono materiale
 * dell'hotel, non dati personali dell'ospite.
 */
#[Signature('documenti:pulisci-scaduti
    {--giorni=7 : Giorni dopo il check-out oltre i quali i documenti ospite vengono eliminati}
    {--dry-run : Mostra cosa verrebbe eliminato senza toccare nulla}')]
#[Description('Elimina i documenti ospite delle prenotazioni concluse oltre il periodo di retention')]
class PulisciDocumentiScaduti extends Command
{
    public function handle(DocumentoService $documentoService): int
    {
        $giorni = max(1, (int) $this->option('giorni'));
        $dryRun = (bool) $this->option('dry-run');
        $limite = now()->subDays($giorni);

        $candidati = Documento::where('contesto_tipo', ContestoDocumento::Prenotazione)
            ->where('created_at', '<', $limite) // mai un documento caricato da poco
            ->get();

        $daEliminare = $candidati->filter(function (Documento $doc) use ($limite) {
            $pren = Prenotazione::find($doc->contesto_id);

            // Orfano: la prenotazione non esiste più → basta l'età del file
            if (! $pren) {
                return true;
            }

            // Soggiorno concluso da almeno N giorni
            return $pren->check_out->lt($limite->toDateString());
        });

        if ($daEliminare->isEmpty()) {
            $this->info('Nessun documento ospite da eliminare.');
            return self::SUCCESS;
        }

        foreach ($daEliminare as $doc) {
            $this->line(sprintf(
                '%s %s (%s) prenotazione %s',
                $dryRun ? '[dry-run]' : 'elimino',
                $doc->titolo ?? 'documento',
                $doc->estensione,
                $doc->contesto_id,
            ));

            if (! $dryRun) {
                $documentoService->elimina($doc);
            }
        }

        $this->info(sprintf(
            '%s %d documenti ospite di soggiorni conclusi da più di %d giorni.',
            $dryRun ? 'Da eliminare:' : 'Eliminati',
            $daEliminare->count(),
            $giorni,
        ));

        return self::SUCCESS;
    }
}
