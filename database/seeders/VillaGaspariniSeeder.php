<?php

namespace Database\Seeders;

use App\Enums\StatoChiosco;
use App\Enums\TipoChiosco;
use App\Models\Camera;
use App\Models\Chiosco;
use App\Models\Hotel;
use App\Services\PortineriaService;
use Illuminate\Database\Seeder;

/**
 * Hotel Villa Gasparini (Dolo, VE) — struttura reale, copia 1:1 delle
 * tipologie e dei numeri camera del gestionale Slope dell'hotel.
 *
 * Idempotente: si può rilanciare senza duplicare nulla. NON crea utenti:
 * per quelli c'è `php artisan rsmioni:crea-utente` (password generata e
 * stampata una volta sola, mai nel codice).
 *
 * Uso: php artisan db:seed --class=VillaGaspariniSeeder
 *
 * Nota (docs/11): Slope resta il master delle prenotazioni. I prezzi a
 * notte qui restano vuoti di proposito — li gestisce Slope; l'AI al go-live
 * lavora solo su prenotazioni esistenti e non propone camere in vendita.
 */
class VillaGaspariniSeeder extends Seeder
{
    public const NOME_HOTEL = 'Hotel Villa Gasparini';

    public function run(): void
    {
        $hotel = Hotel::firstOrCreate(
            ['nome' => self::NOME_HOTEL],
            [
                'indirizzo'                    => 'Riviera Martiri della Libertà 37, 30031 Dolo (VE)',
                'chioschi_concorrenti_max'     => 1,
                'giorni_visibilita_calendario' => 60,
                'overbooking_permesso'         => false,
                'checkout_libero'              => false,
                'checkout_ora'                 => '10:30:00',
                'lingua_default'               => 'it',
                'lingue_abilitate'             => ['it', 'en', 'de', 'es', 'fr'],
                'suoneria_attiva'              => true,
                'volume_suoneria'              => 80,
                'numero_massimo_pax'           => 4,
                'campi_pax_obbligatori'        => ['nome', 'cognome'],
            ],
        );

        // ── Tipologie (da Slope → Struttura → Alloggi) ───────────────────────
        $tipologie = [
            'Camera Economy' => [
                'descrizione' => 'Camera doppia con letto matrimoniale, bagno privato, aria condizionata, Wi-Fi e TV.',
                'vasca'       => false,
                'minibar'     => false,
                'mq'          => 14,
            ],
            'Camera standard' => [
                'descrizione' => 'Camera doppia al piano nobile della villa, ognuna con un tema diverso. Letto matrimoniale, bagno privato, aria condizionata, minibar, Wi-Fi e TV.',
                'vasca'       => false,
                'minibar'     => true,
                'mq'          => 16,
            ],
            'Camera superior con Jacuzzi' => [
                'descrizione' => 'Camera doppia a tema con vasca idromassaggio Jacuzzi in camera. Letto matrimoniale, bagno privato, aria condizionata, minibar, Wi-Fi e TV.',
                'vasca'       => true,
                'minibar'     => true,
                'mq'          => 20,
            ],
            'Junior Suite con Jacuzzi' => [
                'descrizione' => 'Junior Suite spaziosa con vasca idromassaggio Jacuzzi, zona relax, letto matrimoniale, bagno privato, aria condizionata, minibar, Wi-Fi e TV.',
                'vasca'       => true,
                'minibar'     => true,
                'mq'          => 28,
            ],
        ];

        // ── Camere: numero → [tipologia, piano, edificio] (da Slope → Piani) ──
        // `piano` è un intero: 0 terra, 1 primo, 2 secondo. La Dépendance è un
        // edificio separato: lo diciamo nella descrizione (serve all'AI e al
        // receptionist), il piano resta 0.
        $camere = [
            '101' => ['Camera Economy',              0, 'Villa, piano terra'],
            '102' => ['Camera Economy',              0, 'Villa, piano terra'],
            '103' => ['Camera standard',             1, 'Villa, primo piano'],
            '104' => ['Camera superior con Jacuzzi', 1, 'Villa, primo piano'],
            '105' => ['Junior Suite con Jacuzzi',    1, 'Villa, primo piano'],
            '106' => ['Camera superior con Jacuzzi', 1, 'Villa, primo piano'],
            '107' => ['Camera superior con Jacuzzi', 1, 'Villa, primo piano'],
            '108' => ['Camera standard',             1, 'Villa, primo piano'],
            '109' => ['Camera superior con Jacuzzi', 2, 'Villa, secondo piano'],
            '110' => ['Junior Suite con Jacuzzi',    2, 'Villa, secondo piano'],
            '111' => ['Camera standard',             0, 'Dépendance (edificio separato)'],
            '112' => ['Camera Economy',              0, 'Dépendance (edificio separato)'],
            '113' => ['Camera Economy',              0, 'Dépendance (edificio separato)'],
            '114' => ['Camera Economy',              0, 'Dépendance (edificio separato)'],
            '115' => ['Camera Economy',              0, 'Dépendance (edificio separato)'],
        ];

        foreach ($camere as $numero => [$tipo, $piano, $dove]) {
            $t = $tipologie[$tipo];

            Camera::updateOrCreate(
                ['hotel_id' => $hotel->id, 'nome' => $numero],
                [
                    'tipo'                      => $tipo,
                    'piano'                     => $piano,
                    'booking_consentito'        => true,
                    'letti_matrimoniali'        => 1,
                    'letti_singoli'             => 0,
                    'letti_aggiunti'            => 0,
                    'divani_letto_singoli'      => 0,
                    'divani_letto_matrimoniali' => 0,
                    'culle'                     => 0,
                    'doccia'                    => ! $t['vasca'],
                    'vasca'                     => $t['vasca'],
                    'minibar'                   => $t['minibar'],
                    'minibar_pieno'             => false,
                    'aria_condizionata'         => true,
                    'mq'                        => $t['mq'],
                    'prezzo_notte'              => null, // i prezzi li fa Slope
                    'descrizione'               => "{$dove}. {$t['descrizione']}",
                ],
            );
        }

        // ── Chiosco in hall ─────────────────────────────────────────────────
        $chiosco = Chiosco::firstOrCreate(
            ['hotel_id' => $hotel->id, 'nome' => 'Chiosco Reception'],
            [
                'tipo'          => TipoChiosco::Touch,
                'interattivo'   => true,
                'has_pos'       => false, // POS spento al go-live (docs/11, decisione C)
                'tipo_pos'      => null,
                'has_stampante' => false,
                'attivo'        => true,
            ],
        );

        app(PortineriaService::class)->impostaStato($chiosco, StatoChiosco::Idle);

        $this->command?->info("Hotel «{$hotel->nome}»: " . count($camere) . " camere, chiosco «{$chiosco->nome}».");
        $this->command?->info('Utenti: php artisan rsmioni:crea-utente <username> <profilo> --hotel="' . self::NOME_HOTEL . '"');
    }
}
