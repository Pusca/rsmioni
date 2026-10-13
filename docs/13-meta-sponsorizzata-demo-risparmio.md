# 13 — Sponsorizzata Meta: «Demo gratuita di 20 minuti» (angolo: risparmio con la receptionist virtuale)

> Preparato il **13/10/2026**. Obiettivo: far prenotare una **demo gratuita di 20 minuti** a hotel e strutture ricettive.
> Messaggio unico: **risparmi sulla reception senza rinunciare alla persona vera**, perché RS Mioni è *receptionist AI + receptionist umano da remoto*.
> Esecuzione **headless** (senza Gestione inserzioni) con `marketing/meta/crea_campagna.py` (Marketing API). Specifica unica: `marketing/meta/campagna-demo-risparmio.json`.

---

## 1. In breve

| Voce | Scelta |
|------|--------|
| Obiettivo Meta | Contatti (OUTCOME_LEADS) con **modulo istantaneo** «higher intent» (schermata di riepilogo prima dell'invio) |
| Perché modulo e non landing | rsmioni.it oggi è solo il login dell'app: non c'è una landing pubblica. Il modulo precompila nome/telefono/email e il lead arriva a Chip in pochi minuti. Quando esisterà una landing si potrà fare un test A/B |
| Pubblico freddo | Veneto, Friuli-Venezia Giulia, Trentino-Alto Adige + raggio 40 km su Verona e Brescia (Garda). 28-65 anni. Interessi: hotel, B&B, agriturismo, hospitality management, Booking.com. Advantage+ audience attivo |
| Pubblico bando | Treviso (35 km) e Belluno (40 km): inserzione dedicata al bando CCIAA «Doppia transizione», fino al 22/10 |
| Retargeting | Chi ha aperto il modulo senza inviarlo o ha interagito con pagina/IG negli ultimi 90 giorni. Si attiva dal 17/10 |
| Posizionamenti | Advantage+ (feed FB/IG, storie, reel, Marketplace…). Immagini 1:1 e 9:16 pronte |
| Budget | 6 €/g freddo + 2 €/g bando (8 giorni) + 1,5 €/g retargeting ≈ **160 € fino al 03/11**: i 139 € residui della quota Meta del Piano Media + 20 € dalla riserva. Il resto della riserva (60 €) va al gruppo con il costo/lead più basso dal 21/10 |
| Periodo | Dal **15/10/2026** al **03/11/2026** (fine del Piano Media Lancio) |
| CTA | **Prenota ora** → modulo → pagina di ringraziamento con bottone WhatsApp |
| Dopo il modulo | Chip scrive su WhatsApp entro 2 ore (orario di lavoro) con tre orari; demo su Meet o telefono; stima costi e risparmio; aiuto per il bando |
| KPI | Costo per lead ≤ 30 € (oggi 23 €), lead → demo fissata ≥ 60 %, demo fatte / fissate ≥ 70 % |

---

## 2. L'argomento del risparmio: numeri e regole

Il pubblico sono albergatori: il risparmio va detto in euro, non in percentuali vaghe. Numeri usati e come sono stati stimati (**assunzione A30 in `assumptions.md`, da validare con Edoardo prima di attivare**):

| Voce | Stima | Base |
|------|-------|------|
| Costo azienda di un receptionist a tempo pieno | **≈ 31.000 €/anno** | CCNL Turismo liv. 4: ≈ 1.700 € lordi × 14 mensilità ≈ 23.800 € + contributi e TFR ≈ 30 % |
| Presidio notturno 7 notti su 7 | ≈ 1,7 FTE ⇒ **≈ 50.000 €/anno** | 63 h/settimana di notte, ferie e riposi, maggiorazioni notturne |
| Claim usato nelle inserzioni | «Un receptionist di notte costa **più di 30.000 € l'anno**» | È la versione **conservativa** (1 FTE). Regge anche se un hotel paga meno della media |

Regole di copy (Meta e onestà):
- Mai «risparmi X €»: il risparmio dipende dalla struttura. Si dice «a una frazione di quel costo» e si promette **una stima chiara in demo**.
- **Niente prezzi di RS Mioni** negli annunci: non c'è un listino pubblico e il prezzo si costruisce in demo (licenza / installazione / totem / modulo AI, vedi doc 11).
- **Niente POS**: l'integrazione è ancora da validare (A22), quindi nelle inserzioni si parla di documenti letti dalla telecamera e chiavi consegnate dal totem, non di pagamento.
- Niente «sostituisce il receptionist»: il messaggio è *meno ore al banco*, non licenziamenti. La persona vera resta sempre nel frame.
- Bando: citare sempre ente, percentuale e data di chiusura; «totem compreso» è coerente con doc 11 (chiosco come bene strumentale) ma **va riverificato sul testo ufficiale** prima di attivare l'inserzione D.

---

## 3. Testi delle inserzioni

Quattro inserzioni. A, B, C girano nel gruppo freddo (Meta sceglie la migliore, dopo 7 giorni si spengono le peggiori); D nel gruppo bando; A e D nel retargeting. Tutti i testi sono nel JSON e vengono caricati così come sono.

### A — «Il conto della notte» (immagine: totem con receptionist AI)

| Campo | Testo |
|-------|-------|
| Testo principale | Quanto ti costa tenere qualcuno al banco nelle ore in cui non arriva nessuno?<br><br>Un receptionist di notte costa a un hotel più di 30.000 € l'anno. E d'inverno, o nei pomeriggi vuoti, il banco va presidiato lo stesso.<br><br>Con RS Mioni la reception risponde 24 ore su 24, a una frazione di quel costo:<br>✅ il receptionist AI fa il check-in da solo, in 5 lingue, a qualsiasi ora<br>✅ una persona vera ascolta e interviene in videochiamata quando serve<br>✅ le chiavi le consegna il totem nella hall<br><br>Prenota una demo gratuita di 20 minuti: vedi il sistema in funzione sul caso della tua struttura e ti lasciamo una stima chiara di quanto risparmi. Se non ha senso per te, te lo diciamo noi per primi. |
| Titolo | Reception 24h: AI + una persona vera |
| Descrizione | Demo gratuita di 20 minuti, senza impegno |
| Immagine | «Un receptionist di notte costa più di 30.000 € l'anno.» / «RS Mioni risponde 24 ore su 24. Receptionist AI + una persona vera.» |

### B — «Due strutture, una reception» (immagine: totem in videochiamata)

| Campo | Testo |
|-------|-------|
| Testo principale | Due strutture, due banchi, due stipendi?<br><br>Con RS Mioni un solo receptionist, da remoto, segue più strutture insieme. Il totem nella hall collega l'ospite in videochiamata con una persona vera; quando il receptionist è occupato, o è notte, il check-in lo fa il receptionist AI, in 5 lingue.<br><br>Meno ore pagate al banco. Nessun ospite davanti a una porta chiusa.<br><br>Demo gratuita di 20 minuti, su Meet o al telefono: ti mostriamo come funzionerebbe nelle tue strutture e quanto risparmi. |
| Titolo | Un receptionist per più strutture |
| Descrizione | Demo gratuita di 20 minuti |
| Immagine | «Un solo receptionist per due o tre strutture.» / «Il resto lo fa il receptionist AI, in 5 lingue, a qualsiasi ora.» |

### C — «Paga il banco solo quando serve» (immagine: totem con receptionist AI)

| Campo | Testo |
|-------|-------|
| Testo principale | Arrivo alle 23, check-in alle 6 del mattino, bassa stagione con tre camere occupate: quante ore di banco paghi per gestire pochi arrivi?<br><br>RS Mioni mette un totem nella hall: l'ospite fa il check-in con il receptionist AI, in 5 lingue, oppure parla in videochiamata con un receptionist vero che lavora da remoto. Documenti letti dalla telecamera e chiavi consegnate dal totem, senza nessuno al banco.<br><br>Tu paghi il presidio solo per le ore che servono davvero.<br><br>Prenota la demo gratuita di 20 minuti: la facciamo sul caso della tua struttura. |
| Titolo | Paga il banco solo quando serve |
| Descrizione | Check-in 24h con AI + persona vera |
| Immagine | «Paga il banco solo quando serve.» / «Arrivi tardivi e bassa stagione li gestisce RS Mioni, 24 ore su 24.» |

### D — «Bando CCIAA Treviso-Belluno» (solo province TV/BL e retargeting, fino al 22/10)

| Campo | Testo |
|-------|-------|
| Testo principale | Fino al 23 ottobre il bando «Doppia transizione» della Camera di Commercio di Treviso-Belluno copre il 50% dell'investimento in intelligenza artificiale, totem compreso.<br><br>RS Mioni è una reception a distanza: il receptionist AI fa il check-in in autonomia, in 5 lingue, e una persona vera interviene in videochiamata quando serve. Meno ore di presidio al banco, ospiti accolti a qualsiasi ora.<br><br>Prenota una demo gratuita di 20 minuti: ti mostriamo il sistema sul caso della tua struttura e ti aiutiamo con la domanda per il bando. |
| Titolo | Bando CCIAA: 50% a fondo perduto |
| Descrizione | Sportello aperto fino al 23/10 |
| Immagine | «Reception a distanza: il bando copre il 50%.» / «CCIAA Treviso-Belluno, sportello fino al 23/10. Totem compreso.» |

### Ganci brevi di riserva (da usare come «testo principale» alternativo se Meta chiede più varianti)

1. «Il banco vuoto costa come il banco pieno. Con RS Mioni paghi solo le ore che servono.»
2. «Check-in alle 2 di notte, in tedesco, senza nessuno al banco. Poi, se serve, una persona vera in videochiamata.»
3. «Un receptionist, tre strutture, zero ospiti davanti a una porta chiusa.»

---

## 4. Creatività

### Immagini (già generate)

`python -I marketing/meta/genera_creativita.py` produce in `marketing/meta/creativita/`:

| Inserzione | Feed 1:1 | Storie/Reel 9:16 |
|-----------|----------|------------------|
| A | `A-conto-della-notte-1080x1080.png` | `A-conto-della-notte-1080x1920.png` |
| B | `B-due-strutture-1080x1080.png` | `B-due-strutture-1080x1920.png` |
| C | `C-solo-quando-serve-1080x1080.png` | `C-solo-quando-serve-1080x1920.png` |
| D | `D-bando-cciaa-1080x1080.png` | `D-bando-cciaa-1080x1920.png` |

Stile: dark dashboard dell'app, totem reale (mockup di `smartera/outreach-rsmioni/make_img.py`), pill «Demo gratuita · 20 minuti», headline in Segoe UI Light, firma «RS Mioni · reception a distanza per hotel e strutture ricettive · rsmioni.it». Testo sotto il 20 % dell'area, zone sicure delle storie rispettate. Lo script headless carica oggi il formato 1:1 (Meta lo adatta); il 9:16 si aggiunge come «personalizzazione per posizionamento» dall'anteprima, o si estende lo script con `asset_feed_spec`.

### Reel 9:16, 25 secondi (da girare: registrazione schermo del chiosco + una ripresa di hall)

| Sec | Video | Voce / audio | Testo a schermo |
|-----|-------|--------------|-----------------|
| 0-3 | Hall vuota di sera, banco spento, orologio 23:40 | Silenzio, passi | **Nessuno al banco.** |
| 3-8 | Ospite davanti al totem, schermata «Benvenuto» → AI che parla (forma d'onda) | AI: «Buonasera, benvenuto. Mi dice il cognome della prenotazione?» | Il receptionist AI fa il check-in. In 5 lingue. |
| 8-13 | Documento mostrato alla telecamera, riepilogo «La sua camera è la 12», chiave consegnata | AI: «Perfetto, ho letto il documento. La sua camera è la 12.» | Documento letto dalla telecamera. Chiave dal totem. |
| 13-18 | Il riquadro del receptionist umano si allarga: Giulia saluta | Giulia: «Buonasera, sono Giulia della reception. Serve una mano con il parcheggio?» | Una persona vera, quando serve. |
| 18-23 | Schermata nera, numeri in bianco | VO: «Un receptionist di notte costa più di 30.000 euro l'anno. RS Mioni risponde 24 ore su 24, a una frazione.» | **> 30.000 €/anno** → **RS Mioni: AI + persona vera** |
| 23-25 | Pill blu | VO: «Prenota la demo gratuita di 20 minuti.» | Demo gratuita · 20 minuti → **Prenota ora** |

Sottotitoli sempre accesi (la maggior parte guarda senza audio). Nessun avatar: solo voce e forma d'onda, coerente con il prodotto.

---

## 5. Modulo istantaneo «Demo gratuita 20 min — RS Mioni»

Tipo **higher intent** (schermata di riepilogo): qualche lead in meno, ma più veri. Lingua it_IT.

**Scheda introduttiva** — titolo «Demo gratuita di 20 minuti», elenco:
- Vedi il totem e il receptionist AI in funzione, sul caso della tua struttura
- Su Meet o al telefono, nel giorno e nell'ora che scegli tu
- Ti lasciamo una stima chiara di costi e risparmio
- Se rientri nel bando CCIAA, ti aiutiamo con la domanda

Bottone: «Prenota la demo».

**Domande** (6, le prime tre precompilate da Meta):

| # | Campo | Tipo | Perché |
|---|-------|------|--------|
| 1 | Nome e cognome | precompilato | — |
| 2 | Telefono (WhatsApp) | precompilato | È il canale di Chip |
| 3 | Email | precompilato | Invito Meet |
| 4 | Nome della struttura | risposta breve | Chip apre la conversazione con il nome giusto e Edoardo prepara la demo sul caso reale |
| 5 | Quante camere ha la struttura? | scelta: Fino a 10 · Da 11 a 30 · Da 31 a 60 · Più di 60 · Più strutture | Qualifica (sotto 10 camere la demo resta ma la proposta è più leggera) |
| 6 | Quando ti pesa di più tenere qualcuno al banco? | scelta: Di notte · In bassa stagione · Pomeriggi e weekend · Sempre, costa troppo | Gancio per il primo messaggio di Chip e per la stima del risparmio |

**Privacy**: link «Informativa privacy di RS Mioni» → `https://rsmioni.it/privacy` (**pagina da pubblicare prima**, vedi §7).

**Ringraziamento**: titolo «Grazie! Ti scriviamo su WhatsApp entro 2 ore», testo «In orario di lavoro ti proponiamo tre orari per la demo di 20 minuti su Meet o al telefono. Se preferisci, scrivici subito tu.», bottone «Scrivici su WhatsApp» → `https://wa.me/393273313323?text=Ciao, ho richiesto la demo gratuita di RS Mioni`.

---

## 6. Funnel completo

```
Inserzione Meta (A/B/C freddo · D bando · A+D retargeting)
   │  click «Prenota ora»
   ▼
Modulo istantaneo (6 campi, riepilogo, privacy)
   │  invio                                   ──► chi apre e non invia → pubblico retargeting (90 gg)
   ▼
Ringraziamento + bottone WhatsApp ──► lead in Meta (leads_retrieval) ──► Chip (oggi: export/Zapier-like; domani: webhook)
   │
   ▼  entro 2 h in orario di lavoro (Lun-Ven 9-19, Sab 9-13; fuori orario: la mattina dopo alle 9)
M1  Chip su WhatsApp: saluto, richiama il «momento» scelto nel modulo, propone 3 orari
   │  risposta ──────────────────────────────── nessuna risposta dopo 24 h → M1-bis (una sola volta, poi M6 a 72 h)
   ▼
M2  Conferma: invito Meet via email + riepilogo su WhatsApp; chiede foto/planimetria della hall
   │  (richiesta di spostamento → Chip ripropone 3 orari e aggiorna l'invito: come oggi, vedi doc 12)
   ▼
M3  Promemoria il giorno prima (ore 18) · M4 promemoria 1 ora prima con link Meet
   ▼
DEMO 20 min (Edoardo): 1) il problema della struttura  2) totem + receptionist AI in funzione  3) stima costi e risparmio  4) bando se applicabile
   │  no-show → M5 (riproposta, 2 tentativi)
   ▼
M6  Post-demo entro 24 h: stima scritta, link al bando, prossimo passo (sopralluogo / prova in struttura)
   │
   ▼
Cliente ──► stato «cliente» in /marketing · lead perso con motivo
```

### Messaggi WhatsApp di Chip (testo pronto; `{…}` dai campi del modulo)

Chip si presenta come **assistente di Edoardo**: è onesto e dimostra il prodotto («AI + persona vera» anche nel funnel).

| Codice | Quando | Testo |
|--------|--------|-------|
| **M1** | Entro 2 h dal lead | Ciao {nome}, sono Chip, l'assistente di Edoardo di RS Mioni 👋 Grazie per la richiesta della demo per {struttura}. Hai scritto che il banco ti pesa soprattutto {momento}: è proprio il caso in cui il receptionist AI + la persona da remoto fanno la differenza. Per i 20 minuti su Meet (o al telefono, se preferisci) ti propongo: 1) {slot1} 2) {slot2} 3) {slot3}. Quale ti va bene? Se nessuno, dimmi tu e mi adatto. |
| **M1-bis** | +24 h senza risposta | Ciao {nome}, ti riscrivo per la demo di RS Mioni per {struttura}: se preferisci un orario diverso da quelli che ti ho proposto, basta che me lo dici. Se invece non è il momento, nessun problema: scrivimi «più avanti» e ti ricontatto io a {mese+2}. |
| **M2** | Alla conferma | Perfetto {nome}, demo fissata per {giorno} alle {ora} con Edoardo. Ti ho mandato l'invito Meet a {email} (ti basta un telefono o un pc). Se hai una foto del banco o della hall mandamela qui: così in demo vediamo subito dove starebbe il totem. A {giorno}! |
| **M3** | Giorno prima, ore 18 | Ciao {nome}, ti ricordo la demo di RS Mioni domani alle {ora} su Meet: {link}. Durata 20 minuti. Se devi spostarla, dimmelo pure qui. |
| **M4** | 1 h prima | Tra un'ora la demo con Edoardo: {link}. A dopo! |
| **M5** | No-show, +30 min | Ciao {nome}, non ci siamo trovati su Meet: capita. Ti propongo {slot1} o {slot2}, oppure dimmi tu quando ti è comodo. |
| **M6** | Entro 24 h dopo la demo | Grazie per il tempo di oggi, {nome}. Come promesso da Edoardo, qui la stima per {struttura}: {pdf/riga di stima}. {Se bando: Il bando CCIAA Treviso-Belluno chiude il 23/10: se vuoi procedere ti mando entro domani la scheda tecnica da allegare alla domanda.} Prossimo passo proposto: {sopralluogo / prova in struttura}. Ti va? |
| **M7** | Lead silente da 72 h dopo M1-bis | {nome}, chiudo qui per non disturbare. Se un giorno il banco di {struttura} torna a pesare, scrivi «demo» e si riparte. Buon lavoro! |

Regole: mai più di un messaggio non richiesto al giorno; fuori orario Chip non scrive; ogni spostamento aggiorna invito e card in `/marketing` (evento `appuntamento_spostato`); «no grazie» = lead perso con motivo, nessun altro contatto.

### Cosa fa Edoardo (20 minuti, scaletta)

1. **3 min** — «Com'è organizzata oggi la reception di {struttura}? Quante ore al banco, chi copre la notte?» (segna i numeri: sono la base della stima).
2. **10 min** — Chiosco dal vivo: check-in con receptionist AI (lingua dell'ospite, documento dalla telecamera, chiave), poi «Subentra» con la persona vera.
3. **5 min** — Stima a voce: ore di banco oggi × costo orario vs. canone RS Mioni; bando se TV/BL.
4. **2 min** — Prossimo passo: sopralluogo o prova in struttura, data concordata. Chip manda M6.

---

## 7. Prerequisiti e blocchi prima di attivare

| # | Cosa | Stato | Chi |
|---|------|-------|-----|
| 1 | **Pagina privacy pubblica** `https://rsmioni.it/privacy` (obbligatoria per il modulo). Bozza qui sotto | ❌ manca | Stanislav (pagina statica nell'app) + Edoardo (dati titolare) |
| 2 | Pagina Facebook «RS Mioni» e account Instagram collegati all'account pubblicitario; metodo di pagamento attivo | da verificare | Edoardo |
| 3 | Token di sistema (Business Manager) con `ads_management`, `pages_manage_ads`, `pages_read_engagement`, `leads_retrieval`, `business_management` | ❌ manca | Stanislav |
| 4 | Accettare i Termini per le inserzioni per acquisizione contatti (una volta, da Gestione inserzioni o dalla pagina) | da verificare | Edoardo |
| 5 | Pubblico personalizzato per il retargeting (modulo aperto non inviato 90 gg + interazione pagina/IG) → `META_RETARGETING_AUDIENCE_ID` | opzionale | Stanislav |
| 6 | Validare il claim «più di 30.000 € l'anno» (A30) e il «totem compreso» del bando sul testo ufficiale CCIAA TV-BL | ❌ | Edoardo |
| 7 | Recupero lead verso Chip: oggi export CSV/notifica email dei lead → inserimento in `marketing.json`; domani webhook `leadgen` | manuale | Stanislav |

### Bozza informativa privacy (da completare con i dati del titolare e far rivedere)

> **Informativa sul trattamento dei dati personali — art. 13 Reg. UE 2016/679**
> **Titolare**: RS Mioni di [ragione sociale], [indirizzo], P. IVA [—], email edoardo@rsmioni.it.
> **Dati trattati**: nome e cognome, telefono, email, nome e dimensione della struttura, risposte del modulo.
> **Finalità e base giuridica**: rispondere alla richiesta di demo e organizzarla (misure precontrattuali su richiesta dell'interessato, art. 6.1.b); ricontatto commerciale sul medesimo servizio (legittimo interesse, art. 6.1.f, con possibilità di opporsi in qualsiasi momento).
> **Modalità**: contatto via WhatsApp, email e telefono, anche con un assistente automatico supervisionato da una persona.
> **Conservazione**: 24 mesi dall'ultimo contatto, salvo instaurazione di un rapporto contrattuale.
> **Destinatari**: fornitori di servizi informatici e di messaggistica (Meta Platforms, Google, WhatsApp) in qualità di responsabili o titolari autonomi; nessuna diffusione.
> **Diritti**: accesso, rettifica, cancellazione, limitazione, portabilità, opposizione, reclamo al Garante; scrivendo a edoardo@rsmioni.it.

---

## 8. Esecuzione headless

Tutto parte dal JSON. Lo script usa solo la libreria standard e crea ogni oggetto **in pausa**.

```bash
# 1) immagini
python -I marketing/meta/genera_creativita.py

# 2) credenziali (solo nella sessione, mai nel repo)
$env:META_ACCESS_TOKEN = "<token di sistema>"
$env:META_AD_ACCOUNT_ID = "act_<id>"
$env:META_PAGE_ID = "<id pagina RS Mioni>"
$env:META_INSTAGRAM_ACTOR_ID = "<id IG>"          # facoltativo
$env:META_RETARGETING_AUDIENCE_ID = "<id>"         # facoltativo, altrimenti il gruppo retargeting è saltato

# 3) controllo e prova a secco
python -I marketing/meta/crea_campagna.py --verifica
python -I marketing/meta/crea_campagna.py            # stampa le 16 chiamate senza eseguirle

# 4) creazione reale (tutto PAUSED) e attivazione dopo il controllo in anteprima
python -I marketing/meta/crea_campagna.py --esegui
```

Cosa crea, nell'ordine: campagna → modulo lead (con il token della pagina) → 4 immagini → gruppi «freddo», «bando» (e «retargeting» se c'è il pubblico) → 4 creatività → 6-8 inserzioni. Le regioni, le città e gli interessi sono cercati per nome sull'API al momento dell'esecuzione. Gli id finiscono in `marketing/meta/stato-campagna.json`: rilanciare non duplica nulla.

Nota: i nomi dei campi del modulo (`context_card`, `thank_you_page`, `is_optimized_for_quality`) seguono la documentazione della Marketing API; se Meta rifiuta un campo, l'errore è stampato per intero e si corregge il payload in `modulo_lead_payload` senza toccare i testi.

### Collegamento con il modulo `/marketing`

Da aggiungere a `database/data/marketing.json` quando la campagna parte (poi `php artisan marketing:importa`):

```jsonc
{
  "codice": "meta-demo-risparmio",
  "nome": "Meta — Demo 20 min, risparmio reception (AI + persona vera)",
  "piattaforma": "facebook",
  "obiettivo": "Richiesta demo gratuita 20 min (modulo istantaneo), angolo risparmio",
  "stato": "attiva",
  "budget": 160, "speso": null, "impression": null, "click": null, "lead_dichiarati": null,
  "contenuti_ai": true,
  "data_inizio": "2026-10-15", "data_fine": "2026-11-03",
  "note": "Gruppi: freddo 6 €/g (A,B,C), bando TV-BL 2 €/g fino al 22/10 (D), retargeting 1,5 €/g (A,D). Spec in marketing/meta/."
}
```

I lead del modulo entrano con `"campagna": "meta-demo-risparmio"` e `"fonte": "facebook"` (o `"instagram"` se il lead arriva da posizionamento IG, visibile nel campo `platform` del lead Meta).

---

## 9. Lettura dei risultati e regole di decisione

| Quando | Controllo | Azione |
|--------|-----------|--------|
| Ogni giorno | Lead arrivati vs. contattati entro 2 h | Se Chip è in ritardo, Edoardo scrive a mano |
| Dopo 50 € spesi in un gruppo senza lead | Costo/lead | Pausa del gruppo, si rivede pubblico o creatività |
| Giorno 7 (21/10) | Costo/lead per inserzione | Restano le 2 migliori nel freddo; la riserva (60 €) va al gruppo con costo/lead più basso |
| 22/10 | Fine gruppo bando | Si spegne da solo (end_time); D resta solo nel retargeting senza la riga sulla scadenza, oppure si disattiva |
| Settimanale (punto del mercoledì) | Lead → demo fissata, demo fatte, obiezioni raccolte da Edoardo | Si aggiornano i testi: le obiezioni ricorrenti diventano il prossimo gancio |
| 03/11 | Chiusura | Report in `/marketing`; decisione sul rinnovo con il costo per demo fatta come metrica guida |

Soglie: costo/lead obiettivo ≤ 30 € (allarme a 60 €), lead → demo ≥ 60 %, demo fatte ≥ 70 % delle fissate, costo per demo fatta ≤ 70 €.
