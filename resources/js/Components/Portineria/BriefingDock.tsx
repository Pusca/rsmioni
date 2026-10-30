import { useEffect, useMemo, useRef, useState } from 'react';
import type { AiBriefing, ChioscoConStato } from '@/types';
import BriefingAi from './BriefingAi';

/**
 * Riquadro fisso in basso a destra della Portineria con il briefing del
 * self check-in in corso: il receptionist è sempre al corrente di chi c'è
 * al chiosco e a che punto è la pratica, qualunque chiosco abbia selezionato
 * e qualunque cosa stia facendo. Mostra il chiosco selezionato se ha un
 * briefing, altrimenti quello aggiornato più di recente; con più sessioni
 * attive si passa dall'uno all'altro dalla testata.
 *
 * Si aggiorna via evento realtime E con una rilettura ogni 8 s dello stato
 * del chiosco mostrato (rete di sicurezza se il realtime non arriva). Si
 * riapre da solo quando l'AI chiama un receptionist (nuovo motivo).
 */

interface Props {
    chioschi:    ChioscoConStato[];
    selezioneId: string | null;
    onAggiorna:  (chioscoId: string, briefing: AiBriefing | null) => void;
    onSeleziona: (chioscoId: string) => void;
}

const REFRESH_MS = 8000;

export default function BriefingDock({ chioschi, selezioneId, onAggiorna, onSeleziona }: Props) {
    const conBriefing = useMemo(
        () => chioschi
            .filter((c) => c.ai_briefing && ! ['idle', 'offline'].includes(c.stato))
            .sort((a, b) => (b.ai_briefing!.aggiornato_at ?? '').localeCompare(a.ai_briefing!.aggiornato_at ?? '')),
        [chioschi],
    );
    const [sceltoId, setSceltoId] = useState<string | null>(null);
    const mostrato = conBriefing.find((c) => c.id === sceltoId)
        ?? conBriefing.find((c) => c.id === selezioneId)
        ?? conBriefing[0]
        ?? null;

    const [aperto, setAperto] = useState(true);

    // Nuovo motivo (l'AI ha chiamato un umano) → il riquadro si riapre da solo
    const ultimoMotivo = useRef<string | null>(null);
    useEffect(() => {
        const motivo = mostrato?.ai_briefing?.motivo ?? null;
        if (motivo && motivo !== ultimoMotivo.current) setAperto(true);
        ultimoMotivo.current = motivo;
    }, [mostrato?.ai_briefing?.motivo]);

    // Rete di sicurezza: rilettura periodica del briefing del chiosco mostrato
    const mostratoId = mostrato?.id ?? null;
    useEffect(() => {
        if (! mostratoId) return;
        let fermo = false;
        const leggi = async () => {
            try {
                const res = await fetch(`/portineria/chioschi/${mostratoId}/stato?_t=${Date.now()}`, { headers: { Accept: 'application/json' } });
                if (! res.ok || fermo) return;
                const data = (await res.json()) as { ai_briefing?: AiBriefing | null };
                if (data.ai_briefing !== undefined) onAggiorna(mostratoId, data.ai_briefing);
            } catch { /* rete: riprova al giro dopo */ }
        };
        const timer = setInterval(leggi, REFRESH_MS);
        return () => { fermo = true; clearInterval(timer); };
    }, [mostratoId, onAggiorna]);

    if (! mostrato || ! mostrato.ai_briefing) return null;
    const b = mostrato.ai_briefing;
    const nomeOspite = [b.ospite?.nome, b.ospite?.cognome].filter(Boolean).join(' ');

    return (
        <div className="fixed z-40 flex flex-col items-end"
             style={{ right: 16, bottom: 16, width: aperto ? 'min(440px, calc(100vw - 32px))' : 'auto', maxHeight: 'calc(100vh - 96px)' }}>
            {/* Testata: sempre visibile, anche a riquadro chiuso */}
            <button type="button" onClick={() => setAperto((v) => ! v)}
                    className="flex items-center gap-2 rounded-t-xl px-3 py-2 text-left w-full"
                    style={{ backgroundColor: 'rgba(76,29,149,0.92)', border: '1px solid rgba(167,139,250,0.6)', borderBottom: aperto ? 'none' : undefined,
                             borderRadius: aperto ? '0.75rem 0.75rem 0 0' : '0.75rem', boxShadow: '0 10px 30px rgba(0,0,0,0.45)', minWidth: 260 }}
                    title={aperto ? 'Riduci il briefing' : 'Apri il briefing'}>
                <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold shrink-0"
                      style={{ backgroundColor: 'rgba(196,181,253,0.25)', color: '#ede9fe' }}>AI</span>
                <span className="flex-1 min-w-0">
                    <span className="block text-xs font-semibold truncate" style={{ color: '#ede9fe' }}>
                        {mostrato.nome} · {nomeOspite || 'ospite in arrivo'}
                    </span>
                    <span className="block text-[11px] truncate" style={{ color: b.motivo ? '#fde68a' : 'rgba(237,233,254,0.7)' }}>
                        {b.motivo ?? `${b.fase_label ?? 'in corso'} · documenti ${b.documenti?.acquisiti ?? 0}/${b.documenti?.attesi ?? '?'}`}
                    </span>
                </span>
                {b.motivo && <span className="shrink-0 animate-pulse" aria-hidden="true">🔔</span>}
                <span className="shrink-0 text-xs" style={{ color: '#c4b5fd' }} aria-hidden="true">{aperto ? '▼' : '▲'}</span>
            </button>

            {aperto && (
                <div className="w-full overflow-y-auto rounded-b-xl"
                     style={{ backgroundColor: 'rgba(15,23,42,0.97)', border: '1px solid rgba(167,139,250,0.6)', borderTop: 'none',
                              boxShadow: '0 10px 30px rgba(0,0,0,0.45)', maxHeight: 'calc(100vh - 150px)' }}>
                    {/* Più sessioni AI in parallelo: selettore del chiosco */}
                    {conBriefing.length > 1 && (
                        <div className="flex gap-1 flex-wrap px-3 pt-2">
                            {conBriefing.map((c) => (
                                <button key={c.id} type="button"
                                        onClick={() => { setSceltoId(c.id); onSeleziona(c.id); }}
                                        className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                                        style={{ backgroundColor: c.id === mostrato.id ? 'rgba(167,139,250,0.35)' : 'rgba(148,163,184,0.12)',
                                                 color: c.id === mostrato.id ? '#ede9fe' : 'var(--color-text-muted)' }}>
                                    {c.nome}
                                </button>
                            ))}
                        </div>
                    )}
                    <div className="p-2">
                        <BriefingAi briefing={b} compatto />
                    </div>
                </div>
            )}
        </div>
    );
}
