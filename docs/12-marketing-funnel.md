# 12 — Marketing: funnel campagne → lead → appuntamenti

> Modulo aggiunto il **10/10/2026**. Non deriva dal manuale RH24: serve a RS Mioni (il cliente) per
> seguire l'andamento delle campagne di acquisizione hotel e cosa fa Chip in automatico.

---

## 1. Cosa mostra

Pagina `/marketing` (voce **Marketing** nel menu del Gestore Hotel; anche profilo Admin, che atterra qui dalla root).

| Blocco | Contenuto |
|--------|-----------|
| KPI | Speso/budget (barra), Impression, Click + CTR, Lead + costo/lead, Appuntamenti + % lead → appuntamento + quanti gestiti da Chip, Clienti |
| Funnel | Impression → Click → Lead → Appuntamenti → Clienti. Ogni barra = conversione rispetto allo stadio precedente |
| Campagne | Tabella per piattaforma: stato, budget, speso, impression, click, CTR, lead (dalla tabella lead, con tra parentesi quelli dichiarati dalla piattaforma se diversi), €/lead. Icona ✦ = creatività e testi generati con Chip |
| Budget per piattaforma | Traccia = budget, barra piena = speso |
| Appuntamenti | Schede: data/ora, struttura, tipo, stato, pill **Spostato** con orario originale barrato, riga "Gestito in automatico da Chip via WhatsApp" |
| Lead | Tabella: ricevuto, struttura, referente, città, fonte, campagna, stato, gestione (Chip/Team) |
| Attività | Timeline degli eventi: chi ha fatto cosa (Chip / Cliente / Team) e quando |

**Regola dei dati mancanti:** le metriche di piattaforma (speso, impression, click) sono `null` finché non vengono
caricate e la UI le mostra come «—», mai come 0. Un avviso in testa alla pagina lo ricorda finché tutto è vuoto.

**Non filtrato per hotel.** I dati sono a livello RS Mioni, non della struttura selezionata.

## 2. Da dove arrivano i dati

Oggi: **caricamento manuale** da `database/data/marketing.json` con

```bash
php artisan marketing:importa              # legge database/data/marketing.json
php artisan marketing:importa altro.json
php artisan marketing:importa --pulisci    # elimina anche i record non più presenti nel file
```

Il comando è idempotente: ogni record ha un `codice` stabile, rilanciare aggiorna e non duplica.
`MarketingSeeder` chiama lo stesso comando (incluso in `DatabaseSeeder`).

Passo successivo previsto (non fatto): collegamento alle API Meta Marketing / Google Ads per impression,
click e spesa, e aggancio dell'automazione WhatsApp di Chip per scrivere lead, appuntamenti ed eventi
direttamente (`meta.fonte_dati` passerà da `import_manuale` ad `api`).

### Formato del JSON

```jsonc
{
  "campagne": [{
    "codice": "fb-lead-hotel",            // obbligatorio, stabile
    "nome": "Facebook — Lead hotel Veneto", // obbligatorio
    "piattaforma": "facebook",            // facebook | instagram | google | youtube | display | retargeting | altro
    "obiettivo": "Generazione contatti",
    "stato": "attiva",                    // bozza | attiva | in_pausa | conclusa
    "budget": 250, "speso": 118.4,        // euro; null = non caricato
    "impression": 21500, "click": 310,    // null = non caricato
    "lead_dichiarati": 4,                 // lead secondo la piattaforma (facoltativo)
    "contenuti_ai": true,                 // creatività/testi generati con Chip
    "data_inizio": "2026-10-01", "data_fine": null,
    "note": "..."
  }],
  "lead": [{
    "codice": "lead-001", "campagna": "fb-lead-hotel",   // campagna = codice campagna (facoltativo)
    "struttura": "Hotel Esempio", "referente": "Mario Rossi", "citta": "Abano Terme",
    "telefono": "+39 ...", "email": "...",
    "fonte": "facebook",
    "stato": "appuntamento",              // nuovo | contattato | qualificato | appuntamento | cliente | perso
    "gestito_da": "chip",                 // chip | umano
    "ricevuto_at": "2026-10-08 18:40",    // ora italiana, obbligatorio
    "note": "..."
  }],
  "appuntamenti": [{
    "codice": "app-001", "lead": "lead-001",             // lead = codice lead, obbligatorio
    "inizio": "2026-10-13 15:00",         // obbligatorio
    "inizio_originale": "2026-10-11 10:30", // solo se spostato
    "durata_minuti": 30,
    "tipo": "demo_online",                // demo_online | visita | chiamata
    "stato": "confermato",                // programmato | confermato | completato | annullato | no_show
    "gestito_da": "chip_whatsapp",        // chip_whatsapp | umano
    "note": "..."
  }],
  "eventi": [{
    "codice": "ev-004", "lead": "lead-001", "appuntamento": "app-001",
    "tipo": "appuntamento_spostato",      // libero: lead_ricevuto, messaggio_whatsapp, appuntamento_fissato, richiesta_spostamento, appuntamento_spostato, ...
    "attore": "chip",                     // chip | umano | cliente
    "descrizione": "Chip ha riprogrammato ...",
    "avvenuto_at": "2026-10-10 11:22"
  }]
}
```

Gli orari sono **ora italiana e vengono salvati così come sono** (l'app ha `timezone=UTC`, nessuna conversione).

## 3. Stato dei dati al 10/10/2026

Dati allineati al blocco "Campagna media" del portale Smartera per il cliente RS Mioni.

- Piano Media Lancio: **900 €** in 6 settimane dal 23/09 al 03/11/2026 (Google Search 380, Meta 330 diviso
  Facebook 190 + Instagram 140, YouTube retargeting 110, riserva 80 da assegnare in settimana 5).
- Speso 378 € (42%), 473 clic, 14 lead, 7 demo su Meet (2 fatte, 4 confermate, 1 da confermare), 2 lead persi.
- La demo di Albergo Al Ponte, fissata per domenica 11/10 10:30, e' stata **spostata a martedi' 13/10 16:00 su
  richiesta del cliente, gestita in automatico da Chip via WhatsApp**.
- Aggiornamenti successivi: modificare `marketing.json` e rilanciare l'import; nel portale Smartera si aggiornano
  dalla pagina del progetto.

## 4. Implementazione

| Pezzo | File |
|-------|------|
| Migration | `database/migrations/2026_10_10_000001_create_marketing_tables.php` — tabelle `marketing_campagne`, `marketing_lead`, `marketing_appuntamenti`, `marketing_eventi` |
| Enum | `app/Enums/Marketing/{Piattaforma,StatoCampagna,StatoLead,StatoAppuntamento}.php` |
| Modelli | `app/Models/Marketing/{Campagna,Lead,Appuntamento,EventoMarketing}.php` |
| Calcolo KPI | `app/Services/MarketingService.php` (`dashboard()`) |
| Import | `app/Console/Commands/ImportaMarketing.php`, `database/seeders/MarketingSeeder.php`, `database/data/marketing.json` |
| Controller / rotta | `app/Http/Controllers/Marketing/MarketingController.php`, `GET /marketing` (`role:gestore_hotel,admin`) |
| UI | `resources/js/Pages/Marketing/Index.tsx`, tipi in `resources/js/types/marketing.ts`, voce menu in `Layouts/GestoreHotelLayout.tsx` |
| Test | `tests/Feature/MarketingTest.php` |

### Assunzioni

- La pagina è di sola lettura: niente form di inserimento. L'aggiornamento passa dal JSON (o, in futuro, dalle API).
- "Appuntamenti" nel funnel conta i **lead con almeno un appuntamento valido** (programmato/confermato/completato);
  annullati e no-show non contano. Il KPI "Appuntamenti" conta invece gli appuntamenti validi.
- Visibilità: tutti gli account `gestore_hotel` vedono il modulo. Oggi l'unico gestore è il cliente RS Mioni;
  **quando arriveranno veri hotel clienti, restringere la rotta e la voce di menu al solo profilo `admin`**
  (o a un flag per utente).
- Colori piattaforma: palette categorica fissa (Facebook blu, Instagram magenta, Google giallo, YouTube rosso,
  display acquamarina, retargeting viola), sempre affiancata dall'etichetta testuale.
