"""Crea la sponsorizzata Meta «Demo 20 min — risparmio reception» in modo headless (Marketing API),
senza passare da Gestione inserzioni. Tutto nasce IN PAUSA: si attiva a mano dopo il controllo.

Uso:
  python -I marketing/meta/crea_campagna.py                 # prova a secco: stampa cosa farebbe, nessuna chiamata di scrittura
  python -I marketing/meta/crea_campagna.py --verifica      # controlla token, account pubblicitario e pagina
  python -I marketing/meta/crea_campagna.py --esegui        # crea davvero (campagna, modulo, immagini, gruppi, creatività, inserzioni)
  python -I marketing/meta/crea_campagna.py --esegui --attiva   # come sopra ma lascia campagna e gruppi ACTIVE

Variabili d'ambiente (mai nel repo):
  META_ACCESS_TOKEN            token utente di sistema / utente con ads_management, pages_manage_ads, leads_retrieval, pages_read_engagement
  META_AD_ACCOUNT_ID           es. act_1234567890
  META_PAGE_ID                 id della pagina Facebook «RS Mioni»
  META_INSTAGRAM_ACTOR_ID      (facoltativo) id dell'account Instagram collegato, per le posizioni IG con identità IG
  META_API_VERSION             (facoltativo) default v23.0
  META_RETARGETING_AUDIENCE_ID (facoltativo) pubblico personalizzato per il gruppo «retargeting»; senza, il gruppo viene saltato
  META_PRIVACY_URL             (facoltativo) sostituisce pagina.privacy_url della specifica

Stato: gli id creati finiscono in marketing/meta/stato-campagna.json (nessun segreto: si può versionare).
Rilanciare con --esegui salta i pezzi già creati (idempotente per nome/codice).
Solo libreria standard: nessuna dipendenza da installare.
"""
from __future__ import annotations

import argparse
import json
import mimetypes
import os
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import uuid
import calendar
from datetime import datetime, timedelta, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = HERE / "campagna-demo-risparmio.json"
STATO = HERE / "stato-campagna.json"
CREATIVITA = HERE / "creativita"
LEAD_LINK = "https://fb.me/"  # link convenzionale per le inserzioni con modulo (lead ads)


class Meta:
    def __init__(self, token: str, version: str, dry: bool):
        self.token = token
        self.base = f"https://graph.facebook.com/{version}"
        self.dry = dry
        self.n_dry = 0

    # ---- trasporto ------------------------------------------------------
    def _call(self, method: str, path: str, params: dict | None = None, files: dict | None = None, token: str | None = None) -> dict:
        params = {k: (json.dumps(v, ensure_ascii=False) if isinstance(v, (dict, list)) else v) for k, v in (params or {}).items() if v is not None}
        params["access_token"] = token or self.token
        url = f"{self.base}/{path.lstrip('/')}"
        if method == "GET":
            req = urllib.request.Request(url + "?" + urllib.parse.urlencode(params))
        elif files:
            boundary = "----rsmioni" + uuid.uuid4().hex
            body = b""
            for k, v in params.items():
                body += f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"\r\n\r\n{v}\r\n".encode()
            for k, fpath in files.items():
                mime = mimetypes.guess_type(fpath)[0] or "application/octet-stream"
                body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"{k}\"; filename=\"{Path(fpath).name}\"\r\n"
                         f"Content-Type: {mime}\r\n\r\n").encode() + Path(fpath).read_bytes() + b"\r\n"
            body += f"--{boundary}--\r\n".encode()
            req = urllib.request.Request(url, data=body, method="POST", headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
        else:
            req = urllib.request.Request(url, data=urllib.parse.urlencode(params).encode(), method="POST")
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            raise SystemExit(f"Meta API {method} /{path} → HTTP {e.code}: {e.read().decode(errors='replace')}") from None

    def get(self, path: str, **params) -> dict:
        return self._call("GET", path, params)

    def post(self, path: str, params: dict, files: dict | None = None, token: str | None = None, descr: str = "") -> dict:
        if self.dry:
            self.n_dry += 1
            shown = {k: v for k, v in params.items()}
            print(f"\n[{self.n_dry}] POST /{path}  {descr}")
            print(json.dumps(shown, ensure_ascii=False, indent=2)[:4000])
            if files:
                print("  file:", ", ".join(str(f) for f in files.values()))
            return {"id": f"DRY-{self.n_dry}", "hash": f"DRY-HASH-{self.n_dry}", "images": {}}
        return self._call("POST", path, params, files, token)


# ---- helper di risoluzione (sola lettura, girano anche in prova a secco) -------------------
def cerca_geo(api: Meta, q: str, tipo: str, paese: str) -> dict:
    res = api.get("search", type="adgeolocation", q=q, location_types=[tipo], country_code=paese, limit=5).get("data", [])
    if not res:
        raise SystemExit(f"Località non trovata su Meta: {q} ({tipo})")
    return res[0]


def cerca_interesse(api: Meta, nome: str) -> dict | None:
    res = api.get("search", type="adinterest", q=nome, limit=5).get("data", [])
    for r in res:
        if r["name"].lower() == nome.lower():
            return {"id": r["id"], "name": r["name"]}
    return {"id": res[0]["id"], "name": res[0]["name"]} if res else None


def targeting(api: Meta, t: dict, offline: bool) -> dict:
    geo: dict = {"location_types": ["home", "recent"]}
    if t.get("regioni"):
        geo["regions"] = [{"key": "DRY"} if offline else {"key": cerca_geo(api, r, "region", t["paese"])["key"]} for r in t["regioni"]]
    if t.get("citta_raggio_km"):
        geo["cities"] = []
        for c in t["citta_raggio_km"]:
            key = "DRY" if offline else cerca_geo(api, c["nome"], "city", t["paese"])["key"]
            geo["cities"].append({"key": key, "radius": c["raggio_km"], "distance_unit": "kilometer"})
    if "regions" not in geo and "cities" not in geo:
        geo["countries"] = [t["paese"]]
    out: dict = {"geo_locations": geo, "age_min": t["eta_min"], "age_max": t["eta_max"]}
    if t.get("interessi"):
        ints = [] if offline else [i for i in (cerca_interesse(api, n) for n in t["interessi"]) if i]
        if ints:
            out["flexible_spec"] = [{"interests": ints}]
        elif offline:
            out["flexible_spec"] = [{"interests": [{"id": "DRY", "name": n} for n in t["interessi"]]}]
    if t.get("pubblico_personalizzato_env"):
        aud = os.environ.get(t["pubblico_personalizzato_env"])
        if aud:
            out["custom_audiences"] = [{"id": aud}]
    if t.get("advantage_audience"):
        out["targeting_automation"] = {"advantage_audience": 1}
    return out


def _ultima_domenica(anno: int, mese: int) -> int:
    return max(d for d in range(25, 32) if calendar.weekday(anno, mese, d) == 6)


def ora_iso(s: str) -> str:
    """Ora italiana → ISO 8601 con offset (+02:00 con ora legale, +01:00 con ora solare).
    Regola UE senza dipendere da tzdata (assente su Windows): ora legale dall'ultima domenica di marzo
    alle 02:00 all'ultima domenica di ottobre alle 03:00."""
    dt = datetime.strptime(s, "%Y-%m-%d %H:%M")
    inizio = datetime(dt.year, 3, _ultima_domenica(dt.year, 3), 2)
    fine = datetime(dt.year, 10, _ultima_domenica(dt.year, 10), 3)
    ore = 2 if inizio <= dt < fine else 1
    return dt.replace(tzinfo=timezone(timedelta(hours=ore))).isoformat()


def chiave(testo: str) -> str:
    """Chiave ASCII per le opzioni del modulo (Meta accetta solo [a-z0-9_])."""
    t = unicodedata.normalize("NFKD", testo).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "_", t).strip("_")


def modulo_lead_payload(spec: dict, privacy_url: str) -> dict:
    m = spec["modulo_lead"]
    domande = []
    for d in m["domande"]:
        q: dict = {"type": d["tipo"]}
        if d["tipo"] == "CUSTOM":
            q["key"] = d["chiave"]
            q["label"] = d["etichetta"]
            if d.get("opzioni"):
                q["options"] = [{"value": o, "key": chiave(o)} for o in d["opzioni"]]
        domande.append(q)
    r = m["ringraziamento"]
    return {
        "name": m["nome"],
        "locale": m["locale"],
        "is_optimized_for_quality": m.get("tipo") == "higher_intent",
        "privacy_policy": {"url": privacy_url, "link_text": m["privacy_testo_link"]},
        "context_card": {
            "title": m["scheda_intro"]["titolo"],
            "style": "LIST_STYLE",
            "content": m["scheda_intro"]["testo"],
            "button_text": m["scheda_intro"]["bottone"],
        },
        "questions": domande,
        "thank_you_page": {
            "title": r["titolo"],
            "body": r["testo"],
            "button_type": r["bottone_tipo"],
            "button_text": r["bottone"],
            "website_url": r["bottone_url"],
        },
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--esegui", action="store_true", help="crea davvero (default: prova a secco)")
    ap.add_argument("--verifica", action="store_true", help="controlla solo token, account e pagina")
    ap.add_argument("--attiva", action="store_true", help="con --esegui: campagna e gruppi ACTIVE invece che PAUSED")
    args = ap.parse_args()

    for stream in (sys.stdout, sys.stderr):  # console Windows: evita errori sugli emoji dei testi
        stream.reconfigure(encoding="utf-8", errors="replace")
    spec = json.loads(SPEC.read_text(encoding="utf-8"))
    token = os.environ.get("META_ACCESS_TOKEN", "")
    reale = args.esegui or args.verifica
    account = os.environ.get("META_AD_ACCOUNT_ID", "") or ("" if reale else "act_<ID>")
    page = os.environ.get("META_PAGE_ID", "") or ("" if reale else "<PAGE_ID>")
    ig = os.environ.get("META_INSTAGRAM_ACTOR_ID")
    version = os.environ.get("META_API_VERSION", "v23.0")
    privacy_url = os.environ.get("META_PRIVACY_URL", spec["pagina"]["privacy_url"])
    dry = not args.esegui
    offline = dry and not token  # senza token non si possono nemmeno fare le ricerche di sola lettura

    if (args.esegui or args.verifica) and not (token and account and page):
        sys.exit("Servono META_ACCESS_TOKEN, META_AD_ACCOUNT_ID (act_...) e META_PAGE_ID nell'ambiente.")
    if args.esegui and not CREATIVITA.exists():
        sys.exit("Mancano le immagini: lancia prima genera_creativita.py")

    api = Meta(token, version, dry)
    if args.verifica:
        me = api.get("me", fields="id,name")
        acc = api.get(account, fields="name,currency,account_status,timezone_name")
        pg = api.get(page, fields="name,access_token")
        print("Token di:", me.get("name"), "| account:", acc.get("name"), acc.get("currency"), "stato", acc.get("account_status"), acc.get("timezone_name"))
        print("Pagina:", pg.get("name"), "| token pagina:", "ok" if pg.get("access_token") else "ASSENTE (servono pages_manage_ads)")
        return

    stato = json.loads(STATO.read_text(encoding="utf-8")) if STATO.exists() and not dry else {}

    def salva():
        if not dry:
            STATO.write_text(json.dumps(stato, ensure_ascii=False, indent=2), encoding="utf-8")

    print("Modalità:", "PROVA A SECCO (nessuna scrittura)" if dry else "ESECUZIONE REALE", "| API", version)
    if offline:
        print("Nessun META_ACCESS_TOKEN: le chiavi geografiche e gli interessi sono segnaposto «DRY».")

    # 1. Campagna
    c = spec["campagna"]
    stato_iniziale = "ACTIVE" if args.attiva else c["stato_iniziale"]
    if "campagna_id" not in stato:
        r = api.post(f"{account}/campaigns", {
            "name": c["nome"], "objective": c["obiettivo"], "buying_type": c["buying_type"],
            "special_ad_categories": c["special_ad_categories"], "status": stato_iniziale,
        }, descr="campagna")
        stato["campagna_id"] = r["id"]; salva()

    # 2. Modulo lead (serve il token della PAGINA)
    if "modulo_id" not in stato:
        page_token = None if dry else api.get(page, fields="access_token").get("access_token")
        if not dry and not page_token:
            sys.exit("Il token non può ottenere il token della pagina: servono i permessi pages_manage_ads / pages_show_list.")
        r = api.post(f"{page}/leadgen_forms", modulo_lead_payload(spec, privacy_url), token=page_token, descr="modulo lead (token pagina)")
        stato["modulo_id"] = r["id"]; salva()

    # 3. Immagini
    stato.setdefault("immagini", {})
    for code, ad in spec["inserzioni"].items():
        fname = f"{ad['immagine']['file']}-1080x1080.png"
        if fname in stato["immagini"]:
            continue
        fpath = CREATIVITA / fname
        if not dry and not fpath.exists():
            sys.exit(f"Manca {fpath}")
        r = api.post(f"{account}/adimages", {}, files={"filename": str(fpath)}, descr=f"immagine {code}")
        h = r["hash"] if dry else next(iter(r["images"].values()))["hash"]
        stato["immagini"][fname] = h; salva()

    # 4. Gruppi di inserzioni
    stato.setdefault("gruppi", {})
    for g in spec["gruppi_inserzioni"]:
        env_aud = g["targeting"].get("pubblico_personalizzato_env")
        if env_aud and not os.environ.get(env_aud):
            print(f"\n— gruppo «{g['codice']}» saltato: manca {env_aud}")
            continue
        if g["codice"] in stato["gruppi"]:
            continue
        r = api.post(f"{account}/adsets", {
            "name": g["nome"], "campaign_id": stato["campagna_id"],
            "daily_budget": int(round(g["budget_giornaliero_eur"] * 100)),
            "billing_event": "IMPRESSIONS", "optimization_goal": "LEAD_GENERATION",
            "bid_strategy": "LOWEST_COST_WITHOUT_CAP", "destination_type": "ON_AD",
            "promoted_object": {"page_id": page},
            "start_time": ora_iso(g["inizio"]), "end_time": ora_iso(g["fine"]),
            "targeting": targeting(api, g["targeting"], offline),
            "status": stato_iniziale,
        }, descr=f"gruppo {g['codice']}")
        stato["gruppi"][g["codice"]] = r["id"]; salva()

    # 5. Creatività + inserzioni
    stato.setdefault("creativita", {})
    stato.setdefault("inserzioni", {})
    for g in spec["gruppi_inserzioni"]:
        gid = stato["gruppi"].get(g["codice"])
        if not gid:
            continue
        for code in g["inserzioni"]:
            ad = spec["inserzioni"][code]
            if code not in stato["creativita"]:
                story: dict = {
                    "page_id": page,
                    "link_data": {
                        "image_hash": stato["immagini"][f"{ad['immagine']['file']}-1080x1080.png"],
                        "link": LEAD_LINK,
                        "message": ad["testo"],
                        "name": ad["titolo"],
                        "description": ad["descrizione"],
                        "call_to_action": {"type": ad["cta"], "value": {"lead_gen_form_id": stato["modulo_id"]}},
                    },
                }
                if ig:
                    story["instagram_actor_id"] = ig
                r = api.post(f"{account}/adcreatives", {"name": ad["nome"], "object_story_spec": story}, descr=f"creatività {code}")
                stato["creativita"][code] = r["id"]; salva()
            key = f"{g['codice']}/{code}"
            if key in stato["inserzioni"]:
                continue
            r = api.post(f"{account}/ads", {
                "name": f"{ad['nome']} · {g['codice']}", "adset_id": gid,
                "creative": {"creative_id": stato["creativita"][code]}, "status": stato_iniziale,
            }, descr=f"inserzione {key}")
            stato["inserzioni"][key] = r["id"]; salva()

    if dry:
        print(f"\nProva a secco finita: {api.n_dry} chiamate di scrittura previste. Rilancia con --esegui per crearle davvero.")
    else:
        print("\nFatto. Id salvati in", STATO)
        print("Campagna", stato["campagna_id"], "| modulo", stato["modulo_id"], "| gruppi", stato["gruppi"])
        print("Tutto è in stato", stato_iniziale, ": controlla l'anteprima in Gestione inserzioni e attiva.")


if __name__ == "__main__":
    main()
