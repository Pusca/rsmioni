import '../css/app.css';
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

// ── Laravel Echo / Pusher ──────────────────────────────────────────────────
//
// Broadcast driver: Pusher (managed WebSocket, free tier).
// Sostituisce Reverb che richiedeva un processo WebSocket server separato
// non disponibile su hosting condiviso.
//
// Variabili richieste in .env:
//   BROADCAST_CONNECTION=pusher
//   PUSHER_APP_ID, PUSHER_APP_KEY, PUSHER_APP_SECRET, PUSHER_APP_CLUSTER
//   VITE_PUSHER_APP_KEY, VITE_PUSHER_APP_CLUSTER
//
// Echo si connette a Pusher solo se VITE_PUSHER_APP_KEY è configurata.
// Senza credenziali: Echo non viene inizializzato, i hook rilevano l'assenza
// e attivano il polling HTTP fallback (usePortineriaRealtime, useKioskStato).
//
// Ziggy deliberatamente NON installato — URL hardcoded nei service TS.

declare global {
    interface Window {
        Pusher: typeof Pusher;
        Echo: Echo<'pusher'>;
    }
}

window.Pusher = Pusher;

const pusherKey = import.meta.env.VITE_PUSHER_APP_KEY as string | undefined;

if (pusherKey) {
    window.Echo = new Echo({
        broadcaster:  'pusher',
        key:          pusherKey,
        cluster:      import.meta.env.VITE_PUSHER_APP_CLUSTER ?? 'eu',
        forceTLS:     true,
        authEndpoint: '/broadcasting/auth',
        auth: {
            headers: {
                'X-CSRF-TOKEN': document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '',
            },
        },
    });
}

// ── Inertia ────────────────────────────────────────────────────────────────
createInertiaApp({
    title: (title) => `${title} — RS Mioni`,
    resolve: async (name) => {
        const pages = import.meta.glob<{ default: ComponentType }>('./Pages/**/*.tsx');
        const mod = await pages[`./Pages/${name}.tsx`]();
        return mod.default;
    },
    setup({ el, App, props }) {
        createRoot(el).render(<App {...props} />);
    },
    progress: { color: '#3b82f6' },
});
