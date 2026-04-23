<?php

namespace App\Services;

use App\Enums\StatoChiosco;
use App\Models\Chiosco;
use Carbon\Carbon;
use Illuminate\Support\Facades\Cache;

/**
 * Servizio di diagnostica runtime per i chioschi.
 *
 * Gestisce:
 *   - Heartbeat/presenza: il chiosco invia POST /kiosk/heartbeat ogni 60s
 *     → chiave "kiosk_heartbeat:{id}" TTL 120s
 *   - Lettura operazioni pendenti in cache (acquisizione / stampa / pagamento)
 *   - Diagnostica aggregata con rilevazione automatica problemi
 *   - Recovery: reset pendenti, reset presenza
 *
 * Nessuna dipendenza da Reverb — funziona via polling HTTP.
 */
class DiagnosticaChioscoService
{
    public const HEARTBEAT_KEY = 'kiosk_heartbeat:';
    public const HEARTBEAT_TTL = 120; // 2 min — kiosk invia ogni 60s

    // ── Heartbeat ─────────────────────────────────────────────────────────────

    /**
     * Salva i dati di presenza inviati dal chiosco.
     * Chiamato da KioskHeartbeatController.
     */
    public function salvaHeartbeat(string $chioscoId, array $dati): void
    {
        Cache::put(
            self::HEARTBEAT_KEY . $chioscoId,
            array_merge($dati, ['timestamp' => now()->toIso8601String()]),
            self::HEARTBEAT_TTL,
        );
    }

    // ── Presenza ──────────────────────────────────────────────────────────────

    /**
     * Legge lo stato di presenza del chiosco dalla cache heartbeat.
     *
     * @return array{
     *   online: bool,
     *   ultimo_heartbeat: string|null,
     *   secondi_fa: int|null,
     *   dati: array|null
     * }
     */
    public function presenza(string $chioscoId): array
    {
        $dati = Cache::get(self::HEARTBEAT_KEY . $chioscoId);

        if (! $dati) {
            return ['online' => false, 'ultimo_heartbeat' => null, 'secondi_fa' => null, 'dati' => null];
        }

        $secondiFa = isset($dati['timestamp'])
            ? (int) now()->diffInSeconds(Carbon::parse($dati['timestamp']))
            : null;

        return [
            'online'           => true,
            'ultimo_heartbeat' => $dati['timestamp'] ?? null,
            'secondi_fa'       => $secondiFa,
            'dati'             => $dati,
        ];
    }

    // ── Operazioni pendenti ───────────────────────────────────────────────────

    /**
     * Legge le operazioni in cache (acquisizione / stampa / pagamento).
     * Restituisce null per ciascuna se non presente.
     */
    public function operazioniPendenti(string $chioscoId): array
    {
        $acq    = Cache::get("acquisizione_pendente:chiosco_{$chioscoId}");
        $stampa = Cache::get("stampa_pendente:chiosco_{$chioscoId}");
        $pag    = Cache::get("pagamento_pendente:chiosco_{$chioscoId}");

        return [
            'acquisizione' => $acq    ? array_merge($acq,    ['tipo' => 'acquisizione']) : null,
            'stampa'       => $stampa ? array_merge($stampa, ['tipo' => 'stampa'])       : null,
            'pagamento'    => $pag    ? array_merge($pag,    ['tipo' => 'pagamento'])    : null,
        ];
    }

    // ── Diagnostica aggregata ─────────────────────────────────────────────────

    /**
     * Restituisce la diagnostica completa per la pagina del Gestore.
     * Include: presenza, stato portineria, pendenti, problemi rilevati.
     */
    public function diagnosticaCompleta(Chiosco $chiosco, StatoChiosco $stato): array
    {
        $presenza = $this->presenza($chiosco->id);
        $pendenti = $this->operazioniPendenti($chiosco->id);

        $problemi = $this->rilevaProblemi($presenza, $stato, $pendenti, $chiosco);

        return [
            'presenza' => $presenza,
            'stato'    => $stato->value,
            'pendenti' => $pendenti,
            'problemi' => $problemi,
        ];
    }

    /**
     * Analisi automatica dei problemi rilevabili senza hardware.
     * Restituisce array di { tipo, livello, msg }.
     *
     * Tipi: 'runtime' | 'browser' | 'configurazione'
     * Livelli: 'info' | 'warning' | 'errore'
     */
    private function rilevaProblemi(array $presenza, StatoChiosco $stato, array $pendenti, Chiosco $chiosco): array
    {
        $problemi = [];

        // Chiosco non invia heartbeat ma lo stato non è offline
        if (! $presenza['online'] && $stato !== StatoChiosco::Offline) {
            $problemi[] = [
                'tipo'    => 'runtime',
                'livello' => 'warning',
                'msg'     => 'Heartbeat assente: il browser del chiosco potrebbe essere chiuso o disconnesso, ma lo stato non è ancora scaduto.',
                'azione'  => 'forza_offline',
            ];
        }

        // Stato offline ma operazioni pendenti
        if ($stato === StatoChiosco::Offline && ($pendenti['acquisizione'] || $pendenti['stampa'])) {
            $problemi[] = [
                'tipo'    => 'runtime',
                'livello' => 'warning',
                'msg'     => 'Operazione in cache su chiosco offline. Il chiosco non potrà completarla finché non torna online.',
                'azione'  => 'reset_pendenti',
            ];
        }

        // Pagamento POS bloccato su chiosco offline
        if ($pendenti['pagamento'] && ! $presenza['online']) {
            $problemi[] = [
                'tipo'    => 'runtime',
                'livello' => 'errore',
                'msg'     => 'Pagamento POS pending con chiosco offline. Il record in DB resterà "pending" fino ad annullamento manuale.',
                'azione'  => 'reset_pendenti',
            ];
        }

        // IP non configurato
        if (! $chiosco->ip_address) {
            $problemi[] = [
                'tipo'    => 'configurazione',
                'livello' => 'info',
                'msg'     => 'Indirizzo IP del chiosco non configurato. Necessario per il kiosk-agent Windows.',
                'azione'  => 'configura',
            ];
        }

        // POS abilitato ma path non configurati (Ingenico)
        if ($chiosco->has_pos && $chiosco->tipo_pos === 'ingenico'
            && (! $chiosco->path_input_pos || ! $chiosco->path_output_pos)) {
            $problemi[] = [
                'tipo'    => 'configurazione',
                'livello' => 'warning',
                'msg'     => 'POS Ingenico abilitato ma path file non configurati. Il POS remoto non funzionerà senza kiosk-agent.',
                'azione'  => 'configura',
            ];
        }

        return $problemi;
    }

    // ── Recovery ──────────────────────────────────────────────────────────────

    /**
     * Cancella tutte le operazioni pendenti in cache per il chiosco.
     * Recovery action: usare quando il chiosco è bloccato su un'operazione.
     */
    public function resetPendenti(string $chioscoId): void
    {
        Cache::forget("acquisizione_pendente:chiosco_{$chioscoId}");
        Cache::forget("stampa_pendente:chiosco_{$chioscoId}");
        Cache::forget("pagamento_pendente:chiosco_{$chioscoId}");
    }

    /**
     * Cancella la presenza (heartbeat) del chiosco dalla cache.
     * Recovery action: usare quando si vuole forzare il chiosco a re-registrarsi.
     */
    public function resetPresenza(string $chioscoId): void
    {
        Cache::forget(self::HEARTBEAT_KEY . $chioscoId);
    }
}
