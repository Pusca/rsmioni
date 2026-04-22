import { Head } from '@inertiajs/react';
import { useForm } from '@inertiajs/react';
import { usePage } from '@inertiajs/react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import ReceptionistLayout from '@/Layouts/ReceptionistLayout';
import PrenotazioneForm from '@/Components/Prenotazioni/PrenotazioneForm';
import { HotelConfig, Profilo, SharedProps } from '@/types';

interface Props {
    hotels: HotelConfig[];
    profilo: Profilo;
    oggi: string;
}

export default function Create({ hotels, profilo, oggi }: Props) {
    const isGestore = profilo === 'gestore_hotel';
    const Layout = isGestore ? GestoreHotelLayout : ReceptionistLayout;

    return (
        <Layout>
            <Head title="Nuova prenotazione" />

            <div className="max-w-3xl mx-auto py-8 px-6">
                <div className="mb-6">
                    <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Nuova prenotazione
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        Compila i dati per inserire una nuova prenotazione.
                    </p>
                </div>

                <PrenotazioneForm
                    hotels={hotels}
                    profilo={profilo}
                    oggi={oggi}
                    submitLabel="Salva prenotazione"
                    onSubmit={(form) => {
                        form.transform((data) => ({
                            hotel_id:           data.hotel_id,
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
                        }));
                        form.post('/prenotazioni');
                    }}
                />
            </div>
        </Layout>
    );
}
