<?php

namespace App\Services;

use App\Models\Camera;
use App\Models\Prenotazione;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Support\Collection;

/**
 * Logica di dominio per le Camere.
 *
 * Responsabilità:
 *   - disponibilità camere per un intervallo di date (con esclusione overbooking)
 *   - verifica cancellabilità (nessuna prenotazione futura/corrente)
 *   - assegnazione camere a una prenotazione (sync + validazione)
 *   - conflitti: prenotazioni sovrapposte su una camera
 */
class CameraService
{
    /**
     * Restituisce le camere disponibili di un hotel per un intervallo di date.
     *
     * Una camera è "occupata" se esiste almeno una prenotazione con:
     *   check_in < $checkOut  AND  check_out > $checkIn
     * (overlap standard semi-aperto).
     *
     * @param string      $hotelId
     * @param string      $checkIn            Data ISO (Y-m-d)
     * @param string      $checkOut           Data ISO (Y-m-d)
     * @param string|null $escludiPrenotazioneId  Esclude questa prenotazione dal calcolo (usato in edit)
     * @return Collection<Camera>
     */
    public function camereDisponibili(
        string  $hotelId,
        string  $checkIn,
        string  $checkOut,
        ?string $escludiPrenotazioneId = null,
    ): Collection {
        // IDs di camere occupate nel periodo
        $occupate = $this->idCamereOccupate($hotelId, $checkIn, $checkOut, $escludiPrenotazioneId);

        return Camera::where('hotel_id', $hotelId)
            ->where('booking_consentito', true)
            ->whereNotIn('id', $occupate)
            ->orderBy('piano')
            ->orderBy('nome')
            ->get();
    }

    /**
     * Tutte le camere dell'hotel con un flag `disponibile` aggiunto.
     * Utile per mostrare la griglia completa con disponibilità evidenziata.
     *
     * @return Collection<Camera>
     */
    public function camereConDisponibilita(
        string  $hotelId,
        string  $checkIn,
        string  $checkOut,
        ?string $escludiPrenotazioneId = null,
    ): Collection {
        $occupate = $this->idCamereOccupate($hotelId, $checkIn, $checkOut, $escludiPrenotazioneId);

        return Camera::where('hotel_id', $hotelId)
            ->where('booking_consentito', true)
            ->orderBy('piano')
            ->orderBy('nome')
            ->get()
            ->map(function (Camera $c) use ($occupate) {
                $c->disponibile = ! $occupate->contains($c->id);
                return $c;
            });
    }

    /**
     * Verifica se una camera può essere cancellata.
     * Non cancellabile se ha prenotazioni con check_out >= oggi.
     */
    public function puoCancellare(Camera $camera): bool
    {
        return ! $camera->prenotazioni()
            ->where('check_out', '>=', now()->toDateString())
            ->exists();
    }

    /**
     * Restituisce le prenotazioni che si sovrappongono alla camera nel periodo.
     * Usato per mostrare i conflitti nella UI.
     *
     * @return Collection<Prenotazione>
     */
    public function conflitti(
        Camera  $camera,
        string  $checkIn,
        string  $checkOut,
        ?string $escludiPrenotazioneId = null,
    ): Collection {
        return $camera->prenotazioni()
            ->where('check_in', '<', $checkOut)
            ->where('check_out', '>', $checkIn)
            ->when($escludiPrenotazioneId, fn (Builder $q) =>
                $q->where('prenotazioni.id', '!=', $escludiPrenotazioneId)
            )
            ->get();
    }

    /**
     * Sincronizza le camere di una prenotazione.
     *
     * Se la prenotazione NON è overbooking, verifica che ogni camera
     * richiesta sia effettivamente disponibile — se non lo è, lancia
     * un'eccezione con il nome della camera in conflitto.
     *
     * @param  string[] $cameraIds
     * @throws \DomainException  Se una camera non è disponibile e non c'è overbooking
     */
    public function assegna(Prenotazione $pren, array $cameraIds): void
    {
        if (! $pren->overbooking && ! empty($cameraIds)) {
            foreach ($cameraIds as $cameraId) {
                $camera = Camera::where('hotel_id', $pren->hotel_id)
                    ->where('id', $cameraId)
                    ->firstOrFail();

                $conflitti = $this->conflitti(
                    $camera,
                    $pren->check_in->toDateString(),
                    $pren->check_out->toDateString(),
                    $pren->id,
                );

                if ($conflitti->isNotEmpty()) {
                    throw new \DomainException(
                        "Camera «{$camera->nome}» non disponibile nel periodo selezionato."
                    );
                }
            }
        }

        $pren->camere()->sync($cameraIds);
    }

    // ── Internals ──────────────────────────────────────────────────────────────

    /**
     * @return Collection<string>  IDs delle camere occupate nel periodo
     */
    private function idCamereOccupate(
        string  $hotelId,
        string  $checkIn,
        string  $checkOut,
        ?string $escludiPrenotazioneId,
    ): Collection {
        return Camera::where('hotel_id', $hotelId)
            ->whereHas('prenotazioni', function (Builder $q) use ($checkIn, $checkOut, $escludiPrenotazioneId) {
                $q->where('check_in', '<', $checkOut)
                  ->where('check_out', '>', $checkIn)
                  ->when($escludiPrenotazioneId, fn (Builder $sub) =>
                      $sub->where('prenotazioni.id', '!=', $escludiPrenotazioneId)
                  );
            })
            ->pluck('id');
    }
}
