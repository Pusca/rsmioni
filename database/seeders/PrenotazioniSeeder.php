<?php

namespace Database\Seeders;

use App\Enums\Profilo;
use App\Enums\StatoDocumentoIdentita;
use App\Enums\TipoPagamento;
use App\Models\Hotel;
use App\Models\Prenotazione;
use App\Models\User;
use Illuminate\Database\Seeder;
use Illuminate\Support\Str;

class PrenotazioniSeeder extends Seeder
{
    public function run(): void
    {
        $hotel      = Hotel::where('nome', 'Hotel Demo Mioni')->firstOrFail();
        $receptionist = User::where('profilo', Profilo::Receptionist->value)->first();
        $gestore      = User::where('profilo', Profilo::GestoreHotel->value)->first();

        $rId = $receptionist?->id ?? Str::uuid()->toString();
        $gId = $gestore?->id      ?? Str::uuid()->toString();

        $prenotazioni = [
            // ── Arrivanti oggi ──────────────────────────────────────────────
            [
                'hotel_id'           => $hotel->id,
                'codice'             => 'BKG-001',
                'nome'               => 'Marco',
                'cognome'            => 'Bianchi',
                'gruppo'             => null,
                'check_in'           => now()->toDateString(),
                'check_out'          => now()->addDays(3)->toDateString(),
                'pax'                => ['adulti' => 2, 'ragazzi' => 0, 'bambini' => 0],
                'tipo_pagamento'     => TipoPagamento::GiaPagato,
                'documento_identita' => StatoDocumentoIdentita::DaAcquisire,
                'checkin_confermato' => false,
                'prezzo'             => 360.00,
                'overbooking'        => false,
                'inserito_da'        => $rId,
                'inserito_da_profilo'=> Profilo::Receptionist,
            ],
            [
                'hotel_id'           => $hotel->id,
                'codice'             => 'BKG-002',
                'nome'               => 'Lucia',
                'cognome'            => 'Rossi',
                'gruppo'             => null,
                'check_in'           => now()->toDateString(),
                'check_out'          => now()->addDays(7)->toDateString(),
                'pax'                => ['adulti' => 1, 'ragazzi' => 0, 'bambini' => 0],
                'tipo_pagamento'     => TipoPagamento::DaPagare,
                'documento_identita' => StatoDocumentoIdentita::DaAcquisire,
                'checkin_confermato' => false,
                'prezzo'             => 490.00,
                'overbooking'        => false,
                'inserito_da'        => $gId,
                'inserito_da_profilo'=> Profilo::GestoreHotel,
            ],
            // ── In casa ─────────────────────────────────────────────────────
            [
                'hotel_id'           => $hotel->id,
                'codice'             => 'BKG-003',
                'nome'               => null,
                'cognome'            => null,
                'gruppo'             => 'Gruppo Congressuale Terme',
                'check_in'           => now()->subDays(2)->toDateString(),
                'check_out'          => now()->addDays(5)->toDateString(),
                'pax'                => ['adulti' => 8, 'ragazzi' => 2, 'bambini' => 0],
                'tipo_pagamento'     => TipoPagamento::GiaPagato,
                'documento_identita' => StatoDocumentoIdentita::GiaFornito,
                'checkin_confermato' => true,
                'prezzo'             => 2400.00,
                'overbooking'        => false,
                'inserito_da'        => $gId,
                'inserito_da_profilo'=> Profilo::GestoreHotel,
            ],
            [
                'hotel_id'           => $hotel->id,
                'codice'             => 'BKG-004',
                'nome'               => 'Andrea',
                'cognome'            => 'Ferrari',
                'gruppo'             => null,
                'check_in'           => now()->subDays(1)->toDateString(),
                'check_out'          => now()->addDays(2)->toDateString(),
                'pax'                => ['adulti' => 2, 'ragazzi' => 1, 'bambini' => 1],
                'tipo_pagamento'     => TipoPagamento::DaPagare,
                'documento_identita' => StatoDocumentoIdentita::GiaFornito,
                'checkin_confermato' => true,
                'prezzo'             => 420.00,
                'overbooking'        => false,
                'inserito_da'        => $rId,
                'inserito_da_profilo'=> Profilo::Receptionist,
            ],
            // ── Check-out oggi ───────────────────────────────────────────────
            [
                'hotel_id'           => $hotel->id,
                'codice'             => 'BKG-005',
                'nome'               => 'Sara',
                'cognome'            => 'Conti',
                'gruppo'             => null,
                'check_in'           => now()->subDays(4)->toDateString(),
                'check_out'          => now()->toDateString(),
                'pax'                => ['adulti' => 2, 'ragazzi' => 0, 'bambini' => 0],
                'tipo_pagamento'     => TipoPagamento::GiaPagato,
                'documento_identita' => StatoDocumentoIdentita::GiaFornito,
                'checkin_confermato' => true,
                'prezzo'             => 480.00,
                'overbooking'        => false,
                'inserito_da'        => $rId,
                'inserito_da_profilo'=> Profilo::Receptionist,
            ],
            // ── Prossimi arrivi ──────────────────────────────────────────────
            [
                'hotel_id'           => $hotel->id,
                'codice'             => 'BKG-006',
                'nome'               => 'Thomas',
                'cognome'            => 'Müller',
                'gruppo'             => null,
                'check_in'           => now()->addDays(2)->toDateString(),
                'check_out'          => now()->addDays(9)->toDateString(),
                'pax'                => ['adulti' => 2, 'ragazzi' => 0, 'bambini' => 0],
                'tipo_pagamento'     => TipoPagamento::GiaPagato,
                'documento_identita' => StatoDocumentoIdentita::DaAcquisire,
                'checkin_confermato' => false,
                'prezzo'             => 980.00,
                'overbooking'        => false,
                'inserito_da'        => $gId,
                'inserito_da_profilo'=> Profilo::GestoreHotel,
            ],
            [
                'hotel_id'           => $hotel->id,
                'codice'             => 'BKG-007',
                'nome'               => 'Elena',
                'cognome'            => 'Moretti',
                'gruppo'             => null,
                'check_in'           => now()->addDays(5)->toDateString(),
                'check_out'          => now()->addDays(12)->toDateString(),
                'pax'                => ['adulti' => 1, 'ragazzi' => 0, 'bambini' => 0],
                'tipo_pagamento'     => TipoPagamento::DaPagare,
                'documento_identita' => StatoDocumentoIdentita::DaAcquisire,
                'checkin_confermato' => false,
                'prezzo'             => 840.00,
                'overbooking'        => false,
                'inserito_da'        => $rId,
                'inserito_da_profilo'=> Profilo::Receptionist,
            ],
            // ── Overbooking (test business rules) ────────────────────────────
            [
                'hotel_id'           => $hotel->id,
                'codice'             => 'BKG-008',
                'nome'               => 'Fabio',
                'cognome'            => 'Longo',
                'gruppo'             => null,
                'check_in'           => now()->addDays(3)->toDateString(),
                'check_out'          => now()->addDays(6)->toDateString(),
                'pax'                => ['adulti' => 3, 'ragazzi' => 0, 'bambini' => 0],
                'tipo_pagamento'     => TipoPagamento::DaPagare,
                'documento_identita' => StatoDocumentoIdentita::DaAcquisire,
                'checkin_confermato' => false,
                'prezzo'             => null,
                'overbooking'        => true,
                'inserito_da'        => $gId,
                'inserito_da_profilo'=> Profilo::GestoreHotel,
            ],
        ];

        foreach ($prenotazioni as $data) {
            Prenotazione::create($data);
        }

        $this->command->info('Prenotazioni seeded: ' . count($prenotazioni) . ' records');
    }
}
