import '../css/app.css';
import type { ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { createInertiaApp } from '@inertiajs/react';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

// ── Laravel Echo / Reverb ──────────────────────────────────────────────────
//
// Ziggy (route helpers JS) deliberatamente NON installato.
// Le URL nei service TS sono hardcoded — nessuna dipendenza da Ziggy.
// Se in futuro serve route() in JS: composer require tightenco/ziggy
//
// Echo<'reverb'>: T deve estendere keyof Broadcaster — 'reverb' è valido.
declare global {
    interface Window {
        Pusher: typeof Pusher;
        Echo: Echo<'reverb'>;
    }
}

window.Pusher = Pusher;

// Echo si connette a Reverb solo se VITE_REVERB_APP_KEY è configurata.
// Senza Reverb attivo: connessione fallisce silenziosamente,
// il hook usePortineriaRealtime lo rileva e attiva il polling fallback.
const reverbKey = import.meta.env.VITE_REVERB_APP_KEY as string | undefined;

if (reverbKey) {
    window.Echo = new Echo({
        broadcaster:       'reverb',
        key:               reverbKey,
        wsHost:            import.meta.env.VITE_REVERB_HOST  ?? 'localhost',
        wsPort:            Number(import.meta.env.VITE_REVERB_PORT  ?? 8080),
        wssPort:           Number(import.meta.env.VITE_REVERB_PORT  ?? 443),
        forceTLS:          (import.meta.env.VITE_REVERB_SCHEME ?? 'http') === 'https',
        enabledTransports: ['ws', 'wss'],
        authEndpoint:      '/broadcasting/auth',
    });
}

// ── Inertia ────────────────────────────────────────────────────────────────
// import.meta.glob<{ default: ComponentType }> fornisce il tipo corretto
// per le pagine React dopo l'introduzione di vite-env.d.ts.
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
