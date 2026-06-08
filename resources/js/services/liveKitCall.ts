import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';

/**
 * Gestore SINGLETON della videochiamata LiveKit del receptionist.
 *
 * Vive a livello di modulo (fuori dall'albero React), quindi la `Room`
 * sopravvive alla navigazione tra pagine Inertia (es. Portineria → Prenotazioni).
 * I componenti (AreaVideo a tutto schermo, PiP flottante) sono solo "viste":
 * si sottoscrivono allo stato e attaccano le track ai propri <video>.
 *
 * Tipi sessione:
 *   - chiaro:   receptionist pubblica webcam, vede il chiosco
 *   - nascosto: receptionist NON pubblica (canPublish=false lato token), solo visione
 *   - parlato:  receptionist pubblica webcam + microfono
 */

export type TipoCall = 'chiaro' | 'nascosto' | 'parlato';
export type StatoCall = 'idle' | 'connecting' | 'connected' | 'error';

export interface CallState {
    stato:        StatoCall;
    tipo:         TipoCall | null;
    sessionId:    string | null;
    chioscoId:    string | null;
    chioscoNome:  string | null;
    condivisione:        boolean; // schermo condiviso ricevuto (remoto)
    condivisioneLocale:  boolean; // schermo condiviso dal receptionist (locale)
    errore:       string | null;
}

const STATE_INIZIALE: CallState = {
    stato: 'idle', tipo: null, sessionId: null, chioscoId: null,
    chioscoNome: null, condivisione: false, condivisioneLocale: false, errore: null,
};

let room: Room | null = null;
let state: CallState = { ...STATE_INIZIALE };
const listeners = new Set<() => void>();

// Track remota corrente + <video> nascosto sempre agganciato ad essa: serve a
// (a) tenere viva la decodifica per la cattura documento, (b) permettere lo
// snapshot anche quando nessun elemento visibile è montato.
let remoteVideoTrack: RemoteTrack | null = null;
let hiddenVideo: HTMLVideoElement | null = null;

function ensureHiddenVideo(): HTMLVideoElement {
    if (!hiddenVideo) {
        hiddenVideo = document.createElement('video');
        hiddenVideo.muted = true;
        hiddenVideo.autoplay = true;
        hiddenVideo.playsInline = true;
        hiddenVideo.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;';
        document.body.appendChild(hiddenVideo);
    }
    return hiddenVideo;
}

function emit(patch: Partial<CallState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
}

export function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}

export function getState(): CallState {
    return state;
}

function getCsrf(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

async function fetchToken(sessionId: string): Promise<{ url: string; token: string } | null> {
    try {
        const res = await fetch('/portineria/livekit/token', {
            method:  'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept':       'application/json',
                'X-CSRF-TOKEN': getCsrf(),
            },
            body: JSON.stringify({ session_id: sessionId }),
        });
        if (!res.ok) { console.warn('[LiveKitCall] token error', res.status); return null; }
        const data = await res.json();
        if (!data.url || !data.token) return null;
        return { url: data.url, token: data.token };
    } catch (e) {
        console.warn('[LiveKitCall] fetch token fallita', e);
        return null;
    }
}

function attachRemoteToHidden(track: RemoteTrack) {
    remoteVideoTrack = track;
    if (track.kind === Track.Kind.Video) {
        track.attach(ensureHiddenVideo());
    }
}

/**
 * Avvia (o cambia) la chiamata. Idempotente: se è già attiva la stessa
 * sessione+tipo non fa nulla. Se cambia, chiude la precedente e riparte.
 */
export async function startCall(opts: {
    sessionId: string;
    tipo: TipoCall;
    chioscoId: string;
    chioscoNome: string;
}): Promise<void> {
    if (room && state.sessionId === opts.sessionId && state.tipo === opts.tipo
        && (state.stato === 'connected' || state.stato === 'connecting')) {
        return; // già attiva
    }

    await stopCall();

    emit({
        stato: 'connecting', tipo: opts.tipo, sessionId: opts.sessionId,
        chioscoId: opts.chioscoId, chioscoNome: opts.chioscoNome,
        condivisione: false, errore: null,
    });

    const cred = await fetchToken(opts.sessionId);
    // Se nel frattempo la chiamata è cambiata/chiusa, abortisci
    if (state.sessionId !== opts.sessionId) return;
    if (!cred) {
        emit({ stato: 'error', errore: 'Token LiveKit non disponibile.' });
        return;
    }

    const r = new Room({ adaptiveStream: true, dynacast: true });
    room = r;

    r.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Video) {
            attachRemoteToHidden(track);
            if (track.source === Track.Source.ScreenShare) emit({ condivisione: true });
            emit({ stato: 'connected' });
        }
        if (track.kind === Track.Kind.Audio) track.attach();
    });
    r.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.source === Track.Source.ScreenShare) emit({ condivisione: false });
        if (track === remoteVideoTrack) remoteVideoTrack = null;
    });
    r.on(RoomEvent.Disconnected, () => {
        if (room === r) {
            room = null;
            remoteVideoTrack = null;
            emit({ ...STATE_INIZIALE });
        }
    });

    try {
        await r.connect(cred.url, cred.token);
        if (room !== r) { r.disconnect(); return; } // superata da un'altra start/stop
        console.log('[LiveKitCall] connesso', opts.sessionId, opts.tipo);

        if (opts.tipo === 'chiaro' || opts.tipo === 'parlato') {
            await r.localParticipant.setCameraEnabled(true);
            if (opts.tipo === 'parlato') {
                await r.localParticipant.setMicrophoneEnabled(true);
            }
        }

        // Track remote già presenti (chiosco entrato per primo)
        r.remoteParticipants.forEach((p) => {
            p.trackPublications.forEach((pub) => {
                if (pub.track) {
                    const t = pub.track as RemoteTrack;
                    if (t.kind === Track.Kind.Video) attachRemoteToHidden(t);
                    if (t.kind === Track.Kind.Audio) t.attach();
                }
            });
        });

        if (state.stato === 'connecting') emit({ stato: 'connected' });
    } catch (err) {
        console.error('[LiveKitCall] connessione fallita', err);
        if (room === r) { room = null; emit({ stato: 'error', errore: 'Connessione fallita.' }); }
    }
}

export async function stopCall(): Promise<void> {
    const r = room;
    room = null;
    remoteVideoTrack = null;
    if (r) {
        try { r.disconnect(); } catch { /* ignore */ }
    }
    if (state.stato !== 'idle') emit({ ...STATE_INIZIALE });
}

/** Attacca la track video remota a un <video> visibile. */
export function attachRemote(el: HTMLVideoElement | null) {
    if (el && remoteVideoTrack && remoteVideoTrack.kind === Track.Kind.Video) {
        remoteVideoTrack.attach(el);
    }
}

/** Attacca la webcam locale del receptionist a un <video> visibile. */
export function attachLocal(el: HTMLVideoElement | null) {
    if (!el || !room) return;
    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (pub?.track) pub.track.attach(el);
}

export async function startScreenShare(): Promise<boolean> {
    if (!room || state.tipo === 'nascosto') return false;
    try {
        await room.localParticipant.setScreenShareEnabled(true);
        emit({ condivisioneLocale: true });
        return true;
    } catch (e) {
        console.warn('[LiveKitCall] screen share fallita/annullata', e);
        return false;
    }
}

export async function stopScreenShare(): Promise<void> {
    if (!room) return;
    try { await room.localParticipant.setScreenShareEnabled(false); } catch { /* ignore */ }
    emit({ condivisioneLocale: false });
}

/** Invia un messaggio dati (topic) agli altri partecipanti (es. il chiosco). */
export function sendData(topic: string): void {
    if (!room) return;
    try {
        const payload = new TextEncoder().encode(JSON.stringify({ topic }));
        room.localParticipant.publishData(payload, { reliable: true });
    } catch (e) {
        console.warn('[LiveKitCall] publishData fallita', e);
    }
}

/** Cattura un fotogramma dal video remoto (chiosco) come JPEG Blob. */
export async function captureRemoteFrame(): Promise<Blob | null> {
    const v = hiddenVideo;
    if (!v || !v.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width  = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
    });
}
