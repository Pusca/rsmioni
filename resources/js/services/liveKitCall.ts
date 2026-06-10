import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';

/**
 * Gestore SINGLETON multi-room delle videochiamate LiveKit del receptionist.
 *
 * Tiene N chiamate (una Room per chiosco) CONNESSE insieme (fino a ~8), così il
 * passaggio da una all'altra non richiede riconnessione → quasi istantaneo.
 * Il receptionist pubblica camera/microfono SOLO nella chiamata "attiva"; le
 * altre restano connesse ma in attesa (il loro chiosco mostra "un momento…").
 *
 * Vive a livello di modulo → sopravvive alla navigazione tra pagine Inertia.
 * I componenti sono viste: si sottoscrivono allo snapshot e attaccano le track.
 */

export type TipoCall  = 'chiaro' | 'nascosto' | 'parlato';
export type StatoCall  = 'connecting' | 'connected' | 'error';

interface CallEntry {
    room:             Room;
    sessionId:        string;
    tipo:             TipoCall;
    chioscoId:        string;
    chioscoNome:      string;
    stato:            StatoCall;
    remoteVideoTrack: RemoteTrack | null;
    hiddenVideo:      HTMLVideoElement | null;
    condivisione:     boolean; // schermo condiviso ricevuto (lato chiosco)
    remoteVer:        number;
}

// ── Stato modulo ──────────────────────────────────────────────────────────
const calls = new Map<string, CallEntry>(); // key: chioscoId
let activeChioscoId: string | null = null;
let condivisioneLocale = false;              // schermo condiviso dal receptionist (nell'attiva)

// ── Snapshot per React (useSyncExternalStore) ───────────────────────────────
export interface PublicCall {
    chioscoId:    string;
    stato:        StatoCall;
    tipo:         TipoCall;
    chioscoNome:  string;
    sessionId:    string;
    condivisione: boolean;
    remoteVer:    number;
    attiva:       boolean;
}
export interface Snapshot {
    activeChioscoId:    string | null;
    condivisioneLocale: boolean;
    ver:                number;
    calls:              Record<string, PublicCall>;
}

let snapshot: Snapshot = { activeChioscoId: null, condivisioneLocale: false, ver: 0, calls: {} };
const listeners = new Set<() => void>();

function rebuild() {
    const c: Record<string, PublicCall> = {};
    calls.forEach((e, id) => {
        c[id] = {
            chioscoId: id, stato: e.stato, tipo: e.tipo, chioscoNome: e.chioscoNome, sessionId: e.sessionId,
            condivisione: e.condivisione, remoteVer: e.remoteVer, attiva: id === activeChioscoId,
        };
    });
    snapshot = { activeChioscoId, condivisioneLocale, ver: snapshot.ver + 1, calls: c };
    listeners.forEach((l) => l());
}

export function subscribe(cb: () => void): () => void {
    listeners.add(cb);
    return () => { listeners.delete(cb); };
}
export function getSnapshot(): Snapshot { return snapshot; }

// ── Util ────────────────────────────────────────────────────────────────────
function getCsrf(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

async function fetchToken(sessionId: string): Promise<{ url: string; token: string } | null> {
    try {
        const res = await fetch('/portineria/livekit/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-CSRF-TOKEN': getCsrf() },
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

function ensureHiddenVideo(entry: CallEntry): HTMLVideoElement {
    if (!entry.hiddenVideo) {
        const v = document.createElement('video');
        v.muted = true; v.autoplay = true; v.playsInline = true;
        v.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:-9999px;';
        document.body.appendChild(v);
        entry.hiddenVideo = v;
    }
    return entry.hiddenVideo;
}

function sendTo(room: Room, topic: string) {
    try {
        room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify({ topic })), { reliable: true });
    } catch { /* ignore */ }
}

// ── Avvio / cambio chiamata ─────────────────────────────────────────────────
export async function startCall(opts: {
    sessionId: string; tipo: TipoCall; chioscoId: string; chioscoNome: string;
}): Promise<void> {
    const existing = calls.get(opts.chioscoId);
    if (existing && existing.sessionId === opts.sessionId && existing.tipo === opts.tipo) {
        await setActive(opts.chioscoId); // già presente → rendila attiva
        return;
    }
    if (existing) {
        await stopCall(opts.chioscoId); // sessione/tipo cambiati → ricrea
    }

    const cred = await fetchToken(opts.sessionId);
    if (!cred) {
        // entry in errore minima
        calls.set(opts.chioscoId, {
            room: new Room(), sessionId: opts.sessionId, tipo: opts.tipo, chioscoId: opts.chioscoId,
            chioscoNome: opts.chioscoNome, stato: 'error', remoteVideoTrack: null, hiddenVideo: null,
            condivisione: false, remoteVer: 0,
        });
        rebuild();
        return;
    }

    const room = new Room({ adaptiveStream: true, dynacast: true });
    const entry: CallEntry = {
        room, sessionId: opts.sessionId, tipo: opts.tipo, chioscoId: opts.chioscoId,
        chioscoNome: opts.chioscoNome, stato: 'connecting', remoteVideoTrack: null, hiddenVideo: null,
        condivisione: false, remoteVer: 0,
    };
    calls.set(opts.chioscoId, entry);
    rebuild();

    const setRemote = (track: RemoteTrack) => {
        if (track.kind !== Track.Kind.Video) { if (track.kind === Track.Kind.Audio) track.attach(); return; }
        entry.remoteVideoTrack = track;
        track.attach(ensureHiddenVideo(entry));
        if (track.source === Track.Source.ScreenShare) entry.condivisione = true;
        entry.stato = 'connected';
        entry.remoteVer += 1;
        rebuild();
    };

    room
        .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => setRemote(track))
        .on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
            if (track.source === Track.Source.ScreenShare) { entry.condivisione = false; rebuild(); }
            if (track === entry.remoteVideoTrack) entry.remoteVideoTrack = null;
        })
        .on(RoomEvent.Disconnected, () => {
            if (calls.get(opts.chioscoId) === entry) { calls.delete(opts.chioscoId); if (activeChioscoId === opts.chioscoId) activeChioscoId = null; rebuild(); }
        });

    try {
        await room.connect(cred.url, cred.token);
        if (calls.get(opts.chioscoId) !== entry) { room.disconnect(); return; } // superata
        if (entry.stato === 'connecting') { entry.stato = 'connected'; }

        // track remote già presenti
        room.remoteParticipants.forEach((p) => p.trackPublications.forEach((pub) => { if (pub.track) setRemote(pub.track as RemoteTrack); }));

        rebuild();
        await setActive(opts.chioscoId); // la nuova chiamata diventa attiva
    } catch (err) {
        console.error('[LiveKitCall] connessione fallita', err);
        if (calls.get(opts.chioscoId) === entry) { entry.stato = 'error'; rebuild(); }
    }
}

/** Rende attiva una chiamata: pubblica camera/mic in quella, le toglie dalla precedente. */
export async function setActive(chioscoId: string | null): Promise<void> {
    if (activeChioscoId === chioscoId) return;

    // Disattiva la precedente
    const prev = activeChioscoId ? calls.get(activeChioscoId) : null;
    if (prev) {
        try { await prev.room.localParticipant.setScreenShareEnabled(false); } catch { /* ignore */ }
        try { await prev.room.localParticipant.setCameraEnabled(false); } catch { /* ignore */ }
        try { await prev.room.localParticipant.setMicrophoneEnabled(false); } catch { /* ignore */ }
        sendTo(prev.room, 'attesa_on'); // il chiosco mostra "un momento…"
    }

    activeChioscoId = chioscoId;
    condivisioneLocale = false;

    const next = chioscoId ? calls.get(chioscoId) : null;
    if (next) {
        sendTo(next.room, 'attesa_off');
        try {
            if (next.tipo !== 'nascosto') await next.room.localParticipant.setCameraEnabled(true);
            if (next.tipo === 'parlato')  await next.room.localParticipant.setMicrophoneEnabled(true);
        } catch (e) { console.warn('[LiveKitCall] pubblicazione attiva fallita', e); }
    }
    rebuild();
}

export async function stopCall(chioscoId: string): Promise<void> {
    const e = calls.get(chioscoId);
    if (!e) return;
    calls.delete(chioscoId);
    if (activeChioscoId === chioscoId) activeChioscoId = null;
    try { e.room.disconnect(); } catch { /* ignore */ }
    if (e.hiddenVideo && e.hiddenVideo.parentNode) e.hiddenVideo.parentNode.removeChild(e.hiddenVideo);
    if (calls.size === 0) condivisioneLocale = false;
    rebuild();
}

export async function stopActive(): Promise<void> {
    if (activeChioscoId) await stopCall(activeChioscoId);
}

// ── Attach video ────────────────────────────────────────────────────────────
export function attachRemote(el: HTMLVideoElement | null, chioscoId?: string) {
    const id = chioscoId ?? activeChioscoId;
    if (!el || !id) return;
    const e = calls.get(id);
    if (e?.remoteVideoTrack) e.remoteVideoTrack.attach(el);
}

export function attachLocal(el: HTMLVideoElement | null, chioscoId?: string) {
    const id = chioscoId ?? activeChioscoId;
    if (!el || !id) return;
    const e = calls.get(id);
    const pub = e?.room.localParticipant.getTrackPublication(Track.Source.Camera);
    if (pub?.track) pub.track.attach(el);
}

// ── Condivisione schermo (sull'attiva) ──────────────────────────────────────
export async function startScreenShare(): Promise<boolean> {
    const e = activeChioscoId ? calls.get(activeChioscoId) : null;
    if (!e || e.tipo === 'nascosto') return false;
    try { await e.room.localParticipant.setScreenShareEnabled(true); condivisioneLocale = true; rebuild(); return true; }
    catch (err) { console.warn('[LiveKitCall] screen share fallita/annullata', err); return false; }
}
export async function stopScreenShare(): Promise<void> {
    const e = activeChioscoId ? calls.get(activeChioscoId) : null;
    if (!e) return;
    try { await e.room.localParticipant.setScreenShareEnabled(false); } catch { /* ignore */ }
    condivisioneLocale = false; rebuild();
}

// ── Messaggio dati al chiosco (default: attivo) ─────────────────────────────
export function sendData(topic: string, chioscoId?: string): void {
    const id = chioscoId ?? activeChioscoId;
    const e = id ? calls.get(id) : null;
    if (e) sendTo(e.room, topic);
}

// ── Cattura fotogramma dal video del chiosco (default: attivo) ──────────────
export async function captureRemoteFrame(chioscoId?: string): Promise<Blob | null> {
    const id = chioscoId ?? activeChioscoId;
    const e = id ? calls.get(id) : null;
    const v = e?.hiddenVideo;
    if (!v || !v.videoWidth) return null;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92));
}
