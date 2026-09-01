<?php

namespace App\Console\Commands;

use App\Enums\Profilo;
use App\Models\Hotel;
use App\Models\User;
use Illuminate\Console\Attributes\Description;
use Illuminate\Console\Attributes\Signature;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Crea un utente reale (non esiste ancora una UI per gli account).
 *
 * La password viene GENERATA e stampata una volta sola: non passa da
 * argomenti (finirebbe nella history della shell) né da file versionati.
 * Con --reset-password rigenera la password di un utente esistente.
 */
#[Signature('rsmioni:crea-utente
    {username : Nome utente per il login}
    {profilo : receptionist | receptionist_lite | gestore_hotel | chiosco}
    {--hotel=* : Nome (o id) degli hotel da associare; ripetibile}
    {--email= : Email (default: <username>@rsmioni.local)}
    {--ip=* : IP ammessi (solo Receptionist); vuoto = nessun vincolo}
    {--reset-password : Se l\'utente esiste, rigenera la password}')]
#[Description('Crea un utente con password generata (stampata una sola volta)')]
class CreaUtente extends Command
{
    public function handle(): int
    {
        $username = trim((string) $this->argument('username'));
        $profilo  = Profilo::tryFrom((string) $this->argument('profilo'));

        if (! $profilo) {
            $this->error('Profilo non valido. Ammessi: ' . implode(', ', array_map(fn ($p) => $p->value, Profilo::cases())));
            return self::FAILURE;
        }

        $hotels = collect($this->option('hotel'))
            ->map(fn (string $h) => Hotel::where('nome', $h)->orWhere('id', $h)->first()
                ?? throw new \InvalidArgumentException("Hotel non trovato: {$h}"));

        if ($hotels->isEmpty() && $profilo !== Profilo::Admin) {
            $this->error('Serve almeno un --hotel: senza, l\'utente non vede nulla.');
            return self::FAILURE;
        }

        $password = $this->generaPassword();
        $esiste   = User::where('username', $username)->first();

        if ($esiste && ! $this->option('reset-password')) {
            $this->error("L'utente «{$username}» esiste già. Usa --reset-password per rigenerare la password.");
            return self::FAILURE;
        }

        $utente = $esiste ?? new User(['username' => $username]);
        $utente->fill([
            'email'        => $this->option('email') ?: ($utente->email ?? "{$username}@rsmioni.local"),
            'password'     => $password,
            'profilo'      => $profilo,
            'ip_whitelist' => array_values(array_filter($this->option('ip'))),
            'attivo'       => true,
        ])->save();

        if ($hotels->isNotEmpty()) {
            $utente->hotels()->syncWithoutDetaching($hotels->pluck('id')->all());
        }

        $this->newLine();
        $this->info($esiste ? 'Password rigenerata.' : 'Utente creato.');
        $this->table(
            ['Username', 'Profilo', 'Hotel', 'Password (mostrata solo ora)'],
            [[$username, $profilo->value, $hotels->pluck('nome')->implode(', ') ?: '—', $password]],
        );
        $this->warn('Consegna la password su un canale sicuro e chiedi di cambiarla al primo accesso (icona chiave in alto a destra).');

        return self::SUCCESS;
    }

    /** 16 caratteri, sempre con maiuscole, minuscole e cifre (regole del cambio password). */
    private function generaPassword(): string
    {
        do {
            $p = Str::password(16, symbols: false);
        } while (! preg_match('/[a-z]/', $p) || ! preg_match('/[A-Z]/', $p) || ! preg_match('/\d/', $p));

        return $p;
    }
}
