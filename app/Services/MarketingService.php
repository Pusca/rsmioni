<?php

namespace App\Services;

use App\Enums\Marketing\Piattaforma;
use App\Enums\Marketing\StatoAppuntamento;
use App\Enums\Marketing\StatoLead;
use App\Models\Marketing\Appuntamento;
use App\Models\Marketing\Campagna;
use App\Models\Marketing\EventoMarketing;
use App\Models\Marketing\Lead;
use Illuminate\Support\Carbon;
use Illuminate\Support\Collection;

/**
 * Calcola i numeri del funnel marketing (docs/12-marketing-funnel.md).
 *
 * Tutte le metriche "di piattaforma" (impression, click, speso) sono nullable:
 * finché non vengono caricate restano null e la UI mostra "—" invece di 0,
 * così non si confonde "non ancora inserito" con "zero".
 */
class MarketingService
{
    public const TIMEZONE = 'Europe/Rome';

    public function dashboard(): array
    {
        $campagne     = Campagna::withCount('lead')->orderBy('piattaforma')->orderBy('nome')->get();
        $lead         = Lead::with('campagna:id,codice,nome,piattaforma')->orderByDesc('ricevuto_at')->get();
        $appuntamenti = Appuntamento::with('lead:id,codice,struttura,referente,citta,stato')->orderBy('inizio')->get();
        $eventi       = EventoMarketing::with(['lead:id,struttura', 'appuntamento:id,inizio,inizio_originale'])
            ->orderByDesc('avvenuto_at')
            ->limit(40)
            ->get();

        $budget     = $this->sommaNullable($campagne, 'budget');
        $speso      = $this->sommaNullable($campagne, 'speso');
        $impression = $this->sommaNullable($campagne, 'impression');
        $click      = $this->sommaNullable($campagne, 'click');

        $leadTotali   = $lead->count();
        $leadAttivi   = $lead->filter(fn (Lead $l) => $l->stato !== StatoLead::Perso)->count();
        $clienti      = $lead->filter(fn (Lead $l) => $l->stato === StatoLead::Cliente)->count();
        $appValidi    = $appuntamenti->filter(fn (Appuntamento $a) => in_array($a->stato, StatoAppuntamento::validi(), true));
        $appTotali    = $appValidi->count();
        $leadConApp   = $appValidi->pluck('lead_id')->unique()->count();
        $appSpostati  = $appValidi->filter(fn (Appuntamento $a) => $a->spostato)->count();
        $appChip      = $appValidi->filter(fn (Appuntamento $a) => str_starts_with((string) $a->gestito_da, 'chip'))->count();

        $adesso = Carbon::now(self::TIMEZONE);

        return [
            'kpi' => [
                'budget'            => $budget,
                'speso'             => $speso,
                'budget_pct'        => $this->rapporto($speso, $budget),
                'impression'        => $impression,
                'click'             => $click,
                'ctr'               => $this->rapporto($click, $impression),
                'lead'              => $leadTotali,
                'lead_attivi'       => $leadAttivi,
                'cpl'               => $this->divisione($speso, $leadTotali),
                'appuntamenti'      => $appTotali,
                'lead_con_appuntamento' => $leadConApp,
                'tasso_lead_app'    => $this->rapporto($leadConApp, $leadTotali),
                'cpa'               => $this->divisione($speso, $appTotali),
                'appuntamenti_spostati' => $appSpostati,
                'appuntamenti_chip' => $appChip,
                'clienti'           => $clienti,
                'tasso_app_cliente' => $this->rapporto($clienti, $leadConApp),
            ],
            'funnel' => [
                ['chiave' => 'impression',   'label' => 'Impression',   'valore' => $impression],
                ['chiave' => 'click',        'label' => 'Click',        'valore' => $click],
                ['chiave' => 'lead',         'label' => 'Lead',         'valore' => $leadTotali],
                ['chiave' => 'appuntamenti', 'label' => 'Appuntamenti', 'valore' => $leadConApp],
                ['chiave' => 'clienti',      'label' => 'Clienti',      'valore' => $clienti],
            ],
            'lead_per_stato' => collect(StatoLead::cases())->map(fn (StatoLead $s) => [
                'stato'  => $s->value,
                'label'  => $s->label(),
                'totale' => $lead->filter(fn (Lead $l) => $l->stato === $s)->count(),
            ])->values(),
            'per_piattaforma' => $this->perPiattaforma($campagne),
            'campagne' => $campagne->map(fn (Campagna $c) => [
                'id'               => $c->id,
                'codice'           => $c->codice,
                'nome'             => $c->nome,
                'piattaforma'      => $c->piattaforma->value,
                'piattaforma_label'=> $c->piattaforma->label(),
                'obiettivo'        => $c->obiettivo,
                'stato'            => $c->stato->value,
                'stato_label'      => $c->stato->label(),
                'budget'           => $c->budget !== null ? (float) $c->budget : null,
                'speso'            => $c->speso !== null ? (float) $c->speso : null,
                'budget_pct'       => $this->rapporto($c->speso, $c->budget),
                'impression'       => $c->impression,
                'click'            => $c->click,
                'ctr'              => $this->rapporto($c->click, $c->impression),
                'lead_dichiarati'  => $c->lead_dichiarati,
                'lead'             => $c->lead_count,
                'cpl'              => $this->divisione($c->speso, $c->lead_count),
                'contenuti_ai'     => $c->contenuti_ai,
                'data_inizio'      => $c->data_inizio?->format('Y-m-d'),
                'data_fine'        => $c->data_fine?->format('Y-m-d'),
                'note'             => $c->note,
            ])->values(),
            'lead' => $lead->map(fn (Lead $l) => [
                'id'          => $l->id,
                'codice'      => $l->codice,
                'struttura'   => $l->struttura,
                'referente'   => $l->referente,
                'citta'       => $l->citta,
                'telefono'    => $l->telefono,
                'email'       => $l->email,
                'fonte'       => $l->fonte,
                'fonte_label' => $l->fonte ? (Piattaforma::tryFrom($l->fonte)?->label() ?? $l->fonte) : null,
                'campagna'    => $l->campagna?->nome,
                'stato'       => $l->stato->value,
                'stato_label' => $l->stato->label(),
                'gestito_da'  => $l->gestito_da,
                'ricevuto_at' => $l->ricevuto_at?->format('Y-m-d H:i'),
                'note'        => $l->note,
            ])->values(),
            'appuntamenti' => $appuntamenti->map(fn (Appuntamento $a) => [
                'id'               => $a->id,
                'codice'           => $a->codice,
                'lead_id'          => $a->lead_id,
                'struttura'        => $a->lead?->struttura,
                'referente'        => $a->lead?->referente,
                'citta'            => $a->lead?->citta,
                'inizio'           => $a->inizio?->format('Y-m-d H:i'),
                'inizio_originale' => $a->inizio_originale?->format('Y-m-d H:i'),
                'spostato'         => $a->spostato,
                'durata_minuti'    => $a->durata_minuti,
                'tipo'             => $a->tipo,
                'stato'            => $a->stato->value,
                'stato_label'      => $a->stato->label(),
                'gestito_da'       => $a->gestito_da,
                'note'             => $a->note,
                'futuro'           => $a->inizio !== null && $a->inizio->format('Y-m-d H:i') >= $adesso->format('Y-m-d H:i'),
            ])->values(),
            'eventi' => $eventi->map(fn (EventoMarketing $e) => [
                'id'          => $e->id,
                'tipo'        => $e->tipo,
                'attore'      => $e->attore,
                'descrizione' => $e->descrizione,
                'avvenuto_at' => $e->avvenuto_at?->format('Y-m-d H:i'),
                'struttura'   => $e->lead?->struttura,
            ])->values(),
            'meta' => [
                'adesso'        => $adesso->format('Y-m-d H:i'),
                'aggiornato_al' => $this->ultimoAggiornamento($campagne, $lead, $appuntamenti),
                'fonte_dati'    => 'import_manuale', // vedi docs/12: collegamento API Meta/Google previsto
            ],
        ];
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function perPiattaforma(Collection $campagne): array
    {
        return $campagne
            ->groupBy(fn (Campagna $c) => $c->piattaforma->value)
            ->map(function (Collection $gruppo, string $piattaforma) {
                $budget = $this->sommaNullable($gruppo, 'budget');
                $speso  = $this->sommaNullable($gruppo, 'speso');
                return [
                    'piattaforma' => $piattaforma,
                    'label'       => Piattaforma::from($piattaforma)->label(),
                    'campagne'    => $gruppo->count(),
                    'budget'      => $budget,
                    'speso'       => $speso,
                    'impression'  => $this->sommaNullable($gruppo, 'impression'),
                    'click'       => $this->sommaNullable($gruppo, 'click'),
                    'lead'        => (int) $gruppo->sum('lead_count'),
                ];
            })
            ->values()
            ->all();
    }

    /** Somma che resta null se nessuna riga ha il valore (dato non ancora caricato). */
    private function sommaNullable(Collection $righe, string $campo): int|float|null
    {
        $valori = $righe->pluck($campo)->filter(fn ($v) => $v !== null);
        if ($valori->isEmpty()) {
            return null;
        }
        $somma = $valori->sum(fn ($v) => (float) $v);
        return in_array($campo, ['impression', 'click', 'lead_dichiarati'], true) ? (int) $somma : round($somma, 2);
    }

    /** Rapporto 0..1 (null se il denominatore manca o è zero). */
    private function rapporto(int|float|string|null $num, int|float|string|null $den): ?float
    {
        if ($num === null || $den === null || (float) $den == 0.0) {
            return null;
        }
        return round((float) $num / (float) $den, 4);
    }

    /** Costo unitario (null se manca la spesa o il conteggio è zero). */
    private function divisione(int|float|string|null $spesa, int $conteggio): ?float
    {
        if ($spesa === null || $conteggio === 0) {
            return null;
        }
        return round((float) $spesa / $conteggio, 2);
    }

    private function ultimoAggiornamento(Collection ...$insiemi): ?string
    {
        $max = null;
        foreach ($insiemi as $insieme) {
            foreach ($insieme as $riga) {
                $u = $riga->updated_at;
                if ($u && ($max === null || $u->gt($max))) {
                    $max = $u;
                }
            }
        }
        return $max?->copy()->setTimezone(self::TIMEZONE)->format('Y-m-d H:i');
    }
}
