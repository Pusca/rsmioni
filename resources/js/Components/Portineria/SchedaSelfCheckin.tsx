import { useEffect, useRef, useState } from 'react';
import type { AiBriefing } from '@/types';

/**
 * Scheda della chiamata self check-in, nell'area video (colonna sinistra)
 * del chiosco selezionato: chi c'è al chiosco, a che punto è la pratica,
 * perché l'AI ha chiamato un receptionist, i punti salienti e la
 * conversazione quasi in diretta. Stessa scheda in ascolto nascosto e dopo
 * il Subentra. Colori dai token del tema (chiaro/scuro), accento viola = AI.
 */

const LINGUA: Record<string, string> = { it: 'italiano', en: 'inglese', de: 'tedesco', fr: 'francese', es: 'spagnolo' };
const VIOLA = '#8b5cf6';

const PASSI_CHECKIN  = [
    { chiavi: ['accoglienza', 'dati'], label: 'Dati' },
    { chiavi: ['conferma'],            label: 'Conferma' },
    { chiavi: ['salvata', 'camera'],   label: 'Camera' },
    { chiavi: ['documento'],           label: 'Documento' },
    { chiavi: ['congedo'],             label: 'Fine' },
];
const PASSI_CHECKOUT = [
    { chiavi: ['ricerca'],   label: 'Ricerca' },
    { chiavi: ['trovata'],   label: 'Prenotazione' },
    { chiavi: ['pagamento'], label: 'Pagamento' },
    { chiavi: ['congedo'],   label: 'Fine' },
];

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
function notti(a?: string | null, b?: string | null): number | null {
    if (! a || ! b) return null;
    const n = Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86_400_000);
    return isNaN(n) || n <= 0 ? null : n;
}

/** Stepper compatto: passi fatti in verde, corrente in viola, futuri spenti. */
function Passi({ fase, scopo }: { fase: string | null; scopo: string }) {
    const passi = scopo === 'checkout' ? PASSI_CHECKOUT : PASSI_CHECKIN;
    const idx = Math.max(0, passi.findIndex((p) => p.chiavi.includes(fase ?? '')));
    return (
        <ol className="flex items-center gap-1" aria-label="Fase della pratica">
            {passi.map((p, i) => {
                const fatto = i < idx, corrente = i === idx;
                return (
                    <li key={p.label} className="flex items-center gap-1">
                        <span className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                              style={{
                                  backgroundColor: corrente ? 'rgba(139,92,246,0.16)' : fatto ? 'rgba(34,197,94,0.12)' : 'transparent',
                                  color: corrente ? VIOLA : fatto ? '#16a34a' : 'var(--color-text-muted)',
                                  border: `1px solid ${corrente ? 'rgba(139,92,246,0.5)' : fatto ? 'rgba(34,197,94,0.35)' : 'var(--color-border)'}`,
                                  opacity: ! corrente && ! fatto ? 0.6 : 1,
                              }}>
                            {fatto && (
                                <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                    <path d="M20 6L9 17l-5-5" />
                                </svg>
                            )}
                            {corrente && <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ backgroundColor: VIOLA }} />}
                            {p.label}
                        </span>
                        {i < passi.length - 1 && <span style={{ width: 8, height: 1, backgroundColor: 'var(--color-border)' }} />}
                    </li>
                );
            })}
        </ol>
    );
}

function Riga({ icona, children }: { icona: React.ReactNode; children: React.ReactNode }) {
    return (
        <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--color-text-secondary)' }}>
            <span className="shrink-0 inline-flex" style={{ color: 'var(--color-text-muted)' }}>{icona}</span>
            <span className="truncate">{children}</span>
        </div>
    );
}

const Ico = {
    ospiti:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" /></svg>,
    date:      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>,
    camera:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 18v-6a2 2 0 012-2h14a2 2 0 012 2v6M3 18h18M5 10V6a2 2 0 012-2h10a2 2 0 012 2v4" /></svg>,
    codice:    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9h16M4 15h16M10 3L8 21M16 3l-2 18" /></svg>,
    documento: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="8" cy="12" r="2" /><path d="M14 10h5M14 14h3" /></svg>,
    campana:   <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 01-3.46 0" /></svg>,
    chat:      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" /></svg>,
};

export default function SchedaSelfCheckin({ briefing }: { briefing: AiBriefing }) {
    const o = briefing.ospite ?? {};
    const s = briefing.soggiorno ?? {};
    const doc = briefing.documenti ?? null;
    const nome = [o.nome, o.cognome].filter(Boolean).join(' ');
    const ospiti = s.adulti
        ? `${s.adulti} adult${s.adulti === 1 ? 'o' : 'i'}`
            + (s.ragazzi ? `, ${s.ragazzi} ragazz${s.ragazzi === 1 ? 'o' : 'i'}` : '')
            + (s.bambini ? `, ${s.bambini} bambin${s.bambini === 1 ? 'o' : 'i'}` : '')
        : null;
    const n = notti(s.check_in, s.check_out);
    const soggiorno = s.check_in || s.check_out
        ? `${dataIt(s.check_in) ?? '?'} → ${dataIt(s.check_out) ?? '?'}` + (n ? ` · ${n} nott${n === 1 ? 'e' : 'i'}` : '')
        : null;
    const camera = s.camera ? `Camera ${s.camera}` + (s.piano !== null && s.piano !== undefined ? ` · piano ${s.piano}` : '') : null;
    const punti = briefing.punti ?? [];
    const turni = briefing.trascrizione ?? [];
    const attesi = doc?.attesi ?? 0;
    const docMancanti = !! doc && (doc.rinunciato || doc.acquisiti < doc.attesi);

    // Conversazione: ultime battute a vista, scorre da sola in fondo a ogni aggiornamento
    const [tutta, setTutta] = useState(false);
    const chatRef = useRef<HTMLDivElement | null>(null);
    useEffect(() => {
        const el = chatRef.current;
        if (el) el.scrollTop = el.scrollHeight;
    }, [turni.length, tutta]);
    const visibili = tutta ? turni : turni.slice(-6);

    return (
        <section className="w-full rounded-xl border overflow-hidden text-left"
                 style={{ backgroundColor: 'var(--color-bg-card)', borderColor: briefing.motivo ? 'rgba(245,158,11,0.6)' : 'var(--color-border)',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}
                 aria-label="Scheda self check-in">
            {/* Testata: cosa è + a che punto è */}
            <header className="flex items-center justify-between gap-3 px-4 py-2 border-b flex-wrap"
                    style={{ borderColor: 'var(--color-border)', background: 'linear-gradient(90deg, rgba(139,92,246,0.10), transparent 60%)' }}>
                <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center justify-center rounded-md text-[10px] font-extrabold shrink-0"
                          style={{ width: 26, height: 22, backgroundColor: VIOLA, color: '#fff', letterSpacing: 0.5 }}>AI</span>
                    <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--color-text-primary)' }}>
                        {briefing.scopo === 'checkout' ? 'Check-out' : briefing.scopo === 'info' ? 'Informazioni' : 'Self check-in'}
                    </span>
                    {briefing.lingua && (
                        <span className="text-[11px] rounded-full px-2 py-0.5" style={{ color: 'var(--color-text-muted)', border: '1px solid var(--color-border)' }}>
                            parla {LINGUA[briefing.lingua] ?? briefing.lingua}
                        </span>
                    )}
                </div>
                <Passi fase={briefing.fase} scopo={briefing.scopo} />
                <span className="text-[11px] tabular-nums shrink-0" style={{ color: 'var(--color-text-muted)' }} title="Ultimo aggiornamento">
                    {oraIt(briefing.aggiornato_at)}
                </span>
            </header>

            {/* Perché serve un umano: la prima cosa da leggere */}
            {briefing.motivo && (
                <div className="flex items-start gap-2.5 px-4 py-2.5 border-b ai-handoff-card"
                     style={{ backgroundColor: 'rgba(245,158,11,0.10)', borderColor: 'rgba(245,158,11,0.35)' }}>
                    <span className="shrink-0 mt-0.5" style={{ color: '#d97706' }}>{Ico.campana}</span>
                    <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: '#b45309' }}>L'assistente chiede un receptionist</p>
                        <p className="text-sm" style={{ color: 'var(--color-text-primary)', lineHeight: 1.4 }}>{briefing.motivo}</p>
                    </div>
                </div>
            )}

            {/* Corpo: ospite a sinistra, punti salienti a destra */}
            <div className="grid gap-x-6 gap-y-4 px-4 py-3" style={{ gridTemplateColumns: 'minmax(0, 1.1fr) minmax(0, 1fr)' }}>
                <div className="min-w-0 space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>Ospite</p>
                    <p className="font-semibold leading-tight truncate" style={{ fontSize: 20, color: nome ? 'var(--color-text-primary)' : 'var(--color-text-muted)' }}>
                        {nome || 'Nome non ancora detto'}
                    </p>
                    <div className="space-y-1.5 pt-1">
                        <Riga icona={Ico.ospiti}>{ospiti ?? <span style={{ color: 'var(--color-text-muted)' }}>ospiti da definire</span>}</Riga>
                        <Riga icona={Ico.date}>{soggiorno ?? <span style={{ color: 'var(--color-text-muted)' }}>date da definire</span>}</Riga>
                        <Riga icona={Ico.camera}>{camera ?? <span style={{ color: 'var(--color-text-muted)' }}>camera non ancora assegnata</span>}</Riga>
                        <Riga icona={Ico.codice}>{s.codice ? <span className="font-mono tracking-wider">{s.codice}</span> : <span style={{ color: 'var(--color-text-muted)' }}>codice non ancora emesso</span>}</Riga>
                        {doc && (
                            <Riga icona={Ico.documento}>
                                <span className="inline-flex items-center gap-1.5">
                                    <span className="inline-flex gap-1" aria-hidden="true">
                                        {Array.from({ length: Math.max(1, Math.min(attesi, 10)) }).map((_, i) => (
                                            <span key={i} className="rounded-full" style={{
                                                width: 9, height: 9,
                                                backgroundColor: i < doc.acquisiti ? '#22c55e' : 'transparent',
                                                border: `2px solid ${i < doc.acquisiti ? '#22c55e' : docMancanti ? '#f59e0b' : 'var(--color-border)'}`,
                                            }} />
                                        ))}
                                    </span>
                                    <span style={{ color: docMancanti ? '#d97706' : undefined, fontWeight: docMancanti ? 600 : 400 }}>
                                        documenti {doc.acquisiti}/{doc.attesi}{doc.rinunciato ? ' · un ospite è senza documento' : ''}
                                    </span>
                                </span>
                            </Riga>
                        )}
                    </div>
                </div>

                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--color-text-muted)' }}>Punti salienti</p>
                    {punti.length > 0 ? (
                        <ul className="space-y-1.5">
                            {punti.map((p, i) => (
                                <li key={i} className="flex gap-2 text-sm leading-snug" style={{ color: 'var(--color-text-primary)' }}>
                                    <span className="shrink-0 mt-1.5 rounded-full" style={{ width: 6, height: 6, backgroundColor: VIOLA }} />
                                    <span>{p}</span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-xs leading-relaxed" style={{ color: 'var(--color-text-muted)' }}>
                            L'assistente li scrive quando chiama un receptionist o quando l'ospite tocca «Parla con il receptionist». Intanto qui sotto c'è la conversazione.
                        </p>
                    )}
                </div>
            </div>

            {/* Conversazione quasi in diretta */}
            {turni.length > 0 && (
                <div className="border-t" style={{ borderColor: 'var(--color-border)', backgroundColor: 'var(--color-bg-secondary)' }}>
                    <div className="flex items-center justify-between px-4 pt-2 pb-1">
                        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--color-text-muted)' }}>
                            {Ico.chat} Conversazione · {turni.length} battute
                        </p>
                        {turni.length > 6 && (
                            <button type="button" onClick={() => setTutta((v) => ! v)} className="text-[11px] font-semibold" style={{ color: VIOLA }}>
                                {tutta ? 'Solo le ultime' : 'Tutta la conversazione'}
                            </button>
                        )}
                    </div>
                    <div ref={chatRef} className="px-4 pb-3 space-y-1.5 overflow-y-auto" style={{ maxHeight: tutta ? 320 : 190 }}>
                        {visibili.map((t, i) => {
                            const ospite = t.chi === 'ospite';
                            return (
                                <div key={`${i}-${t.testo.slice(0, 12)}`} className={`flex ${ospite ? 'justify-start' : 'justify-end'}`}>
                                    <div className="max-w-[82%] rounded-2xl px-3 py-1.5 text-sm leading-snug"
                                         style={{
                                             backgroundColor: ospite ? 'var(--color-bg-card)' : 'rgba(139,92,246,0.14)',
                                             border: `1px solid ${ospite ? 'var(--color-border)' : 'rgba(139,92,246,0.35)'}`,
                                             color: 'var(--color-text-primary)',
                                             borderBottomLeftRadius: ospite ? 6 : undefined,
                                             borderBottomRightRadius: ospite ? undefined : 6,
                                         }}>
                                        <span className="block text-[10px] font-bold uppercase tracking-wider mb-0.5"
                                              style={{ color: ospite ? '#16a34a' : VIOLA }}>
                                            {ospite ? 'Ospite' : 'Alice'}
                                        </span>
                                        {t.testo}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </section>
    );
}
