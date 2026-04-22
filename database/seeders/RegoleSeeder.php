<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class RegoleSeeder extends Seeder
{
    /**
     * Regole predefinite del sistema RS Mioni.
     * Le valorizzazioni (testo) sono per-hotel e si configurano in Regolamento.
     */
    public function run(): void
    {
        $regole = [
            // Categoria: generale
            ['codice' => 'DESCRIZIONE_STRUTTURA',   'categoria' => 'generale',   'ordine' => 10],
            ['codice' => 'SERVIZI_OFFERTI',          'categoria' => 'generale',   'ordine' => 20],
            ['codice' => 'ORARI_CHECK_IN',           'categoria' => 'generale',   'ordine' => 30],
            ['codice' => 'ORARI_CHECK_OUT',          'categoria' => 'generale',   'ordine' => 40],
            ['codice' => 'ORARIO_COLAZIONE',         'categoria' => 'generale',   'ordine' => 50],
            ['codice' => 'WIFI_CREDENZIALI',         'categoria' => 'generale',   'ordine' => 60],
            ['codice' => 'REGOLE_CASA',              'categoria' => 'generale',   'ordine' => 70],
            ['codice' => 'POLITICA_ANIMALI',         'categoria' => 'generale',   'ordine' => 80],
            ['codice' => 'POLITICA_FUMATORI',        'categoria' => 'generale',   'ordine' => 90],
            ['codice' => 'PARCHEGGIO',               'categoria' => 'generale',   'ordine' => 100],

            // Categoria: turistica
            ['codice' => 'RISTORANTI_CONSIGLIATI',   'categoria' => 'turistica',  'ordine' => 10],
            ['codice' => 'ATTRAZIONI_LOCALI',        'categoria' => 'turistica',  'ordine' => 20],
            ['codice' => 'TRASPORTI_LOCALI',         'categoria' => 'turistica',  'ordine' => 30],
            ['codice' => 'ESCURSIONI_CONSIGLIATE',   'categoria' => 'turistica',  'ordine' => 40],
            ['codice' => 'FARMACIE_OSPEDALI',        'categoria' => 'turistica',  'ordine' => 50],
            ['codice' => 'SUPERMERCATI_NEGOZI',      'categoria' => 'turistica',  'ordine' => 60],

            // Categoria: supporto
            ['codice' => 'CONTATTI_RECEPTION',       'categoria' => 'supporto',   'ordine' => 10],
            ['codice' => 'NUMERO_EMERGENZA',         'categoria' => 'supporto',   'ordine' => 20],
            ['codice' => 'ASSISTENZA_TECNICA',       'categoria' => 'supporto',   'ordine' => 30],
            ['codice' => 'PULIZIA_CAMERA',           'categoria' => 'supporto',   'ordine' => 40],
            ['codice' => 'SERVIZIO_SVEGLIA',         'categoria' => 'supporto',   'ordine' => 50],
            ['codice' => 'RICHIESTE_SPECIALI',       'categoria' => 'supporto',   'ordine' => 60],

            // Categoria: sicurezza
            ['codice' => 'VIE_USCITA_EMERGENZA',     'categoria' => 'sicurezza',  'ordine' => 10],
            ['codice' => 'NORME_ANTINCENDIO',        'categoria' => 'sicurezza',  'ordine' => 20],
            ['codice' => 'CASSAFORTE_CAMERA',        'categoria' => 'sicurezza',  'ordine' => 30],
            ['codice' => 'RESPONSABILITA_OGGETTI',   'categoria' => 'sicurezza',  'ordine' => 40],
        ];

        foreach ($regole as $regola) {
            DB::table('regole')->insertOrIgnore([
                'id'        => Str::uuid()->toString(),
                'codice'    => $regola['codice'],
                'categoria' => $regola['categoria'],
                'ordine'    => $regola['ordine'],
            ]);
        }
    }
}
