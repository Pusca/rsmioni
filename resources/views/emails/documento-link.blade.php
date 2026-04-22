@component('mail::message')
# Documento condiviso

@if($link->testo_receptionist)
{{ $link->testo_receptionist }}

@else
Gentile ospite, le inviamo il link per accedere al documento richiesto.
@endif

**Documento:** {{ $documento->titolo ?? 'Documento allegato' }}

@component('mail::button', ['url' => $linkUrl, 'color' => 'primary'])
Apri documento
@endcomponent

Il link è valido per **{{ $ttlOre }} ore** dalla ricezione di questa email.

Grazie,
**{{ $nomeHotel }}**

---
<small style="color:#888">Questo messaggio è stato generato automaticamente. Non rispondere a questa email.</small>
@endcomponent
