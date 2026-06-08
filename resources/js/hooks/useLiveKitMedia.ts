import { useEffect, useRef, useState } from 'react';
import {
    Room,
    RoomEvent,
    Track,
    type RemoteTrack,
    type RemoteTrackPublication,
} from 'livekit-client';
import { classificaErroreMedia, type ErroreMedia } from '@/services/webrtcMedia';

/**
 * Livello media LiveKit per il receptionist — collegamento in chiaro/nascosto.
 *
 * Sostituisce useWebRtcCollegamento mantenendone l'interfaccia, così AreaVideo
 * non cambia. La "stanza" LiveKit coincide con il sessionId della sessione
 * chiosco; il token (con i permessi giusti per tipo) arriva dal backend.
 *
 *   - chiaro:   il receptionist pubblica la propria webcam e vede quella del chiosco
 *   - nascosto: il receptionist NON pubblica (token canPublish=false), solo visione
 */

export type TipoCollegamento = 'chiaro' | 'nascosto';
export type StatoCollegamento = 'idle' | 'waiting_chiosco' | 'connecting' | 'connected' | 'error';

interface Options {
    sessionId:    string | null;
    tipo:         TipoCollegamento | null;
    attivo:       boolean;
    chioscoId?:   string | null;
    chioscoNome?: string | null;
    // Compatibilità di firma con useWebRtcCollegamento (PiP non ancora gestito su LiveKit)
    parkCall?:    unknown;
    reclaimCall?: unknown;
}

interface Result {
    localVideoRef:  React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
    stato:  StatoCollegamento;
    errore: ErroreMedia | null;
    condivisioneSchermo: boolean;
    avviaCondivisione:   () => Promise<void>;
    fermaCondivisione:   () => void;
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
        if (!res.ok) {
            console.warn('[LiveKit-R] token endpoint error', res.status);
            return null;
        }
        const data = await res.json();
        if (!data.url || !data.token) return null;
        return { url: data.url, token: data.token };
    } catch (e) {
        console.warn('[LiveKit-R] fetch token fallita', e);
        return null;
    }
}

export function useLiveKitMedia({ sessionId, tipo, attivo }: Options): Result {
    const localVideoRef  = useRef<HTMLVideoElement | null>(null);
    const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
    const roomRef        = useRef<Room | null>(null);

    const [stato,  setStato]  = useState<StatoCollegamento>('idle');
    const [errore, setErrore] = useState<ErroreMedia | null>(null);
    const [condivisioneSchermo, setCondivisioneSchermo] = useState(false);

    useEffect(() => {
        if (!attivo || !sessionId || !tipo) return;

        let cancelled = false;
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        // Aggancia le track remote del chiosco al <video> principale
        const attachRemote = (track: RemoteTrack) => {
            if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
                track.attach(remoteVideoRef.current);
                if (!cancelled) setStato('connected');
            }
            if (track.kind === Track.Kind.Audio) {
                track.attach(); // crea un elemento audio nascosto gestito da LiveKit
            }
        };

        room
            .on(RoomEvent.TrackSubscribed, (track: RemoteTrack, _pub: RemoteTrackPublication) => {
                console.log('[LiveKit-R] track remota:', track.kind, track.source);
                attachRemote(track);
            })
            .on(RoomEvent.Disconnected, () => {
                if (!cancelled) { setStato('error'); setErrore({
                    tipo: 'connessione_interrotta',
                    messaggio: 'Collegamento interrotto.',
                    suggerimento: 'Il chiosco si è disconnesso. Chiudi e riprova.',
                }); }
            });

        const avvia = async () => {
            setStato('waiting_chiosco');
            setErrore(null);

            const cred = await fetchToken(sessionId);
            if (cancelled) return;
            if (!cred) {
                setStato('error');
                setErrore({ tipo: 'sconosciuto', messaggio: 'Token LiveKit non disponibile.',
                    suggerimento: 'Verifica la configurazione LiveKit sul server.' });
                return;
            }

            setStato('connecting');
            try {
                await room.connect(cred.url, cred.token);
                if (cancelled) { room.disconnect(); return; }
                console.log('[LiveKit-R] connesso alla stanza', sessionId);

                // chiaro: pubblica webcam. nascosto: non pubblicare (solo visione).
                if (tipo === 'chiaro') {
                    await room.localParticipant.setCameraEnabled(true);
                    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
                    if (pub?.track && localVideoRef.current) {
                        pub.track.attach(localVideoRef.current);
                    }
                }

                // Aggancia eventuali track già presenti (chiosco entrato per primo)
                room.remoteParticipants.forEach((p) => {
                    p.trackPublications.forEach((pub) => {
                        if (pub.track) attachRemote(pub.track as RemoteTrack);
                    });
                });
            } catch (err) {
                if (cancelled) return;
                console.error('[LiveKit-R] connessione fallita', err);
                setStato('error');
                setErrore(classificaErroreMedia(err));
            }
        };

        avvia();

        return () => {
            cancelled = true;
            setCondivisioneSchermo(false);
            try { room.disconnect(); } catch { /* ignore */ }
            roomRef.current = null;
            if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
            setStato('idle');
            setErrore(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attivo, sessionId, tipo]);

    // ── Condivisione schermo (solo chiaro) ───────────────────────────────
    const avviaCondivisione = async () => {
        const room = roomRef.current;
        if (!room || tipo !== 'chiaro') return;
        try {
            await room.localParticipant.setScreenShareEnabled(true);
            setCondivisioneSchermo(true);
        } catch (e) {
            console.warn('[LiveKit-R] screen share annullata/fallita', e);
        }
    };

    const fermaCondivisione = () => {
        const room = roomRef.current;
        if (!room) return;
        room.localParticipant.setScreenShareEnabled(false).catch(() => {});
        setCondivisioneSchermo(false);
    };

    return { localVideoRef, remoteVideoRef, stato, errore, condivisioneSchermo, avviaCondivisione, fermaCondivisione };
}
