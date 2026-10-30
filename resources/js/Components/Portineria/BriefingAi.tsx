import { useState } from 'react';
import type { AiBriefing } from '@/types';

/**
 * Briefing del self check-in per il receptionist che osserva o subentra:
 * chi è l'ospite, a che punto è la pratica, documenti, perché Alice ha
 * chiamato, i punti salienti scritti dall'AI e la trascrizione completa.
 * Si aggiorna in tempo reale (evento `.ai.briefing`), resta visibile per
 * tutta la chiamata, anche dopo il subentro.
 */

const SCOPO: Record<string, string> = { checkin: 'Self check-in', checkout: 'Check-out', info: 'Informazioni' };
const LINGUA: Record<string, string> = { it: 'italiano', en: 'inglese', de: 'tedesco', fr: 'francese', es: 'spagnolo' };

function dataIt(iso?: string | null): string | null {
    if (! iso) return null;
    const d = new Date(iso + 'T00:00:00');
    return isNaN(d.getTime()) ? iso : d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
}

function oraIt(iso?: string | null): string {
    if (! iso) return '';
    const d = new Date(iso);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
}

function Fatto({ label, value, evidenzia = false }: { label: string; value: string | null; evidenzia?: boolean }) {
    return (
        <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>{label}</p>
            <p className="text-sm font-medium truncate"
               style={{ color: value ? (evidenzia ? '#fbbf24' : 'var(--color-text-primary)') : 'rgba(148,163,184,0.45)' }}
               title={value ?? undefined}>
                {value ?? '—'}
            </p>
        </div>
    );
}

export default function BriefingAi({ briefing, compatto = false }: { briefing: AiBriefing; compatto?: boolean }) {
    const [apriTrascrizione, setApriTrascrizione] = useState(false);
    const o = briefing.ospite ?? {};
    const s = briefing.soggiorno ?? {};
    const doc = briefing.documenti;
    const nome = [o.nome, o.cognome].filter(Boolean).join(' ') || null;
    const ospiti = s.adulti
        ? `${s.adulti} adult${s.adulti === 1 ? 'o' : 'i'}`
            + (s.ragazzi ? `, ${s.ragazzi} ragazz${s.ragazzi === 1 ? 'o' : 'i'}` : '')
            + (s.bambini ? `, ${s.bambini} bambin${s.bambini === 1 ? 'o' : 'i'}` : '')
        : null;
    const soggiorno = s.check_in || s.check_out ? `${dataIt(s.check_in) ?? '?'} → ${dataIt(s.check_out) ?? '?'}` : null;
    const camera = s.camera ? `${s.camera}${s.piano !== null && s.piano !== undefined ? ` · piano ${s.piano}` : ''}` : null;
    const documenti = doc
        ? (doc.rinunciato ? `${doc.acquisiti}/${doc.attesi} · ospite senza documento` : `${doc.acquisiti}/${doc.attesi}`)
        : null;
    const docIncompleti = !! doc && (doc.rinunciato || doc.acquisiti < doc.attesi);
    const punti = briefing.punti ?? [];
    const turni = briefing.trascrizione ?? [];

    return (
        <div className="w-full rounded-xl border text-left"
             style={{ borderColor: 'rgba(139,92,246,0.35)', backgroundColor: 'rgba(15,23,42,0.55)', maxWidth: compatto ? 420 : 760 }}>
            {/* Testata */}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b"
                 style={{ borderColor: 'rgba(139,92,246,0.25)' }}>
                <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0"
                          style={{ backgroundColor: 'rgba(139,92,246,0.25)', color: '#c4b5fd' }}>AI</span>
                    <p className="text-xs font-semibold uppercase tracking-wider truncate" style={{ color: '#c4b5fd' }}>
                        Briefing {SCOPO[briefing.scopo] ?? briefing.scopo}
                        {briefing.lingua && briefing.lingua !== 'it' ? ` · parla ${LINGUA[briefing.lingua] ?? briefing.lingua}` : ''}
                    </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                    {briefing.fase_label && (
                        <span className="rounded-full px-2 py-0.5 text-[11px] font-medium"
                              style={{ backgroundColor: 'rgba(96,165,250,0.15)', color: '#93c5fd' }}>
                            {briefing.fase_label}
                        </span>
                    )}
                    <span className="text-[11px]" style={{ color: 'var(--color-text-muted)' }}>{oraIt(briefing.aggiornato_at)}</span>
                </div>
            </div>

            {/* Motivo del passaggio: la prima cosa che il collega deve leggere */}
            {briefing.motivo && (
                <div className="mx-4 mt-3 rounded-lg px-3 py-2 flex items-start gap-2"
                     style={{ backgroundColor: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.45)' }}>
                    <span aria-hidden="true" style={{ color: '#fbbf24' }}>🔔</span>
                    <p className="text-sm" style={{ color: '#fde68a' }}>{briefing.motivo}</p>
                </div>
            )}

            {/* Fatti essenziali */}
            <div className={`grid gap-x-4 gap-y-3 px-4 py-3 ${compatto ? 'grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'}`}>
                <Fatto label="Ospite"     value={nome} />
                <Fatto label="Soggiorno"  value={soggiorno} />
                <Fatto label="Ospiti"     value={ospiti} />
                <Fatto label="Camera"     value={camera} />
                <Fatto label="Codice"     value={s.codice ?? null} />
                <Fatto label="Documenti"  value={documenti} evidenzia={docIncompleti} />
            </div>

            {/* Punti salienti scritti dall'AI */}
            {punti.length > 0 && (
                <div className="px-4 pb-3">
                    <p className="text-[10px] uppercase tracking-wider mb-1.5" style={{ color: 'var(--color-text-muted)' }}>Punti salienti</p>
                    <ul className="space-y-1">
                        {punti.map((p, i) => (
                            <li key={i} className="flex gap-2 text-sm" style={{ color: 'var(--color-text-primary)' }}>
                                <span className="shrink-0" style={{ color: '#a78bfa' }}>•</span>
                                <span>{p}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Trascrizione: chiusa di default, un tocco per leggerla tutta */}
            {turni.length > 0 && (
                <div className="border-t" style={{ borderColor: 'rgba(139,92,246,0.2)' }}>
                    <button type="button" onClick={() => setApriTrascrizione((v) => ! v)}
                            className="w-full flex items-center justify-between px-4 py-2 text-xs"
                            style={{ color: '#c4b5fd' }}>
                        <span>Conversazione · {turni.length} battute</span>
                        <span aria-hidden="true">{apriTrascrizione ? '▲' : '▼'}</span>
                    </button>
                    {apriTrascrizione && (
                        <div className="px-4 pb-3 space-y-1.5 overflow-y-auto" style={{ maxHeight: 260 }}>
                            {turni.map((t, i) => (
                                <p key={i} className="text-sm leading-snug">
                                    <span className="font-semibold mr-1.5"
                                          style={{ color: t.chi === 'ospite' ? '#86efac' : '#c4b5fd' }}>
                                        {t.chi === 'ospite' ? 'Ospite' : 'Alice'}
                                    </span>
                                    <span style={{ color: 'var(--color-text-primary)' }}>{t.testo}</span>
                                </p>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
