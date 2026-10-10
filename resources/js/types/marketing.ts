/**
 * RS Mioni — tipi del modulo Marketing (specchio di App\Services\MarketingService::dashboard()).
 * Le metriche di piattaforma sono `null` finché non vengono caricate: la UI mostra "—", non 0.
 */

export type Piattaforma = 'facebook' | 'instagram' | 'google' | 'youtube' | 'display' | 'retargeting' | 'altro';
export type StatoCampagna = 'bozza' | 'attiva' | 'in_pausa' | 'conclusa';
export type StatoLead = 'nuovo' | 'contattato' | 'qualificato' | 'appuntamento' | 'cliente' | 'perso';
export type StatoAppuntamento = 'programmato' | 'confermato' | 'completato' | 'annullato' | 'no_show';
export type Attore = 'chip' | 'umano' | 'cliente';

export interface KpiMarketing {
    budget: number | null;
    speso: number | null;
    budget_pct: number | null;
    impression: number | null;
    click: number | null;
    ctr: number | null;
    lead: number;
    lead_attivi: number;
    cpl: number | null;
    appuntamenti: number;
    lead_con_appuntamento: number;
    tasso_lead_app: number | null;
    cpa: number | null;
    appuntamenti_spostati: number;
    appuntamenti_chip: number;
    clienti: number;
    tasso_app_cliente: number | null;
}

export interface StadioFunnel {
    chiave: 'impression' | 'click' | 'lead' | 'appuntamenti' | 'clienti';
    label: string;
    valore: number | null;
}

export interface LeadPerStato {
    stato: StatoLead;
    label: string;
    totale: number;
}

export interface RiepilogoPiattaforma {
    piattaforma: Piattaforma;
    label: string;
    campagne: number;
    budget: number | null;
    speso: number | null;
    impression: number | null;
    click: number | null;
    lead: number;
}

export interface CampagnaRow {
    id: string;
    codice: string;
    nome: string;
    piattaforma: Piattaforma;
    piattaforma_label: string;
    obiettivo: string | null;
    stato: StatoCampagna;
    stato_label: string;
    budget: number | null;
    speso: number | null;
    budget_pct: number | null;
    impression: number | null;
    click: number | null;
    ctr: number | null;
    lead_dichiarati: number | null;
    lead: number;
    cpl: number | null;
    contenuti_ai: boolean;
    data_inizio: string | null;
    data_fine: string | null;
    note: string | null;
}

export interface LeadRow {
    id: string;
    codice: string;
    struttura: string;
    referente: string | null;
    citta: string | null;
    telefono: string | null;
    email: string | null;
    fonte: Piattaforma | string | null;
    fonte_label: string | null;
    campagna: string | null;
    stato: StatoLead;
    stato_label: string;
    gestito_da: 'chip' | 'umano' | string;
    ricevuto_at: string | null;   // "YYYY-MM-DD HH:mm" ora italiana
    note: string | null;
}

export interface AppuntamentoRow {
    id: string;
    codice: string;
    lead_id: string;
    struttura: string | null;
    referente: string | null;
    citta: string | null;
    inizio: string | null;             // "YYYY-MM-DD HH:mm"
    inizio_originale: string | null;   // valorizzato se spostato
    spostato: boolean;
    durata_minuti: number;
    tipo: 'demo_online' | 'visita' | 'chiamata' | string;
    stato: StatoAppuntamento;
    stato_label: string;
    gestito_da: 'chip_whatsapp' | 'umano' | string;
    note: string | null;
    futuro: boolean;
}

export interface EventoRow {
    id: string;
    tipo: string;
    attore: Attore | string;
    descrizione: string;
    avvenuto_at: string | null;
    struttura: string | null;
}

export interface MarketingDashboardProps {
    kpi: KpiMarketing;
    funnel: StadioFunnel[];
    lead_per_stato: LeadPerStato[];
    per_piattaforma: RiepilogoPiattaforma[];
    campagne: CampagnaRow[];
    lead: LeadRow[];
    appuntamenti: AppuntamentoRow[];
    eventi: EventoRow[];
    meta: {
        adesso: string;
        aggiornato_al: string | null;
        fonte_dati: 'import_manuale' | 'api';
    };
    profilo: string;
}
