import { useRef, useState, useEffect } from 'react';
import { usePage, router } from '@inertiajs/react';
import { SharedProps, HotelMinimo } from '@/types';

function getCsrfToken(): string {
    return document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]')?.content ?? '';
}

export default function HotelSelector() {
    const { hotels, hotel_corrente } = usePage<SharedProps>().props;

    const [aperto, setAperto] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    // Chiudi dropdown al click fuori
    useEffect(() => {
        if (!aperto) return;
        const onClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setAperto(false);
        };
        document.addEventListener('mousedown', onClickOutside);
        return () => document.removeEventListener('mousedown', onClickOutside);
    }, [aperto]);

    // Non mostrare se un solo hotel (o nessuno)
    if (!hotels || hotels.length <= 1) return null;

    const cambiaHotel = async (hotel: HotelMinimo) => {
        setAperto(false);
        if (hotel.id === hotel_corrente?.id) return;

        await fetch(`/hotel-corrente/${hotel.id}`, {
            method: 'PUT',
            headers: {
                'Accept': 'application/json',
                'X-CSRF-TOKEN': getCsrfToken(),
            },
        });

        // Ricarica la pagina corrente con i nuovi dati
        router.reload();
    };

    return (
        <div ref={ref} className="relative">
            <button
                onClick={() => setAperto(o => !o)}
                className="flex items-center gap-1.5 rounded px-2.5 py-1 text-xs transition-colors"
                style={{
                    color: 'var(--color-text-secondary)',
                    backgroundColor: aperto ? 'var(--color-bg-hover)' : 'transparent',
                    border: '1px solid var(--color-border)',
                }}
            >
                <BuildingIcon />
                <span className="max-w-[140px] truncate font-medium">
                    {hotel_corrente?.nome ?? 'Seleziona hotel'}
                </span>
                <ChevronIcon aperto={aperto} />
            </button>

            {aperto && (
                <div
                    className="absolute left-0 top-full mt-1 min-w-[200px] rounded-lg py-1 shadow-lg z-50"
                    style={{
                        backgroundColor: 'var(--color-bg-card)',
                        border: '1px solid var(--color-border)',
                    }}
                >
                    {hotels.map(h => (
                        <button
                            key={h.id}
                            onClick={() => cambiaHotel(h)}
                            className="w-full text-left px-3 py-2 text-xs transition-colors"
                            style={{
                                color: h.id === hotel_corrente?.id
                                    ? 'var(--color-parlato)'
                                    : 'var(--color-text-secondary)',
                                backgroundColor: h.id === hotel_corrente?.id
                                    ? 'rgba(59,130,246,0.08)'
                                    : 'transparent',
                                fontWeight: h.id === hotel_corrente?.id ? 500 : 400,
                            }}
                            onMouseEnter={e => {
                                if (h.id !== hotel_corrente?.id)
                                    e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                            }}
                            onMouseLeave={e => {
                                if (h.id !== hotel_corrente?.id)
                                    e.currentTarget.style.backgroundColor = 'transparent';
                            }}
                        >
                            {h.nome}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}

function BuildingIcon() {
    return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" style={{ flexShrink: 0 }}>
            <rect x="4" y="2" width="16" height="20" rx="2" />
            <line x1="9" y1="6" x2="9" y2="6.01" />
            <line x1="15" y1="6" x2="15" y2="6.01" />
            <line x1="9" y1="10" x2="9" y2="10.01" />
            <line x1="15" y1="10" x2="15" y2="10.01" />
            <line x1="9" y1="14" x2="9" y2="14.01" />
            <line x1="15" y1="14" x2="15" y2="14.01" />
            <path d="M9 18h6v4H9z" />
        </svg>
    );
}

function ChevronIcon({ aperto }: { aperto: boolean }) {
    return (
        <svg
            width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            style={{ flexShrink: 0, transition: 'transform 0.15s', transform: aperto ? 'rotate(180deg)' : 'none' }}
        >
            <polyline points="6 9 12 15 18 9" />
        </svg>
    );
}
