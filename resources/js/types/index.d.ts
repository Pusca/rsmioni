/**
 * RS Mioni — TypeScript global types
 */

// Profili utente (specchiati dall'enum PHP App\Enums\Profilo)
export type Profilo =
    | 'receptionist'
    | 'receptionist_lite'
    | 'chiosco'
    | 'gestore_hotel'
    | 'gestore_receptionist'
    | 'admin';

// Tipo chiosco
export type TipoChiosco = 'touch' | 'analogico';

// Tipo POS
export type TipoPOS = 'ingenico' | 'mypos' | null;

// Stato chiosco runtime (gestito in Cache/Redis, non persistito in DB)
// Specchio di App\Enums\StatoChiosco
export type StatoChiosco =
    | 'offline'
    | 'idle'
    | 'in_chiamata'
    | 'in_chiaro'
    | 'in_nascosto'
    | 'in_parlato'          // M2 — WebRTC
    | 'messaggio_attesa';

// Tipo pagamento prenotazione
export type TipoPagamento = 'gia_pagato' | 'da_pagare';

// Stato documento identità
export type StatoDocumentoIdentita = 'gia_fornito' | 'da_acquisire';

// Contesto documento
export type ContestoDocumento = 'prenotazione' | 'camera' | 'regola';

// Categoria regola
export type CategoriaRegola = 'generale' | 'turistica' | 'supporto' | 'sicurezza';

// Esito POS
export type EsitoPOS = 'pending' | 'ok' | 'ko' | 'no_file';

// ──────────────────────────────────────────────
// Entità di dominio (shape dei dati passati da Inertia come props)
// ──────────────────────────────────────────────

export interface Hotel {
    id: string;
    nome: string;
    indirizzo: string | null;
    giorni_visibilita_calendario: number;
    overbooking_permesso: boolean;
    chioschi_concorrenti_max: number;
}

export interface Chiosco {
    id: string;
    hotel_id: string;
    nome: string;
    tipo: TipoChiosco;
    interattivo: boolean;
    has_pos: boolean;
    tipo_pos: TipoPOS;
    has_stampante: boolean;
    attivo: boolean;
    ip_address: string | null;
    hotel?: Hotel;
}

/** Chiosco arricchito con stato runtime (usato in Portineria) */
export interface ChioscoConStato extends Chiosco {
    stato: StatoChiosco;
    messaggio_attesa: string | null;
}

export interface Utente {
    id: string;
    username: string;
    email: string;
    profilo: Profilo;
    hotel_ids: string[];
}

export interface Camera {
    id: string;
    hotel_id: string;
    nome: string;
    tipo: string;
    piano: number;
    booking_consentito: boolean;
    letti_matrimoniali: number;
    letti_singoli: number;
    letti_aggiunti: number;
    divani_letto_singoli: number;
    divani_letto_matrimoniali: number;
    culle: number;
    doccia: boolean;
    vasca: boolean;
    minibar: boolean;
    minibar_pieno: boolean;
    aria_condizionata: boolean;
    quadro_elettrico: string | null;
    codice_chiave: string | null;
    mq: number | null;
    hotel?: { id: string; nome: string };
}

/** Camera arricchita con flag disponibile (da CameraService::camereConDisponibilita) */
export interface CameraConDisponibilita extends Camera {
    disponibile: boolean;
}

export interface PaxDettaglio {
    adulti: number;
    ragazzi: number;
    bambini: number;
}

export interface Prenotazione {
    id: string;
    hotel_id: string;
    codice: string | null;
    check_in: string;
    check_out: string | null;
    pax: PaxDettaglio;
    nome: string | null;
    cognome: string | null;
    gruppo: string | null;
    tipo_pagamento: TipoPagamento;
    documento_identita: StatoDocumentoIdentita;
    checkin_confermato: boolean;
    checkin_confermato_at: string | null;
    prezzo: number | null;
    overbooking: boolean;
    inserito_da_profilo: Profilo;
    camere: Camera[];
}

export interface Documento {
    id: string;
    contesto_tipo: ContestoDocumento;
    contesto_id: string;
    titolo: string | null;
    lingua: string | null;
    tipo_documento: string | null;
    estensione: 'pdf' | 'png' | 'jpg' | 'jpeg';
    inserito_da_profilo: Profilo;
    created_at: string;
}

export interface Regola {
    id: string;
    codice: string;
    categoria: CategoriaRegola;
    ordine: number;
    testo?: string | null;
    documenti?: Documento[];
}

// ──────────────────────────────────────────────
// Generici paginazione Laravel (Inertia)
// ──────────────────────────────────────────────

export interface PaginatedLink {
    url: string | null;
    label: string;
    active: boolean;
}

export interface Paginated<T> {
    data: T[];
    current_page: number;
    last_page: number;
    per_page: number;
    total: number;
    from: number | null;
    to: number | null;
    links: PaginatedLink[];
    path: string;
    first_page_url: string;
    last_page_url: string;
    next_page_url: string | null;
    prev_page_url: string | null;
}

/** Subset dell'Hotel usato nei form prenotazioni */
export interface HotelConfig {
    id: string;
    nome: string;
    overbooking_permesso: boolean;
    giorni_visibilita_calendario: number;
}

// ──────────────────────────────────────────────
// Inertia shared props (passate dal middleware HandleInertiaRequests)
// Deve estendere Record<string, unknown> per soddisfare il vincolo di usePage<T>.
// ──────────────────────────────────────────────
export interface SharedProps extends Record<string, unknown> {
    auth: {
        utente: Utente | null;
    };
    flash: {
        success?: string;
        error?: string;
    };
}
