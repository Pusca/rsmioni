/**
 * Client HTTP per le API del Kiosk (profilo chiosco).
 * Stesso pattern di portineriaApi.ts — CSRF da meta tag X-CSRF-TOKEN.
 */

function getCsrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

const headers = (): HeadersInit => ({
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-CSRF-TOKEN': getCsrfToken(),
});

// ── WebRTC — recovery e segnali ───────────────────────────────────────────

/**
 * GET /kiosk/webrtc/sessione-corrente
 * Restituisce il sessionId attivo per il chiosco corrente.
 * null se non c'è nessuna sessione attiva.
 * Usato al caricamento della pagina kiosk per recuperare sessioni
 * create mentre il browser non era ancora connesso a Reverb.
 */
export interface SessioneCorrenteResult {
    session_id: string;
    tipo: 'chiaro' | 'nascosto' | 'parlato';
}

/**
 * GET /kiosk/webrtc/sessione-corrente
 * Restituisce la sessione attiva per il chiosco corrente (session_id + tipo).
 * null se non c'è nessuna sessione attiva.
 * Usato al caricamento della pagina kiosk per recuperare sessioni create
 * mentre il browser non era ancora connesso a Reverb.
 */
export async function getSessioneCorrente(): Promise<SessioneCorrenteResult | null> {
    try {
        const res = await fetch('/kiosk/webrtc/sessione-corrente', {
            headers: { Accept: 'application/json' },
        });
        if (!res.ok) return null;
        const data = await res.json() as { session_id: string | null; tipo: string | null };
        if (!data.session_id) return null;
        return {
            session_id: data.session_id,
            tipo: (data.tipo ?? 'parlato') as 'chiaro' | 'nascosto' | 'parlato',
        };
    } catch {
        return null;
    }
}

// ── Chiamata dal chiosco ──────────────────────────────────────────────────

/**
 * POST /kiosk/chiama
 * Il guest tocca lo schermo (touch) o il campanello viene attivato (analogico).
 * Transita il chiosco da idle → in_chiamata e notifica i receptionist via Reverb.
 */
export async function chiamaReceptionist(): Promise<{ ok: boolean; stato?: string; error?: string }> {
    try {
        const res = await fetch('/kiosk/chiama', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({}),
        });
        const data = await res.json() as { stato?: string; error?: string };
        if (! res.ok) return { ok: false, error: data.error ?? 'Errore nella chiamata' };
        return { ok: true, stato: data.stato };
    } catch {
        return { ok: false, error: 'Errore di rete' };
    }
}

/**
 * POST /kiosk/annulla-chiamata
 * Annulla la chiamata in corso, torna a idle.
 * Best-effort — non mostra errori al guest.
 */
export async function annullaChiamata(): Promise<void> {
    try {
        await fetch('/kiosk/annulla-chiamata', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({}),
        });
    } catch { /* best-effort */ }
}

// ── Stato runtime — polling fallback ─────────────────────────────────────

export interface StatoChioscoResult {
    stato: string;
    messaggio_attesa: string | null;
}

/**
 * GET /kiosk/stato
 * Restituisce stato e messaggio attesa del chiosco corrente.
 * Usato come fallback quando Reverb non è disponibile.
 */
export async function getStatoChiosco(): Promise<StatoChioscoResult | null> {
    try {
        const res = await fetch('/kiosk/stato', {
            headers: { Accept: 'application/json' },
        });
        if (! res.ok) return null;
        return await res.json() as StatoChioscoResult;
    } catch {
        return null;
    }
}

// ── Acquisizione documento da webcam chiosco ─────────────────────────────

export interface AcquisizionePendenteResult {
    pendente:         true;
    prenotazione_id:  string;
    titolo:           string | null;
    lingua:           string | null;
    tipo_documento:   string | null;
}

/**
 * GET /kiosk/acquisizione-pendente
 * Il chiosco fa polling per verificare se il receptionist ha innescato un'acquisizione.
 */
export async function getAcquisizionePendente(): Promise<AcquisizionePendenteResult | null> {
    try {
        const res = await fetch('/kiosk/acquisizione-pendente', {
            headers: { Accept: 'application/json' },
        });
        if (! res.ok) return null;
        const data = await res.json() as { pendente: boolean } & Partial<AcquisizionePendenteResult>;
        if (! data.pendente) return null;
        return {
            pendente:        true,
            prenotazione_id: data.prenotazione_id ?? '',
            titolo:          data.titolo          ?? null,
            lingua:          data.lingua          ?? null,
            tipo_documento:  data.tipo_documento  ?? null,
        };
    } catch {
        return null;
    }
}

/**
 * POST /kiosk/acquisizioni
 * Carica l'immagine catturata dalla webcam del chiosco.
 */
export async function uploadDocumentoAcquisito(file: Blob): Promise<{ ok: boolean; errore?: string }> {
    try {
        const formData = new FormData();
        formData.append('file', file, 'acquisizione.jpg');

        const res = await fetch('/kiosk/acquisizioni', {
            method:  'POST',
            headers: { 'X-CSRF-TOKEN': getCsrfToken(), Accept: 'application/json' },
            body:    formData,
        });
        const data = await res.json() as { ok?: boolean; errore?: string };
        if (! res.ok) return { ok: false, errore: data.errore ?? 'Errore upload' };
        return { ok: true };
    } catch {
        return { ok: false, errore: 'Errore di rete' };
    }
}

/**
 * DELETE /kiosk/acquisizioni
 * Annulla l'acquisizione pendente (guest rifiuta o timeout).
 */
export async function annullaAcquisizione(): Promise<void> {
    try {
        await fetch('/kiosk/acquisizioni', {
            method:  'DELETE',
            headers: headers(),
        });
    } catch { /* best-effort */ }
}

// ── Stampa remota — kiosk side ────────────────────────────────────────────

export interface StampaPendenteResult {
    pendente:      true;
    documento_id:  string;
    titolo:        string | null;
}

/**
 * GET /kiosk/stampa-pendente
 * Il chiosco fa polling per verificare se il receptionist ha richiesto una stampa.
 */
export async function getStampaPendente(): Promise<StampaPendenteResult | null> {
    try {
        const res = await fetch('/kiosk/stampa-pendente', {
            headers: { Accept: 'application/json' },
        });
        if (! res.ok) return null;
        const data = await res.json() as { pendente: boolean } & Partial<StampaPendenteResult>;
        if (! data.pendente) return null;
        return {
            pendente:     true,
            documento_id: data.documento_id ?? '',
            titolo:       data.titolo        ?? null,
        };
    } catch {
        return null;
    }
}

/**
 * GET /kiosk/stampe/documento
 * Scarica il documento da stampare come blob.
 * Ritorna null in caso di errore.
 */
export async function getDocumentoPerStampa(): Promise<Blob | null> {
    try {
        const res = await fetch('/kiosk/stampe/documento', {
            headers: { Accept: '*/*' },
        });
        if (! res.ok) return null;
        return await res.blob();
    } catch {
        return null;
    }
}

/**
 * POST /kiosk/stampe/completata
 * Segnala al server l'esito della stampa.
 */
export async function segnalaStampaCompletata(
    esito: 'ok' | 'errore',
    dettaglio?: string,
): Promise<void> {
    try {
        await fetch('/kiosk/stampe/completata', {
            method:  'POST',
            headers: { ...headers(), Accept: 'application/json' },
            body:    JSON.stringify({ esito, dettaglio: dettaglio ?? null }),
        });
    } catch { /* best-effort */ }
}

/**
 * DELETE /kiosk/stampe
 * Annulla la stampa pendente (timeout o errore irrecuperabile).
 */
export async function annullaStampa(): Promise<void> {
    try {
        await fetch('/kiosk/stampe', {
            method:  'DELETE',
            headers: headers(),
        });
    } catch { /* best-effort */ }
}

// ── Pagamento POS remoto — kiosk side ────────────────────────────────────────

export interface PagamentoPendenteResult {
    pendente:      true;
    pagamento_id:  string;
    importo:       number;
    valuta:        string;
    causale:       string | null;
    tipo_pos:      string;
}

/**
 * GET /kiosk/pagamento-pendente
 * Il chiosco fa polling per verificare se il receptionist ha richiesto un pagamento POS.
 */
export async function getPagamentoPendente(): Promise<PagamentoPendenteResult | null> {
    try {
        const res = await fetch('/kiosk/pagamento-pendente', {
            headers: { Accept: 'application/json' },
        });
        if (! res.ok) return null;
        const data = await res.json() as { pendente: boolean } & Partial<PagamentoPendenteResult>;
        if (! data.pendente) return null;
        return {
            pendente:     true,
            pagamento_id: data.pagamento_id ?? '',
            importo:      data.importo      ?? 0,
            valuta:       data.valuta       ?? 'EUR',
            causale:      data.causale      ?? null,
            tipo_pos:     data.tipo_pos     ?? 'ingenico',
        };
    } catch {
        return null;
    }
}

/**
 * POST /kiosk/pagamenti/esito
 * Segnala al server l'esito dell'operazione POS.
 */
export async function segnalaEsitoPagamento(
    esito: 'ok' | 'ko' | 'annullato',
    importo_effettivo?: number,
): Promise<{ ok: boolean; errore?: string }> {
    try {
        const res = await fetch('/kiosk/pagamenti/esito', {
            method:  'POST',
            headers: { ...headers(), Accept: 'application/json' },
            body:    JSON.stringify({ esito, importo_effettivo: importo_effettivo ?? null }),
        });
        const data = await res.json() as { ok?: boolean; errore?: string };
        if (! res.ok) return { ok: false, errore: data.errore ?? 'Errore invio esito' };
        return { ok: true };
    } catch {
        return { ok: false, errore: 'Errore di rete' };
    }
}

/**
 * DELETE /kiosk/pagamenti
 * Annulla il pagamento pendente (guest rifiuta o timeout).
 */
export async function annullaPagamento(): Promise<void> {
    try {
        await fetch('/kiosk/pagamenti', {
            method:  'DELETE',
            headers: headers(),
        });
    } catch { /* best-effort */ }
}

// ── WebRTC — segnali dal chiosco verso il receptionist ─────────────────────

/**
 * POST /kiosk/webrtc/signal
 * Relay di un segnale WebRTC dal browser chiosco verso il receptionist.
 * Tipi ammessi: chiosco_ready, answer, ice-candidate.
 */
export async function inviaSignalChiosco(
    sessionId: string,
    tipo: 'chiosco_ready' | 'answer' | 'ice-candidate',
    payload: Record<string, unknown>,
): Promise<void> {
    try {
        const res = await fetch('/kiosk/webrtc/signal', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ session_id: sessionId, tipo, payload }),
        });
        if (!res.ok) {
            console.warn('[WebRTC-K] signal send failed:', res.status, tipo);
        }
    } catch { /* best-effort, network error — ignora */ }
}
