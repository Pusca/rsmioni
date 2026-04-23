<?php

use App\Http\Controllers\Auth\LoginController;
use App\Http\Controllers\Auth\LogoutController;
use App\Http\Controllers\Camere\CamereController;
use App\Http\Controllers\Configurazioni\ChioscoConfigController;
use App\Http\Controllers\Configurazioni\CollaudoController;
use App\Http\Controllers\Configurazioni\DiagnosticaController;
use App\Http\Controllers\Configurazioni\HotelConfigController;
use App\Http\Controllers\Configurazioni\InstallazioneController;
use App\Http\Controllers\Documenti\DocumentiController;
use App\Http\Controllers\Documenti\LinkTemporaneoController;
use App\Http\Controllers\Kiosk\KioskAcquisizioneController;
use App\Http\Controllers\Kiosk\KioskCollaudoController;
use App\Http\Controllers\Kiosk\KioskDiagnosticaController;
use App\Http\Controllers\Kiosk\KioskHeartbeatController;
use App\Http\Controllers\Kiosk\KioskPagamentoController;
use App\Http\Controllers\Kiosk\KioskStampaController;
use App\Http\Controllers\Portineria\AcquisizioneDocumentoController;
use App\Http\Controllers\Portineria\PagamentoPOSController;
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
| Configurazioni — solo Gestore Hotel
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:gestore_hotel'])
    ->prefix('configurazioni')
    ->name('configurazioni.')
    ->group(function () {
        // Hotel
        Route::get('/hotel',              [HotelConfigController::class, 'show'])->name('hotel.show');
        Route::put('/hotel/{hotel}',      [HotelConfigController::class, 'update'])->name('hotel.update');

        // Chioschi
        Route::get('/chioschi',                         [ChioscoConfigController::class, 'index'])->name('chioschi.index');
        Route::get('/chioschi/crea',                    [ChioscoConfigController::class, 'create'])->name('chioschi.create');
        Route::post('/chioschi',                        [ChioscoConfigController::class, 'store'])->name('chioschi.store');
        Route::get('/chioschi/{chiosco}/edit',          [ChioscoConfigController::class, 'edit'])->name('chioschi.edit');
        Route::put('/chioschi/{chiosco}',               [ChioscoConfigController::class, 'update'])->name('chioschi.update');

        // Collaudo chiosco — accessibile solo al Gestore Hotel
        Route::get('/chioschi/{chiosco}/collaudo',  [CollaudoController::class, 'show'])->name('chioschi.collaudo.show');
        Route::post('/chioschi/{chiosco}/collaudo', [CollaudoController::class, 'store'])->name('chioschi.collaudo.store');

        // Installazione / provisioning chiosco (M5E)
        Route::get('/chioschi/{chiosco}/installazione',  [InstallazioneController::class, 'show'])->name('chioschi.installazione.show');
        Route::put('/chioschi/{chiosco}/installazione',  [InstallazioneController::class, 'update'])->name('chioschi.installazione.update');

        // Diagnostica runtime chiosco (M5D)
        Route::get('/chioschi/{chiosco}/diagnostica',          [DiagnosticaController::class, 'show'])->name('chioschi.diagnostica.show');
        Route::get('/chioschi/{chiosco}/diagnostica/stato',    [DiagnosticaController::class, 'statoJson'])->name('chioschi.diagnostica.stato');
        Route::post('/chioschi/{chiosco}/diagnostica/reset-pendenti',  [DiagnosticaController::class, 'resetPendenti'])->name('chioschi.diagnostica.reset_pendenti');
        Route::post('/chioschi/{chiosco}/diagnostica/forza-offline',   [DiagnosticaController::class, 'forzaOffline'])->name('chioschi.diagnostica.forza_offline');
        Route::post('/chioschi/{chiosco}/diagnostica/reset-presenza',  [DiagnosticaController::class, 'resetPresenza'])->name('chioschi.diagnostica.reset_presenza');
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
| Pagamento POS remoto — Gestore Hotel + Receptionist pieno
| Receptionist Lite escluso: nessun accesso operativo al POS.
|--------------------------------------------------------------------------
*/
Route::middleware(['auth', 'role:gestore_hotel,receptionist'])
    ->group(function () {
        Route::post('/pagamenti',                    [PagamentoPOSController::class, 'store'])->name('pagamenti_pos.store');
        Route::get('/pagamenti/{chiosco}/stato',     [PagamentoPOSController::class, 'stato'])->name('pagamenti_pos.stato');
        Route::delete('/pagamenti/{chiosco}',        [PagamentoPOSController::class, 'destroy'])->name('pagamenti_pos.destroy');
    });

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

        // Pagamento POS remoto — kiosk side
        Route::get('/pagamento-pendente',       [KioskPagamentoController::class, 'show'])->name('pagamento.show');
        Route::post('/pagamenti/esito',         [KioskPagamentoController::class, 'esito'])->name('pagamento.esito');
        Route::delete('/pagamenti',             [KioskPagamentoController::class, 'annulla'])->name('pagamento.annulla');

        // Collaudo kiosk-side — browser test eseguiti fisicamente sul dispositivo
        Route::get('/collaudo',  [KioskCollaudoController::class, 'show'])->name('collaudo.show');
        Route::post('/collaudo', [KioskCollaudoController::class, 'store'])->name('collaudo.store');

        // Heartbeat — il kiosk lo invia ogni 60s (M5D)
        Route::post('/heartbeat', [KioskHeartbeatController::class, 'store'])->name('heartbeat.store');

        // Auto-diagnostica kiosk-side (M5D)
        Route::get('/diagnostica', [KioskDiagnosticaController::class, 'show'])->name('diagnostica.show');
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
