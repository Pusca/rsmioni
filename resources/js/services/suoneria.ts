/**
 * Suoneria della Portineria — sintetizzata con WebAudio, nessun file audio.
 *
 * Suona quando un chiosco chiama (in_chiamata) e quando il receptionist AI
 * chiede aiuto (campanella). Rispetta le impostazioni hotel
 * `suoneria_attiva` / `volume_suoneria` (Configurazioni → Audio chiosco),
 * che fino a oggi erano salvate ma non usate.
 *
 * I browser bloccano l'audio finché l'utente non ha interagito con la pagina:
 * il primo gesto (click) sblocca l'AudioContext; prima di allora la suoneria
 * viene semplicemente saltata.
 */

let ctx: AudioContext | null = null;
let sbloccato = false;

function contesto(): AudioContext | null {
    try {
        ctx ??= new AudioContext();
        if (ctx.state === 'suspended') ctx.resume().catch(() => {});
        return ctx;
    } catch {
        return null;
    }
}

// Sblocco al primo gesto dell'utente (autoplay policy)
if (typeof window !== 'undefined') {
    const sblocca = () => { sbloccato = true; contesto(); };
    window.addEventListener('pointerdown', sblocca, { once: true, passive: true });
    window.addEventListener('keydown', sblocca, { once: true });
}

export interface OpzioniSuoneria {
    attiva?: boolean;      // default true
    volume?: number;       // 0..100, default 80
}

/** Nota singola con attacco/rilascio morbidi. */
function nota(c: AudioContext, freq: number, inizio: number, durata: number, gain: number) {
    const osc = c.createOscillator();
    const env = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    env.gain.setValueAtTime(0, inizio);
    env.gain.linearRampToValueAtTime(gain, inizio + 0.02);
    env.gain.setValueAtTime(gain, inizio + durata - 0.06);
    env.gain.linearRampToValueAtTime(0, inizio + durata);
    osc.connect(env).connect(c.destination);
    osc.start(inizio);
    osc.stop(inizio + durata);
}

/**
 * Chiamata in arrivo: "din-don" ripetuto (3 volte).
 */
export function suonaChiamata(opz: OpzioniSuoneria = {}): void {
    if (opz.attiva === false || !sbloccato) return;
    const c = contesto();
    if (!c) return;
    const g = Math.max(0, Math.min(1, (opz.volume ?? 80) / 100)) * 0.25;
    const t0 = c.currentTime + 0.02;
    for (let i = 0; i < 3; i++) {
        const t = t0 + i * 0.9;
        nota(c, 784, t, 0.28, g);        // sol
        nota(c, 659, t + 0.3, 0.42, g);  // mi
    }
}

/**
 * L'AI chiede aiuto: campanella più insistente (tre colpi acuti, due volte).
 */
export function suonaCampanellaAi(opz: OpzioniSuoneria = {}): void {
    if (opz.attiva === false || !sbloccato) return;
    const c = contesto();
    if (!c) return;
    const g = Math.max(0, Math.min(1, (opz.volume ?? 80) / 100)) * 0.28;
    const t0 = c.currentTime + 0.02;
    for (let r = 0; r < 2; r++) {
        for (let i = 0; i < 3; i++) {
            nota(c, 1046, t0 + r * 1.1 + i * 0.18, 0.14, g); // do acuto ×3
        }
    }
}
