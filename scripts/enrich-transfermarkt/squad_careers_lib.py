"""Funciones puras para enriquecer la carrera del plantel (spec 2026-09-23).
Sin I/O: el script enrich_squad_careers.py hace los requests y llama acá."""
import re
from html import unescape
from unicodedata import normalize as unicode_normalize

YOUTH_COMPETITION_RE = re.compile(r"juvenil|youth|junior|sub[- ]?\d{2}|\bu-?\d{2}\b|reserva|primavera|viareggio", re.I)
YOUTH_CLUB_RE = re.compile(r"\bII\b|\bIII\b|youth|juvenil|reserva|\bu-?\d{2}\b|sub[- ]?\d{2}", re.I)
# TM usa ids especiales para "Sin club" (515), "Desconocido" (75) y "Retirado" (123).
NON_CLUB_IDS = {"0", "75", "123", "515", ""}


def norm(s):
    return unicode_normalize("NFD", s or "").encode("ascii", "ignore").decode().lower().strip()


def _text(fragment):
    return re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]+>", " ", fragment))).strip()


def _iso(ddmmyyyy):
    m = re.search(r"(\d{2})/(\d{2})/(\d{4})", ddmmyyyy or "")
    return f"{m.group(3)}-{m.group(2)}-{m.group(1)}" if m else None


def _ddmmyyyy(iso):
    y, m, d = iso.split("-")
    return f"{d}/{m}/{y}"


def parse_debuts(page_html):
    start = page_html.find("<table")
    if start < 0:
        return []
    table = page_html[start:page_html.find("</table>", start)]
    section, out = "", []
    for tr in re.findall(r"<tr[^>]*>(.*?)</tr>", table, re.S):
        if 'colspan="7"' in tr:
            section = _text(tr)
            continue
        # La 1ra <td> de TM no cierra: el regex la une con la del nombre de competición,
        # así que las celdas quedan [competición, club, fecha, encuentro, entrenador, edad].
        tds = re.findall(r"<td[^>]*>(.*?)</td>", tr, re.S)
        if len(tds) < 6:
            continue
        club = re.search(r'title="([^"]+)"[^>]*href="[^"]*/verein/(\d+)', tds[1])
        date = _iso(_text(tds[2]))
        if not club or not date:
            continue
        club_id = int(club.group(2))
        opponent = ""
        for name, cid in re.findall(r'title="([^"]+)"[^>]*href="[^"]*/verein/(\d+)', tds[3]):
            if int(cid) != club_id:
                opponent = unescape(name)
                break
        out.append({
            "section": section,
            "competition": _text(tds[0]),
            "club_tm_id": club_id,
            "club_name": unescape(club.group(1)),
            "date": date,
            "opponent": opponent,
            "coach": _text(tds[4]),
        })
    return out


def pick_pro_debut(debuts):
    senior = [d for d in debuts if not YOUTH_COMPETITION_RE.search(f"{d['section']} {d['competition']}")]
    return min(senior, key=lambda d: d["date"]) if senior else None


def _label_value(page_html, label):
    i = page_html.find(label)
    if i < 0:
        return None
    for part in re.split(r"<[^>]+>", page_html[i + len(label):i + len(label) + 600]):
        value = unescape(part).replace("\xa0", " ").strip(" :\n\t")
        if value:
            return value
    return None


def parse_profile_html(page_html):
    m = re.search(r'itemprop="nationality"(.*?)</span>', page_html, re.S)
    nationalities = re.findall(r'title="([^"]+)"', m.group(1)) if m else []
    # El agente es un link a su agencia: /<slug>/beraterfirma/berater/<id>">Nombre
    agent = re.search(r'/beraterfirma/berater/(\d+)"[^>]*>\s*([^<]+?)\s*<', page_html)
    return {
        "agent": unescape(agent.group(2)) if agent else None,
        "agent_tm_id": int(agent.group(1)) if agent else None,
        "nationality": " / ".join(unescape(n) for n in nationalities) or None,
        "position": _label_value(page_html, "Posición:"),
        "foot": _label_value(page_html, "Pie:"),
        "joined_at": _iso(_label_value(page_html, "Fichado:")),
        "contract_until": _iso(_label_value(page_html, "Contrato hasta")),
    }


def normalize_transfers(raw_history, club_names):
    hist = (raw_history or {}).get("history") or {}
    rows = []
    for t in (hist.get("terminated") or []) + (hist.get("pending") or []):
        src = str((t.get("transferSource") or {}).get("clubId") or "")
        dst = str((t.get("transferDestination") or {}).get("clubId") or "")
        date = ((t.get("details") or {}).get("date") or "")[:10]
        if not date:
            continue
        rows.append({
            "date": date,
            "from_id": src, "from_name": club_names.get(src, src),
            "to_id": dst, "to_name": club_names.get(dst, dst),
            "type": (t.get("typeDetails") or {}).get("type") or "",
        })
    return sorted(rows, key=lambda r: r["date"])


def _club_sequence(transfers):
    seq = []
    for t in transfers:
        for cid, name in ((t["from_id"], t["from_name"]), (t["to_id"], t["to_name"])):
            if cid not in NON_CLUB_IDS and (not seq or seq[-1][0] != cid):
                seq.append((cid, name))
    return seq


def youth_clubs(transfers):
    seen = []
    for _, name in _club_sequence(transfers):
        if YOUTH_CLUB_RE.search(name) and name not in seen:
            seen.append(name)
    return seen


def classify_homegrown(debut, transfers, home_id=14542, home_family=frozenset({14542, 77897, 22597})):
    if debut:
        where = f"{debut['club_name']} el {_ddmmyyyy(debut['date'])}"
        detail = f" vs {debut['opponent']}" if debut.get("opponent") else ""
        detail += f" ({debut['competition']}" + (f", DT {debut['coach']})" if debut.get("coach") else ")")
        return (debut["club_tm_id"] == home_id, f"Debutó en {where}{detail}", False)
    for cid, name in _club_sequence(transfers):
        if int(cid) in home_family:
            break
        if not YOUTH_CLUB_RE.search(name):
            return (False, f"Sin debut registrado; jugó en {name} antes de llegar al club", True)
    return (True, "Sin debut profesional registrado; no pasó por otro club senior antes del club (inferido)", True)


def _api_name_parts(api_name):
    tokens = norm(api_name).replace(".", ". ").split()
    initials = [t[0] for t in tokens if t.endswith(".")]
    surname = " ".join(t for t in tokens if not t.endswith("."))
    return initials, surname


def link_api_player(tm_full_name, api_players):
    tm_tokens = norm(tm_full_name).split()
    if not tm_tokens:
        return (None, "none")
    candidates = []
    for api_id, api_name in api_players.items():
        initials, surname = _api_name_parts(api_name)
        n = len(surname.split())
        if surname and n <= len(tm_tokens) and " ".join(tm_tokens[-n:]) == surname:
            candidates.append((api_id, initials))
    if not candidates:
        return (None, "none")
    by_initial = [c for c in candidates if tm_tokens[0][0] in c[1]]
    if len(by_initial) == 1:
        return (by_initial[0][0], "exact")
    if len(candidates) == 1:
        return (candidates[0][0], "surname-only")
    if not by_initial:
        return (None, "none")
    return (None, "ambiguous")


def group_api_aliases(api_players, appearances):
    """API-Football a veces reasigna a un jugador a otro id (p. ej. usa el de un homónimo y
    después crea uno nuevo). Mismo nombre + nunca juntos en una alineación = misma persona.
    `appearances` = [(fecha, {ids en la alineación})]. Devuelve ({id canónico: nombre},
    {id canónico: [ids alias]}); el canónico es el que aparece más recientemente."""
    last_seen = {}
    for date, ids in appearances:
        for i in ids:
            last_seen[i] = max(last_seen.get(i, ""), date)
    by_name = {}
    for api_id, name in api_players.items():
        by_name.setdefault(name, []).append(api_id)
    canonical, aliases = {}, {}
    for name, ids in by_name.items():
        together = any(len(set(ids) & lineup) > 1 for _, lineup in appearances)
        if len(ids) == 1 or together:
            for i in ids:
                canonical[i] = name
            continue
        ordered = sorted(ids, key=lambda i: last_seen.get(i, ""), reverse=True)
        canonical[ordered[0]] = name
        aliases[ordered[0]] = ordered[1:]
    return canonical, aliases
