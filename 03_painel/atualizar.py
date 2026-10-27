"""Atualizacao do Painel de Oportunidades B3.

Uso (de qualquer pasta):
  python 03_painel/atualizar.py nova-versao                 # config.json: vN -> vN+1, data_versao = hoje
  python 03_painel/atualizar.py precos                      # Yahoo -> 02_etapa2_score/precos_yahoo_3m.json
  python 03_painel/atualizar.py fundamentus [--nao-aplicar] # Fundamentus -> colunas automaticas de dados_entrada.csv
  python 03_painel/atualizar.py build                       # score + 03_painel/dados/*.json + historico de scores
  python 03_painel/atualizar.py auto-datas                  # data_ref = ultimo pregao fechado; 1m e 1s antes
  python 03_painel/atualizar.py site                        # app PWA em docs/ (GitHub Pages)
  python 03_painel/atualizar.py snapshot                    # copia a versao atual para 03_painel/historico/<data>_<versao>/
  python 03_painel/atualizar.py teste                       # checagens de consistencia

Colunas manuais (cet1, cobertura, npl90, credito, perfil, ll12_rec, dy_rec, obs, var_stress...) nunca sao tocadas
pelo script. Colunas listadas em `travar` de notas_ativos.csv tambem nao (dado oficial que substitui o Fundamentus).
"""
import csv, json, re, shutil, sys, unicodedata, urllib.request
import datetime as dt
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAINEL, SCORE = ROOT / "03_painel", ROOT / "02_etapa2_score"
CFG_PATH, ENTRADA = PAINEL / "config.json", SCORE / "dados_entrada.csv"
OUT, HIST = PAINEL / "dados", PAINEL / "historico"
BRT = dt.timezone(dt.timedelta(hours=-3))
UA = {"User-Agent": "Mozilla/5.0"}

sys.path.insert(0, str(SCORE))
import score  # noqa: E402


def cfg():
    return json.loads(CFG_PATH.read_text(encoding="utf-8"))


def read_csv(path):
    with open(path, encoding="utf-8-sig") as f:
        return list(csv.DictReader(f, delimiter=";"))


def write_csv(path, rows, fields):
    tmp = path.with_suffix(".tmp")       # escreve em temporario e troca: nunca deixa o arquivo pela metade
    with open(tmp, "w", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, fieldnames=fields, delimiter=";")
        w.writeheader()
        w.writerows(rows)
    tmp.replace(path)


def notas():
    return {r["ticker"]: r for r in read_csv(PAINEL / "notas_ativos.csv")}


def num(v):
    return None if v in (None, "", "N/D") else float(v)


# ---------------------------------------------------------------- precos (Yahoo)
def cmd_precos():
    tickers = [r["ticker"] for r in read_csv(ENTRADA)] + ["^BVSP"]
    out = {}
    for t in tickers:
        sym = t if t.startswith("^") else t + ".SA"
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?range=3mo&interval=1d"
        r = json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))["chart"]["result"][0]
        q = r["indicators"]["quote"][0]
        rows = [{"d": dt.datetime.fromtimestamp(ts, BRT).date().isoformat(), "o": q["open"][i], "h": q["high"][i],
                 "l": q["low"][i], "c": q["close"][i], "v": q["volume"][i]}
                for i, ts in enumerate(r.get("timestamp", [])) if q["close"][i] is not None]
        out[t] = {"meta": {"longName": r["meta"].get("longName")}, "rows": rows}
        print(f"{t:7s} {len(rows)} pregoes, ultimo {rows[-1]['d']} {rows[-1]['c']:.2f}")
    (SCORE / "precos_yahoo_3m.json").write_text(json.dumps(out), encoding="utf-8")


# ---------------------------------------------------------------- fundamentos (Fundamentus)
def norm(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9/$%.()]", "", s)


def cells(ticker):
    url = f"https://www.fundamentus.com.br/detalhes.php?papel={ticker}"
    html = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read().decode("latin1")
    tds = re.findall(r"<td[^>]*>(.*?)</td>", html, re.S)
    return [re.sub(r"\s+", " ", unescape(re.sub(r"<[^>]*>", " ", t))).strip().strip("?").strip() for t in tds]


def pick(c, label, nth=0):
    """Valor da celula seguinte ao rotulo (nth = ocorrencia: 0 = 12 meses, 1 = 3 meses)."""
    hits = [i for i, x in enumerate(c) if norm(x) == norm(label)]
    return c[hits[nth] + 1] if len(hits) > nth and hits[nth] + 1 < len(c) else None


def br(v):
    if v is None:
        return None
    v = v.replace("%", "").replace(".", "").replace(",", ".").strip()
    try:
        return float(v)
    except ValueError:
        return None


LABELS = {  # campo -> (rotulo no Fundamentus, ocorrencia)
    "preco": ("Cotação", 0), "data_cot": ("Data últ cot", 0), "balanco": ("Últ balanço processado", 0),
    "valor_mercado": ("Valor de mercado", 0), "ev": ("Valor da firma", 0), "pe": ("P/L", 0), "pvp": ("P/VP", 0),
    "dy": ("Div. Yield", 0), "roic": ("ROIC", 0), "lc": ("Liquidez Corr", 0), "cresc": ("Cres. Rec (5a)", 0),
    "ev_ebitda": ("EV / EBITDA", 0), "margem_liq": ("Marg. Líquida", 0), "dl": ("Dív. Líquida", 0),
    "pl": ("Patrim. Líq", 0), "ll12": ("Lucro Líquido", 0), "ll3": ("Lucro Líquido", 1),
    # FIIs
    "relatorio": ("Relatório", 0), "div12": ("Dividendo/cota", 0), "ffo12": ("FFO", 0), "ffo3": ("FFO", 1),
    "rend12": ("Rend. Distribuído", 0), "venda_ativos12": ("Venda de ativos", 0), "ativos": ("Ativos", 0),
    "plf": ("Patrim Líquido", 0), "cotas": ("Nro. Cotas", 0), "vol": ("Vol $ méd (2m)", 0),
    "vacancia": ("Vacância Média", 0), "n_imoveis": ("Qtd imóveis", 0), "cap_rate": ("Cap Rate", 0),
}
TEXT_FIELDS = {"data_cot", "balanco", "relatorio"}


def parse(c):
    return {k: (pick(c, lab, n) if k in TEXT_FIELDS else br(pick(c, lab, n))) for k, (lab, n) in LABELS.items()}


def fmt(x):
    return str(int(x)) if float(x).is_integer() else str(round(x, 4))


def auto_values(row, f):
    """Colunas de dados_entrada.csv que vem do Fundamentus, por tipo de ativo."""
    if row["classe"] == "FII":
        v = {k: f[k] for k in ("preco", "pvp", "div12", "ffo12", "ffo3", "rend12", "venda_ativos12", "ativos",
                               "plf", "cotas")}
        v["vol_mi"] = round(f["vol"] / 1e6, 2) if f["vol"] is not None else None
        if row["tipo"] == "tijolo":
            v.update(vacancia=f["vacancia"], n_imoveis=f["n_imoveis"])
        return v
    v = {k: f[k] for k in ("preco", "pl", "ll12", "ll3", "pvp", "dy")}
    v["pe"] = f["pe"] if f["pe"] and f["pe"] > 0 else None     # P/L negativo fica vazio (regra do score)
    if row["tipo"] != "banco":
        v.update(roic=f["roic"], lc=f["lc"], cresc=f["cresc"])
        if row["tipo"] == "incorporadora":
            v["dl_pl"] = round(f["dl"] / f["pl"], 2) if f["dl"] is not None and f["pl"] else None
        elif f["dl"] is not None and f["ev"] and f["ev_ebitda"]:
            v["dl_ebitda"] = round(f["dl"] / (f["ev"] / f["ev_ebitda"]), 2)
    return v


def cmd_fundamentus(apply=True):
    rows, travas = read_csv(ENTRADA), {t: set(filter(None, n["travar"].split("|"))) for t, n in notas().items()}
    raw, changes = {}, []
    for r in rows:
        f = parse(cells(r["ticker"]))
        raw[r["ticker"]] = f
        for k, new in auto_values(r, f).items():
            if new is None or k in travas.get(r["ticker"], set()):
                continue
            old = num(r[k])
            if old is None or abs(new - old) > 1e-9 * max(1, abs(old)):
                changes.append((r["ticker"], k, r[k], fmt(new)))
                r[k] = fmt(new)
    data = next((v["data_cot"] for v in raw.values() if v["data_cot"]), None)
    stamp = dt.datetime.strptime(data, "%d/%m/%Y").date().isoformat() if data else dt.date.today().isoformat()
    (SCORE / f"fundamentus_{stamp}.json").write_text(json.dumps(raw, ensure_ascii=False, indent=1), encoding="utf-8")
    for c in changes:
        print(f"{c[0]:7s} {c[1]:15s} {c[2]} -> {c[3]}")
    print(f"{len(changes)} mudancas. Bruto salvo em 02_etapa2_score/fundamentus_{stamp}.json")
    bal = {t: v["balanco"] or v["relatorio"] for t, v in raw.items()}
    print("Balanco/relatorio por ativo:", ", ".join(f"{t} {b}" for t, b in bal.items()))
    if apply:
        write_csv(ENTRADA, rows, list(rows[0].keys()))
    else:
        print("(--nao-aplicar: dados_entrada.csv nao foi alterado)")


# ---------------------------------------------------------------- build
def on_or_before(rows, d):
    sel = [r for r in rows if r["d"] <= d]
    return sel[-1] if sel else None


def price_stats(rows, c):
    ref, m, s = on_or_before(rows, c["data_ref"]), on_or_before(rows, c["data_1m"]), on_or_before(rows, c["data_1s"])
    pre, st = on_or_before(rows, c["data_pre_estresse"]), on_or_before(rows, c["data_estresse"])
    upto = [r for r in rows if r["d"] <= c["data_ref"]]
    peak = max(upto, key=lambda r: r["c"])
    i = upto.index(st)
    prev = [r["v"] or 0 for r in upto[max(0, i - 20):i]]
    pct = lambda a, b: round((b / a - 1) * 100, 2)
    return {"preco_1m": round(m["c"], 2), "preco_1s": round(s["c"], 2), "preco_pre": round(pre["c"], 2),
            "preco_estresse_min": round(st["l"], 2), "preco_atual": round(ref["c"], 2),
            "var_estresse": pct(pre["c"], st["c"]), "var_1m": pct(m["c"], ref["c"]),
            "queda_pico": pct(peak["c"], ref["c"]), "data_pico": peak["d"],
            "vol_ratio": round((st["v"] or 0) / (sum(prev) / len(prev)), 1) if prev and sum(prev) else None}


def latest(pattern):
    files = sorted(SCORE.glob(pattern))
    return json.loads(files[-1].read_text(encoding="utf-8")) if files else {}


def r2(x, k=1):
    return None if x is None else round(x * k, 2)


def cmd_build():
    c, ent, nts = cfg(), {r["ticker"]: r for r in read_csv(ENTRADA)}, notas()
    precos = json.loads((SCORE / "precos_yahoo_3m.json").read_text(encoding="utf-8"))
    fund = latest("fundamentus_*.json")
    base = score.run()
    OUT.mkdir(exist_ok=True)

    ativos = []
    for pos, x in enumerate(base, 1):
        t, e, n, f = x["ticker"], ent[x["ticker"]], nts[x["ticker"]], fund.get(x["ticker"], {})
        fii = e["classe"] == "FII"
        row = {"ticker": t, "nome": n["nome"], "classe": "FII" if fii else "Ação", "segmento": n["segmento"],
               "posicao": pos, "score": round(x["total"], 1), "p1": r2(x["P1"]), "p2": r2(x["P2"]),
               "p3": r2(x["P3"]), "p4": r2(x["P4"]), "cobertura": r2(x["coverage"], 100), "status": x["status"],
               "confianca": n["confianca"], "sinal": n["sinal"], "tese": n["tese"], "risco": n["risco"],
               "nota": n["nota"], "pvp": num(e["pvp"]), "balanco": f.get("balanco") or f.get("relatorio"),
               **price_stats(precos[t]["rows"], c)}
        if fii:
            row.update(dy=r2(x["dy"]), ffo_yield=r2(x["ffoy"]), cobertura_ffo=r2(x["cov"], 100),
                       passivo_ativo=r2(x["lev"]), venda_ativos_pct=r2(x["va"], 100), vacancia=num(e["vacancia"]),
                       patrimonio_bi=r2(num(e["plf"]) / 1e9), vp_cota=r2(num(e["plf"]) / num(e["cotas"])))
        else:
            lev = e["dl_pl"] if e["tipo"] == "incorporadora" else e["dl_ebitda"]
            row.update(dy=num(e["dy_rec"]) if e["dy_rec"] else num(e["dy"]), pl_ratio=num(e["pe"]),
                       ev_ebitda=f.get("ev_ebitda"), margem_liq=f.get("margem_liq"),
                       roe=r2(x["roe12"], 100), roe_n=r2(x["roen"], 100), ms=r2(x["ms"], 100),
                       valor_justo=r2(x["pvp_just"] * num(e["preco"]) / num(e["pvp"])) if num(e["pvp"]) else None,
                       earnings_yield=r2(x["ey"], 100), payout=r2(x["payout"], 100),
                       alavancagem=num(lev), alavancagem_tipo="DL/PL" if e["tipo"] == "incorporadora" else
                       "CET1 %" if e["tipo"] == "banco" else "DL/EBITDA",
                       cet1=num(e["cet1"]), npl90=num(e["npl90"]), cobertura_pdd=num(e["cobertura"]),
                       patrimonio_bi=r2(num(e["pl"]) / 1e9))
            if e["tipo"] == "banco":
                row.update(alavancagem=num(e["cet1"]), margem_liq=None)   # Fundamentus mostra 0% para bancos
        ativos.append(row)

    serie = []
    for t in list(ent) + ["^BVSP"]:
        rows = precos[t]["rows"]
        b = on_or_before(rows, c["data_1m"])["c"]
        serie += [{"ticker": "IBOV" if t == "^BVSP" else t, "data": r["d"], "fechamento": round(r["c"], 2),
                   "base100": round(r["c"] / b * 100, 2)} for r in rows if r["d"] <= c["data_ref"]]

    macro = []
    for r in read_csv(ROOT / c["macro_csv"]):
        v = r["valor"].replace(",", ".")
        macro.append({**r, "valor_num": float(v) if re.fullmatch(r"-?\d+(\.\d+)?", v) else None})

    sens = [{"cenario": "base", "ticker": x["ticker"], "posicao": i, "score": round(x["total"], 1)}
            for i, x in enumerate(base, 1)]
    for name, (w, ke) in score.SCENARIOS.items():
        sens += [{"cenario": name, "ticker": x["ticker"], "posicao": i, "score": round(x["total"], 1)}
                 for i, x in enumerate(score.run(w, ke), 1)]

    hist_path = HIST / "scores_historico.csv"
    HIST.mkdir(exist_ok=True)
    fields = ["versao", "data_versao", "data_ref", "ticker", "posicao", "score", "p1", "p2", "p3", "p4"]
    hist = read_csv(hist_path) if hist_path.exists() else []
    hist = [h for h in hist if h["versao"] != c["versao"]]          # rebuild da mesma versao substitui
    hist += [{"versao": c["versao"], "data_versao": c["data_versao"], "data_ref": c["data_ref"], "ticker": a["ticker"],
              "posicao": a["posicao"], "score": a["score"], "p1": a["p1"], "p2": a["p2"], "p3": a["p3"], "p4": a["p4"]}
             for a in ativos]
    write_csv(hist_path, hist, fields)
    historico = [{**h, **{k: float(h[k]) for k in ("score", "p1", "p2", "p3", "p4")}, "posicao": int(h["posicao"])}
                 for h in hist]

    meta = {k: c[k] for k in ("versao", "data_versao", "data_ref", "data_1m", "data_1s", "evento",
                               "data_pre_estresse", "data_estresse")}
    meta.update(ke=score.KE * 100, g=score.G * 100, cdi_liq=round(score.CDI_LIQ, 2))
    for name, data in {"ativos": ativos, "precos": serie, "macro": macro, "sensibilidade": sens,
                       "historico": historico, "parametros": [meta]}.items():
        (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"03_painel/dados/{name}.json: {len(data)} linhas")


# ---------------------------------------------------------------- datas automaticas e site
def cmd_auto_datas():
    """data_ref = ultimo pregao fechado (hoje so conta depois das 18h de Brasilia); 1m e 1s antes dele."""
    rows = json.loads((SCORE / "precos_yahoo_3m.json").read_text(encoding="utf-8"))["^BVSP"]["rows"]
    now = dt.datetime.now(BRT)
    dias = [r["d"] for r in rows if r["d"] < now.date().isoformat() or now.hour >= 18]
    ref = dt.date.fromisoformat(dias[-1])
    ate = lambda d: [x for x in dias if x <= d.isoformat()][-1]
    c = cfg()
    c.update(data_ref=ref.isoformat(), data_1m=ate(ref - dt.timedelta(days=30)), data_1s=ate(ref - dt.timedelta(days=7)))
    CFG_PATH.write_text(json.dumps(c, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"data_ref {c['data_ref']} · 1 mes {c['data_1m']} · 1 semana {c['data_1s']}")


def cmd_site():
    """Gera o app PWA em docs/ (GitHub Pages) com a mesma pagina do painel e os dados atuais."""
    c, app, docs = cfg(), PAINEL / "painel" / "app", ROOT / "docs"
    page = (PAINEL / "painel" / "index.html").read_text(encoding="utf-8")
    scripts = re.findall(r"<script>.*?</script>", page, re.S)
    markup = re.sub(r"<script>.*?</script>", "", page, flags=re.S)
    repo = c.get("github_repo", "")
    actions = f"https://github.com/{repo}/actions/workflows/atualizar.yml" if repo else "#"
    shell = (app / "shell.html").read_text(encoding="utf-8")
    html = shell.replace("<!--PAINEL-->", markup).replace("<!--SCRIPTS-->", "\n".join(scripts)).replace("{{ACTIONS_URL}}", actions)
    (docs / "dados").mkdir(parents=True, exist_ok=True)
    (docs / "index.html").write_text(html, encoding="utf-8")
    for f in ("sw.js", "manifest.webmanifest", "icon-192.png", "icon-512.png"):
        shutil.copy2(app / f, docs / f)
    for f in OUT.glob("*.json"):
        shutil.copy2(f, docs / "dados" / f.name)
    (docs / ".nojekyll").write_text("", encoding="utf-8")
    print(f"docs/ gerado ({len(html) // 1024} KB) · botao Atualizar -> {actions}")


# ---------------------------------------------------------------- versao e historico
def cmd_nova_versao():
    c = cfg()
    c["versao"] = f"v{int(c['versao'][1:]) + 1}"
    c["data_versao"] = dt.date.today().isoformat()
    CFG_PATH.write_text(json.dumps(c, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"versao {c['versao']} ({c['data_versao']})")


def cmd_snapshot():
    c = cfg()
    dest = HIST / f"{c['data_versao']}_{c['versao']}"
    if dest.exists():
        sys.exit(f"ERRO: {dest} ja existe. O historico nunca e sobrescrito; crie uma nova versao.")
    ign = shutil.ignore_patterns("__pycache__", "*.tmp")
    for d in ("01_diagnostico", "02_etapa2_score", "dados"):
        shutil.copytree(ROOT / d, dest / d, ignore=ign)
    shutil.copytree(OUT, dest / "03_painel" / "dados", ignore=ign)
    for f in ("README.md", "fontes.md", "03_painel/notas_ativos.csv", "03_painel/config.json"):
        (dest / f).parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / f, dest / f)
    print(f"snapshot: {dest.relative_to(ROOT)}")


def cmd_teste():
    ent, nts = read_csv(ENTRADA), notas()
    ativos = json.loads((OUT / "ativos.json").read_text(encoding="utf-8"))
    assert {r["ticker"] for r in ent} == set(nts) == {a["ticker"] for a in ativos}, "tickers divergem"
    for a in ativos:
        assert 0 <= a["score"] <= 1000
        assert abs(sum(a[k] or 0 for k in ("p1", "p2", "p3", "p4")) - a["score"]) < 0.5, a["ticker"]
    assert [a["posicao"] for a in ativos] == list(range(1, len(ativos) + 1))
    assert br("1.234,5%") == 1234.5 and br("-") is None and norm("Cotação") == "cotacao"
    assert pick(["P/L", "6,91", "Lucro Líquido", "1", "Lucro Líquido", "2"], "Lucro Líquido", 1) == "2"
    print(f"ok: {len(ativos)} ativos consistentes")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    {"precos": cmd_precos, "build": cmd_build, "snapshot": cmd_snapshot, "teste": cmd_teste,
     "nova-versao": cmd_nova_versao, "auto-datas": cmd_auto_datas, "site": cmd_site,
     "fundamentus": lambda: cmd_fundamentus(apply="--nao-aplicar" not in sys.argv)}.get(cmd, lambda: print(__doc__))()
