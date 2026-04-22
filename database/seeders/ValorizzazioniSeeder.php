<?php

namespace Database\Seeders;

use App\Models\Hotel;
use App\Models\Regola;
use App\Models\ValorizzazioneRegola;
use Illuminate\Database\Seeder;

/**
 * Inserisce valorizzazioni demo per il regolamento dell'Hotel Demo Mioni.
 * Copre le regole principali in IT e alcune in EN per testare il multilingua.
 */
class ValorizzazioniSeeder extends Seeder
{
    public function run(): void
    {
        $hotel = Hotel::where('nome', 'Hotel Demo Mioni')->firstOrFail();

        $valorizzazioni = [
            // ── Generali ────────────────────────────────────────────────────
            'DESCRIZIONE_STRUTTURA' => [
                'it' => "Hotel Mioni Pezzato è un elegante 4 stelle situato nel cuore di Montegrotto Terme, a 40 km da Venezia. La struttura dispone di 120 camere, parco termale privato, piscine di acqua termale esterna e interna, centro benessere e ristorante gourmet. L'hotel si trova a pochi passi dalla stazione ferroviaria e dal centro storico di Montegrotto.",
                'en' => "Hotel Mioni Pezzato is an elegant 4-star hotel in the heart of Montegrotto Terme, 40 km from Venice. The property features 120 rooms, a private thermal park, outdoor and indoor thermal pools, a wellness center and gourmet restaurant.",
            ],
            'SERVIZI_OFFERTI' => [
                'it' => "• Piscine termali esterna (35°C) e interna (36°C)\n• Centro benessere con sauna, bagno turco, percorso Kneipp\n• Ristorante con cucina tipica veneta e menu termale\n• Bar lounge aperto dalle 7:00 alle 23:00\n• Sala conferenze fino a 80 persone\n• Parcheggio privato gratuito\n• Wi-Fi gratuito in tutta la struttura\n• Servizio navetta su prenotazione per stazione e aeroporto",
                'en' => "• Outdoor (35°C) and indoor (36°C) thermal pools\n• Wellness center with sauna, steam bath, Kneipp path\n• Restaurant with Venetian cuisine\n• Lounge bar open 7:00–23:00\n• Conference room up to 80 people\n• Free private parking\n• Free Wi-Fi throughout\n• Shuttle service on request",
            ],
            'ORARI_CHECK_IN' => [
                'it' => "Check-in: dalle ore 14:00\n\nÈ possibile richiedere il check-in anticipato (soggetto a disponibilità, con eventuale supplemento). I bagagli possono essere depositati in reception prima dell'orario di check-in.",
                'en' => "Check-in: from 14:00\n\nEarly check-in available upon request (subject to availability, extra charge may apply). Luggage storage available at reception before check-in time.",
            ],
            'ORARI_CHECK_OUT' => [
                'it' => "Check-out: entro le ore 10:30\n\nÈ possibile richiedere il late check-out fino alle 13:00 con supplemento di € 30, soggetto a disponibilità. Oltre le 13:00 verrà addebitata una notte aggiuntiva.",
                'en' => "Check-out: by 10:30\n\nLate check-out until 13:00 available with €30 surcharge, subject to availability.",
            ],
            'ORARIO_COLAZIONE' => [
                'it' => "La colazione è servita nella sala ristorante al piano terra.\n\nOrari: 7:30 – 10:30 (feriali), 7:30 – 11:00 (festivi e domenica)\n\nLa colazione è a buffet con prodotti locali, dolci artigianali e selezione di prodotti biologici. Su richiesta è disponibile menu celiaco e vegano.",
                'en' => "Breakfast is served in the ground floor restaurant.\n\nHours: 7:30–10:30 (weekdays), 7:30–11:00 (weekends)\n\nBuffet breakfast with local products. Gluten-free and vegan options available on request.",
            ],
            'WIFI_CREDENZIALI' => [
                'it' => "Wi-Fi gratuito disponibile in tutta la struttura.\n\nRete: HotelMioni_Guest\nPassword: termemioni2024\n\nPer assistenza tecnica contattare la reception (interno 0).",
            ],
            'REGOLE_CASA' => [
                'it' => "• Silenzio nelle ore notturne: 23:00 – 7:00\n• Vietato fumare in camera e nelle aree comuni al chiuso\n• Gli animali sono ammessi solo nelle camere pet-friendly (segnalare al momento della prenotazione)\n• La capacità massima delle camere non può essere superata\n• Non sono ammessi ospiti esterni nelle camere senza preventiva comunicazione alla reception\n• L'accesso alle aree termali è riservato agli ospiti dell'hotel",
                'en' => "• Quiet hours: 23:00–7:00\n• Smoking prohibited in rooms and indoor common areas\n• Pets allowed in pet-friendly rooms only (notify at booking)\n• Maximum room capacity must not be exceeded\n• External guests in rooms must be registered at reception",
            ],
            'POLITICA_ANIMALI' => [
                'it' => "Gli animali domestici di piccola taglia (max 8 kg) sono benvenuti nelle camere pet-friendly.\nSupplemento: € 15 per notte.\n\nGli animali non sono ammessi nelle aree ristorante, piscina e spa.\nNecessaria la segnalazione anticipata al momento della prenotazione.",
            ],
            'POLITICA_FUMATORI' => [
                'it' => "L'hotel è completamente non fumatori.\n\nÈ vietato fumare in tutte le aree al chiuso incluse le camere.\nArea fumatori esterna disponibile nel giardino laterale (lato parcheggio).\n\nIn caso di fumatori in camera verrà addebitata una penale di € 200 per le spese di sanificazione.",
                'en' => "The hotel is entirely non-smoking.\n\nSmoking is prohibited in all indoor areas including rooms.\nOutdoor smoking area available in the side garden.\n\nA €200 sanitation fee will be charged for smoking in rooms.",
            ],
            'PARCHEGGIO' => [
                'it' => "Parcheggio privato coperto e scoperto disponibile gratuitamente per tutti gli ospiti.\nCapacità: 80 posti auto.\n\nParcheggio coperto: accesso con scheda magnetica fornita alla reception.\nParcheggio scoperto: libero accesso.\n\nL'hotel declina ogni responsabilità per danni o furti ai veicoli.",
            ],

            // ── Turistiche ───────────────────────────────────────────────────
            'RISTORANTI_CONSIGLIATI' => [
                'it' => "Nei dintorni:\n\n• Trattoria da Bepi – cucina veneta tradizionale, Via Roma 12 (5 min a piedi)\n• Osteria al Gallo – pesce fresco, Piazza Maggiore 3 (10 min a piedi)\n• Ristorante Le Terme – menu termale con prodotti locali, Via Terme 8 (3 min a piedi)\n• Pizzeria Margherita – pizza al forno a legna, Via Nazionale 45 (7 min a piedi)\n\nPer prenotazioni la reception può assistere.",
            ],
            'ATTRAZIONI_LOCALI' => [
                'it' => "• Terme di Montegrotto – complesso termale pubblico (500m)\n• Colli Euganei – parco naturale regionale con sentieri e vigneti (5 km)\n• Abano Terme – centro termale limitrofo (8 km)\n• Padova – città d'arte con Cappella degli Scrovegni e Basilica di Sant'Antonio (15 km)\n• Venezia – (40 km, treno diretto da Montegrotto 45 min)\n• Lago di Garda – (70 km)",
                'en' => "• Montegrotto Terme thermal baths (500m)\n• Euganean Hills Natural Park (5 km)\n• Padua – art city with Scrovegni Chapel (15 km)\n• Venice – (40 km, direct train 45 min)\n• Lake Garda (70 km)",
            ],
            'TRASPORTI_LOCALI' => [
                'it' => "Treno: stazione di Montegrotto Terme a 800m dall'hotel (collegamento diretto con Padova e Venezia)\n\nAutobus: fermata in Piazza Maggiore con linee per Abano Terme, Padova e Battaglia Terme\n\nTaxi: Radio Taxi Terme 049 891 5678\n\nNoleggio bici: disponibile in reception (€ 8/giorno)",
            ],

            // ── Supporto ─────────────────────────────────────────────────────
            'CONTATTI_RECEPTION' => [
                'it' => "Reception aperta 24 ore su 24, 7 giorni su 7.\n\nInterno dalla camera: 0\nTelefono esterno: +39 049 891 2345\nEmail: reception@hotelmioni.it\n\nPer urgenze notturne è sempre presente un receptionist in servizio.",
                'en' => "Reception open 24/7.\n\nFrom room: dial 0\nExternal: +39 049 891 2345\nEmail: reception@hotelmioni.it",
            ],
            'NUMERO_EMERGENZA' => [
                'it' => "EMERGENZE:\n• Emergenza generale: 112\n• Ambulanza: 118\n• Vigili del Fuoco: 115\n• Carabinieri: 112\n• Polizia: 113\n\nOspedale più vicino: Ospedale di Abano Terme, Via Augustea 10 (6 km)\n\nFarmacia di turno: contattare la reception per informazioni aggiornate.",
                'en' => "EMERGENCY:\n• General emergency: 112\n• Ambulance: 118\n• Fire: 115\n• Police: 112/113\n\nNearest hospital: Abano Terme Hospital (6 km)\nFor on-call pharmacy, contact reception.",
            ],
            'PULIZIA_CAMERA' => [
                'it' => "Le camere vengono pulite quotidianamente dalle 10:00 alle 14:00.\n\nPer non disturbare esponere il cartellino «Non disturbare» alla porta. La pulizia verrà effettuata nelle ore successive.\n\nCambio biancheria: ogni 3 giorni (per motivi ambientali) o su richiesta.\nÈ possibile richiedere asciugamani aggiuntivi alla reception.",
            ],

            // ── Sicurezza ────────────────────────────────────────────────────
            'VIE_USCITA_EMERGENZA' => [
                'it' => "Le vie di uscita di emergenza sono indicate da cartelli verdi luminosi lungo tutti i corridoi.\n\nIn caso di evacuazione:\n1. Non usare gli ascensori\n2. Seguire le frecce di emergenza verso le scale\n3. Il punto di raccolta è il parcheggio principale (lato est)\n4. Non rientrare nell'edificio fino all'autorizzazione del personale\n\nLa mappa di evacuazione è affissa nella sua camera.",
                'en' => "Emergency exits are marked by green illuminated signs throughout all corridors.\n\nIn case of evacuation:\n1. Do not use elevators\n2. Follow emergency arrows to stairwells\n3. Assembly point: main parking lot (east side)\n4. Do not re-enter until authorized by staff",
            ],
            'NORME_ANTINCENDIO' => [
                'it' => "• Non utilizzare candele, fornelli o fiamme libere nelle camere\n• Non ostruire le porte antincendio\n• Gli estintori sono posizionati ogni 20 metri lungo i corridoi\n• Gli allarmi antincendio vengono testati ogni lunedì dalle 10:00 alle 10:15\n• In caso di rilevazione di fumo contattare immediatamente la reception (int. 0)",
            ],
            'CASSAFORTE_CAMERA' => [
                'it' => "Ogni camera è dotata di cassaforte elettronica con codice personalizzabile.\n\nIstruzioni:\n1. Aprire con la chiave master\n2. Inserire i propri oggetti\n3. Chiudere e digitare un codice a 4 cifre\n4. Confermare con «#»\n\nPer ripristino in caso di codice dimenticato: contattare la reception.",
            ],
        ];

        $regoleMap = Regola::pluck('id', 'codice');

        $count = 0;
        foreach ($valorizzazioni as $codice => $lingue) {
            $regolaId = $regoleMap->get($codice);
            if (! $regolaId) continue;

            foreach ($lingue as $lingua => $testo) {
                ValorizzazioneRegola::updateOrCreate(
                    [
                        'regola_id' => $regolaId,
                        'hotel_id'  => $hotel->id,
                        'lingua'    => $lingua,
                    ],
                    ['testo' => $testo]
                );
                $count++;
            }
        }

        $this->command->info("Valorizzazioni seeded: {$count} record per {$hotel->nome}");
    }
}
