<?php

namespace App\Mail;

use App\Models\Documento;
use App\Models\Hotel;
use App\Models\LinkTemporaneo;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

class DocumentoLinkMail extends Mailable
{
    use Queueable, SerializesModels;

    public function __construct(
        public readonly LinkTemporaneo $link,
        public readonly Documento      $documento,
        public readonly ?Hotel         $hotel,
    ) {}

    public function envelope(): Envelope
    {
        $nomeHotel = $this->hotel?->nome ?? config('app.name');
        $titoloDoc = $this->documento->titolo ?? 'Documento';

        return new Envelope(
            subject: "[{$nomeHotel}] {$titoloDoc}",
        );
    }

    public function content(): Content
    {
        return new Content(
            markdown: 'emails.documento-link',
            with: [
                'linkUrl'   => route('documenti.link', ['token' => $this->link->token]),
                'ttlOre'    => \App\Services\LinkTemporaneaService::TTL_ORE,
                'nomeHotel' => $this->hotel?->nome ?? config('app.name'),
            ],
        );
    }
}
