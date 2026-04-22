import { Head } from '@inertiajs/react';
import GestoreHotelLayout from '@/Layouts/GestoreHotelLayout';
import CameraForm from '@/Components/Camere/CameraForm';

interface HotelOption { id: string; nome: string; }

interface Props {
    hotels: HotelOption[];
}

export default function CamereCreate({ hotels }: Props) {
    return (
        <GestoreHotelLayout>
            <Head title="Nuova camera" />

            <div className="max-w-3xl mx-auto py-8 px-6">
                <div className="mb-6">
                    <h1 className="text-lg font-semibold" style={{ color: 'var(--color-text-primary)' }}>
                        Nuova camera
                    </h1>
                    <p className="text-sm mt-1" style={{ color: 'var(--color-text-muted)' }}>
                        Configura una nuova camera per l'hotel.
                    </p>
                </div>

                <CameraForm
                    hotels={hotels}
                    submitLabel="Salva camera"
                    onSubmit={(form) => {
                        form.transform(data => ({
                            hotel_id:                  data.hotel_id,
                            nome:                      data.nome,
                            tipo:                      data.tipo,
                            piano:                     parseInt(data.piano, 10),
                            booking_consentito:        data.booking_consentito,
                            letti_matrimoniali:        parseInt(data.letti_matrimoniali, 10) || 0,
                            letti_singoli:             parseInt(data.letti_singoli, 10) || 0,
                            letti_aggiunti:            parseInt(data.letti_aggiunti, 10) || 0,
                            divani_letto_singoli:      parseInt(data.divani_letto_singoli, 10) || 0,
                            divani_letto_matrimoniali: parseInt(data.divani_letto_matrimoniali, 10) || 0,
                            culle:                     parseInt(data.culle, 10) || 0,
                            doccia:                    data.doccia,
                            vasca:                     data.vasca,
                            minibar:                   data.minibar,
                            minibar_pieno:             data.minibar_pieno,
                            aria_condizionata:         data.aria_condizionata,
                            quadro_elettrico:          data.quadro_elettrico || null,
                            codice_chiave:             data.codice_chiave || null,
                            mq:                        data.mq ? parseFloat(data.mq) : null,
                        }));
                        form.post('/camere');
                    }}
                />
            </div>
        </GestoreHotelLayout>
    );
}
