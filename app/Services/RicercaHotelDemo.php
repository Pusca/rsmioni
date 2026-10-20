<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Compila la scheda demo a partire dal nome di un hotel vero.
 * Posizione, camere, fermate, ristoranti e luoghi arrivano da OpenStreetMap.
 * Check-in, check-out e colazione solo se sono scritti sul sito indicato lì.
 * Quello che non c'è resta vuoto: non si inventa.
 */
class RicercaHotelDemo
{
    /**
     * @return array{
     *   dove: string,
     *   fonte: string,
     *   scheda: array<string, mixed>,
     *   mancanti: list<string>
     * }|null
     */
    public function cerca(string $nome): ?array
    {
        $hotel = $this->trovaHotel($nome);
        if ($hotel === null) {
            return null;
        }

        $lat = (float) $hotel['lat'];
        $lon = (float) $hotel['lon'];
        $dintorni = $this->dintorni($lat, $lon);
        $sito = $this->urlPubblico($hotel['extratags']['website'] ?? $hotel['extratags']['url'] ?? $hotel['extratags']['contact:website'] ?? null);
        $orari = $sito ? $this->orariDalSito($sito) : ['checkin' => '', 'checkout' => '', 'colazione' => ''];

        $camere = $hotel['extratags']['rooms'] ?? null;
        $numero = is_numeric($camere) ? (int) $camere : null;
        if ($numero !== null && ($numero < 1 || $numero > 500)) {
            $numero = null;
        }

        $scheda = [
            'nome'          => $hotel['name'] !== '' ? $hotel['name'] : trim($nome),
            'numero_camere' => $numero,
            'checkin'       => $orari['checkin'],
            'checkout'      => $orari['checkout'],
            'colazione'     => $orari['colazione'],
            'autobus'       => $dintorni['autobus'],
            'trasporto'     => $dintorni['taxi'],
            'ristoranti'    => $dintorni['ristoranti'],
            'luoghi'        => $dintorni['luoghi'],
        ];

        $mancanti = [];
        foreach ([
            'numero_camere' => 'numero camere',
            'checkin'       => 'check-in',
            'checkout'      => 'check-out',
            'colazione'     => 'colazione',
            'autobus'       => 'autobus',
            'trasporto'     => 'taxi',
        ] as $campo => $etichetta) {
            if ($scheda[$campo] === null || $scheda[$campo] === '') {
                $mancanti[] = $etichetta;
            }
        }
        if ($scheda['ristoranti'] === []) {
            $mancanti[] = 'ristoranti';
        }
        if ($scheda['luoghi'] === []) {
            $mancanti[] = 'luoghi da visitare';
        }

        $fonte = 'OpenStreetMap';
        if ($orari['checkin'] !== '' || $orari['checkout'] !== '' || $orari['colazione'] !== '') {
            $fonte .= ' e il sito dell\'hotel';
        }

        return [
            'dove'     => $hotel['display_name'],
            'fonte'    => $fonte,
            'scheda'   => $scheda,
            'mancanti' => $mancanti,
        ];
    }

    /** @return array{lat: string, lon: string, name: string, display_name: string, extratags: array<string, string>}|null */
    private function trovaHotel(string $nome): ?array
    {
        try {
            $risposta = Http::withHeaders([
                'User-Agent' => 'RSMioniDemo/1.0 (scheda demo)',
                'Accept'     => 'application/json',
            ])->timeout(8)->get('https://nominatim.openstreetmap.org/search', [
                'q'               => $nome,
                'format'          => 'jsonv2',
                'addressdetails'  => 1,
                'extratags'       => 1,
                'limit'           => 5,
                'accept-language' => 'it',
            ]);
        } catch (\Throwable) {
            throw new RuntimeException('Ricerca non disponibile in questo momento.');
        }

        if (! $risposta->ok()) {
            throw new RuntimeException('Ricerca non disponibile in questo momento.');
        }

        foreach ($risposta->json() ?? [] as $hit) {
            if (! is_array($hit) || ! isset($hit['lat'], $hit['lon'])) {
                continue;
            }
            $classe = ($hit['category'] ?? $hit['class'] ?? '').'/'.($hit['type'] ?? '');
            $nomeTrovato = (string) ($hit['name'] ?? '');
            $sembraHotel = str_contains($classe, 'hotel')
                || str_contains($classe, 'guest_house')
                || str_contains($classe, 'motel')
                || str_contains(mb_strtolower($nomeTrovato.' '.($hit['display_name'] ?? '')), 'hotel');
            if (! $sembraHotel) {
                continue;
            }

            return [
                'lat'          => (string) $hit['lat'],
                'lon'          => (string) $hit['lon'],
                'name'         => $nomeTrovato,
                'display_name' => (string) ($hit['display_name'] ?? $nomeTrovato),
                'extratags'    => is_array($hit['extratags'] ?? null) ? $hit['extratags'] : [],
            ];
        }

        return null;
    }

    /**
     * @return array{ristoranti: list<array{nome: string, nota: string}>, luoghi: list<array{nome: string, nota: string}>, autobus: string, taxi: string}
     */
    private function dintorni(float $lat, float $lon): array
    {
        $vuoto = ['ristoranti' => [], 'luoghi' => [], 'autobus' => '', 'taxi' => ''];

        $query = <<<OVERPASS
[out:json][timeout:12];
(
  nwr(around:700,{$lat},{$lon})[amenity~"^(restaurant|fast_food)$"];
  nwr(around:1200,{$lat},{$lon})[tourism~"^(attraction|museum|viewpoint|gallery)$"];
  nwr(around:400,{$lat},{$lon})[highway=bus_stop];
  nwr(around:800,{$lat},{$lon})[amenity=taxi];
);
out tags center 40;
OVERPASS;

        try {
            $risposta = Http::asForm()->timeout(14)->post('https://overpass-api.de/api/interpreter', [
                'data' => $query,
            ]);
        } catch (\Throwable) {
            return $vuoto;
        }

        if (! $risposta->ok()) {
            return $vuoto;
        }

        $vicini = [];
        foreach ($risposta->json('elements') ?? [] as $elemento) {
            if (! is_array($elemento)) {
                continue;
            }
            $coordinate = $this->coordinate($elemento);
            if ($coordinate === null) {
                continue;
            }
            $tags = is_array($elemento['tags'] ?? null) ? $elemento['tags'] : [];
            $vicini[] = [
                'tags'  => $tags,
                'metri' => $this->metri($lat, $lon, $coordinate[0], $coordinate[1]),
            ];
        }
        usort($vicini, fn ($a, $b) => $a['metri'] <=> $b['metri']);

        $ristoranti = [];
        $luoghi = [];
        $autobus = '';
        $taxi = '';
        foreach ($vicini as $voce) {
            $tags = $voce['tags'];
            $nota = $this->distanza($voce['metri']);
            if (isset($tags['amenity']) && in_array($tags['amenity'], ['restaurant', 'fast_food'], true) && count($ristoranti) < 3) {
                $nome = trim((string) ($tags['name'] ?? ''));
                if ($nome === '') {
                    continue;
                }
                $cucina = trim(str_replace(';', ', ', (string) ($tags['cuisine'] ?? '')));
                $ristoranti[] = [
                    'nome' => $nome,
                    'nota' => $cucina !== '' ? $cucina.', '.$nota : $nota,
                ];
            } elseif (isset($tags['tourism']) && count($luoghi) < 3) {
                $nome = trim((string) ($tags['name'] ?? ''));
                if ($nome === '') {
                    continue;
                }
                $luoghi[] = ['nome' => $nome, 'nota' => $this->tipoLuogo($tags['tourism']).', '.$nota];
            } elseif (($tags['highway'] ?? '') === 'bus_stop' && $autobus === '') {
                $nome = trim((string) ($tags['name'] ?? ''));
                $autobus = ($nome !== '' ? 'Fermata '.$nome : 'Fermata dell\'autobus').', '.$nota;
            } elseif (($tags['amenity'] ?? '') === 'taxi' && $taxi === '') {
                $nome = trim((string) ($tags['name'] ?? ''));
                $taxi = ($nome !== '' ? $nome : 'Taxi').', '.$nota;
            }
        }

        return compact('ristoranti', 'luoghi', 'autobus', 'taxi');
    }

    /** @return array{checkin: string, checkout: string, colazione: string} */
    private function orariDalSito(string $url): array
    {
        $vuoto = ['checkin' => '', 'checkout' => '', 'colazione' => ''];
        try {
            $risposta = Http::withHeaders([
                'User-Agent' => 'RSMioniDemo/1.0 (scheda demo)',
            ])->timeout(8)->get($url);
        } catch (\Throwable) {
            return $vuoto;
        }
        if (! $risposta->ok()) {
            return $vuoto;
        }

        $html = $risposta->body();
        $html = preg_replace('/<(script|style)\b[^>]*>.*?<\/\1>/is', ' ', $html) ?? $html;
        $testo = html_entity_decode(strip_tags($html));
        $testo = trim(preg_replace('/\s+/u', ' ', $testo) ?? '');

        return [
            'checkin'   => $this->frase($testo, ['check-in', 'check in', 'checkin', 'arrivo']),
            'checkout'  => $this->frase($testo, ['check-out', 'check out', 'checkout', 'partenza']),
            'colazione' => $this->frase($testo, ['colazione', 'breakfast']),
        ];
    }

    /** @param list<string> $etichette */
    private function frase(string $testo, array $etichette): string
    {
        foreach ($etichette as $etichetta) {
            $cerca = preg_quote($etichetta, '/');
            if (preg_match('/'.$cerca.'\s*[:\-]?\s*([^.]{3,90})/iu', $testo, $trovato) !== 1) {
                continue;
            }
            $frase = trim($trovato[1], " \t\n\r\0\x0B-:");
            if (preg_match('/\d/', $frase) === 1) {
                return $frase;
            }
        }

        return '';
    }

    private function urlPubblico(mixed $url): ?string
    {
        $url = trim((string) $url);
        if ($url === '') {
            return null;
        }
        if (preg_match('#^https?://#i', $url) !== 1) {
            $url = 'https://'.$url;
        }
        $host = parse_url($url, PHP_URL_HOST);
        if (! is_string($host) || $host === '' || filter_var($host, FILTER_VALIDATE_IP)) {
            return null;
        }

        return $url;
    }

    /** @param array<string, mixed> $elemento
     *  @return array{0: float, 1: float}|null
     */
    private function coordinate(array $elemento): ?array
    {
        if (isset($elemento['lat'], $elemento['lon'])) {
            return [(float) $elemento['lat'], (float) $elemento['lon']];
        }
        $centro = $elemento['center'] ?? null;
        if (is_array($centro) && isset($centro['lat'], $centro['lon'])) {
            return [(float) $centro['lat'], (float) $centro['lon']];
        }

        return null;
    }

    private function metri(float $lat1, float $lon1, float $lat2, float $lon2): int
    {
        $raggio = 6371000;
        $dLat = deg2rad($lat2 - $lat1);
        $dLon = deg2rad($lon2 - $lon1);
        $a = sin($dLat / 2) ** 2
            + cos(deg2rad($lat1)) * cos(deg2rad($lat2)) * sin($dLon / 2) ** 2;

        return (int) round($raggio * 2 * asin(min(1, sqrt($a))));
    }

    private function distanza(int $metri): string
    {
        if ($metri < 1000) {
            return 'a circa '.$metri.' m';
        }

        return 'a circa '.number_format($metri / 1000, 1, ',', '').' km';
    }

    private function tipoLuogo(string $tourism): string
    {
        return match ($tourism) {
            'museum'    => 'museo',
            'viewpoint' => 'punto panoramico',
            'gallery'   => 'galleria',
            default     => 'luogo',
        };
    }
}
