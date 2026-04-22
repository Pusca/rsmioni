import { Head } from '@inertiajs/react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import ReceptionistLayout from '@/Layouts/ReceptionistLayout';
import PrenotazioneForm from '@/Components/Prenotazioni/PrenotazioneForm';
import { HotelConfig, Prenotazione, Profilo } from '@/types';

interface Props {
    prenotazione: Prenotazione & { hotel?: { id: string; nome: string } };
    hotels: HotelConfig[];
    profilo: Profilo;
    oggi: string;
}

export default function Edit({ prenotazione, hotels, profilo, oggi }: Props) {
    const isGestore = profilo === 'gestore_hotel';
    const Layout = isGestore ? GestoreHotelLayout : ReceptionistLayout;

    return (
        <Layout>
            <Head title="Modifica prenotazione" />

            <div className="max-w-3xl mx-auto py-8 px-6">
                <div className="mb-6">
                    <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Modifica prenotazione
                    </h1>
                    {prenotazione.codice && (
                        <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                            {prenotazione.codice}
                            {(prenotazione.nome || prenotazione.cognome) && (
                                <> — {[prenotazione.nome, prenotazione.cognome].filter(Boolean).join(' ')}</>
                            )}
                        </p>
                    )}
                </div>

                <PrenotazioneForm
                    prenotazione={prenotazione}
                    hotels={hotels}
                    profilo={profilo}
                    oggi={oggi}
                    isEdit
                    submitLabel="Salva modifiche"
                    onSubmit={(form) => {
                        form.transform((data) => ({
                            codice:             data.codice || null,
                            nome:               data.nome || null,
                            cognome:            data.cognome || null,
                            gruppo:             data.gruppo || null,
                            check_in:           data.check_in,
                            check_out:          data.check_out,
                            pax:                {
                                adulti:  parseInt(data.pax_adulti, 10) || 1,
                                ragazzi: parseInt(data.pax_ragazzi, 10) || 0,
                                bambini: parseInt(data.pax_bambini, 10) || 0,
                            },
                            tipo_pagamento:     data.tipo_pagamento,
                            documento_identita: data.documento_identita,
                            prezzo:             data.prezzo ? parseFloat(data.prezzo) : null,
                            overbooking:        data.overbooking,
                            checkin_confermato: data.checkin_confermato ?? false,
                        }));
                        form.patch(`/prenotazioni/${prenotazione.id}`);
                    }}
                />
            </div>
        </Layout>
    );
}
