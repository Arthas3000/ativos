"""Atualizacao do Painel de Oportunidades B3.

Uso (de qualquer pasta):
  python 03_painel/atualizar.py nova-versao                 # config.json: vN -> vN+1, data_versao = hoje
  python 03_painel/atualizar.py precos                      # Yahoo -> 02_etapa2_score/precos_yahoo_3m.json
  python 03_painel/atualizar.py fundamentus [--nao-aplicar] # Fundamentus -> colunas automaticas de dados_entrada.csv
  python 03_painel/atualizar.py build                       # score + 03_painel/dados/*.json + historico de scores
  python 03_painel/atualizar.py auto-datas                  # data_ref = ultimo pregao fechado; 1m e 1s antes
  python 03_painel/atualizar.py historico                   # Yahoo 5a + BCB -> 03_painel/dados_longos/{serie_longa,indices}.json
  python 03_painel/atualizar.py site                        # app PWA em docs/ (GitHub Pages)
  python 03_painel/atualizar.py snapshot                    # copia a versao atual para 03_painel/historico/<data>_<versao>/
                                                            # (sem dados_longos: e reproduzivel pelo comando historico e grande)
  python 03_painel/atualizar.py teste                       # checagens de consistencia

Colunas manuais (cet1, cobertura, npl90, credito, perfil, ll12_rec, dy_rec, obs, var_stress...) nunca sao tocadas
pelo script. Colunas listadas em `travar` de notas_ativos.csv tambem nao (dado oficial que substitui o Fundamentus).
"""
import csv, json, re, shutil, sys, time, unicodedata, urllib.request
import datetime as dt
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PAINEL, SCORE = ROOT / "03_painel", ROOT / "02_etapa2_score"
CFG_PATH, ENTRADA = PAINEL / "config.json", SCORE / "dados_entrada.csv"
OUT, HIST = PAINEL / "dados", PAINEL / "historico"
LONGOS = PAINEL / "dados_longos"
BRT = dt.timezone(dt.timedelta(hours=-3))
UA = {"User-Agent": "Mozilla/5.0"}
INVEST_JS = ("invest.js", "invest-store.js", "invest-sim.js", "invest-corretora.js", "invest-assistente.js", "invest-ajuda.js", "invest-nav.js",
             "invest-tour.js")

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
def janela_precos(c, hoje):
    """Inicio da janela baixada do Yahoo: o mais antigo entre (data_pre_estresse - 45 dias) e (hoje - 100 dias).
    Assim o dia pre-estresse e os 20 pregoes anteriores (media de volume) nunca saem da serie."""
    return min(dt.date.fromisoformat(c["data_pre_estresse"]) - dt.timedelta(days=45), hoje - dt.timedelta(days=100))


def cmd_precos():
    tickers = [r["ticker"] for r in read_csv(ENTRADA)] + ["^BVSP"]
    out = {}
    agora = dt.datetime.now(BRT)
    ini = janela_precos(cfg(), agora.date())
    p1 = int(dt.datetime.combine(ini, dt.time(0, 0), tzinfo=BRT).timestamp())
    p2 = int(agora.timestamp())
    for t in tickers:
        sym = t if t.startswith("^") else t + ".SA"
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={p1}&period2={p2}&interval=1d"
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
    # pico dos ultimos 3 meses (92 dias corridos): a janela baixada e maior para garantir o dia pre-estresse
    ini3m = (dt.date.fromisoformat(c["data_ref"]) - dt.timedelta(days=92)).isoformat()
    peak = max((r for r in upto if r["d"] > ini3m), key=lambda r: r["c"])
    i = upto.index(st)
    prev = [r["v"] or 0 for r in upto[max(0, i - 20):i]]
    pct = lambda a, b: round((b / a - 1) * 100, 2)
    return {"preco_1m": round(m["c"], 2), "preco_1s": round(s["c"], 2), "preco_pre": round(pre["c"], 2),
            "preco_estresse_min": round(st["l"], 2), "preco_estresse": round(st["c"], 2), "preco_atual": round(ref["c"], 2),
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
            pl_rec = bool(num(e["ll12_rec"]))      # lucro recorrente oficial substitui o contabil (score.stock)
            row.update(dy=num(e["dy_rec"]) if e["dy_rec"] else num(e["dy"]), dy_recorrente=bool(e["dy_rec"]),
                       # com ll12_rec, o P/L exibido e o recorrente (= 1 / earnings yield), coerente com EY e payout
                       pl_ratio=round(1 / x["ey"], 2) if pl_rec and x["ey"] else num(e["pe"]), pl_recorrente=pl_rec,
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

    # precos.json (graficos de Precos e do Ativo): ultimos 3 meses (92 dias corridos), como antes, e sempre
    # a partir de data_pre_estresse - 10 dias se ela for mais antiga. Pico e volume medio nao dependem desta serie.
    corte = min((dt.date.fromisoformat(c["data_ref"]) - dt.timedelta(days=92)).isoformat(),
                (dt.date.fromisoformat(c["data_pre_estresse"]) - dt.timedelta(days=10)).isoformat())
    serie = []
    for t in list(ent) + ["^BVSP"]:
        rows = precos[t]["rows"]
        b = on_or_before(rows, c["data_1m"])["c"]
        serie += [{"ticker": "IBOV" if t == "^BVSP" else t, "data": r["d"], "fechamento": round(r["c"], 2),
                   "base100": round(r["c"] / b * 100, 2)} for r in rows if corte <= r["d"] <= c["data_ref"]]

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
    m = re.search(r"(\d{4}-\d{2}-\d{2})", Path(c["macro_csv"]).name)      # snapshot_mercado_<data>.csv
    meta["data_macro"] = m.group(1) if m else c["data_ref"]
    for name, data in {"ativos": ativos, "precos": serie, "macro": macro, "sensibilidade": sens,
                       "historico": historico, "parametros": [meta]}.items():
        (OUT / f"{name}.json").write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")
        print(f"03_painel/dados/{name}.json: {len(data)} linhas")


# ---------------------------------------------------------------- historico longo (Yahoo 5 anos + BCB)
def parse_yahoo(js, data_ref, casas=2):
    """Resposta da chart API do Yahoo (completa ou so result[0]) -> {'d','c','div'} (funcao pura, sem rede).
    d crescente e sem duplicatas, so datas <= data_ref; close nulo e descartado; div = [[data_ex, valor]] ordenado."""
    r = js["chart"]["result"][0] if "chart" in js else js
    q = r["indicators"]["quote"][0]
    por_data = {}
    for i, ts in enumerate(r.get("timestamp") or []):
        c = q["close"][i] if i < len(q["close"]) else None
        d = dt.datetime.fromtimestamp(ts, BRT).date().isoformat()
        if c is None or d > data_ref:
            continue
        por_data[d] = round(float(c), casas)          # data repetida: vale a ultima linha
    datas = sorted(por_data)
    divs = {}
    for ev in ((r.get("events") or {}).get("dividends") or {}).values():
        d = dt.datetime.fromtimestamp(ev["date"], BRT).date().isoformat()
        if d <= data_ref and ev.get("amount") and ev["amount"] > 0:
            divs[d] = round(float(ev["amount"]), 4)
    return {"d": datas, "c": [por_data[d] for d in datas], "div": [[d, divs[d]] for d in sorted(divs)]}


def parse_sgs(lista, mensal=False):
    """SGS do BCB [{'data': 'DD/MM/AAAA', 'valor': '0.029256'}] -> (datas, valores). Mensal: datas 'AAAA-MM'."""
    por_data = {}
    for x in lista:
        try:
            dd, mm, aa = x["data"].split("/")
            d = f"{aa}-{mm}" if mensal else f"{aa}-{mm}-{dd}"
            por_data[d] = float(str(x["valor"]).replace(",", "."))
        except (KeyError, ValueError, AttributeError):
            continue                                   # linha sem valor ou data invalida
    datas = sorted(por_data)
    return datas, [por_data[d] for d in datas]


def http_json(url):
    return json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30))


def cmd_historico():
    """Serie diaria de 5 anos (fechamento + dividendos) e indices CDI/IPCA em 03_painel/dados_longos/.
    Falha por ticker ou serie vai para 'falhas' e o comando termina com codigo 0."""
    c = cfg()
    ref = c["data_ref"]
    agora = dt.datetime.now(BRT).isoformat(timespec="seconds")
    nomes = {t: n["nome"] for t, n in notas().items()}
    tickers = [r["ticker"] for r in read_csv(ENTRADA)] + [t for t in c.get("extras", [])] + ["IBOV"]
    tickers = list(dict.fromkeys(t.strip().upper() for t in tickers if t.strip()))
    ativos, falhas = {}, {}
    ant = json.loads((LONGOS / "serie_longa.json").read_text(encoding="utf-8")) if (LONGOS / "serie_longa.json").exists() else {}
    # 5 anos + 15 dias antes de data_ref: "range=5y" comecava um pregao depois e deixava "Ultimos 5 anos" sem dados
    d_ref = dt.date.fromisoformat(ref)
    p1 = dt.datetime.combine(dt.date(d_ref.year - 5, d_ref.month, min(d_ref.day, 28)) - dt.timedelta(days=15), dt.time(), BRT)
    p2 = dt.datetime.combine(d_ref + dt.timedelta(days=1), dt.time(23, 59), BRT)
    janela = f"period1={int(p1.timestamp())}&period2={int(p2.timestamp())}"
    for t in tickers:
        sym = "^BVSP" if t == "IBOV" else t + ".SA"
        url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?{janela}&interval=1d&events=div"
        try:
            js = http_json(url)
            moeda = (js["chart"]["result"][0]["meta"].get("currency") or "BRL").upper()
            if moeda != "BRL":
                raise ValueError(f"moeda {moeda} (so BRL)")
            s = parse_yahoo(js, ref, 0 if t == "IBOV" else 2)
            if not s["d"]:
                raise ValueError("sem pregoes")
            meta = js["chart"]["result"][0]["meta"]
            ativos[t] = {"nome": "Ibovespa" if t == "IBOV" else nomes.get(t) or meta.get("longName") or meta.get("shortName") or t,
                         "moeda": "BRL", **s}
            print(f"{t:7s} {len(s['d'])} pregoes, {len(s['div'])} dividendos, {s['d'][0]} a {s['d'][-1]}")
        except Exception as e:  # noqa: BLE001 - qualquer falha de rede/formato vira aviso, nunca aborta
            velho = (ant.get("ativos") or {}).get(t)
            if velho and velho.get("d"):                 # falha passageira nao apaga a ultima serie boa
                ativos[t] = velho
                falhas[t] = f"{e} (mantida a serie anterior, ate {velho['d'][-1]})"
            else:
                falhas[t] = str(e)
            print(f"{t:7s} FALHOU: {falhas[t]}")
        time.sleep(0.2)
    LONGOS.mkdir(exist_ok=True)
    fonte = ("Yahoo Finance chart API (5 anos + 15 dias ate data_ref, interval=1d, events=div); close ajustado so por desdobramento; "
             "dividendos por acao na data ex")
    serie = {"gerado_em": agora, "fonte": fonte, "data_ref": ref, "ativos": ativos, "falhas": falhas}
    (LONGOS / "serie_longa.json").write_text(json.dumps(serie, ensure_ascii=False), encoding="utf-8")

    fim = dt.date.fromisoformat(ref)
    ini = fim.replace(year=fim.year - 5, day=1) - dt.timedelta(days=31)          # 5 anos + 1 mes
    idx = {"gerado_em": agora, "fonte": "Banco Central do Brasil — SGS (série 12 CDI % a.d.; série 433 IPCA % a.m.)"}
    falhas_i = {}
    idx_ant = json.loads((LONGOS / "indices.json").read_text(encoding="utf-8")) if (LONGOS / "indices.json").exists() else {}
    for nome, n, unidade, mensal in (("cdi", 12, "% ao dia", False), ("ipca", 433, "% no mês", True)):
        url = (f"https://api.bcb.gov.br/dados/serie/bcdata.sgs.{n}/dados?formato=json"
               f"&dataInicial={ini.strftime('%d/%m/%Y')}&dataFinal={fim.strftime('%d/%m/%Y')}")
        try:
            datas, vals = parse_sgs(http_json(url), mensal)
            if not datas:
                raise ValueError("serie vazia")
            print(f"{nome.upper():7s} {len(datas)} pontos, {datas[0]} a {datas[-1]}")
        except Exception as e:  # noqa: BLE001
            velho = idx_ant.get(nome) or {}
            datas, vals = velho.get("m" if mensal else "d") or [], velho.get("v") or []
            falhas_i[nome] = f"{e} (mantida a serie anterior)" if datas else str(e)
            print(f"{nome.upper():7s} FALHOU: {falhas_i[nome]}")
        idx[nome] = {"serie": n, "unidade": unidade, ("m" if mensal else "d"): datas, "v": vals}
    idx["falhas"] = falhas_i
    (LONGOS / "indices.json").write_text(json.dumps(idx, ensure_ascii=False), encoding="utf-8")
    print(f"historico: {len(ativos)} series, {len(falhas)} falhas; indices com {len(falhas_i)} falhas "
          f"(03_painel/dados_longos/)")


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


def indice_raiz(html):
    """index.html da raiz (GitHub Pages serve a raiz): mesmo html, com referencias apontando para docs/.
    Substituicoes literais; cada uma precisa acontecer, senao falha (assert)."""
    subs = [("window.PB_BASE = '';", "window.PB_BASE = 'docs/';"),
            ('href="manifest.webmanifest"', 'href="docs/manifest.webmanifest"'),
            ('href="icon-192.png"', 'href="docs/icon-192.png"'),
            ("register('sw.js')", "register('docs/sw.js', { scope: './docs/' })")]
    subs += [(f'src="{f}"', f'src="docs/{f}"') for f in INVEST_JS]
    for a, b in subs:
        assert a in html, f"index da raiz: trecho nao encontrado: {a}"
        html = html.replace(a, b)
    return html


def cmd_site():
    """Gera o app PWA em docs/ (GitHub Pages) e o index.html da raiz, com a mesma pagina do painel e os dados atuais.
    Copia tambem os invest*.js e, se existirem, os JSONs de 03_painel/dados_longos/ (para docs/dados/)."""
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
    (ROOT / "index.html").write_text(indice_raiz(html), encoding="utf-8")
    for f in ("sw.js", "manifest.webmanifest", "icon-192.png", "icon-512.png") + INVEST_JS:
        if (app / f).exists():
            shutil.copy2(app / f, docs / f)
        else:
            print(f"AVISO: app/{f} nao existe; nao copiado")
    for f in OUT.glob("*.json"):
        shutil.copy2(f, docs / "dados" / f.name)
    if LONGOS.exists():
        for f in LONGOS.glob("*.json"):
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
    """Copia o estado da versao atual para historico/<data>_<versao>/. NAO copia 03_painel/dados_longos/ (serie de 5 anos:
    e grande e reproduzivel com o comando historico)."""
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


def teste_historico():
    """Parsers do historico longo e do index da raiz, offline, com fixtures em memoria."""
    ts = lambda d, h=13: int(dt.datetime.fromisoformat(f"{d}T{h:02d}:00:00").replace(tzinfo=BRT).timestamp())
    js = {"chart": {"result": [{"meta": {"currency": "BRL"},
          "timestamp": [ts("2026-10-22"), ts("2026-10-21"), ts("2026-10-23"), ts("2026-10-26"), ts("2026-10-27")],
          "indicators": {"quote": [{"close": [10.005, 9.0, None, 11.114, 12.0]}]},
          "events": {"dividends": {"1": {"date": ts("2026-10-26"), "amount": 0.123456},
                                    "2": {"date": ts("2026-10-21"), "amount": 0.5},
                                    "3": {"date": ts("2026-10-27"), "amount": 9.0}}}}]}}
    s = parse_yahoo(js, "2026-10-26")
    assert s["d"] == ["2026-10-21", "2026-10-22", "2026-10-26"], s["d"]              # fora de ordem ordenado; nulo e pos-data_ref fora
    assert s["c"] == [9.0, round(10.005, 2), 11.11], s["c"]
    assert s["div"] == [["2026-10-21", 0.5], ["2026-10-26", 0.1235]], s["div"]       # ordenado, 4 casas, apos data_ref descartado
    assert parse_yahoo(js["chart"]["result"][0], "2026-10-26") == s                   # aceita so result[0]
    assert parse_yahoo(js, "2026-10-26", 0)["c"] == [9.0, 10.0, 11.0]
    sem = {"timestamp": [ts("2026-10-21")], "indicators": {"quote": [{"close": [None]}]}}
    assert parse_yahoo(sem, "2026-10-26") == {"d": [], "c": [], "div": []}
    d, v = parse_sgs([{"data": "27/10/2021", "valor": "0.029256"}, {"data": "26/10/2021", "valor": "0,03"},
                      {"data": "28/10/2021", "valor": ""}])
    assert d == ["2021-10-26", "2021-10-27"] and v == [0.03, 0.029256], (d, v)
    d, v = parse_sgs([{"data": "01/09/2026", "valor": "0.48"}, {"data": "01/08/2026", "valor": "-0.11"}], mensal=True)
    assert d == ["2026-08", "2026-09"] and v == [-0.11, 0.48], (d, v)
    shell = (PAINEL / "painel" / "app" / "shell.html").read_text(encoding="utf-8")
    html = shell.replace("<!--PAINEL-->", "").replace("<!--SCRIPTS-->", "").replace("{{ACTIONS_URL}}", "#")
    raiz = indice_raiz(html)
    assert "PB_BASE = 'docs/'" in raiz and "register('docs/sw.js', { scope: './docs/' })" in raiz
    assert all(f'src="docs/{f}"' in raiz for f in INVEST_JS) and 'href="docs/manifest.webmanifest"' in raiz
    print("ok: parsers do historico longo e index da raiz")


def teste_precos_e_score(ent, ativos):
    """Janela de precos cobre o dia pre-estresse + 20 pregoes; score (CSV manual) bate com os precos do Yahoo."""
    c = cfg()
    precos = json.loads((SCORE / "precos_yahoo_3m.json").read_text(encoding="utf-8"))
    pre, est = c["data_pre_estresse"], c["data_estresse"]
    for t, v in precos.items():
        datas = [r["d"] for r in v["rows"]]
        assert pre in datas and est in datas, (
            f"{t}: precos_yahoo_3m.json nao tem {pre} (pre-estresse) e/ou {est} (estresse). "
            f"Rode 'precos' de novo: a janela baixada tem de comecar antes de data_pre_estresse")
        antes = sum(1 for d in datas if d < pre)
        assert antes >= 20, (f"{t}: so {antes} pregoes antes de {pre} em precos_yahoo_3m.json (precisa de 20 para a media "
                             f"de volume). Rode 'precos' de novo com janela maior")
    por = {a["ticker"]: a for a in ativos}
    for r in ent:
        a = por[r["ticker"]]
        d = abs(float(r["var_stress"]) - a["var_estresse"])
        assert d < 0.01, (f"{r['ticker']}: var_stress do CSV ({r['var_stress']}) difere do var_estresse do Yahoo "
                          f"({a['var_estresse']}); atualize dados_entrada.csv (o score usa o do CSV)")
        if abs(float(r["preco"]) / a["preco_atual"] - 1) > 0.005:
            print(f"AVISO: {r['ticker']}: preco do CSV/Fundamentus ({r['preco']}) difere {abs(float(r['preco']) / a['preco_atual'] - 1) * 100:.1f}% "
                  f"do fechamento do Yahoo em {c['data_ref']} ({a['preco_atual']}); valor justo e DY dos FIIs usam o do CSV")
    ib = price_stats(precos["^BVSP"]["rows"], c)["var_estresse"]
    assert abs(score.IBOV_STRESS - ib) < 0.01, (
        f"score.IBOV_STRESS ({score.IBOV_STRESS}) difere do var_estresse do ^BVSP ({ib}); revise a constante em score.py")
    fiis = sorted(a["var_estresse"] for a in ativos if a["classe"] == "FII")
    med = (fiis[(len(fiis) - 1) // 2] + fiis[len(fiis) // 2]) / 2
    for r in ent:
        if r["classe"] == "FII":
            assert abs(float(r["fii_mediana"]) - med) < 0.011, (
                f"{r['ticker']}: fii_mediana do CSV ({r['fii_mediana']}) difere da mediana dos FIIs ({med:.2f})")
    print(f"ok: janela de precos, var_stress do CSV e IBOV_STRESS ({score.IBOV_STRESS}) batem com o Yahoo")


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
    teste_precos_e_score(ent, ativos)
    teste_historico()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    {"precos": cmd_precos, "build": cmd_build, "snapshot": cmd_snapshot, "teste": cmd_teste,
     "nova-versao": cmd_nova_versao, "auto-datas": cmd_auto_datas, "site": cmd_site, "historico": cmd_historico,
     "fundamentus": lambda: cmd_fundamentus(apply="--nao-aplicar" not in sys.argv)}.get(cmd, lambda: print(__doc__))()
