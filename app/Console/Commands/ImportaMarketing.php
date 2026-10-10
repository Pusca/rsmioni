<?php

namespace App\Console\Commands;

use App\Models\Marketing\Appuntamento;
use App\Models\Marketing\Campagna;
use App\Models\Marketing\EventoMarketing;
use App\Models\Marketing\Lead;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Carica/aggiorna i dati del funnel marketing da un file JSON.
 *
 *   php artisan marketing:importa                       # database/data/marketing.json
 *   php artisan marketing:importa percorso/altro.json
 *   php artisan marketing:importa --pulisci              # elimina anche le righe non più presenti nel file
 *
 * Ogni record ha un `codice` stabile: la stessa riga rilanciata aggiorna, non duplica.
 * I riferimenti tra record usano i codici (campagna, lead, appuntamento).
 * Formato: docs/12-marketing-funnel.md.
 */
class ImportaMarketing extends Command
{
    protected $signature = 'marketing:importa {file=database/data/marketing.json} {--pulisci : Rimuove i record assenti dal file}';

    protected $description = 'Importa campagne, lead, appuntamenti ed eventi marketing da JSON';

    public function handle(): int
    {
        $percorso = $this->argument('file');
        if (! str_starts_with($percorso, '/') && ! preg_match('#^[A-Za-z]:[\\\\/]#', $percorso)) {
            $percorso = base_path($percorso);
        }

        if (! is_file($percorso)) {
            $this->error("File non trovato: {$percorso}");
            return self::FAILURE;
        }

        $dati = json_decode((string) file_get_contents($percorso), true);
        if (! is_array($dati)) {
            $this->error('JSON non valido: ' . json_last_error_msg());
            return self::FAILURE;
        }

        $esito = DB::transaction(fn () => $this->importa($dati, (bool) $this->option('pulisci')));

        foreach ($esito as $tabella => $n) {
            $this->line(sprintf('%-14s %d', $tabella, $n));
        }
        $this->info('Import completato.');

        return self::SUCCESS;
    }

    /** @return array<string,int> */
    private function importa(array $dati, bool $pulisci): array
    {
        $campagne = collect($dati['campagne'] ?? []);
        $lead     = collect($dati['lead'] ?? []);
        $app      = collect($dati['appuntamenti'] ?? []);
        $eventi   = collect($dati['eventi'] ?? []);

        // Campagne
        $campagne->each(function (array $c) {
            $this->richiedi($c, ['codice', 'nome', 'piattaforma'], 'campagna');
            Campagna::updateOrCreate(['codice' => $c['codice']], [
                'nome'            => $c['nome'],
                'piattaforma'     => $c['piattaforma'],
                'obiettivo'       => $c['obiettivo'] ?? null,
                'stato'           => $c['stato'] ?? 'attiva',
                'budget'          => $c['budget'] ?? null,
                'speso'           => $c['speso'] ?? null,
                'impression'      => $c['impression'] ?? null,
                'click'           => $c['click'] ?? null,
                'lead_dichiarati' => $c['lead_dichiarati'] ?? null,
                'contenuti_ai'    => (bool) ($c['contenuti_ai'] ?? false),
                'data_inizio'     => $c['data_inizio'] ?? null,
                'data_fine'       => $c['data_fine'] ?? null,
                'note'            => $c['note'] ?? null,
            ]);
        });
        $campagnaId = Campagna::pluck('id', 'codice');

        // Lead
        $lead->each(function (array $l) use ($campagnaId) {
            $this->richiedi($l, ['codice', 'struttura', 'ricevuto_at'], 'lead');
            Lead::updateOrCreate(['codice' => $l['codice']], [
                'campagna_id' => isset($l['campagna']) ? $this->risolvi($campagnaId, $l['campagna'], 'campagna') : null,
                'struttura'   => $l['struttura'],
                'referente'   => $l['referente'] ?? null,
                'citta'       => $l['citta'] ?? null,
                'telefono'    => $l['telefono'] ?? null,
                'email'       => $l['email'] ?? null,
                'fonte'       => $l['fonte'] ?? null,
                'stato'       => $l['stato'] ?? 'nuovo',
                'gestito_da'  => $l['gestito_da'] ?? 'chip',
                'ricevuto_at' => $l['ricevuto_at'],
                'note'        => $l['note'] ?? null,
            ]);
        });
        $leadId = Lead::pluck('id', 'codice');

        // Appuntamenti
        $app->each(function (array $a) use ($leadId) {
            $this->richiedi($a, ['codice', 'lead', 'inizio'], 'appuntamento');
            Appuntamento::updateOrCreate(['codice' => $a['codice']], [
                'lead_id'          => $this->risolvi($leadId, $a['lead'], 'lead'),
                'inizio'           => $a['inizio'],
                'inizio_originale' => $a['inizio_originale'] ?? null,
                'durata_minuti'    => $a['durata_minuti'] ?? 30,
                'tipo'             => $a['tipo'] ?? 'demo_online',
                'stato'            => $a['stato'] ?? 'programmato',
                'gestito_da'       => $a['gestito_da'] ?? 'umano',
                'note'             => $a['note'] ?? null,
            ]);
        });
        $appId = Appuntamento::pluck('id', 'codice');

        // Eventi (timeline)
        $eventi->each(function (array $e) use ($leadId, $appId) {
            $this->richiedi($e, ['codice', 'tipo', 'descrizione', 'avvenuto_at'], 'evento');
            EventoMarketing::updateOrCreate(['codice' => $e['codice']], [
                'lead_id'         => isset($e['lead']) ? $this->risolvi($leadId, $e['lead'], 'lead') : null,
                'appuntamento_id' => isset($e['appuntamento']) ? $this->risolvi($appId, $e['appuntamento'], 'appuntamento') : null,
                'tipo'            => $e['tipo'],
                'attore'          => $e['attore'] ?? 'chip',
                'descrizione'     => $e['descrizione'],
                'avvenuto_at'     => $e['avvenuto_at'],
            ]);
        });

        if ($pulisci) {
            EventoMarketing::whereNotIn('codice', $eventi->pluck('codice'))->delete();
            Appuntamento::whereNotIn('codice', $app->pluck('codice'))->delete();
            Lead::whereNotIn('codice', $lead->pluck('codice'))->delete();
            Campagna::whereNotIn('codice', $campagne->pluck('codice'))->delete();
        }

        return [
            'campagne'     => Campagna::count(),
            'lead'         => Lead::count(),
            'appuntamenti' => Appuntamento::count(),
            'eventi'       => EventoMarketing::count(),
        ];
    }

    private function richiedi(array $record, array $campi, string $tipo): void
    {
        foreach ($campi as $campo) {
            if (! isset($record[$campo]) || $record[$campo] === '') {
                throw new \InvalidArgumentException(
                    sprintf('Record %s senza campo obbligatorio "%s": %s', $tipo, $campo, json_encode($record, JSON_UNESCAPED_UNICODE))
                );
            }
        }
    }

    private function risolvi($mappa, string $codice, string $tipo): string
    {
        $id = $mappa[$codice] ?? null;
        if ($id === null) {
            throw new \InvalidArgumentException("Riferimento a {$tipo} inesistente: \"{$codice}\"");
        }
        return $id;
    }
}
