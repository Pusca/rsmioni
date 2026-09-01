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
        'prezzo'    => ['importo', 'importo_totale', 'totale', 'prezzo', 'totale_soggiorno'],
    ];

    public function __construct(
        private readonly CameraService $camere,
        private readonly XlsxReader    $xlsx,
    ) {}

    /**
     * Importa da un file sul disco: .xlsx (formato reale dell'export Slope,
     * che arriva via email) oppure .csv/.txt.
     */
    public function importaFile(string $percorso, Hotel $hotel, ?User $eseguitoDa = null, bool $dryRun = false): SlopeImportReport
    {
        if (! is_readable($percorso)) {
            throw new \InvalidArgumentException("File non leggibile: {$percorso}");
        }

        if ($this->isXlsx($percorso)) {
            $report = new SlopeImportReport();
            return $this->importaMatrice($this->xlsx->leggi($percorso), $hotel, $eseguitoDa, $dryRun, $report);
        }

        return $this->importaCsv((string) file_get_contents($percorso), $hotel, $eseguitoDa, $dryRun);
    }

    /** Un .xlsx è uno zip: basta la firma "PK" — l'estensione può mancare (upload temporanei). */
    private function isXlsx(string $percorso): bool
    {
        if (str_ends_with(strtolower($percorso), '.xlsx')) {
            return true;
        }
        $h = fopen($percorso, 'rb');
        $firma = $h ? fread($h, 2) : '';
        if ($h) fclose($h);
        return $firma === 'PK';
    }

    /** Importa dal contenuto CSV già letto. */
    public function importaCsv(string $contenuto, Hotel $hotel, ?User $eseguitoDa = null, bool $dryRun = false): SlopeImportReport
    {
        $report = new SlopeImportReport();
        return $this->importaMatrice($this->leggiCsv($contenuto, $report), $hotel, $eseguitoDa, $dryRun, $report);
    }

    /**
     * Cuore dell'import: una matrice (prima riga = intestazioni) da qualunque
     * formato. Le intestazioni vengono normalizzate e le righe raggruppate
     * per numero prenotazione.
     *
     * @param list<list<string>> $matrice
     */
    private function importaMatrice(array $matrice, Hotel $hotel, ?User $eseguitoDa, bool $dryRun, SlopeImportReport $report): SlopeImportReport
    {
        $righe = $this->righeDaMatrice($matrice, $report);

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
            'prenotante'         => $this->prenotante($prima, $nome, $cognome),
            'check_in'           => $checkIn->toDateString(),
            'check_out'          => $checkOut->toDateString(),
            'pax'                => $pax,
            'tipo_pagamento'     => $this->tipoPagamento($prima, $esistente),
        ];

        // Importo del soggiorno (Slope lo espone per riga/camera: somma sul gruppo)
        $prezzo = $righe->sum(fn (array $r) => $this->importo($this->col($r, 'prezzo')) ?? 0.0);
        if ($righe->contains(fn (array $r) => $this->col($r, 'prezzo') !== null)) {
            $dati['prezzo'] = round($prezzo, 2);
        }

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

    // ── Lettura file ─────────────────────────────────────────────────────────

    /**
     * CSV → matrice di stringhe (prima riga = intestazioni).
     * @return list<list<string>>
     */
    private function leggiCsv(string $contenuto, SlopeImportReport $report): array
    {
        $contenuto = preg_replace('/^\xEF\xBB\xBF/', '', $contenuto); // BOM
        $contenuto = str_replace(["\r\n", "\r"], "\n", trim($contenuto));
        if ($contenuto === '') {
            return [];
        }

        $primaRiga    = strtok($contenuto, "\n") ?: '';
        $delimitatore = $this->rilevaDelimitatore($primaRiga);

        $stream = fopen('php://temp', 'r+');
        fwrite($stream, $contenuto);
        rewind($stream);

        $matrice = [];
        while (($campi = fgetcsv($stream, 0, $delimitatore, '"', '\\')) !== false) {
            $matrice[] = array_map(fn ($v) => trim((string) $v), $campi);
        }
        fclose($stream);

        return $matrice;
    }

    /**
     * Matrice → righe associative con intestazioni normalizzate + numero riga.
     * @param  list<list<string>> $matrice
     * @return Collection<int, array<string, string|int>>
     */
    private function righeDaMatrice(array $matrice, SlopeImportReport $report): Collection
    {
        if ($matrice === []) {
            return collect();
        }

        $intestazioni = array_map(fn ($h) => $this->normalizza((string) $h), array_shift($matrice));
        $nCol         = count($intestazioni);

        $righe = [];
        foreach ($matrice as $i => $campi) {
            $n = $i + 2; // 1 = intestazione
            if (implode('', $campi) === '') {
                continue; // riga vuota
            }
            // Celle finali vuote possono mancare (xlsx) o abbondare (csv): si riallinea
            $campi = array_pad(array_slice($campi, 0, $nCol), $nCol, '');
            if (count($campi) !== $nCol) {
                $report->avvisa("riga {$n}: numero di colonne diverso dall'intestazione, ignorata");
                continue;
            }
            $riga          = array_combine($intestazioni, $campi);
            $riga['_riga'] = $n;
            $righe[]       = $riga;
        }

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

        // Seriale Excel (xlsx): giorni dal 1899-12-30, eventuale frazione = ora
        if (preg_match('/^\d{5}(\.\d+)?$/', $s)) {
            $giorni = (int) floor((float) $s);
            return $giorni >= 20000 && $giorni <= 80000
                ? Carbon::create(1899, 12, 30)->addDays($giorni)->startOfDay()
                : null;
        }

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

    /**
     * @return array{0:string,1:string} [nome, cognome]
     *
     * Priorità: OSPITE PRINCIPALE (chi dorme in camera e fa il check-in) →
     * colonne Nome/Cognome (nell'export Slope sono il PRENOTANTE, che può
     * essere un'agenzia o un'altra persona) → Prenotante come testo unico.
     */
    private function nominativo(array $riga): array
    {
        // Slope mette "-" quando l'ospite principale non è specificato
        $ospite = trim((string) $this->col($riga, 'ospite'));
        if ($ospite !== '' && $ospite !== '-') {
            return $this->dividiNominativo($ospite);
        }

        $nome    = $this->col($riga, 'nome');
        $cognome = $this->col($riga, 'cognome');
        if ($nome || $cognome) {
            return [$nome ?? '', $cognome ?? ''];
        }

        $prenotante = trim((string) $this->col($riga, 'prenotante'));
        if ($prenotante !== '' && $prenotante !== '-') {
            return $this->dividiNominativo($prenotante);
        }

        return ['Ospite', '(da documento)'];
    }

    /**
     * Chi ha prenotato, se diverso dall'ospite principale: colonne Nome/Cognome
     * dell'export (= prenotante) oppure la colonna Prenotante. Null se coincide.
     */
    private function prenotante(array $riga, string $nomeOspite, string $cognomeOspite): ?string
    {
        $nome    = trim((string) $this->col($riga, 'nome'));
        $cognome = trim((string) $this->col($riga, 'cognome'));
        $completo = trim("{$nome} {$cognome}");
        if ($completo === '') {
            $completo = trim((string) $this->col($riga, 'prenotante'));
        }
        if ($completo === '' || $completo === '-') {
            return null;
        }
        $ospite = trim("{$nomeOspite} {$cognomeOspite}");
        return mb_strtolower($completo) === mb_strtolower($ospite) ? null : $completo;
    }

    /** "Nome Cognome" → [nome, cognome]; un solo token → cognome. */
    private function dividiNominativo(string $completo): array
    {
        $parti = explode(' ', trim(preg_replace('/\s+/', ' ', $completo)));
        if (count($parti) === 1) {
            return ['', $parti[0]];
        }
        return [array_shift($parti), implode(' ', $parti)];
    }

    /** "59.00", "1.250,50 €" → float; null se assente/illeggibile. */
    private function importo(?string $s): ?float
    {
        if ($s === null || trim($s) === '') {
            return null;
        }
        $s = trim(str_replace(['€', ' '], '', $s));
        if (preg_match('/^\d+(\.\d+)?$/', $s)) {
            return (float) $s;                       // formato macchina (xlsx)
        }
        $s = str_replace('.', '', $s);               // separatore migliaia italiano
        $s = str_replace(',', '.', $s);              // decimale italiano
        return is_numeric($s) ? (float) $s : null;
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
