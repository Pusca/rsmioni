import type { TipoErroreMedia } from '@/types/media';

/** Colore e icona SVG per tipo errore media */
export default function ErroreIcon({ tipo }: { tipo: TipoErroreMedia }) {
    switch (tipo) {
        case 'permessi_negati':
            // Lucchetto
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                </svg>
            );
        case 'device_occupato':
            // Webcam barrata
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                    <path d="M15 10l4.553-2.069A1 1 0 0121 8.87v6.26a1 1 0 01-1.447.894L15 14M4 6h8a2 2 0 012 2v8a2 2 0 01-2 2H4a2 2 0 01-2-2V8a2 2 0 012-2zM1 1l22 22" />
                </svg>
            );
        case 'device_non_trovato':
            // Punto interrogativo
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ba3c0" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M9.09 9a3 3 0 015.83 1c0 2-3 3-3 3M12 17h.01" />
                </svg>
            );
        case 'condivisione_negata':
            // Schermo barrato
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9ba3c0" strokeWidth="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" />
                    <path d="M8 21h8M12 17v4M1 1l22 22" />
                </svg>
            );
        case 'peer_irraggiungibile':
            // Nessuna connessione
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                    <line x1="1" y1="1" x2="23" y2="23" />
                    <path d="M16.72 11.06A10.94 10.94 0 0119 12.55M5 12.55a10.94 10.94 0 015.17-2.39M10.71 5.05A16 16 0 0122.56 9M1.42 9a15.91 15.91 0 014.7-2.88M8.53 16.11a6 6 0 016.95 0M12 20h.01" />
                </svg>
            );
        case 'timeout_signaling':
            // Orologio
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                </svg>
            );
        default:
            // Triangolo di warning
            return (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                    <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0zM12 9v4M12 17h.01" />
                </svg>
            );
    }
}
