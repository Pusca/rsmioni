import {
    Room, RoomEvent, Track, VideoPresets,
    type RemoteParticipant, type RemoteTrack, type RemoteTrackPublication, type TrackPublication,
} from 'livekit-client';
import { useSyncExternalStore } from 'react';

/**
 * Presenza — il canale "sempre acceso" tra Portineria e chioschi (docs/11).
 *
 * Una stanza LiveKit per hotel ("presenza-{hotelId}"), separata dalle sessioni
 * di chiamata. Finché il receptionist è operativo:
 *   - pubblica la propria webcam → sui chioschi è grande e centrale, muta;
 *   - riceve la webcam di OGNI chiosco → griglia live nella colonna destra;
 *   - accende il microfono verso UN solo chiosco alla volta (`parlaCon`): la
 *     voce arriva solo a quel chiosco (permessi di sottoscrizione per track),
 *     e a quel chiosco viene chiesto di accendere il suo microfono.
 *
 * Singleton a livello di modulo: sopravvive alla navigazione tra pagine
 * Inertia; si spegne alla chiusura della pagina (o con ferma()).
 */

const IDENT_KIOSK = 'presenza-kiosk-';
const TOPIC       = 'presenza';

const rooms       = new Map<string, Room>();   // hotelId → Room
let   avvioInCorso = false;

// ── Store osservabile (per la UI) ─────────────────────────────────────────

export interface SnapshotPresenza {
    /** Webcam di ogni chiosco presente nella stanza presenza (chioscoId → track). */
    tracks:   Record<string, MediaStreamTrack>;
    /** Chiosco verso cui il microfono del receptionist è acceso. */
    parlaCon: string | null;
    /** Numero di stanze presenza connesse. */
    connesse: number;
}

let snapshot: SnapshotPresenza = { tracks: {}, parlaCon: null, connesse: 0 };
const listeners = new Set<() => void>();

function emit(): void {
    const tracks: Record<string, MediaStreamTrack> = {};
    rooms.forEach((room) => {
        room.remoteParticipants.forEach((p) => {
            const id = chioscoIdDa(p.identity);
            if (!id) return;
            p.videoTrackPublications.forEach((pub) => {
                if (pub.track?.mediaStreamTrack) tracks[id] = pub.track.mediaStreamTrack;
            });
        });
    });
    snapshot = { tracks, parlaCon: snapshot.parlaCon, connesse: rooms.size };
    listeners.forEach((l) => l());
}

function chioscoIdDa(identity: string): string | null {
    return identity.startsWith(IDENT_KIOSK) ? identity.slice(IDENT_KIOSK.length) : null;
}

export function usePresenza(): SnapshotPresenza {
    return useSyncExternalStore(
        (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
        () => snapshot,
        () => snapshot,
    );
}

// ── Audio dei chioschi: si sente solo chi ha il microfono acceso ──────────

const audioEls = new Map<string, HTMLMediaElement>(); // trackSid → <audio>

function attaccaAudio(track: RemoteTrack): void {
    if (track.kind !== Track.Kind.Audio) return;
    const el = track.attach();
    el.setAttribute('data-presenza-audio', '1');
    document.body.appendChild(el);
    audioEls.set(track.sid ?? String(Math.random()), el);
}

function staccaAudio(track: RemoteTrack): void {
    if (track.kind !== Track.Kind.Audio) return;
    track.detach().forEach((el) => el.remove());
    if (track.sid) audioEls.delete(track.sid);
}

// ── Connessione ───────────────────────────────────────────────────────────

function getCsrf(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

export async function avvia(): Promise<void> {
    if (avvioInCorso || rooms.size > 0) return; // idempotente
    avvioInCorso = true;

    try {
        const res = await fetch('/portineria/presenza/token', {
            method: 'POST',
            headers: { 'Accept': 'application/json', 'X-CSRF-TOKEN': getCsrf() },
        });
        if (!res.ok) return; // LiveKit non configurato o profilo senza portineria
        const data = await res.json() as { stanze?: { hotel_id: string; url: string; token: string }[] };

        await Promise.all((data.stanze ?? []).map(async ({ hotel_id, url, token }) => {
            if (rooms.has(hotel_id)) return;
            // Il receptionist è GRANDE sul chiosco: risoluzione media, bitrate
            // contenuto (è una presenza continua, non una videochiamata).
            const room = new Room({
                videoCaptureDefaults: { resolution: VideoPresets.h360.resolution },
                publishDefaults: { videoEncoding: { maxBitrate: 450_000, maxFramerate: 20 } },
            });
            rooms.set(hotel_id, room);

            room
                .on(RoomEvent.TrackSubscribed,   (t: RemoteTrack) => { attaccaAudio(t); emit(); })
                .on(RoomEvent.TrackUnsubscribed, (t: RemoteTrack) => { staccaAudio(t); emit(); })
                .on(RoomEvent.ParticipantConnected,    () => { emit(); riapplicaPermessi(room); })
                .on(RoomEvent.ParticipantDisconnected, (p: RemoteParticipant) => {
                    // Se stavo parlando proprio con quel chiosco, il microfono si spegne
                    if (snapshot.parlaCon && chioscoIdDa(p.identity) === snapshot.parlaCon) void parlaCon(null);
                    emit(); riapplicaPermessi(room);
                })
                .on(RoomEvent.LocalTrackPublished, () => riapplicaPermessi(room))
                .on(RoomEvent.Disconnected, () => { rooms.delete(hotel_id); emit(); });

            try {
                await room.connect(url, token);
                await room.localParticipant.setCameraEnabled(true);
                emit();
            } catch (e) {
                // Webcam negata/occupata o rete: nessuna presenza, nessun errore in faccia
                console.warn('[Presenza] pubblicazione non riuscita', e);
                rooms.delete(hotel_id);
                try { room.disconnect(); } catch { /* ignore */ }
                emit();
            }
        }));
    } catch (e) {
        console.warn('[Presenza] avvio fallito', e);
    } finally {
        avvioInCorso = false;
    }
}

export function ferma(): void {
    void parlaCon(null);
    rooms.forEach((room) => { try { room.disconnect(); } catch { /* ignore */ } });
    rooms.clear();
    audioEls.forEach((el) => el.remove());
    audioEls.clear();
    emit();
}

// ── Microfono verso UN chiosco ────────────────────────────────────────────

function roomDelChiosco(chioscoId: string): Room | null {
    for (const room of rooms.values()) {
        for (const p of room.remoteParticipants.values()) {
            if (chioscoIdDa(p.identity) === chioscoId) return room;
        }
    }
    return null;
}

function cameraSid(room: Room): string | null {
    let sid: string | null = null;
    room.localParticipant.videoTrackPublications.forEach((pub: TrackPublication) => {
        if (pub.source === Track.Source.Camera && pub.trackSid) sid = pub.trackSid;
    });
    return sid;
}

/**
 * Permessi di sottoscrizione sulle MIE track: tutti i chioschi vedono la
 * camera; la voce (microfono) può sottoscriverla solo il chiosco con cui sto
 * parlando. Va riapplicato quando entra/esce un partecipante o cambia il
 * set di track pubblicate, perché LiveKit ragiona per identità esplicite.
 */
function riapplicaPermessi(room: Room): void {
    const lp = room.localParticipant;
    if (!snapshot.parlaCon) {
        lp.setTrackSubscriptionPermissions(true);
        return;
    }
    const cam = cameraSid(room);
    const permessi = Array.from(room.remoteParticipants.values()).map((p) => {
        const id = chioscoIdDa(p.identity);
        return id === snapshot.parlaCon
            ? { participantIdentity: p.identity, allowAll: true }
            : { participantIdentity: p.identity, allowAll: false, allowedTrackSids: cam ? [cam] : [] };
    });
    lp.setTrackSubscriptionPermissions(false, permessi);
}

function inviaMic(room: Room, chioscoId: string, on: boolean): void {
    const payload = new TextEncoder().encode(JSON.stringify({ type: 'mic', on }));
    void room.localParticipant.publishData(payload, {
        reliable: true, topic: TOPIC, destinationIdentities: [IDENT_KIOSK + chioscoId],
    }).catch(() => { /* chiosco non in stanza: ignora */ });
}

/**
 * Accende il microfono verso `chioscoId` (null = spegni). Al massimo un
 * chiosco alla volta: cambiare chiosco spegne l'altro.
 */
export async function parlaCon(chioscoId: string | null): Promise<boolean> {
    const precedente = snapshot.parlaCon;
    if (precedente === chioscoId) return chioscoId !== null;

    // Spegni verso il precedente
    if (precedente) {
        const r = roomDelChiosco(precedente);
        if (r) {
            inviaMic(r, precedente, false);
            try { await r.localParticipant.setMicrophoneEnabled(false); } catch { /* ignore */ }
        }
        snapshot = { ...snapshot, parlaCon: null };
        rooms.forEach(riapplicaPermessi);
        listeners.forEach((l) => l());
    }

    if (!chioscoId) return false;

    const room = roomDelChiosco(chioscoId);
    if (!room) return false; // chiosco non in stanza presenza (offline)

    snapshot = { ...snapshot, parlaCon: chioscoId };
    riapplicaPermessi(room); // PRIMA di pubblicare: nessun altro chiosco deve sentire nemmeno un istante
    try {
        await room.localParticipant.setMicrophoneEnabled(true);
    } catch (e) {
        console.warn('[Presenza] microfono non disponibile', e);
        snapshot = { ...snapshot, parlaCon: null };
        riapplicaPermessi(room);
        listeners.forEach((l) => l());
        return false;
    }
    riapplicaPermessi(room); // ora la track mic ha un SID: gli altri restano esclusi
    inviaMic(room, chioscoId, true);
    listeners.forEach((l) => l());
    return true;
}

/** Il receptionist può parlare con questo chiosco (è in stanza presenza)? */
export function raggiungibile(chioscoId: string): boolean {
    return roomDelChiosco(chioscoId) !== null;
}

// Silenzia il warning "unused" per il tipo importato solo nelle firme
export type { RemoteTrackPublication };
