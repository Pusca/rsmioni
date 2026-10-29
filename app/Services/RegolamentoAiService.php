<?php

namespace App\Services;

use App\Models\Hotel;
use App\Models\ValorizzazioneRegola;
use Illuminate\Support\Collection;

/**
 * Regolamento dell'hotel in forma di testo per l'assistente vocale.
 *
 * Le regole valorizzate in Regolamento (animali, parcheggio, wifi, orari…)
 * sono conoscenza dell'hotel esattamente come la scheda demo: senza questo
 * testo Alice non ne sa nulla. Per ogni regola si prende la lingua della
 * conversazione, poi la lingua di default dell'hotel, poi l'italiano: il
 * modello traduce da sé.
 */
class RegolamentoAiService
{
    /** Oltre questa lunghezza il metadata del dispatch diventa inutilmente pesante. */
    public const MAX_CARATTERI = 12000;

    public function testo(Hotel $hotel, string $lingua): ?string
    {
        $lingue = array_values(array_unique(array_filter([
            strtolower($lingua),
            strtolower((string) ($hotel->lingua_default ?: 'it')),
            'it',
        ])));

        $valorizzazioni = ValorizzazioneRegola::query()
            ->with('regola')
            ->where('hotel_id', $hotel->id)
            ->whereIn('lingua', $lingue)
            ->whereNotNull('testo')
            ->get()
            ->filter(fn (ValorizzazioneRegola $v) => $v->regola !== null && trim((string) $v->testo) !== '');

        if ($valorizzazioni->isEmpty()) {
            return null;
        }

        $priorita = array_flip($lingue);
        $perRegola = $valorizzazioni
            ->groupBy('regola_id')
            ->map(fn (Collection $gruppo) => $gruppo->sortBy(fn ($v) => $priorita[$v->lingua] ?? 99)->first())
            ->sortBy(fn (ValorizzazioneRegola $v) => sprintf('%s-%05d', $v->regola->categoria->value, $v->regola->ordine));

        $righe = [];
        foreach ($perRegola as $v) {
            $testo = preg_replace("/\r\n?/", "\n", trim((string) $v->testo));
            $righe[] = self::etichetta($v->regola->codice).":\n".$testo;
        }

        $testo = implode("\n\n", $righe);
        if (mb_strlen($testo) > self::MAX_CARATTERI) {
            $testo = mb_substr($testo, 0, self::MAX_CARATTERI)."\n[…regolamento troncato: chiedere al receptionist per il resto]";
        }

        return $testo;
    }

    /** POLITICA_ANIMALI → "Politica Animali" (come regolaLabel nel frontend). */
    public static function etichetta(string $codice): string
    {
        return mb_convert_case(str_replace('_', ' ', strtolower($codice)), MB_CASE_TITLE, 'UTF-8');
    }
}
