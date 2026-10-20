<?php

namespace App\Services;

use App\Enums\Profilo;
use App\Models\Camera;
use App\Models\Chiosco;
use App\Models\Hotel;
use App\Models\User;
use Illuminate\Support\Str;

/**
 * Scheda dell'hotel demo. Se nessuno la personalizza, l'hotel resta
 * quello generico (nome, orari, servizi, liste) e si può provare
 * con gli account receptionist e chiosco.
 */
class SchedaDemoService
{
    /** Scheda vuota, usata solo per completare le chiavi mancanti. */
    public static function vuota(): array
    {
        return [
            'nome'          => '',
            'numero_camere' => null,
            'checkin'       => '',
            'checkout'      => '',
            'colazione'     => '',
            'autobus'       => '',
            'trasporto'     => '',
            'ristoranti'    => [],
            'luoghi'        => [],
        ];
    }

    /**
     * Hotel di scena già compilato. I locali sono inventati di proposito:
     * servono a far rispondere Alice durante la demo, non sono indirizzi reali.
     */
    public static function generiche(): array
    {
        return [
            'origine'       => 'default',
            'nome'          => 'Hotel Demo',
            'numero_camere' => 15,
            'checkin'       => 'Mattina fino alle 15',
            'checkout'      => 'Fino alle 10',
            'colazione'     => 'Dalle 7 alle 10',
            'autobus'       => 'Autobus davanti all\'hotel',
            'trasporto'     => 'Servizio di trasporto e taxi lì vicino, disponibile a qualsiasi orario',
            'ristoranti'    => [
                ['nome' => 'Trattoria del centro', 'nota' => 'cucina locale, pochi minuti a piedi'],
                ['nome' => 'Pizzeria all\'angolo', 'nota' => 'aperta a pranzo e a cena'],
                ['nome' => 'Ristorante del lago', 'nota' => 'pesce, meglio prenotare'],
            ],
            'luoghi'        => [
                ['nome' => 'Centro storico', 'nota' => 'raggiungibile a piedi'],
                ['nome' => 'Terme', 'nota' => 'a pochi minuti dall\'hotel'],
                ['nome' => 'Parco cittadino', 'nota' => 'passeggiata breve'],
            ],
        ];
    }

    /**
     * Su un hotel demo senza scheda scrive le informazioni generiche,
     * allinea le camere e garantisce chiosco e account di prova.
     * Sugli altri hotel non fa nulla.
     */
    public function assicurata(Hotel $hotel): Hotel
    {
        if (! $hotel->demo) {
            return $hotel;
        }

        if (! is_array($hotel->scheda_demo)) {
            $this->scrivi($hotel, self::generiche());
            $this->allineaCamere($hotel, 15);
        }

        $this->assicuraChiosco($hotel);
        $this->assicuraAccount($hotel, Profilo::Receptionist, 'receptionist', 'receptionist@demo.rsmioni.it');
        $this->assicuraAccount($hotel, Profilo::Chiosco, 'chiosco_demo', 'chiosco@demo.rsmioni.it');

        return $hotel->fresh()->loadCount('camere');
    }

    public function ripristina(Hotel $hotel): void
    {
        $this->scrivi($hotel, self::generiche());
        $this->allineaCamere($hotel, 15);
        $this->assicuraChiosco($hotel);
        $this->assicuraAccount($hotel, Profilo::Receptionist, 'receptionist', 'receptionist@demo.rsmioni.it');
        $this->assicuraAccount($hotel, Profilo::Chiosco, 'chiosco_demo', 'chiosco@demo.rsmioni.it');
    }

    /** Completa le chiavi mancanti senza inventare contenuti. */
    public function perForm(?array $scheda): array
    {
        $scheda = array_replace(self::vuota(), $scheda ?? []);
        foreach (['nome', 'checkin', 'checkout', 'colazione', 'autobus', 'trasporto'] as $campo) {
            $scheda[$campo] = trim((string) ($scheda[$campo] ?? ''));
        }
        $numero = $scheda['numero_camere'];
        $scheda['numero_camere'] = ($numero === null || $numero === '') ? null : (int) $numero;
        $scheda['ristoranti'] = $this->voci($scheda['ristoranti'] ?? []);
        $scheda['luoghi'] = $this->voci($scheda['luoghi'] ?? []);
        unset($scheda['origine']);

        return $scheda;
    }

    /**
     * Testo passato all'assistente. Le liste vuote restano esplicite,
     * così non inventa ristoranti o luoghi.
     */
    public function componi(array $scheda): string
    {
        $scheda = $this->perForm($scheda);
        $linee = [];
        $this->riga($linee, 'Nome hotel', $scheda['nome']);
        if ($scheda['numero_camere']) {
            $linee[] = 'Camere: '.$scheda['numero_camere'];
        }
        $this->riga($linee, 'Check-in', $scheda['checkin']);
        $this->riga($linee, 'Check-out', $scheda['checkout']);
        $this->riga($linee, 'Colazione', $scheda['colazione']);
        $this->riga($linee, 'Autobus', $scheda['autobus']);
        $this->riga($linee, 'Trasporto e taxi', $scheda['trasporto']);
        $linee[] = $this->elenco('Ristoranti consigliati', $scheda['ristoranti']);
        $linee[] = $this->elenco('Luoghi da visitare', $scheda['luoghi']);

        return implode("\n", $linee);
    }

    /**
     * Prima ora riconoscibile nel testo del check-out ("Fino alle 10", "10:30").
     * Null se il testo non contiene un orario.
     */
    public function oraCheckout(?string $testo): ?string
    {
        $testo = trim((string) $testo);
        if ($testo === '') {
            return null;
        }

        if (preg_match('/\b(\d{1,2})[:.](\d{2})\b/', $testo, $m)) {
            return $this->ora((int) $m[1], (int) $m[2]);
        }

        if (preg_match('/\b(\d{1,2})\b/', $testo, $m)) {
            return $this->ora((int) $m[1], 0);
        }

        return null;
    }

    public function salva(Hotel $hotel, array $input): void
    {
        $scheda = $this->perForm($input);
        $scheda['origine'] = 'personalizzata';
        $this->scrivi($hotel, $scheda);
        if ($scheda['numero_camere']) {
            $this->allineaCamere($hotel, (int) $scheda['numero_camere']);
        }
    }

    /**
     * Stessa password per receptionist e chiosco di prova: serve solo
     * quando la demo gira su due dispositivi (totem + portineria).
     */
    public function impostaPasswordProva(Hotel $hotel, string $password): void
    {
        foreach ([Profilo::Receptionist, Profilo::Chiosco] as $profilo) {
            $this->account($hotel, $profilo)?->update(['password' => $password]);
        }
    }

    public function account(Hotel $hotel, Profilo $profilo): ?User
    {
        return User::query()
            ->where('profilo', $profilo)
            ->whereHas('hotels', fn ($q) => $q->where('hotels.id', $hotel->id))
            ->first();
    }

    /** Aggiunge camere mancanti. Non ne cancella mai. */
    public function allineaCamere(Hotel $hotel, int $numero): void
    {
        $mancanti = $numero - $hotel->camere()->count();
        if ($mancanti <= 0) {
            return;
        }

        $usati = $hotel->camere()->pluck('nome')->all();
        $n = 1;
        while ($mancanti > 0 && $n <= $numero + 100) {
            $nome = (string) $n;
            if (! in_array($nome, $usati, true)) {
                Camera::create([
                    'hotel_id'           => $hotel->id,
                    'nome'               => $nome,
                    'tipo'               => 'Doppia',
                    'piano'              => intdiv($n - 1, 10),
                    'booking_consentito' => true,
                    'letti_matrimoniali' => 1,
                    'doccia'             => true,
                ]);
                $usati[] = $nome;
                $mancanti--;
            }
            $n++;
        }
    }

    private function scrivi(Hotel $hotel, array $scheda): void
    {
        $hotel->scheda_demo = $scheda;
        $hotel->nome = $scheda['nome'];
        $hotel->istruzioni_ai = $this->componi($scheda);

        $ora = $this->oraCheckout($scheda['checkout'] ?? '');
        if ($ora !== null) {
            $hotel->checkout_ora = $ora;
            $hotel->checkout_libero = false;
        }

        $hotel->save();
    }

    private function assicuraChiosco(Hotel $hotel): void
    {
        if ($hotel->chioschi()->where('attivo', true)->exists()) {
            return;
        }

        Chiosco::create([
            'hotel_id'      => $hotel->id,
            'nome'          => 'Chiosco Ingresso',
            'tipo'          => 'touch',
            'interattivo'   => true,
            'has_pos'       => true,
            'tipo_pos'      => 'ingenico',
            'has_stampante' => true,
            'attivo'        => true,
        ]);
    }

    private function assicuraAccount(Hotel $hotel, Profilo $profilo, string $username, string $email): User
    {
        $esistente = $this->account($hotel, $profilo);
        if ($esistente) {
            return $esistente;
        }

        if (User::where('username', $username)->exists()) {
            $username = $profilo->value.'_'.substr((string) $hotel->id, 0, 8);
        }
        if (User::where('email', $email)->exists()) {
            $email = $profilo->value.'.'.substr((string) $hotel->id, 0, 8).'@demo.rsmioni.it';
        }

        // Password casuale: dalla scheda si entra con «Prova» senza conoscerla;
        // per un secondo dispositivo la si imposta dalla scheda stessa.
        $utente = User::create([
            'username'     => $username,
            'email'        => $email,
            'password'     => Str::password(24),
            'profilo'      => $profilo,
            'ip_whitelist' => [],
            'attivo'       => true,
        ]);
        $utente->hotels()->attach($hotel->id);

        return $utente;
    }

    private function riga(array &$linee, string $etichetta, mixed $valore): void
    {
        $valore = trim((string) $valore);
        if ($valore !== '') {
            $linee[] = $etichetta.': '.$valore;
        }
    }

    private function elenco(string $titolo, array $voci): string
    {
        if ($voci === []) {
            return $titolo.': nessuno indicato.';
        }

        $linee = [$titolo.':'];
        foreach ($voci as $voce) {
            $nota = trim((string) ($voce['nota'] ?? ''));
            $linee[] = '- '.trim((string) $voce['nome']).($nota !== '' ? ' — '.$nota : '');
        }

        return implode("\n", $linee);
    }

    /** @return list<array{nome: string, nota: string}> */
    private function voci(mixed $voci): array
    {
        if (! is_array($voci)) {
            return [];
        }

        $pulite = [];
        foreach ($voci as $voce) {
            if (! is_array($voce)) {
                continue;
            }
            $nome = trim((string) ($voce['nome'] ?? ''));
            if ($nome === '') {
                continue;
            }
            $pulite[] = [
                'nome' => $nome,
                'nota' => trim((string) ($voce['nota'] ?? '')),
            ];
        }

        return $pulite;
    }

    private function ora(int $ore, int $minuti): ?string
    {
        if ($ore > 23 || $minuti > 59) {
            return null;
        }

        return sprintf('%02d:%02d:00', $ore, $minuti);
    }
}
