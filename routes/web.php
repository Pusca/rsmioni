<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\Camere\CamereController;
use App\Http\Controllers\Documenti\DocumentiController;
use App\Http\Controllers\Documenti\LinkTemporaneoController;
use App\Http\Controllers\Kiosk\KioskAcquisizioneController;
use App\Http\Controllers\Kiosk\KioskStampaController;
use App\Http\Controllers\Portineria\AcquisizioneDocumentoController;
use App\Http\Controllers\Prenotazioni\PrenotazioneCamereController;
use App\Http\Controllers\Kiosk\KioskChiamataController;
use App\Http\Controllers\Kiosk\KioskController;
use App\Http\Controllers\Kiosk\KioskStatoController;
use App\Http\Controllers\Kiosk\KioskWebRtcController;
use App\Http\Controllers\Portineria\DemoController;
use App\Http\Controllers\Portineria\PortineriaController;
use App\Http\Controllers\Portineria\StatoChioscoController;
use App\Http\Controllers\Portineria\StampaController;
use App\Http\Controllers\Portineria\MediaController;
use App\Http\Controllers\Portineria\WebRtcController;
use App\Http\Controllers\Prenotazioni\PrenotazioniController;
use App\Http\Controllers\Regolamento\RegolamentoController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Auth
|--------------------------------------------------------------------------
*/
Route::middleware('guest')->group(function () {
    Route::get('/login', [LoginController::class, 'create'])->name('login');
    Route::post('/login', [LoginController::class, 'store']);
});

Route::post('/logout', [LogoutController::class, 'destroy'])
    ->middleware('auth')
    ->name('logout');

/*
|--------------------------------------------------------------------------
| Portineria — Receptionist e Receptionist Lite
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'ip_whitelist', 'role:receptionist,receptionist_lite'])
    ->prefix('portineria')
    ->name('portineria.')
    ->group(function () {
        // Pagina principale
        Route::get('/', [PortineriaController::class, 'index'])->name('index');

        // Stato runtime chioschi (AJAX)
        Route::get('/chioschi/{chiosco}/stato', [StatoChioscoController::class, 'show'])
            ->name('chioschi.stato.show');
        Route::patch('/chioschi/{chiosco}/stato', [StatoChioscoController::class, 'update'])
            ->name('chioschi.stato.update');

        // WebRTC — parlato receptionist ↔ chiosco (con transizione stato)
        Route::post('/webrtc/sessione', [WebRtcController::class, 'creaSessione'])->name('webrtc.sessione');
        Route::post('/webrtc/signal',   [WebRtcController::class, 'signal'])->name('webrtc.signal');
        Route::post('/webrtc/chiudi',   [WebRtcController::class, 'chiudi'])->name('webrtc.chiudi');

        // Media — sessioni chiaro/nascosto (senza transizione stato)
        Route::post('/media/sessione', [MediaController::class, 'creaSessione'])->name('media.sessione');
        Route::post('/media/chiudi',   [MediaController::class, 'chiudiSessione'])->name('media.chiudi');

        // Demo / testing (solo APP_ENV=local)
        Route::post('/demo/simula', [DemoController::class, 'simula'])->name('demo.simula');
        Route::post('/demo/reset', [DemoController::class, 'reset'])->name('demo.reset');
    });

/*
|--------------------------------------------------------------------------
| Prenotazioni — Gestore Hotel e Receptionist pieno
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:gestore_hotel,receptionist'])
    ->group(function () {
        Route::resource('prenotazioni', PrenotazioniController::class);

        // Assegnazione camere a una prenotazione
        Route::put('/prenotazioni/{prenotazione}/camere', [PrenotazioneCamereController::class, 'update'])
            ->name('prenotazioni.camere.update');

        // Disponibilità camere per date+hotel (AJAX, usata dal selettore frontend)
        Route::get('/api/camere-disponibili', [\App\Http\Controllers\Camere\CamereDisponibiliController::class, 'index'])
            ->name('api.camere_disponibili');
    });

/*
|--------------------------------------------------------------------------
| Gestione Camere — solo Gestore Hotel
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:gestore_hotel'])
    ->group(function () {
        Route::resource('camere', CamereController::class);
    });

/*
|--------------------------------------------------------------------------
| Acquisizione documento da chiosco — Gestore Hotel + Receptionist pieno
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:gestore_hotel,receptionist'])
    ->group(function () {
        Route::post('/acquisizioni',                    [AcquisizioneDocumentoController::class, 'store'])->name('acquisizioni.store');
        Route::get('/acquisizioni/{chiosco}/stato',     [AcquisizioneDocumentoController::class, 'stato'])->name('acquisizioni.stato');
        Route::delete('/acquisizioni/{chiosco}',        [AcquisizioneDocumentoController::class, 'destroy'])->name('acquisizioni.destroy');
    });

/*
|--------------------------------------------------------------------------
| Stampa remota — Gestore Hotel + Receptionist pieno
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:gestore_hotel,receptionist'])
    ->group(function () {
        Route::post('/stampe',                    [StampaController::class, 'store'])->name('stampe.store');
        Route::get('/stampe/{chiosco}/stato',     [StampaController::class, 'stato'])->name('stampe.stato');
        Route::delete('/stampe/{chiosco}',        [StampaController::class, 'destroy'])->name('stampe.destroy');
    });

/*
|--------------------------------------------------------------------------
| Documenti — Gestore Hotel + Receptionist pieno
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:gestore_hotel,receptionist'])
    ->group(function () {
        Route::post('/documenti',                        [DocumentiController::class, 'store'])->name('documenti.store');
        Route::get('/documenti/{documento}',             [DocumentiController::class, 'show'])->name('documenti.show');
        Route::get('/documenti/{documento}/download',    [DocumentiController::class, 'download'])->name('documenti.download');
        Route::delete('/documenti/{documento}',          [DocumentiController::class, 'destroy'])->name('documenti.destroy');
        Route::post('/documenti/{documento}/invia',      [DocumentiController::class, 'invia'])->name('documenti.invia');
    });

/*
|--------------------------------------------------------------------------
| Link temporanei — accesso pubblico al documento via token
|--------------------------------------------------------------------------
*/
Route::get('/doc/{token}', [LinkTemporaneoController::class, 'show'])
    ->name('documenti.link')
    ->middleware([]);

/*
|--------------------------------------------------------------------------
| Regolamento — lettura: Gestore Hotel + Receptionist pieno
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:gestore_hotel,receptionist'])
    ->group(function () {
        Route::get('/regolamento',              [RegolamentoController::class, 'index'])->name('regolamento.index');
        Route::get('/regolamento/{regola}',     [RegolamentoController::class, 'show'])->name('regolamento.show');
    });

/*
|--------------------------------------------------------------------------
| Regolamento — scrittura valorizzazione: solo Gestore Hotel
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:gestore_hotel'])
    ->group(function () {
        Route::get('/regolamento/{regola}/edit', [RegolamentoController::class, 'edit'])->name('regolamento.edit');
        Route::put('/regolamento/{regola}',      [RegolamentoController::class, 'update'])->name('regolamento.update');
    });

/*
|--------------------------------------------------------------------------
| Kiosk — profilo chiosco
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:chiosco'])
    ->prefix('kiosk')
    ->name('kiosk.')
    ->group(function () {
        Route::get('/', [KioskController::class, 'index'])->name('index');
        Route::get('/seleziona', [KioskController::class, 'seleziona'])->name('seleziona');
        Route::post('/seleziona', [KioskController::class, 'storeSeleziona'])->name('seleziona.store');

        // Stato runtime — polling fallback per quando Reverb non è disponibile
        Route::get('/stato', [KioskStatoController::class, 'show'])->name('stato');

        // Chiamata dal chiosco verso la Portineria
        Route::post('/chiama',           [KioskChiamataController::class, 'chiama'])->name('chiama');
        Route::post('/annulla-chiamata', [KioskChiamataController::class, 'annullaChiamata'])->name('annulla_chiamata');

        // WebRTC — recovery sessione e segnali dal chiosco verso il receptionist
        Route::get('/webrtc/sessione-corrente', [KioskWebRtcController::class, 'sessioneCorrente'])->name('webrtc.sessione_corrente');
        Route::post('/webrtc/signal',           [KioskWebRtcController::class, 'signal'])->name('webrtc.signal');

        // Acquisizione documento da webcam chiosco
        Route::get('/acquisizione-pendente',    [KioskAcquisizioneController::class, 'show'])->name('kiosk.acquisizione.show');
        Route::post('/acquisizioni',            [KioskAcquisizioneController::class, 'store'])->name('kiosk.acquisizione.store');
        Route::delete('/acquisizioni',          [KioskAcquisizioneController::class, 'annulla'])->name('kiosk.acquisizione.annulla');

        // Stampa remota — kiosk side
        Route::get('/stampa-pendente',          [KioskStampaController::class, 'show'])->name('stampa.show');
        Route::get('/stampe/documento',         [KioskStampaController::class, 'documento'])->name('stampa.documento');
        Route::post('/stampe/completata',       [KioskStampaController::class, 'completata'])->name('stampa.completata');
        Route::delete('/stampe',                [KioskStampaController::class, 'annulla'])->name('stampa.annulla');
    });

/*
|--------------------------------------------------------------------------
| Root redirect
|--------------------------------------------------------------------------
*/
Route::get('/', function () {
    if (! auth()->check()) {
        return redirect()->route('login');
    }

    return match (auth()->user()->profilo->value) {
        'receptionist', 'receptionist_lite' => redirect()->route('portineria.index'),
        'gestore_hotel'                      => redirect()->route('prenotazioni.index'),
        'chiosco'                            => redirect()->route('kiosk.index'),
        default                              => redirect()->route('login'),
    };
});
