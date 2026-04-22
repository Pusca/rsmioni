<?php

namespace Database\Seeders;

use App\Models\Camera;
use App\Models\Hotel;
use App\Models\Prenotazione;
use Illuminate\Database\Seeder;

class CamereSeeder extends Seeder
{
    public function run(): void
    {
        $hotel = Hotel::where('nome', 'Hotel Demo Mioni')->firstOrFail();

        $camere = [
            // ── Piano 0 (Terra) ──────────────────────────────────────────────
            [
                'hotel_id'            => $hotel->id,
                'nome'                => '01',
                'tipo'                => 'Singola',
                'piano'               => 0,
                'booking_consentito'  => true,
                'letti_matrimoniali'  => 0,
                'letti_singoli'       => 1,
                'letti_aggiunti'      => 0,
                'divani_letto_singoli'=> 0,
                'divani_letto_matrimoniali' => 0,
                'culle'               => 0,
                'doccia'              => true,
                'vasca'               => false,
                'minibar'             => false,
                'minibar_pieno'       => false,
                'aria_condizionata'   => true,
                'codice_chiave'       => 'K-01',
                'mq'                  => 18.00,
            ],
            [
                'hotel_id'            => $hotel->id,
                'nome'                => '02',
                'tipo'                => 'Doppia uso singola',
                'piano'               => 0,
                'booking_consentito'  => true,
                'letti_matrimoniali'  => 0,
                'letti_singoli'       => 2,
                'letti_aggiunti'      => 0,
                'divani_letto_singoli'=> 0,
                'divani_letto_matrimoniali' => 0,
                'culle'               => 0,
                'doccia'              => true,
                'vasca'               => false,
                'minibar'             => true,
                'minibar_pieno'       => false,
                'aria_condizionata'   => true,
                'codice_chiave'       => 'K-02',
                'mq'                  => 22.00,
            ],
            // ── Piano 1 ──────────────────────────────────────────────────────
            [
                'hotel_id'            => $hotel->id,
                'nome'                => '101',
                'tipo'                => 'Matrimoniale',
                'piano'               => 1,
                'booking_consentito'  => true,
                'letti_matrimoniali'  => 1,
                'letti_singoli'       => 0,
                'letti_aggiunti'      => 1,
                'divani_letto_singoli'=> 0,
                'divani_letto_matrimoniali' => 0,
                'culle'               => 1,
                'doccia'              => true,
                'vasca'               => false,
                'minibar'             => true,
                'minibar_pieno'       => true,
                'aria_condizionata'   => true,
                'codice_chiave'       => 'K-101',
                'mq'                  => 28.50,
            ],
            [
                'hotel_id'            => $hotel->id,
                'nome'                => '102',
                'tipo'                => 'Matrimoniale',
                'piano'               => 1,
                'booking_consentito'  => true,
                'letti_matrimoniali'  => 1,
                'letti_singoli'       => 0,
                'letti_aggiunti'      => 0,
                'divani_letto_singoli'=> 0,
                'divani_letto_matrimoniali' => 0,
                'culle'               => 0,
                'doccia'              => true,
                'vasca'               => false,
                'minibar'             => true,
                'minibar_pieno'       => false,
                'aria_condizionata'   => true,
                'codice_chiave'       => 'K-102',
                'mq'                  => 26.00,
            ],
            [
                'hotel_id'            => $hotel->id,
                'nome'                => '103',
                'tipo'                => 'Tripla',
                'piano'               => 1,
                'booking_consentito'  => true,
                'letti_matrimoniali'  => 1,
                'letti_singoli'       => 1,
                'letti_aggiunti'      => 1,
                'divani_letto_singoli'=> 0,
                'divani_letto_matrimoniali' => 0,
                'culle'               => 0,
                'doccia'              => true,
                'vasca'               => false,
                'minibar'             => true,
                'minibar_pieno'       => false,
                'aria_condizionata'   => true,
                'codice_chiave'       => 'K-103',
                'mq'                  => 34.00,
            ],
            // ── Piano 2 ──────────────────────────────────────────────────────
            [
                'hotel_id'            => $hotel->id,
                'nome'                => '201',
                'tipo'                => 'Matrimoniale Superior',
                'piano'               => 2,
                'booking_consentito'  => true,
                'letti_matrimoniali'  => 1,
                'letti_singoli'       => 0,
                'letti_aggiunti'      => 1,
                'divani_letto_singoli'=> 0,
                'divani_letto_matrimoniali' => 0,
                'culle'               => 1,
                'doccia'              => true,
                'vasca'               => true,
                'minibar'             => true,
                'minibar_pieno'       => true,
                'aria_condizionata'   => true,
                'codice_chiave'       => 'K-201',
                'mq'                  => 35.00,
            ],
            [
                'hotel_id'            => $hotel->id,
                'nome'                => '202',
                'tipo'                => 'Family',
                'piano'               => 2,
                'booking_consentito'  => true,
                'letti_matrimoniali'  => 1,
                'letti_singoli'       => 2,
                'letti_aggiunti'      => 0,
                'divani_letto_singoli'=> 0,
                'divani_letto_matrimoniali' => 0,
                'culle'               => 1,
                'doccia'              => true,
                'vasca'               => false,
                'minibar'             => true,
                'minibar_pieno'       => true,
                'aria_condizionata'   => true,
                'codice_chiave'       => 'K-202',
                'mq'                  => 42.00,
            ],
            [
                'hotel_id'            => $hotel->id,
                'nome'                => '203',
                'tipo'                => 'Quadrupla',
                'piano'               => 2,
                'booking_consentito'  => true,
                'letti_matrimoniali'  => 2,
                'letti_singoli'       => 0,
                'letti_aggiunti'      => 2,
                'divani_letto_singoli'=> 0,
                'divani_letto_matrimoniali' => 0,
                'culle'               => 0,
                'doccia'              => true,
                'vasca'               => false,
                'minibar'             => false,
                'minibar_pieno'       => false,
                'aria_condizionata'   => true,
                'codice_chiave'       => 'K-203',
                'mq'                  => 48.00,
            ],
            // ── Piano 3 — Suite ───────────────────────────────────────────────
            [
                'hotel_id'            => $hotel->id,
                'nome'                => '301 Suite',
                'tipo'                => 'Suite',
                'piano'               => 3,
                'booking_consentito'  => true,
                'letti_matrimoniali'  => 1,
                'letti_singoli'       => 0,
                'letti_aggiunti'      => 0,
                'divani_letto_singoli'=> 0,
                'divani_letto_matrimoniali' => 1,
                'culle'               => 0,
                'doccia'              => true,
                'vasca'               => true,
                'minibar'             => true,
                'minibar_pieno'       => true,
                'aria_condizionata'   => true,
                'quadro_elettrico'    => 'Q3A - quadro secondario',
                'codice_chiave'       => 'K-301',
                'mq'                  => 65.00,
            ],
            // ── Camera non prenotabile (magazzino/servizio) ───────────────────
            [
                'hotel_id'            => $hotel->id,
                'nome'                => 'Deposito',
                'tipo'                => 'Servizio',
                'piano'               => 0,
                'booking_consentito'  => false,
                'letti_matrimoniali'  => 0,
                'letti_singoli'       => 0,
                'letti_aggiunti'      => 0,
                'divani_letto_singoli'=> 0,
                'divani_letto_matrimoniali' => 0,
                'culle'               => 0,
                'doccia'              => false,
                'vasca'               => false,
                'minibar'             => false,
                'minibar_pieno'       => false,
                'aria_condizionata'   => false,
                'codice_chiave'       => null,
                'mq'                  => 12.00,
            ],
        ];

        $createdCamere = [];
        foreach ($camere as $data) {
            $createdCamere[] = Camera::create($data);
        }

        // ── Assegna camere a prenotazioni demo già esistenti ─────────────────

        // BKG-003 (Gruppo in casa, 8 adulti) → camere 202 (Family) + 203 (Quadrupla)
        $bkg003 = Prenotazione::where('codice', 'BKG-003')->first();
        $c202   = collect($createdCamere)->firstWhere('nome', '202');
        $c203   = collect($createdCamere)->firstWhere('nome', '203');
        if ($bkg003 && $c202 && $c203) {
            $bkg003->camere()->sync([$c202->id, $c203->id]);
        }

        // BKG-004 (Andrea Ferrari, 2+1+1) → camera 103 (Tripla)
        $bkg004 = Prenotazione::where('codice', 'BKG-004')->first();
        $c103   = collect($createdCamere)->firstWhere('nome', '103');
        if ($bkg004 && $c103) {
            $bkg004->camere()->sync([$c103->id]);
        }

        // BKG-001 (Bianchi, 2 adulti, arriva oggi) → camera 101
        $bkg001 = Prenotazione::where('codice', 'BKG-001')->first();
        $c101   = collect($createdCamere)->firstWhere('nome', '101');
        if ($bkg001 && $c101) {
            $bkg001->camere()->sync([$c101->id]);
        }

        $this->command->info('Camere seeded: ' . count($createdCamere) . ' camere, assegnazioni demo create');
    }
}
