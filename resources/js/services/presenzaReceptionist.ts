import { Room, VideoPresets } from 'livekit-client';

/**
 * Presenza video del receptionist verso i chioschi.
 *
 * Finché il receptionist è operativo (layout Receptionist montato), pubblica
 * la propria webcam a bassa risoluzione nella stanza "presenza-{hotelId}" di
 * ciascun suo hotel. I chioschi la mostrano come miniatura "receptionist
 * online" in attesa e durante il self check-in AI. Nessun audio.
 *
 * Singleton a livello di modulo: sopravvive alla navigazione tra pagine
 * Inertia; si spegne solo alla chiusura della pagina (o a ferma() esplicita).
 */

const rooms = new Map<string, Room>(); // key: hotelId
let avvioInCorso = false;

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
            // Bassa risoluzione e bitrate contenuto: è una miniatura di presenza,
            // non una videochiamata.
            const room = new Room({
                videoCaptureDefaults: { resolution: VideoPresets.h180.resolution },
                publishDefaults: { videoEncoding: { maxBitrate: 150_000, maxFramerate: 12 } },
            });
            rooms.set(hotel_id, room);
            try {
                await room.connect(url, token);
                await room.localParticipant.setCameraEnabled(true);
            } catch (e) {
                // Webcam negata/occupata o rete: nessuna presenza, nessun errore in faccia
                console.warn('[Presenza] pubblicazione non riuscita', e);
                rooms.delete(hotel_id);
                try { room.disconnect(); } catch { /* ignore */ }
            }
        }));
    } catch (e) {
        console.warn('[Presenza] avvio fallito', e);
    } finally {
        avvioInCorso = false;
    }
}

export function ferma(): void {
    rooms.forEach((room) => { try { room.disconnect(); } catch { /* ignore */ } });
    rooms.clear();
}
