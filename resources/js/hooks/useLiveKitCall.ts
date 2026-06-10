import { useSyncExternalStore } from 'react';
import { subscribe, getSnapshot, type Snapshot } from '@/services/liveKitCall';

/**
 * Espone lo snapshot multi-room delle videochiamate LiveKit.
 * Il componente si ri-renderizza ad ogni cambiamento (nuova chiamata, switch
 * attiva, arrivo track remota, condivisione, ecc.).
 */
export function useLiveKitCall(): Snapshot {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
