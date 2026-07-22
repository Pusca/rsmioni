<?php

namespace App\Http\Requests;

use App\Enums\StatoDocumentoIdentita;
use App\Enums\TipoPagamento;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

/**
 * Validazione condivisa per inserimento (store) e modifica (update)
 * di una prenotazione.
 *
 * Le differenze tra i due flussi sono gestite qui:
 *  - store: valida anche hotel_id (limitato agli hotel dell'utente);
 *  - store: messaggi custom aggiuntivi su pax.adulti.
 */
class SalvaPrenotazioneRequest extends FormRequest
{
    public function authorize(): bool
    {
        // Ownership e vincoli di stato (check-in confermato) restano
        // verificati nel controller, come prima del refactoring.
        return true;
    }

    public function rules(): array
    {
        $rules = [
            'codice'             => ['nullable', 'string', 'max:100'],
            'codice_chiave'      => ['nullable', 'string', 'max:100'],
            'nome'               => ['nullable', 'string', 'max:200'],
            'cognome'            => ['nullable', 'string', 'max:200'],
            'gruppo'             => ['nullable', 'string', 'max:200'],
            'check_in'           => ['required', 'date'],
            'check_out'          => ['required', 'date', 'after:check_in'],
            'pax.adulti'         => ['required', 'integer', 'min:1', 'max:99'],
            'pax.ragazzi'        => ['nullable', 'integer', 'min:0', 'max:99'],
            'pax.bambini'        => ['nullable', 'integer', 'min:0', 'max:99'],
            'tipo_pagamento'     => ['required', Rule::enum(TipoPagamento::class)],
            'documento_identita' => ['required', Rule::enum(StatoDocumentoIdentita::class)],
            'prezzo'             => ['nullable', 'numeric', 'min:0', 'max:999999'],
            'overbooking'        => ['boolean'],
        ];

        if ($this->isCreazione()) {
            $rules = [
                'hotel_id' => ['required', 'uuid', Rule::in($this->user()->hotelIds())],
            ] + $rules;
        }

        return $rules;
    }

    public function messages(): array
    {
        $messages = [
            'check_out.after' => 'Il check-out deve essere successivo al check-in.',
        ];

        if ($this->isCreazione()) {
            $messages['pax.adulti.required'] = 'Indicare almeno un adulto.';
            $messages['pax.adulti.min']      = 'Almeno un adulto è obbligatorio.';
        }

        return $messages;
    }

    /** true per store (nessuna prenotazione nella route), false per update */
    private function isCreazione(): bool
    {
        return $this->route('prenotazione') === null;
    }
}
