<?php

namespace App\Services;

use App\Enums\Profilo;
use App\Enums\StatoDocumentoIdentita;
use App\Enums\TipoPagamento;
use App\Models\Camera;
use App\Models\Hotel;
use App\Models\Prenotazione;
use App\Models\User;
use Carbon\Carbon;
use Illuminate\Support\Collection;
use Illuminate\Support\Str;

/**
 * Ponte Slope → rsMioni finché non c'è l'API (docs/11, decisione E).
 *
 * Legge l'export CSV di «Prenotazioni → Elenco → Esporta» e fa l'upsert
 * delle prenotazioni sull'hotel: Slope è il master, quindi nome, date e
 * camere vengono SOVRASCRITTI a ogni import; le prenotazioni con check-in
 * già confermato in rsMioni non vengono toccate.
 *
 * Il formato dell'export non è documentato da Slope: le colonne vengono
 * riconosciute per nome (case/accents-insensitive) tra più candidati, il
 * delimitatore viene rilevato, e ciò che non si capisce finisce negli
 * avvisi del report invece di fermare tutto.
 */
class SlopeImportService
{
    /** Candidati per colonna logica → intestazioni normalizzate accettate. */
    private const COLONNE = [
        'codice'    => ['numero', 'numero_prenotazione', 'id_prenotazione', 'codice', 'id', 'prenotazione'],
        'ospite'    => ['ospite_principale', 'ospite'],
        'prenotante'=> ['prenotante', 'cliente', 'intestatario'],
        'nome'      => ['nome', 'nome_ospite'],
        'cognome'   => ['cognome', 'cognome_ospite'],
        'alloggio'  => ['alloggio', 'camera', 'nome_alloggio', 'unita'],
        'periodo'   => ['periodo', 'soggiorno', 'date'],
        'check_in'  => ['check_in', 'checkin', 'arrivo', 'data_arrivo', 'dal'],
        'check_out' => ['check_out', 'checkout', 'partenza', 'data_partenza', 'al'],
        'stato'     => ['stato', 'status'],
        'adulti'    => ['adulti', 'n_adulti', 'numero_adulti'],
        'bambini'   => ['bambini', 'n_bambini', 'numero_bambini'],
        'ospiti'    => ['ospiti', 'n_ospiti', 'persone', 'pax'],
        'canale'    => ['canale', 'channel', 'agenzia'],
        'saldo'     => ['saldo', 'da_pagare', 'residuo', 'saldo_residuo'],
    ];

    public function __construct(private readonly CameraService $camere) {}

    /** Importa da un file CSV sul disco. */
    public function importaFile(string $percorso, Hotel $hotel, ?User $eseguitoDa = null, bool $dryRun = false): SlopeImportReport
    {
        if (! is_readable($percorso)) {
            throw new \InvalidArgumentException("File non leggibile: {$percorso}");
        }

        return $this->importaCsv((string) file_get_contents($percorso), $hotel, $eseguitoDa, $dryRun);
    }

    /** Importa dal contenuto CSV già letto. */
    public function importaCsv(string $contenuto, Hotel $hotel, ?User $eseguitoDa = null, bool $dryRun = false): SlopeImportReport
    {
        $report = new SlopeImportReport();
        $righe  = $this->leggiCsv($contenuto, $report);

        if ($righe->isEmpty()) {
            $report->avvisa('Nessuna riga leggibile nel file.');
            return $report;
        }

        // Una prenotazione Slope può occupare più righe (una per camera)
        $gruppi = $righe->groupBy(fn (array $r) => $this->codice($r) ?? Str::uuid()->toString());

        foreach ($gruppi as $righeGruppo) {
            $this->importaPrenotazione($righeGruppo, $hotel, $eseguitoDa, $dryRun, $report);
        }

        return $report;
    }

    // ── Una prenotazione (n righe) ───────────────────────────────────────────

    private function importaPrenotazione(Collection $righe, Hotel $hotel, ?User $eseguitoDa, bool $dryRun, SlopeImportReport $report): void
    {
        $prima  = $righe->first();
        $codice = $this->codice($prima);
        $rigaN  = $prima['_riga'];

        if (! $codice) {
            $report->salta("riga {$rigaN}: nessun numero prenotazione");
            return;
        }

        $stato = mb_strtolower((string) $this->col($prima, 'stato'));
        if ($stato !== '' && preg_match('/cancell|annull|no.?show|rifiut/u', $stato)) {
            $report->cancellate++;
            return;
        }

        // Date: min check-in / max check-out sul gruppo
        $checkIn = $checkOut = null;
        foreach ($righe as $r) {
            [$ci, $co] = $this->date($r);
            if ($ci && (! $checkIn || $ci->lt($checkIn)))   $checkIn  = $ci;
            if ($co && (! $checkOut || $co->gt($checkOut))) $checkOut = $co;
        }
        if (! $checkIn || ! $checkOut || ! $checkOut->gt($checkIn)) {
            $report->salta("#{$codice} (riga {$rigaN}): date non riconosciute");
            return;
        }

        [$nome, $cognome] = $this->nominativo($prima);
        $pax              = $this->pax($prima, $report, $codice);

        // Camere: una per riga, cercate per numero nell'hotel
        $camereIds = [];
        foreach ($righe as $r) {
            $numero = $this->numeroCamera($r);
            if ($numero === null) {
                $report->avvisa("#{$codice}: alloggio «" . ($this->col($r, 'alloggio') ?? '') . "» senza numero camera riconoscibile");
                continue;
            }
            $camera = Camera::where('hotel_id', $hotel->id)
                ->where(fn ($q) => $q->where('nome', $numero)->orWhere('nome', ltrim($numero, '0')))
                ->first();
            if (! $camera) {
                $report->avvisa("#{$codice}: camera «{$numero}» non esiste in rsMioni — assegnala a mano");
                continue;
            }
            $camereIds[$camera->id] = $camera->id;
        }

        $esistente = Prenotazione::where('hotel_id', $hotel->id)->where('codice', $codice)->first();

        if ($esistente && $esistente->checkin_confermato) {
            $report->confermate++;
            return;
        }

        if ($dryRun) {
            $esistente ? $report->aggiornate++ : $report->create++;
            return;
        }

        $dati = [
            'nome'               => $nome,
            'cognome'            => $cognome,
            'check_in'           => $checkIn->toDateString(),
            'check_out'          => $checkOut->toDateString(),
            'pax'                => $pax,
            'tipo_pagamento'     => $this->tipoPagamento($prima, $esistente),
        ];

        if ($esistente) {
            $esistente->update($dati);
            $pren = $esistente;
            $report->aggiornate++;
        } else {
            $pren = Prenotazione::create($dati + [
                'hotel_id'            => $hotel->id,
                'codice'              => $codice,
                'documento_identita'  => StatoDocumentoIdentita::DaAcquisire,
                'checkin_confermato'  => false,
                'overbooking'         => false,
                'inserito_da'         => $eseguitoDa?->id,
                'inserito_da_profilo' => Profilo::GestoreHotel,
            ]);
            $report->create++;
        }

        $this->assegnaCamere($pren, array_values($camereIds), $codice, $report);
    }

    /**
     * Slope ha già venduto quelle camere: se in rsMioni risultano occupate
     * (dati vecchi, prenotazione manuale) la prenotazione viene marcata
     * overbooking e assegnata comunque, con avviso — la verità sta in Slope.
     */
    private function assegnaCamere(Prenotazione $pren, array $camereIds, string $codice, SlopeImportReport $report): void
    {
        if (empty($camereIds)) {
            return;
        }

        try {
            $this->camere->assegna($pren, $camereIds);
        } catch (\DomainException $e) {
            $pren->update(['overbooking' => true]);
            $this->camere->assegna($pren, $camereIds);
            $report->avvisa("#{$codice}: {$e->getMessage()} Assegnata comunque (Slope è il master): controlla la doppia occupazione.");
        }
    }

    // ── Lettura CSV ──────────────────────────────────────────────────────────

    /** @return Collection<int, array<string, string>> righe con chiavi = intestazioni normalizzate + _riga */
    private function leggiCsv(string $contenuto, SlopeImportReport $report): Collection
    {
        $contenuto = preg_replace('/^\xEF\xBB\xBF/', '', $contenuto); // BOM
        $contenuto = str_replace(["\r\n", "\r"], "\n", trim($contenuto));
        if ($contenuto === '') {
            return collect();
        }

        $primaRiga   = strtok($contenuto, "\n") ?: '';
        $delimitatore = $this->rilevaDelimitatore($primaRiga);

        $stream = fopen('php://temp', 'r+');
        fwrite($stream, $contenuto);
        rewind($stream);

        $intestazioni = fgetcsv($stream, 0, $delimitatore, '"', '\\');
        if (! $intestazioni) {
            fclose($stream);
            return collect();
        }
        $intestazioni = array_map(fn ($h) => $this->normalizza((string) $h), $intestazioni);

        $righe = [];
        $n     = 1;
        while (($campi = fgetcsv($stream, 0, $delimitatore, '"', '\\')) !== false) {
            $n++;
            if (count($campi) === 1 && trim((string) $campi[0]) === '') {
                continue; // riga vuota
            }
            if (count($campi) !== count($intestazioni)) {
                $report->avvisa("riga {$n}: numero di colonne diverso dall'intestazione, ignorata");
                continue;
            }
            $riga          = array_combine($intestazioni, array_map(fn ($v) => trim((string) $v), $campi));
            $riga['_riga'] = $n;
            $righe[]       = $riga;
        }
        fclose($stream);

        return collect($righe);
    }

    private function rilevaDelimitatore(string $riga): string
    {
        $conteggi = [';' => substr_count($riga, ';'), ',' => substr_count($riga, ','), "\t" => substr_count($riga, "\t")];
        arsort($conteggi);
        return (string) array_key_first($conteggi);
    }

    private function normalizza(string $s): string
    {
        $s = mb_strtolower(Str::ascii(trim($s)));
        $s = preg_replace('/[^a-z0-9]+/', '_', $s);
        return trim($s, '_');
    }

    // ── Estrazione campi ─────────────────────────────────────────────────────

    private function col(array $riga, string $logica): ?string
    {
        foreach (self::COLONNE[$logica] as $nome) {
            if (isset($riga[$nome]) && $riga[$nome] !== '') {
                return $riga[$nome];
            }
        }
        return null;
    }

    private function codice(array $riga): ?string
    {
        $c = $this->col($riga, 'codice');
        if ($c === null) {
            return null;
        }
        $c = trim(str_replace('#', '', $c));
        return $c === '' ? null : $c;
    }

    /** @return array{0:?Carbon,1:?Carbon} */
    private function date(array $riga): array
    {
        $ci = $this->data($this->col($riga, 'check_in'));
        $co = $this->data($this->col($riga, 'check_out'));
        if ($ci && $co) {
            return [$ci, $co];
        }

        $periodo = $this->col($riga, 'periodo') ?? '';
        if (preg_match('/(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})\s*[-–]\s*(\d{1,2}\/\d{1,2}\/\d{4}|\d{4}-\d{2}-\d{2})/u', $periodo, $m)) {
            return [$this->data($m[1]), $this->data($m[2])];
        }

        return [null, null];
    }

    private function data(?string $s): ?Carbon
    {
        if (! $s) {
            return null;
        }
        $s = trim($s);
        foreach (['d/m/Y', 'Y-m-d', 'd-m-Y', 'd/m/Y H:i', 'Y-m-d H:i:s'] as $fmt) {
            try {
                $d = Carbon::createFromFormat($fmt, $s);
                if ($d && $d->format($fmt) === $s) {
                    return $d->startOfDay();
                }
            } catch (\Throwable) {
            }
        }
        return null;
    }

    /** @return array{0:string,1:string} [nome, cognome] */
    private function nominativo(array $riga): array
    {
        $nome    = $this->col($riga, 'nome');
        $cognome = $this->col($riga, 'cognome');
        if ($nome || $cognome) {
            return [$nome ?? '', $cognome ?? ''];
        }

        // Slope mette "-" quando l'ospite principale non è specificato → si usa il prenotante
        $completo = $this->col($riga, 'ospite');
        if ($completo === null || trim($completo) === '-') {
            $completo = $this->col($riga, 'prenotante') ?? '';
        }
        $completo = trim(preg_replace('/\s+/', ' ', $completo));
        if ($completo === '' || $completo === '-') {
            return ['Ospite', '(da documento)'];
        }

        $parti = explode(' ', $completo);
        if (count($parti) === 1) {
            return ['', $parti[0]];
        }
        // Slope mostra "Nome Cognome": primo token nome, il resto cognome.
        return [array_shift($parti), implode(' ', $parti)];
    }

    /** @return array{adulti:int,ragazzi:int,bambini:int} */
    private function pax(array $riga, SlopeImportReport $report, string $codice): array
    {
        $adulti  = $this->intero($this->col($riga, 'adulti'));
        $bambini = $this->intero($this->col($riga, 'bambini'));

        if ($adulti === null) {
            $ospiti = $this->col($riga, 'ospiti') ?? '';
            if (preg_match('/(\d+)\s*adult/iu', $ospiti, $m)) {
                $adulti = (int) $m[1];
            } elseif (preg_match('/^\s*(\d+)\s*$/', $ospiti, $m)) {
                $adulti = (int) $m[1];
            }
            if ($bambini === null && preg_match('/(\d+)\s*bambin/iu', $ospiti, $m)) {
                $bambini = (int) $m[1];
            }
        }

        if ($adulti === null) {
            $report->avvisaUnaVolta('pax', 'Il file non riporta il numero di ospiti: impostato 1 adulto — verifica in Slope.');
            $adulti = 1;
        }

        return ['adulti' => max(1, $adulti), 'ragazzi' => 0, 'bambini' => max(0, $bambini ?? 0)];
    }

    private function intero(?string $s): ?int
    {
        return ($s !== null && preg_match('/\d+/', $s, $m)) ? (int) $m[0] : null;
    }

    /** Ultimo numero nel nome alloggio: "Camera Economy 102" → "102". */
    private function numeroCamera(array $riga): ?string
    {
        $alloggio = $this->col($riga, 'alloggio') ?? '';
        return preg_match('/(\d{1,4})\s*$/', $alloggio, $m) ? $m[1] : null;
    }

    private function tipoPagamento(array $riga, ?Prenotazione $esistente): TipoPagamento
    {
        $saldo = $this->col($riga, 'saldo');
        if ($saldo !== null) {
            $n = (float) str_replace(['€', ' ', '.', ','], ['', '', '', '.'], preg_replace('/\.(?=\d{3})/', '', $saldo));
            return $n <= 0 ? TipoPagamento::GiaPagato : TipoPagamento::DaPagare;
        }
        // Senza informazione: non si tocca ciò che il gestore ha già impostato
        return $esistente?->tipo_pagamento ?? TipoPagamento::DaPagare;
    }
}
