import { StatoChiosco } from '@/types';

/**
 * Client HTTP per le API della Portineria.
 * Usa fetch + cookie di sessione (autenticazione Inertia/Laravel standard).
 *
 * CSRF: leggiamo il token dal meta tag "csrf-token" generato da {{ csrf_token() }}
 * in app.blade.php. Più affidabile del cookie XSRF-TOKEN (sempre presente, non
 * dipende dalla configurazione del middleware cookie).
 * Header: X-CSRF-TOKEN (accettato da Laravel VerifyCsrfToken middleware).
 */
function getCsrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

const headers = (): HeadersInit => ({
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-CSRF-TOKEN': getCsrfToken(),
});

// ── Transizioni di stato ───────────────────────────────────────────────────

export interface TransizioneResult {
    ok: boolean;
    stato?: StatoChiosco;
    messaggio?: string | null;
    error?: string;
}

/**
 * PATCH /portineria/chioschi/{id}/stato
 * Richiede una transizione di stato al backend.
 */
export async function cambiaStato(
    chioscoId: string,
    stato: StatoChiosco,
    messaggio?: string,
): Promise<TransizioneResult> {
    try {
        const res = await fetch(`/portineria/chioschi/${chioscoId}/stato`, {
            method: 'PATCH',
            headers: headers(),
            body: JSON.stringify({ stato, messaggio: messaggio ?? null }),
        });

        const data = await res.json();

        if (!res.ok) {
            return { ok: false, error: data.error ?? 'Errore server' };
        }

        return { ok: true, stato: data.stato, messaggio: data.messaggio };
    } catch {
        return { ok: false, error: 'Errore di rete' };
    }
}

// ── WebRTC — parlato ──────────────────────────────────────────────────────

export interface SessioneParlato {
    session_id: string;
    chiosco_id: string;
}

/**
 * POST /portineria/webrtc/sessione
 * Crea una sessione WebRTC e transisce il chiosco in in_parlato.
 * Richiede che il chiosco sia attualmente in_chiaro.
 */
export async function creaSessioneParlato(
    chioscoId: string,
): Promise<{ ok: true; data: SessioneParlato } | { ok: false; error: string }> {
    try {
        const res = await fetch('/portineria/webrtc/sessione', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ chiosco_id: chioscoId }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error ?? 'Errore server' };
        return { ok: true, data: data as SessioneParlato };
    } catch {
        return { ok: false, error: 'Errore di rete' };
    }
}

/**
 * POST /portineria/webrtc/signal
 * Relay di un messaggio SDP/ICE al peer remoto via Reverb.
 */
export type TipoSignalWebRtc =
    | 'offer'
    | 'answer'
    | 'ice-candidate'
    | 'screen_share_started'
    | 'screen_share_stopped';

export async function inviaSignalWebRtc(
    sessionId: string,
    tipo: TipoSignalWebRtc,
    payload: Record<string, unknown>,
): Promise<void> {
    try {
        await fetch('/portineria/webrtc/signal', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ session_id: sessionId, tipo, payload }),
        });
    } catch { /* best-effort */ }
}

/**
 * POST /portineria/webrtc/chiudi
 * Chiude la sessione e riporta il chiosco in in_chiaro.
 */
export async function chiudiSessioneParlato(
    sessionId: string,
    chioscoId: string,
): Promise<{ ok: boolean; error?: string }> {
    try {
        const res = await fetch('/portineria/webrtc/chiudi', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ session_id: sessionId, chiosco_id: chioscoId }),
        });
        const data = await res.json();
        return res.ok ? { ok: true } : { ok: false, error: data.error };
    } catch {
        return { ok: false, error: 'Errore di rete' };
    }
}

// ── Media — sessioni chiaro/nascosto ──────────────────────────────────────

export type TipoCollegamento = 'chiaro' | 'nascosto';

export interface SessioneCollegamento {
    session_id: string;
    chiosco_id: string;
    tipo:       TipoCollegamento;
}

/**
 * POST /portineria/media/sessione
 * Crea una sessione media per collegamento in chiaro o in nascosto.
 * Richiede che il chiosco sia già nello stato corrispondente.
 */
export async function creaSessioneCollegamento(
    chioscoId: string,
    tipo: TipoCollegamento,
): Promise<{ ok: true; data: SessioneCollegamento } | { ok: false; error: string }> {
    try {
        const res = await fetch('/portineria/media/sessione', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ chiosco_id: chioscoId, tipo }),
        });
        const data = await res.json();
        if (!res.ok) return { ok: false, error: data.error ?? 'Errore server' };
        return { ok: true, data: data as SessioneCollegamento };
    } catch {
        return { ok: false, error: 'Errore di rete' };
    }
}

/**
 * POST /portineria/media/chiudi
 * Chiude una sessione media chiaro/nascosto senza cambiare lo StatoChiosco.
 */
export async function chiudiSessioneCollegamento(
    sessionId: string,
    chioscoId: string,
): Promise<void> {
    try {
        await fetch('/portineria/media/chiudi', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ session_id: sessionId, chiosco_id: chioscoId }),
        });
    } catch { /* best-effort */ }
}

// ── Demo / testing ─────────────────────────────────────────────────────────

export interface DemoSimulaResult {
    ok: boolean;
    error?: string;
}

/**
 * POST /portineria/demo/simula
 * Forza uno stato su un chiosco (solo in APP_ENV=local).
 */
export async function demoSimula(
    chioscoId: string,
    stato: StatoChiosco,
    messaggio?: string,
): Promise<DemoSimulaResult> {
    try {
        const res = await fetch('/portineria/demo/simula', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ chiosco_id: chioscoId, stato, messaggio }),
        });

        const data = await res.json();
        return res.ok ? { ok: true } : { ok: false, error: data.error };
    } catch {
        return { ok: false, error: 'Errore di rete' };
    }
}

/**
 * POST /portineria/demo/reset
 * Riporta tutti i chioschi a idle.
 */
export async function demoReset(): Promise<DemoSimulaResult> {
    try {
        const res = await fetch('/portineria/demo/reset', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({}),
        });
        const data = await res.json();
        return res.ok ? { ok: true } : { ok: false, error: data.error };
    } catch {
        return { ok: false, error: 'Errore di rete' };
    }
}
