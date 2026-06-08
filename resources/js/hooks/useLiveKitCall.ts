import { useSyncExternalStore } from 'react';
import { subscribe, getState, type CallState } from '@/services/liveKitCall';

/**
 * Espone lo stato del gestore singleton della videochiamata LiveKit.
 * Il componente si ri-renderizza ad ogni cambiamento di stato della chiamata.
 */
export function useLiveKitCall(): CallState {
    return useSyncExternalStore(subscribe, getState, getState);
}
