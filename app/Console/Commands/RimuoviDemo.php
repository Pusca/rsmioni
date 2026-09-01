<?php

namespace App\Console\Commands;

use App\Enums\ContestoDocumento;
use App\Models\Documento;
use App\Models\Hotel;
use App\Models\User;
use App\Services\DocumentoService;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Rimuove i dati dimostrativi da un'installazione che va in produzione,
 * senza toccare hotel e utenti reali (niente migrate:fresh).
 *
 * Elimina: gli hotel demo con tutto ciò che dipende da loro (chioschi,
 * camere, prenotazioni, pagamenti, collaudi, valorizzazioni — via FK
 * cascade) più i documenti collegati (file + record) e gli account demo.
 * Le regole del regolamento (ambito piattaforma) restano.
 */
#[Signature('rsmioni:rimuovi-demo
    {--force : Non chiedere conferma}
    {--tieni-utenti : Non eliminare gli account demo}')]
#[Description('Elimina hotel, chioschi, prenotazioni e utenti dimostrativi')]
class RimuoviDemo extends Command
{
    public const HOTEL_DEMO  = ['Hotel Demo Mioni', 'Hotel Prova'];
    public const UTENTI_DEMO = ['receptionist', 'receptionist_lite', 'gestore', 'chiosco_demo', 'chiosco_demo1', 'chiosco_sala'];

    public function handle(DocumentoService $documenti): int
    {
        $hotels = Hotel::whereIn('nome', self::HOTEL_DEMO)->get();
        $utenti = $this->option('tieni-utenti')
            ? collect()
            : User::whereIn('username', self::UTENTI_DEMO)->get();

        if ($hotels->isEmpty() && $utenti->isEmpty()) {
            $this->info('Nessun dato demo presente.');
            return self::SUCCESS;
        }

        $this->line('Verranno eliminati:');
        foreach ($hotels as $h) {
            $this->line(sprintf(
                '  hotel «%s» — %d camere, %d chioschi, %d prenotazioni',
                $h->nome, $h->camere()->count(), $h->chioschi()->count(), $h->prenotazioni()->count(),
            ));
        }
        foreach ($utenti as $u) {
            $this->line("  utente «{$u->username}» ({$u->profilo->value})");
        }

        if (! $this->option('force') && ! $this->confirm('Confermi? L\'operazione non è reversibile.')) {
            $this->warn('Annullato.');
            return self::FAILURE;
        }

        DB::transaction(function () use ($hotels, $utenti, $documenti) {
            foreach ($hotels as $hotel) {
                // Documenti: nessuna FK (contesto polimorfico) → cancellazione esplicita file + record
                $prenIds   = $hotel->prenotazioni()->pluck('id');
                $camereIds = $hotel->camere()->pluck('id');

                Documento::where(fn ($q) => $q
                    ->where(fn ($p) => $p->where('contesto_tipo', ContestoDocumento::Prenotazione)->whereIn('contesto_id', $prenIds))
                    ->orWhere(fn ($c) => $c->where('contesto_tipo', ContestoDocumento::Camera)->whereIn('contesto_id', $camereIds)))
                    ->get()
                    ->each(fn (Documento $d) => $documenti->elimina($d));

                $hotel->delete(); // FK cascade: chioschi, camere, prenotazioni, pagamenti, collaudi, valorizzazioni, hotel_user
            }

            foreach ($utenti as $u) {
                $u->hotels()->detach();
                $u->delete();
            }
        });

        $this->info(sprintf('Eliminati %d hotel demo e %d utenti demo.', $hotels->count(), $utenti->count()));
        $this->warn('Svuota la cache degli stati chiosco: php artisan cache:clear');

        return self::SUCCESS;
    }
}
