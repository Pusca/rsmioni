import { Chiosco } from '@/types';

// ── OfflineScreen ────────────────────────────────────────────────────────────

export default function OfflineScreen({ chiosco }: { chiosco: Chiosco }) {
    return (
        <div className="w-full h-full flex flex-col items-center justify-center gap-6">
            <div className="rounded-full flex items-center justify-center"
                 style={{
                     width:           72,
                     height:          72,
                     backgroundColor: 'rgba(92,99,128,0.08)',
                     border:          '2px solid var(--color-border)',
                 }}>
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#5c6380" strokeWidth="1.5">
                    <path d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
            </div>
            <div className="text-center">
                <p className="text-lg font-light" style={{ color: 'var(--color-text-muted)' }}>
                    Chiosco non connesso
                </p>
                <p className="text-sm mt-1" style={{ color: '#3a3f55' }}>
                    Kiosk offline
                </p>
            </div>

            {import.meta.env.DEV && (
                <div className="absolute bottom-3 left-3 text-xs"
                     style={{ color: 'var(--color-text-muted)' }}>
                    {chiosco.nome} · offline
                </div>
            )}
        </div>
    );
}
