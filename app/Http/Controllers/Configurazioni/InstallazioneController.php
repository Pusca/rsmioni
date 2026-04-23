<?php

namespace App\Http\Controllers\Configurazioni;

use App\Enums\EsitoCollaudo;
use App\Enums\StatoInstallazione;
use App\Http\Controllers\Controller;
use App\Models\Chiosco;
use App\Models\Collaudo;
use App\Services\DiagnosticaChioscoService;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;
use Inertia\Inertia;
use Inertia\Response;

/**
 * Modulo installazione / provisioning chiosco.
 *
 * Responsabilità:
 *   - Mostrare tutti i dati necessari alla messa in servizio di un chiosco
 *   - Fornire checklist di installazione strutturata per categoria
 *   - Persistere lo stato di avanzamento dell'installazione
 *   - Collegare a configurazione, collaudo e diagnostica runtime
 *
 * Distinto da:
 *   - Configurazione: parametri applicativi del chiosco (ChioscoConfigController)
 *   - Collaudo: test funzionale post-installazione (CollaudoController)
 *   - Diagnostica: monitoraggio runtime (DiagnosticaController)
 *
 * Permessi: solo Gestore Hotel.
 */
class InstallazioneController extends Controller
{
    public function __construct(
        private readonly DiagnosticaChioscoService $diagnostica,
    ) {}

    // ── Pagina installazione ──────────────────────────────────────────────────

    public function show(Request $request, string $chioscoId): Response
    {
        $user    = $request->user();
        $chiosco = Chiosco::with('hotel:id,nome')->findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $user->hotelIds(), true)) {
            abort(403);
        }

        $ultimoCollaudo = Collaudo::where('chiosco_id', $chiosco->id)
            ->with('eseguitoDa:id,username')
            ->latest()
            ->first();

        $presenza = $this->diagnostica->presenza($chiosco->id);

        return Inertia::render('Configurazioni/Installazione', [
            'chiosco'          => $this->chioscoForFrontend($chiosco),
            'checklist_voci'   => $this->checklistVoci($chiosco, $ultimoCollaudo),
            'url_kiosk'        => url('/kiosk'),
            'ultimo_collaudo'  => $ultimoCollaudo ? [
                'esito'       => $ultimoCollaudo->esito->value,
                'sorgente'    => $ultimoCollaudo->sorgente,
                'created_at'  => $ultimoCollaudo->created_at->toIso8601String(),
                'eseguito_da' => $ultimoCollaudo->eseguitoDa?->username,
            ] : null,
            'presenza_online'  => $presenza['online'],
        ]);
    }

    // ── Aggiornamento stato installazione ─────────────────────────────────────

    public function update(Request $request, string $chioscoId): RedirectResponse
    {
        $user    = $request->user();
        $chiosco = Chiosco::findOrFail($chioscoId);

        if (! in_array($chiosco->hotel_id, $user->hotelIds(), true)) {
            abort(403);
        }

        $chiavi = collect($this->checklistVoci($chiosco, null))->pluck('key')->all();

        $validated = $request->validate([
            'stato_installazione' => ['required', Rule::enum(StatoInstallazione::class)],
            'note_installazione'  => ['nullable', 'string', 'max:2000'],
            'checklist'           => ['nullable', 'array'],
            'checklist.*'         => ['boolean'],
        ]);

        // Filtra solo le chiavi note — ignora chiavi sconosciute dal client
        $checklistPulita = [];
        foreach ($chiavi as $key) {
            $checklistPulita[$key] = (bool) ($validated['checklist'][$key] ?? false);
        }

        $nuovoStato = StatoInstallazione::from($validated['stato_installazione']);

        $chiosco->stato_installazione     = $nuovoStato;
        $chiosco->note_installazione      = $validated['note_installazione'] ?? null;
        $chiosco->checklist_installazione = $checklistPulita;

        if ($nuovoStato === StatoInstallazione::Installato && ! $chiosco->installato_at) {
            $chiosco->installato_at = now();
        } elseif ($nuovoStato !== StatoInstallazione::Installato) {
            $chiosco->installato_at = null;
        }

        $chiosco->save();

        return back()->with('success', 'Stato installazione aggiornato.');
    }

    // ── Definizione checklist ─────────────────────────────────────────────────

    /**
     * Restituisce le voci della checklist di installazione.
     * Le voci sono filtrate/arricchite in base alla configurazione del chiosco.
     *
     * Categorie:
     *   - infrastruttura: rete, IP
     *   - browser: installazione e configurazione browser kiosk
     *   - applicazione: parametri applicativi (sessione, path POS)
     *   - hardware: periferiche fisiche (audio, stampante, POS)
     *   - sistema: avvio automatico, OS
     *   - verifica: collaudo finale
     *
     * Tipo voce:
     *   - manuale: deve essere spuntata dall'installatore on-site
     *   - auto: valore rilevato automaticamente dal sistema (non editabile in checklist)
     */
    private function checklistVoci(Chiosco $chiosco, ?Collaudo $ultimoCollaudo): array
    {
        $pos    = $chiosco->has_pos;
        $stampa = $chiosco->has_stampante;
        $tipo   = $chiosco->tipo_pos?->value;

        $collaudoOk = $ultimoCollaudo !== null
            && in_array($ultimoCollaudo->esito, [EsitoCollaudo::Superato, EsitoCollaudo::Parziale], true);

        $voci = [
            // ── Infrastruttura ────────────────────────────────────────────
            [
                'key'       => 'rete',
                'categoria' => 'infrastruttura',
                'label'     => 'Rete e connettività verificata',
                'desc'      => 'Il dispositivo chiosco raggiunge l\'URL dell\'applicazione RS Mioni. Verificare con browser.',
                'tipo'      => 'manuale',
                'auto'      => null,
            ],
            [
                'key'       => 'ip_configurato',
                'categoria' => 'infrastruttura',
                'label'     => 'Indirizzo IP configurato nell\'applicazione',
                'desc'      => 'L\'IP del chiosco è impostato nella configurazione. Richiesto per il kiosk-agent Windows.',
                'tipo'      => 'auto',
                'auto'      => (bool) $chiosco->ip_address,
            ],

            // ── Browser ───────────────────────────────────────────────────
            [
                'key'       => 'browser',
                'categoria' => 'browser',
                'label'     => 'Browser kiosk installato (Chrome / Edge)',
                'desc'      => 'Installare Google Chrome o Microsoft Edge. Verificare compatibilità con getUserMedia e fullscreen API.',
                'tipo'      => 'manuale',
                'auto'      => null,
            ],
            [
                'key'       => 'url_kiosk',
                'categoria' => 'browser',
                'label'     => 'URL kiosk configurato come homepage',
                'desc'      => 'Impostare l\'URL dell\'applicazione come homepage del browser. Il browser deve aprirla direttamente all\'avvio.',
                'tipo'      => 'manuale',
                'auto'      => null,
            ],
            [
                'key'       => 'fullscreen',
                'categoria' => 'browser',
                'label'     => 'Modalità fullscreen configurata',
                'desc'      => 'Browser avviato in modalità kiosk (--kiosk per Chrome/Edge) o fullscreen. Nessuna barra di navigazione visibile.',
                'tipo'      => 'manuale',
                'auto'      => null,
            ],
            [
                'key'       => 'webcam',
                'categoria' => 'browser',
                'label'     => 'Permesso webcam concesso al browser',
                'desc'      => 'Autorizzare l\'accesso alla webcam nelle impostazioni del browser per l\'URL dell\'applicazione.',
                'tipo'      => 'manuale',
                'auto'      => null,
            ],
            [
                'key'       => 'microfono',
                'categoria' => 'browser',
                'label'     => 'Permesso microfono concesso al browser',
                'desc'      => 'Autorizzare l\'accesso al microfono. Richiesto per il collegamento in parlato (M2).',
                'tipo'      => 'manuale',
                'auto'      => null,
            ],

            // ── Applicazione ──────────────────────────────────────────────
            [
                'key'       => 'sessione',
                'categoria' => 'applicazione',
                'label'     => 'Selezione chiosco completata',
                'desc'      => 'Accedere all\'applicazione con le credenziali kiosk e selezionare questo chiosco dalla schermata /kiosk/seleziona.',
                'tipo'      => 'manuale',
                'auto'      => null,
            ],

            // ── Hardware ──────────────────────────────────────────────────
            [
                'key'       => 'audio',
                'categoria' => 'hardware',
                'label'     => 'Audio verificato',
                'desc'      => 'Altoparlanti connessi, driver installati, volume impostato a livello udibile per il cliente.',
                'tipo'      => 'manuale',
                'auto'      => null,
            ],

            // ── Sistema ───────────────────────────────────────────────────
            [
                'key'       => 'avvio_automatico',
                'categoria' => 'sistema',
                'label'     => 'Avvio automatico configurato',
                'desc'      => 'Il sistema operativo è configurato per avviare il browser kiosk automaticamente all\'accensione del dispositivo.',
                'tipo'      => 'manuale',
                'auto'      => null,
            ],
        ];

        // Voci condizionali: stampante
        if ($stampa) {
            $voci[] = [
                'key'       => 'stampante',
                'categoria' => 'hardware',
                'label'     => 'Stampante connessa e configurata',
                'desc'      => 'Stampante fisicamente connessa al chiosco, driver installati e test stampa eseguito con successo.',
                'tipo'      => 'manuale',
                'auto'      => null,
            ];
        }

        // Voci condizionali: POS
        if ($pos) {
            $voci[] = [
                'key'       => 'pos_connesso',
                'categoria' => 'hardware',
                'label'     => "Terminale POS connesso" . ($tipo ? " ({$tipo})" : ''),
                'desc'      => 'Terminale POS fisicamente connesso, alimentato e in modalità operativa.',
                'tipo'      => 'manuale',
                'auto'      => null,
            ];

            if ($tipo === 'ingenico') {
                $voci[] = [
                    'key'       => 'pos_path',
                    'categoria' => 'applicazione',
                    'label'     => 'Path file POS Ingenico configurati',
                    'desc'      => 'I path input/output per la comunicazione file con il POS Ingenico sono impostati nella configurazione chiosco.',
                    'tipo'      => 'auto',
                    'auto'      => (bool) ($chiosco->path_input_pos && $chiosco->path_output_pos),
                ];
            }
        }

        // Voce finale: collaudo (sempre presente, auto-rilevata)
        $voci[] = [
            'key'       => 'collaudo',
            'categoria' => 'verifica',
            'label'     => 'Collaudo completato con esito accettabile',
            'desc'      => 'Eseguire il collaudo dalla pagina Collaudo (sia lato Gestore che lato chiosco) e ottenere esito Superato o Parziale.',
            'tipo'      => 'auto',
            'auto'      => $collaudoOk,
        ];

        return $voci;
    }

    // ── Helper serializzazione chiosco ────────────────────────────────────────

    private function chioscoForFrontend(Chiosco $chiosco): array
    {
        return [
            'id'                      => $chiosco->id,
            'nome'                    => $chiosco->nome,
            'tipo'                    => $chiosco->tipo->value,
            'attivo'                  => $chiosco->attivo,
            'interattivo'             => $chiosco->interattivo,
            'has_pos'                 => $chiosco->has_pos,
            'tipo_pos'                => $chiosco->tipo_pos?->value,
            'has_stampante'           => $chiosco->has_stampante,
            'path_input_pos'          => $chiosco->path_input_pos,
            'path_output_pos'         => $chiosco->path_output_pos,
            'ip_address'              => $chiosco->ip_address,
            'stato_installazione'     => $chiosco->stato_installazione?->value ?? 'da_installare',
            'note_installazione'      => $chiosco->note_installazione,
            'checklist_installazione' => $chiosco->checklist_installazione ?? [],
            'installato_at'           => $chiosco->installato_at?->toIso8601String(),
            'hotel'                   => $chiosco->hotel
                ? ['id' => $chiosco->hotel->id, 'nome' => $chiosco->hotel->nome]
                : null,
        ];
    }
}
