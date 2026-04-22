<?php

namespace Database\Factories;

use App\Enums\Profilo;
use App\Models\User;
use Illuminate\Database\Eloquent\Factories\Factory;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Str;

/**
 * @extends Factory<User>
 */
class UserFactory extends Factory
{
    protected static ?string $password;

    public function definition(): array
    {
        return [
            'id'           => Str::uuid()->toString(),
            'username'     => fake()->unique()->userName(),
            'email'        => fake()->unique()->safeEmail(),
            'password'     => static::$password ??= Hash::make('password'),
            'profilo'      => Profilo::Receptionist,
            'ip_whitelist' => [],
            'attivo'       => true,
        ];
    }
}
