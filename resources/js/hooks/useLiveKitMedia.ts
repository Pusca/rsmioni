import { useState, useRef, useEffect } from 'react';
import {
    Room,
    RoomEvent,
    Track,
    type RemoteTrack,
} from 'livekit-client';
import { classificaErroreMedia, classificaErroreCondivisione, type ErroreMedia } from '@/services/webrtcMedia';

/**
 * Livello media LiveKit per il receptionist — chiaro / nascosto / parlato.
 *
 * Sostituisce useWebRtcCollegamento e useWebRtcParlato mantenendone l'interfaccia,
 * così AreaVideo non cambia struttura. La "stanza" LiveKit coincide con il
 * sessionId della sessione chiosco; il token (con i permessi giusti) arriva dal
 * backend.
 *
 *   - chiaro:   pubblica webcam, vede il chiosco
 *   - nascosto: NON pubblica (token canPublish=false), solo visione
 *   - parlato:  pubblica webcam + microfono, vede/sente il chiosco
 */

export type TipoCollegamento = 'chiaro' | 'nascosto' | 'parlato';
export type StatoCollegamento = 'idle' | 'waiting_chiosco' | 'connecting' | 'connected' | 'error';

interface Options {
    sessionId:    string | null;
    tipo:         TipoCollegamento | null;
    attivo:       boolean;
    chioscoId?:   string | null;
    chioscoNome?: string | null;
    parkCall?:    unknown;
    reclaimCall?: unknown;
}

interface Result {
    localVideoRef:  React.RefObject<HTMLVideoElement | null>;
    remoteVideoRef: React.RefObject<HTMLVideoElement | null>;
    stato:  StatoCollegamento;
    errore: ErroreMedia | null;
    condivisioneSchermo:    boolean;
    avviaCondivisione:      () => Promise<void>;
    fermaCondivisione:      () => void;
    erroreCondivisione:     ErroreMedia | null;
    clearErroreCondivisione: () => void;
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
    const [erroreCondivisione, setErroreCondivisione]   = useState<ErroreMedia | null>(null);

    useEffect(() => {
        if (!attivo || !sessionId || !tipo) return;

        let cancelled = false;
        const room = new Room({ adaptiveStream: true, dynacast: true });
        roomRef.current = room;

        const attachRemote = (track: RemoteTrack) => {
            if (track.kind === Track.Kind.Video && remoteVideoRef.current) {
                track.attach(remoteVideoRef.current);
                if (!cancelled) setStato('connected');
            }
            if (track.kind === Track.Kind.Audio) {
                track.attach(); // elemento audio nascosto gestito da LiveKit
            }
        };

        room
            .on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
                console.log('[LiveKit-R] track remota:', track.kind, track.source);
                attachRemote(track);
            })
            .on(RoomEvent.Disconnected, () => {
                if (!cancelled) {
                    setStato('error');
                    setErrore({
                        tipo: 'connessione_interrotta',
                        messaggio: 'Collegamento interrotto.',
                        suggerimento: 'Il chiosco si è disconnesso. Chiudi e riprova.',
                    });
                }
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
                console.log('[LiveKit-R] connesso alla stanza', sessionId, tipo);

                // Pubblicazione in base al tipo
                //  - chiaro:   webcam
                //  - parlato:  webcam + microfono
                //  - nascosto: niente (il guest non deve vedere/sentire il receptionist)
                if (tipo === 'chiaro' || tipo === 'parlato') {
                    await room.localParticipant.setCameraEnabled(true);
                    if (tipo === 'parlato') {
                        await room.localParticipant.setMicrophoneEnabled(true);
                    }
                    const pub = room.localParticipant.getTrackPublication(Track.Source.Camera);
                    if (pub?.track && localVideoRef.current) {
                        pub.track.attach(localVideoRef.current);
                    }
                }

                // Track già presenti (chiosco entrato per primo)
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
            setErroreCondivisione(null);
            try { room.disconnect(); } catch { /* ignore */ }
            roomRef.current = null;
            if (localVideoRef.current)  localVideoRef.current.srcObject  = null;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
            setStato('idle');
            setErrore(null);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [attivo, sessionId, tipo]);

    // ── Condivisione schermo (chiaro e parlato) ──────────────────────────
    const avviaCondivisione = async () => {
        const room = roomRef.current;
        if (!room || tipo === 'nascosto') return;
        try {
            await room.localParticipant.setScreenShareEnabled(true);
            setCondivisioneSchermo(true);
            setErroreCondivisione(null);
        } catch (e) {
            console.warn('[LiveKit-R] screen share annullata/fallita', e);
            setErroreCondivisione(classificaErroreCondivisione(e));
        }
    };

    const fermaCondivisione = () => {
        const room = roomRef.current;
        if (!room) return;
        room.localParticipant.setScreenShareEnabled(false).catch(() => {});
        setCondivisioneSchermo(false);
    };

    const clearErroreCondivisione = () => setErroreCondivisione(null);

    return {
        localVideoRef, remoteVideoRef, stato, errore,
        condivisioneSchermo, avviaCondivisione, fermaCondivisione,
        erroreCondivisione, clearErroreCondivisione,
    };
}
