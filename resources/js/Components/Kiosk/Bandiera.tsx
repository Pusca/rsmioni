/**
 * Bandierine SVG per la scelta lingua sul chiosco.
 *
 * Non si usano le emoji: su Windows (il totem) Chrome le rende come lettere
 * ("IT", "GB") e non come bandiere. Disegni semplificati, sempre nitidi.
 */

interface Props {
    codice: string;
    size?: number;
}

export default function Bandiera({ codice, size = 22 }: Props) {
    const w = size * 4 / 3;
    const common = { width: w, height: size, viewBox: '0 0 40 30', style: { display: 'block', borderRadius: 3 } as const };

    switch (codice) {
        case 'it':
            return (
                <svg {...common} aria-hidden="true">
                    <rect width="40" height="30" fill="#fff" />
                    <rect width="13.33" height="30" fill="#009246" />
                    <rect x="26.67" width="13.33" height="30" fill="#ce2b37" />
                </svg>
            );
        case 'fr':
            return (
                <svg {...common} aria-hidden="true">
                    <rect width="40" height="30" fill="#fff" />
                    <rect width="13.33" height="30" fill="#0055a4" />
                    <rect x="26.67" width="13.33" height="30" fill="#ef4135" />
                </svg>
            );
        case 'de':
            return (
                <svg {...common} aria-hidden="true">
                    <rect width="40" height="10" fill="#000" />
                    <rect y="10" width="40" height="10" fill="#dd0000" />
                    <rect y="20" width="40" height="10" fill="#ffce00" />
                </svg>
            );
        case 'es':
            return (
                <svg {...common} aria-hidden="true">
                    <rect width="40" height="30" fill="#aa151b" />
                    <rect y="7.5" width="40" height="15" fill="#f1bf00" />
                </svg>
            );
        case 'en':
            return (
                <svg {...common} aria-hidden="true">
                    <rect width="40" height="30" fill="#012169" />
                    <path d="M0 0L40 30M40 0L0 30" stroke="#fff" strokeWidth="6" />
                    <path d="M0 0L40 30M40 0L0 30" stroke="#c8102e" strokeWidth="2" />
                    <path d="M20 0V30M0 15H40" stroke="#fff" strokeWidth="10" />
                    <path d="M20 0V30M0 15H40" stroke="#c8102e" strokeWidth="6" />
                </svg>
            );
        default:
            return (
                <svg {...common} aria-hidden="true">
                    <rect width="40" height="30" fill="#1e293b" />
                    <circle cx="20" cy="15" r="9" fill="none" stroke="#94a3b8" strokeWidth="1.5" />
                    <path d="M11 15h18M20 6c-4 3-4 15 0 18M20 6c4 3 4 15 0 18" fill="none" stroke="#94a3b8" strokeWidth="1.2" />
                </svg>
            );
    }
}
