<?php

namespace App\Services;

use ZipArchive;

/**
 * Lettore minimale di file .xlsx (primo foglio) senza dipendenze esterne.
 *
 * Basta per gli export dei gestionali: celle `inlineStr`, stringhe condivise
 * (`sharedStrings.xml`), numeri e formule con valore cache. Le date Excel
 * arrivano come seriale numerico (es. 46265 = 2026-08-31): la conversione la
 * fa chi consuma i dati (SlopeImportService::data), perché solo lui sa quali
 * colonne sono date.
 *
 * Restituisce una matrice di stringhe allineata per colonna (le celle vuote
 * diventano ''), pronta per lo stesso pipeline del CSV.
 */
class XlsxReader
{
    /** @return list<list<string>> */
    public function leggi(string $percorso): array
    {
        $zip = new ZipArchive();
        if ($zip->open($percorso) !== true) {
            throw new \InvalidArgumentException('File XLSX non apribile.');
        }

        try {
            $condivise = $this->stringheCondivise($zip);
            $foglio    = $this->primoFoglio($zip);
            $xml       = $zip->getFromName($foglio);
        } finally {
            $zip->close();
        }

        if ($xml === false) {
            throw new \InvalidArgumentException('Foglio XLSX non trovato.');
        }

        return $this->righe($xml, $condivise);
    }

    /** @return list<string> */
    private function stringheCondivise(ZipArchive $zip): array
    {
        $xml = $zip->getFromName('xl/sharedStrings.xml');
        if ($xml === false) {
            return [];
        }
        $doc = new \SimpleXMLElement($xml);
        $doc->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');

        $out = [];
        foreach ($doc->xpath('//m:si') ?: [] as $si) {
            $si->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $parti = [];
            foreach ($si->xpath('.//m:t') ?: [] as $t) {
                $parti[] = (string) $t;
            }
            $out[] = implode('', $parti);
        }
        return $out;
    }

    /** Percorso del primo foglio dal workbook (fallback: sheet1). */
    private function primoFoglio(ZipArchive $zip): string
    {
        $rels = $zip->getFromName('xl/_rels/workbook.xml.rels');
        $wb   = $zip->getFromName('xl/workbook.xml');
        if ($rels !== false && $wb !== false) {
            $wbx = new \SimpleXMLElement($wb);
            $wbx->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $primo = $wbx->xpath('//m:sheets/m:sheet')[0] ?? null;
            $rid   = $primo ? (string) $primo->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')->id : null;

            if ($rid) {
                $rx = new \SimpleXMLElement($rels);
                foreach ($rx->Relationship as $r) {
                    if ((string) $r['Id'] === $rid) {
                        $target = ltrim((string) $r['Target'], '/');
                        return str_starts_with($target, 'xl/') ? $target : 'xl/' . $target;
                    }
                }
            }
        }
        return 'xl/worksheets/sheet1.xml';
    }

    /** @return list<list<string>> */
    private function righe(string $xml, array $condivise): array
    {
        $doc = new \SimpleXMLElement($xml);
        $doc->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');

        $righe = [];
        foreach ($doc->xpath('//m:sheetData/m:row') ?: [] as $row) {
            $row->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
            $celle = [];
            foreach ($row->xpath('m:c') ?: [] as $c) {
                $c->registerXPathNamespace('m', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main');
                $col  = $this->indiceColonna((string) $c['r']);
                $tipo = (string) $c['t'];

                $valore = match ($tipo) {
                    'inlineStr' => implode('', array_map('strval', $c->xpath('.//m:t') ?: [])),
                    's'         => $condivise[(int) $c->v] ?? '',
                    'b'         => ((string) $c->v) === '1' ? 'true' : 'false',
                    default     => (string) $c->v, // n, str, e, o assente
                };
                $celle[$col] = trim($valore);
            }
            if ($celle === []) {
                continue;
            }
            $max  = max(array_keys($celle));
            $riga = [];
            for ($i = 0; $i <= $max; $i++) {
                $riga[] = $celle[$i] ?? '';
            }
            $righe[] = $riga;
        }
        return $righe;
    }

    /** "AB12" → 27 (indice colonna 0-based). */
    private function indiceColonna(string $ref): int
    {
        preg_match('/^([A-Z]+)/', $ref, $m);
        $n = 0;
        foreach (str_split($m[1] ?? 'A') as $ch) {
            $n = $n * 26 + (ord($ch) - 64);
        }
        return $n - 1;
    }
}
