<?php

namespace Tests\Feature;

use App\Enums\Profilo;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;
use Tests\TestCase;

/** Senza il modulo Marketing (rimosso il 29/10/2026) l'admin atterra sulla scheda demo. */
class AdminAtterraggioTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_viene_rediretto_alla_scheda_demo_e_marketing_non_esiste_piu(): void
    {
        $admin = User::create([
            'id' => Str::uuid()->toString(), 'username' => 'admin_t', 'email' => 'admin@test.local',
            'password' => Hash::make('password'), 'profilo' => Profilo::Admin, 'ip_whitelist' => [], 'attivo' => true,
        ]);

        $this->actingAs($admin)->get('/')->assertRedirect('/demo');
        $this->actingAs($admin)->get('/marketing')->assertNotFound();
        $this->assertFalse(Schema::hasTable('marketing_lead'));
    }
}
