import { useEffect, useRef, useState } from 'react';
import { Room, RoomEvent, Track, type RemoteTrack } from 'livekit-client';

/**
 * Miniatura presenza del receptionist sul chiosco.
 *
 * Si collega in sola ricezione alla stanza "presenza-{hotelId}" del proprio
 * hotel e espone la track video del receptionist quando questi è operativo
 * in portineria. La connessione è persistente: se il receptionist va e viene,
 * la track appare e scompare da sola (TrackSubscribed / TrackUnsubscribed).
 */

const RETRY_MS = 15_000; // riprova la connessione se il token/collegamento fallisce

interface Result {
    /** Track video del receptionist, null se offline. */
    track:  MediaStreamTrack | null;
    online: boolean;
}

export function usePresenzaReceptionist(): Result {
    const [track, setTrack] = useState<MediaStreamTrack | null>(null);
    const roomRef = useRef<Room | null>(null);

    useEffect(() => {
        let cancelled = false;
        let retryTimer: ReturnType<typeof setTimeout> | null = null;

        const connect = async () => {
            if (cancelled || roomRef.current) return;
            try {
                const res = await fetch('/kiosk/presenza/token', { headers: { 'Accept': 'application/json' } });
                if (!res.ok) throw new Error(`token ${res.status}`);
                const cred = await res.json() as { url?: string; token?: string };
                if (!cred.url || !cred.token) throw new Error('token mancante');

                const room = new Room();
                roomRef.current = room;

                const aggiorna = () => {
                    // La track di presenza è l'unico video pubblicato nella stanza
                    let trovata: MediaStreamTrack | null = null;
                    room.remoteParticipants.forEach((p) => {
                        p.videoTrackPublications.forEach((pub) => {
                            if (pub.track?.mediaStreamTrack) trovata = pub.track.mediaStreamTrack;
                        });
                    });
                    if (!cancelled) setTrack(trovata);
                };

                room
                    .on(RoomEvent.TrackSubscribed, (t: RemoteTrack) => { if (t.kind === Track.Kind.Video) aggiorna(); })
                    .on(RoomEvent.TrackUnsubscribed, aggiorna)
                    .on(RoomEvent.ParticipantDisconnected, aggiorna)
                    .on(RoomEvent.Disconnected, () => {
                        roomRef.current = null;
                        if (!cancelled) {
                            setTrack(null);
                            retryTimer = setTimeout(connect, RETRY_MS);
                        }
                    });

                await room.connect(cred.url, cred.token);
                if (cancelled) { room.disconnect(); return; }
                aggiorna();
            } catch {
                roomRef.current = null;
                if (!cancelled) retryTimer = setTimeout(connect, RETRY_MS);
            }
        };

        connect();

        return () => {
            cancelled = true;
            if (retryTimer) clearTimeout(retryTimer);
            if (roomRef.current) { try { roomRef.current.disconnect(); } catch { /* ignore */ } roomRef.current = null; }
        };
    }, []);

    return { track, online: track !== null };
}
