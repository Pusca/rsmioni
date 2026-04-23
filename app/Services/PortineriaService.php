<?php

namespace App\Services;

use App\Enums\Profilo;
use App\Enums\StatoChiosco;
use App\Events\ChioscoStatoCambiato;
use App\Models\Chiosco;
use App\Models\Hotel;
use App\Services\DiagnosticaChioscoService;
use Illuminate\Support\Facades\Cache;

/**
 * Logica di dominio della Portineria.
 *
 * Lo stato runtime dei chioschi vive in Cache (Redis in prod, DB-cache in dev).
 * TTL: 5 minuti — il chiosco torna "offline" se il kiosk-agent non rinnova la presenza.
 *
 * Responsabilità:
 *   - lettura stato corrente
 *   - validazione transizioni (per profilo)
 *   - scrittura stato + broadcast evento
 */
class PortineriaService
{
    const TTL_STATO    = 300;  // 5 min
    const TTL_MESSAGGIO = 600; // 10 min

    /** Motivo dell'ultimo rifiuto di transizione — leggibile dal controller per il feedback UI. */
    private ?string $ultimoMotivoRifiuto = null;

    public function ultimoMotivoRifiuto(): ?string
    {
        return $this->ultimoMotivoRifiuto;
    }

    // ── Lettura stato ──────────────────────────────────────────────────────

    public function statoChiosco(string $chioscoId): StatoChiosco
    {
        $raw = Cache::get($this->keyStato($chioscoId));
        if ($raw === null) {
            return StatoChiosco::Offline;
        }

        return StatoChiosco::tryFrom($raw) ?? StatoChiosco::Offline;
    }

    public function messaggioAttesa(string $chioscoId): ?string
    {
        return Cache::get($this->keyMessaggio($chioscoId));
    }

    /**
     * Carica tutti i chioschi arricchiti con stato runtime.
     * @param  string[]  $hotelIds
     * @return array<array-key, array{id: string, stato: string, messaggio_attesa: string|null, ...}>
     */
    public function chioschiConStato(array $hotelIds): array
    {
        $chioschi = Chiosco::whereIn('hotel_id', $hotelIds)
            ->where('attivo', true)
            ->with('hotel:id,nome,chioschi_concorrenti_max')
            ->orderBy('hotel_id')
            ->orderBy('nome')
            ->get();

        $diagService = app(DiagnosticaChioscoService::class);

        return $chioschi->map(function (Chiosco $c) use ($diagService) {
            $presenza = $diagService->presenza($c->id);
            return [
                ...$c->toArray(),
                'stato'            => $this->statoChiosco($c->id)->value,
                'messaggio_attesa' => $this->messaggioAttesa($c->id),
                'ultima_presenza'  => $presenza['online']
                    ? ['online' => true,  'secondi_fa' => $presenza['secondi_fa']]
                    : ['online' => false, 'secondi_fa' => null],
            ];
        })->values()->all();
    }

    // ── Transizioni di stato ───────────────────────────────────────────────

    /**
     * Tenta una transizione di stato, verifica i permessi per profilo.
     * Ritorna true se la transizione è avvenuta.
     */
    public function transizione(
        Chiosco      $chiosco,
        StatoChiosco $nuovo,
        Profilo      $profiloCaller,
        ?string      $messaggio = null,
    ): bool {
        $attuale = $this->statoChiosco($chiosco->id);
        $this->ultimoMotivoRifiuto = null;

        if (! $attuale->puoTransire($nuovo)) {
            return false;
        }

        if (! $this->transizioneLecitaPerProfilo($attuale, $nuovo, $profiloCaller)) {
            return false;
        }

        // Verifica limite sessioni concorrenti configurato sull'hotel.
        // Il check si applica solo all'inizio di una nuova sessione attiva
        // (da non-connesso a connesso), NON alle transizioni interne a una
        // sessione già attiva (es. in_chiaro ↔ in_nascosto, in_parlato ↔ in_chiaro).
        if (! $attuale->isConnesso() && $nuovo->isConnesso()) {
            $hotel  = Hotel::find($chiosco->hotel_id);
            $limite = $hotel?->chioschi_concorrenti_max ?? 0;

            if ($limite > 0) {
                $attivi = $this->contatoreSessioniAttive($chiosco);
                if ($attivi >= $limite) {
                    $this->ultimoMotivoRifiuto = "Limite sessioni concorrenti raggiunto ({$attivi}/{$limite}). "
                        . 'Chiudere una connessione attiva prima di procedere.';
                    return false;
                }
            }
        }

        $this->impostaStato($chiosco, $nuovo, $messaggio);

        return true;
    }

    /**
     * Forza uno stato (uso interno / demo / kiosk-agent).
     */
    public function impostaStato(
        Chiosco      $chiosco,
        StatoChiosco $stato,
        ?string      $messaggio = null,
    ): void {
        Cache::put($this->keyStato($chiosco->id), $stato->value, self::TTL_STATO);

        if ($stato === StatoChiosco::MessaggioAttesa && $messaggio !== null) {
            Cache::put($this->keyMessaggio($chiosco->id), $messaggio, self::TTL_MESSAGGIO);
        } elseif ($stato === StatoChiosco::Idle || $stato === StatoChiosco::Offline) {
            Cache::forget($this->keyMessaggio($chiosco->id));
        }

        try {
            broadcast(new ChioscoStatoCambiato($chiosco, $stato, $messaggio));
        } catch (\Throwable) {
            // Reverb potrebbe non essere in esecuzione in dev — ignora silenziosamente
        }
    }

    // ── Matrice permessi per profilo ──────────────────────────────────────

    /**
     * Verifica se la transizione è consentita per il profilo del caller.
     *
     * Receptionist Lite — permessi minimi per il monitoraggio passivo:
     *   idle        → in_nascosto  (avvia monitoraggio covert)
     *   in_nascosto → idle         (chiude il proprio monitoraggio)
     *   tutto il resto → NEGATO
     *
     * Il profilo Lite non può rispondere a chiamate, gestire messaggi di attesa,
     * passare in chiaro, avviare il parlato o intervenire in stati gestiti dal
     * Receptionist pieno.
     */
    private function transizioneLecitaPerProfilo(
        StatoChiosco $da,
        StatoChiosco $a,
        Profilo      $profilo,
    ): bool {
        if ($profilo === Profilo::ReceptionistLite) {
            return match ($da) {
                StatoChiosco::Idle       => $a === StatoChiosco::InNascosto,
                StatoChiosco::InNascosto => $a === StatoChiosco::Idle,
                default                  => false,
            };
        }

        // Receptionist pieno: tutte le transizioni lecite dalla state machine
        return true;
    }

    // ── Sessioni concorrenti ──────────────────────────────────────────────

    /**
     * Conta i chioschi dello stesso hotel che hanno una sessione attiva,
     * escludendo il chiosco target (che sta avviando la propria sessione).
     *
     * "Attiva" = in_chiaro | in_nascosto | in_parlato | messaggio_attesa
     * (ossia qualsiasi stato in cui un receptionist è già impegnato).
     */
    private function contatoreSessioniAttive(Chiosco $chiosco): int
    {
        $ids = Chiosco::where('hotel_id', $chiosco->hotel_id)
            ->where('attivo', true)
            ->where('id', '!=', $chiosco->id)
            ->pluck('id');

        return $ids->filter(function (string $id) {
            $stato = $this->statoChiosco($id);
            return $stato->isConnesso() || $stato === StatoChiosco::MessaggioAttesa;
        })->count();
    }

    // ── Cache key helpers ─────────────────────────────────────────────────

    private function keyStato(string $chioscoId): string
    {
        return "kiosk_state:{$chioscoId}";
    }

    private function keyMessaggio(string $chioscoId): string
    {
        return "kiosk_messaggio:{$chioscoId}";
    }
}
