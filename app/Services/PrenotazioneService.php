<?php

namespace App\Services;

use App\Enums\Profilo;
use App\Models\Hotel;
use App\Models\Prenotazione;
use App\Models\User;
use Illuminate\Database\Eloquent\Builder;

/**
 * Logica di dominio per le Prenotazioni.
 *
 * Responsabilità:
 *   - query filtrata per ruolo (visibilità calendario Receptionist)
 *   - regole di cancellazione per profilo (RH24)
 *   - verifica autorizzazione
 */
class PrenotazioneService
{
    /**
     * Costruisce la query prenotazioni filtrata per ruolo e parametri.
     *
     * Receptionist: vede solo prenotazioni con check_in negli ultimi 7gg
     * e fino al limite di giorni_visibilita_calendario configurati sull'hotel.
     * Gestore Hotel: visibilità completa su tutti gli hotel associati.
     */
    public function query(User $user, array $hotelIds, array $filtri = []): Builder
    {
        $q = Prenotazione::query()
            ->whereIn('hotel_id', $hotelIds)
            ->with(['hotel:id,nome'])
            ->orderByDesc('check_in')
            ->orderByDesc('created_at');

        // Receptionist: finestra temporale limitata per hotel
        if ($user->profilo === Profilo::Receptionist) {
            $giorniMax = Hotel::whereIn('id', $hotelIds)->min('giorni_visibilita_calendario') ?? 30;
            $q->where('check_in', '>=', now()->subDays(7)->startOfDay())
              ->where('check_in', '<=', now()->addDays($giorniMax)->endOfDay());
        }

        // Filtro testo libero (nome, cognome, codice, gruppo)
        if (! empty($filtri['cerca'])) {
            $cerca = '%' . trim((string) $filtri['cerca']) . '%';
            $q->where(function (Builder $sub) use ($cerca) {
                $sub->where('nome',    'like', $cerca)
                    ->orWhere('cognome', 'like', $cerca)
                    ->orWhere('codice',  'like', $cerca)
                    ->orWhere('gruppo',  'like', $cerca);
            });
        }

        if (! empty($filtri['data_dal'])) {
            $q->where('check_in', '>=', $filtri['data_dal']);
        }
        if (! empty($filtri['data_al'])) {
            $q->where('check_in', '<=', $filtri['data_al']);
        }
        if (! empty($filtri['stato_pagamento'])) {
            $q->where('tipo_pagamento', $filtri['stato_pagamento']);
        }
        if (! empty($filtri['stato_documento'])) {
            $q->where('documento_identita', $filtri['stato_documento']);
        }

        return $q;
    }

    /**
     * Regole di cancellazione per profilo (RH24):
     *   - Gestore Hotel: sempre autorizzato
     *   - Receptionist: solo prenotazioni non inserite dall'albergatore
     *     e senza pagamenti POS associati
     *   - altri: mai
     */
    public function puoCancellare(User $user, Prenotazione $pren): bool
    {
        return match ($user->profilo) {
            Profilo::GestoreHotel => true,
            Profilo::Receptionist => ! $pren->insertitoDaAlbergatore() && ! $pren->haPagamentoPos(),
            default               => false,
        };
    }

    /**
     * Messaggio motivazionale per quando la cancellazione non è consentita.
     * Usato nella UI per feedback contestuale.
     */
    public function motivoNonCancellabile(User $user, Prenotazione $pren): ?string
    {
        if ($user->profilo !== Profilo::Receptionist) {
            return null;
        }
        if ($pren->insertitoDaAlbergatore()) {
            return "Inserita dall'albergatore — solo il Gestore può cancellarla.";
        }
        if ($pren->haPagamentoPos()) {
            return 'Pagamento POS associato — contatta il Gestore per la cancellazione.';
        }
        return null;
    }

    /**
     * Verifica se l'utente ha accesso all'hotel della prenotazione.
     */
    public function accessoConsentito(User $user, Prenotazione $pren): bool
    {
        return in_array($pren->hotel_id, $user->hotelIds(), true);
    }
}
