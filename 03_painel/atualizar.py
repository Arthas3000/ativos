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
             "invest-modo.js", "invest-tour.js")

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


def rows_de_chart(js):
    """Resposta da chart API do Yahoo -> (longName, [{'d','o','h','l','c','v'}]) so com pregoes de fechamento valido (funcao pura)."""
    r = js["chart"]["result"][0]
    q = r["indicators"]["quote"][0]
    rows = [{"d": dt.datetime.fromtimestamp(ts, BRT).date().isoformat(), "o": q["open"][i], "h": q["high"][i],
             "l": q["low"][i], "c": q["close"][i], "v": q["volume"][i]}
            for i, ts in enumerate(r.get("timestamp", [])) if q["close"][i] is not None]
    return r["meta"].get("longName"), rows


def baixar_rows(t, p1, p2):
    sym = t if t.startswith("^") else t + ".SA"
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{sym}?period1={p1}&period2={p2}&interval=1d"
    nome, rows = rows_de_chart(json.load(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30)))
    return {"meta": {"longName": nome}, "rows": rows}


def janela_unix():
    agora = dt.datetime.now(BRT)
    ini = janela_precos(cfg(), agora.date())
    return int(dt.datetime.combine(ini, dt.time(0, 0), tzinfo=BRT).timestamp()), int(agora.timestamp())


def cmd_precos():
    tickers = [r["ticker"] for r in read_csv(ENTRADA)] + ["^BVSP"]
    out = {}
    p1, p2 = janela_unix()
    for t in tickers:
        out[t] = baixar_rows(t, p1, p2)
        rows = out[t]["rows"]
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


# ---------------------------------------------------------------- catalogo de triagem (ativos sem score)
CATALOGO_BRUTO = PAINEL / "catalogo_bruto.csv"
PLACEHOLDERS = ("Cadastro para triagem", "Validar cotação", "Pendente de análise")
SINAIS_OK = {"oportunidade", "oportunidade-com-risco", "qualidade-sem-margem", "neutro", "risco-rendimento", "armadilha"}


def _partes(v):
    return [p.strip() for p in (v or "").split(" | ") if p.strip()]


def _real(v):
    """Campo mesclado 'texto de triagem | texto real': descarta o texto padrão de triagem e fica com o último trecho real."""
    ps = _partes(v)
    reais = [p for p in ps if not p.startswith(PLACEHOLDERS)]
    return reais[-1] if reais else (ps[-1] if ps else "")


def monta_catalogo(linhas, ranking):
    """Limpa o CSV mesclado e devolve os ativos que NAO estao no ranking, sem score. Nada aqui e recomendacao:
    'status' diz se ha leitura preliminar (nao validada) ou so o cadastro de triagem."""
    saida, vistos = [], set()
    for r in linhas:
        t = r["ticker"].strip().upper()
        assert re.fullmatch(r"[A-Z][A-Z0-9]{3}\d{1,2}B?", t), f"ticker invalido no catalogo: {t}"
        assert t not in vistos, f"ticker repetido no catalogo: {t}"
        vistos.add(t)
        if t in ranking:
            continue
        sinais = [x for x in _partes(r["sinal"]) if x != "validar"]
        assert all(x in SINAIS_OK for x in sinais), f"{t}: sinal desconhecido {r['sinal']}"
        sinal = sinais[-1] if sinais else "validar"
        seg = _real(r["segmento"])
        preliminar = sinal != "validar" and not _real(r["tese"]).startswith(PLACEHOLDERS)
        saida.append({
            "ticker": t, "nome": _real(r["nome"]), "segmento": seg,
            "classe": "FII" if seg.startswith("FII") else "Ação",
            "status": "preliminar" if preliminar else "sem-analise", "sinal": sinal,
            "confianca": _real(r["confianca"]) if preliminar else "Baixa",
            "tese": _real(r["tese"]) if preliminar else "", "risco": _real(r["risco"]) if preliminar else "",
            "nota": _real(r["nota"]) if preliminar else ""})
    return sorted(saida, key=lambda x: x["ticker"])


def cmd_catalogo():
    if not CATALOGO_BRUTO.exists():
        print("AVISO: catalogo_bruto.csv nao existe; catalogo.json nao gerado")
        return
    ranking = {r["ticker"] for r in read_csv(ENTRADA)}
    cat = monta_catalogo(read_csv(CATALOGO_BRUTO), ranking)
    OUT.mkdir(exist_ok=True)
    (OUT / "catalogo.json").write_text(json.dumps(cat, ensure_ascii=False, indent=1), encoding="utf-8")
    n = sum(1 for x in cat if x["status"] == "preliminar")
    print(f"catalogo.json: {len(cat)} ativos fora do ranking ({n} com leitura preliminar, {len(cat) - n} so cadastro)")


# ---------------------------------------------------------------- ativos adicionados pelo usuario (so o ticker)
EXTRAS_MAX = 100
TICKER_RE = re.compile(r"[A-Z][A-Z0-9]{3}\d{1,2}B?")


def extrair_tickers(texto):
    """Tickers validos num texto livre (ex.: titulo de issue 'Adicionar ativo: PRIO3, TAEE11'), sem repeticao."""
    achados = re.findall(r"(?<![A-Z0-9])" + TICKER_RE.pattern + r"(?![A-Z0-9])", (texto or "").upper())
    return list(dict.fromkeys(achados))


def cmd_adicionar():
    """adicionar T1 T2 ... | adicionar --remover T1: atualiza 'extras' de config.json (limite EXTRAS_MAX)."""
    args = [a for a in sys.argv[2:] if a != "--remover"]
    remover = "--remover" in sys.argv[2:]
    novos = extrair_tickers(" ".join(args))
    if not novos:
        raise SystemExit("nenhum ticker valido informado")
    c = cfg()
    ranking = {r["ticker"] for r in read_csv(ENTRADA)}
    extras = list(c.get("extras", []))
    if remover:
        extras = [t for t in extras if t not in novos]
    else:
        for t in novos:
            if t in ranking:
                print(f"{t}: ja esta no ranking; ignorado")
            elif t not in extras:
                if len(extras) >= EXTRAS_MAX:
                    raise SystemExit(f"limite de {EXTRAS_MAX} ativos adicionados atingido; remova algum antes")
                extras.append(t)
                print(f"{t}: adicionado")
            else:
                print(f"{t}: ja estava na lista")
    c["extras"] = extras
    CFG_PATH.write_text(json.dumps(c, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _ate(d, c, dia):
    """Ultimo fechamento em data <= dia (ou None)."""
    v = None
    for x, y in zip(d, c):
        if x > dia:
            break
        v = y
    return v


def metricas_serie(d, c, div, cfg_, dias_vol=252):
    """Indicadores so da serie de precos (fechamento sem dividendos): variacoes, volatilidade anual, queda maxima, DY 12m."""
    ref = dt.date.fromisoformat(cfg_["data_ref"])
    ult = _ate(d, c, ref.isoformat())
    if ult is None:
        return None
    var = lambda dias: (lambda p: None if not p else round((ult / p - 1) * 100, 2))(_ate(d, c, (ref - dt.timedelta(days=dias)).isoformat()))
    rets = [c[i] / c[i - 1] - 1 for i in range(1, len(c)) if c[i - 1] > 0 and d[i] <= ref.isoformat()][-dias_vol:]
    vol = None
    if len(rets) >= 20:
        m = sum(rets) / len(rets)
        vol = round((sum((x - m) ** 2 for x in rets) / (len(rets) - 1)) ** 0.5 * 252 ** 0.5 * 100, 2)
    pico, mdd = 0.0, 0.0
    for dia, p in zip(d, c):
        if dia > ref.isoformat():
            break
        pico = max(pico, p)
        if pico > 0:
            mdd = min(mdd, p / pico - 1)
    ini12 = (ref - dt.timedelta(days=365)).isoformat()
    div12 = sum(v for dia, v in div if ini12 < dia <= ref.isoformat())
    est, pre = _ate(d, c, cfg_["data_estresse"]), _ate(d, c, cfg_["data_pre_estresse"])
    return {"preco": round(ult, 2), "data_preco": max(x for x in d if x <= ref.isoformat()),
            "var_1m": var(30), "var_3m": var(91), "var_12m": var(365), "vol_anual": vol, "queda_max": round(mdd * 100, 2),
            "dy12_calc": round(div12 / ult * 100, 2) if ult > 0 else None,
            "var_estresse": round((est / pre - 1) * 100, 2) if est and pre else None}


def amostra_semanal(d, c, ate):
    """Um fechamento por semana (ultimo da semana) para o grafico: lista [data, preco]."""
    out, ult = [], None
    for dia, p in zip(d, c):
        if dia > ate:
            break
        sem = dt.date.fromisoformat(dia).isocalendar()[:2]
        if ult is not None and sem != ult[0]:
            out.append(ult[1])
        ult = (sem, [dia, round(p, 2)])
    if ult:
        out.append(ult[1])
    return out


ENTRADA_COLS = ["pl", "ll12", "ll3", "pe", "pvp", "dy", "roic", "lc", "dl_ebitda", "dl_pl", "cresc", "cet1", "cobertura", "npl90",
                "div12", "ffo12", "ffo3", "rend12", "venda_ativos12", "ativos", "plf", "cotas", "vol_mi", "vacancia", "n_imoveis",
                "credito", "perfil", "ll12_rec", "dy_rec", "preco", "var_stress", "fii_mediana", "tipo", "estatal", "classe"]


def pontuar_extra(classe, fund, var_stress, fii_mediana):
    """Roda o MESMO modelo do ranking (score.stock / score.fii) com os dados automaticos; o que falta fica vazio e o peso
    e redistribuido dentro do pilar. Devolve (resultado | None, motivo | None)."""
    fii = classe == "FII"
    fund = {**{k: None for k in LABELS}, **fund}      # campo que o Fundamentus nao trouxe = vazio
    row = {k: "" for k in ENTRADA_COLS}
    row.update(classe="FII" if fii else "ACAO", estatal="0", tipo=("tijolo" if fund.get("vacancia") is not None or fund.get("n_imoveis") is not None else "papel") if fii else "geral")
    for k, v in auto_values({"classe": row["classe"], "tipo": row["tipo"]}, fund).items():
        if v is not None:
            row[k] = fmt(v)
    if var_stress is None:
        return None, "sem preços na janela do estresse"
    row["var_stress"] = fmt(var_stress)
    row["fii_mediana"] = fmt(fii_mediana) if fii_mediana is not None else ""
    try:
        if not fii:
            if num(row["pl"]) is None or num(row["pl"]) <= 0 or num(row["ll12"]) is None or num(row["ll3"]) is None or num(row["pvp"]) is None:
                return None, "faltam patrimônio, lucros ou P/VP no Fundamentus (ou patrimônio negativo)"
        elif fii_mediana is None or any(num(row[k]) in (None, 0) for k in ("preco", "pvp", "div12", "ffo12", "ffo3", "rend12", "ativos", "plf", "cotas")):
            return None, "faltam dados do FII no Fundamentus (FFO, rendimento, patrimônio ou cotas)"
        pillars, extra = score.fii(row) if fii else score.stock(row)
    except (ZeroDivisionError, TypeError, ValueError, KeyError) as e:
        return None, f"dados insuficientes para o modelo ({type(e).__name__})"
    exatos = [v for v, _ in pillars]
    pts = [None if v is None else round(v, 1) for v in exatos]
    cob = round(sum(a for _, a in pillars) / 1000, 3)
    if cob < 0.75:
        return None, f"cobertura de dados de {cob * 100:.0f}% (mínimo 75%)"
    total = round(sum(v for v in exatos if v is not None), 1)
    ms = extra.get("ms")
    return {"total": total, "p1": pts[0], "p2": pts[1], "p3": pts[2], "p4": pts[3], "cobertura": cob,
            "status": "definitivo" if cob >= 0.90 else "provisorio", "tipo_assumido": row["tipo"],
            "ms": None if ms is None else round(ms * 100, 1), "pvp_justo": round(extra["pvp_just"], 2) if "pvp_just" in extra else None,
            "_row": row, "_extra": extra}, None


def precos_extra(t, rows, c):
    """Mesmas linhas de precos.json (ticker, data, fechamento, base100) para um ativo adicionado."""
    corte = min((dt.date.fromisoformat(c["data_ref"]) - dt.timedelta(days=92)).isoformat(),
                (dt.date.fromisoformat(c["data_pre_estresse"]) - dt.timedelta(days=10)).isoformat())
    b = on_or_before(rows, c["data_1m"])["c"]
    return [{"ticker": t, "data": r["d"], "fechamento": round(r["c"], 2), "base100": round(r["c"] / b * 100, 2)}
            for r in rows if corte <= r["d"] <= c["data_ref"]]


def linha_ativo(t, nome, segmento, classe, res, fund, stats, metricas):
    """Linha no MESMO formato de ativos.json (tabelas e graficos do app leem esse formato). O que a fonte nao entrega fica None;
    nada e inventado. 'posicao' None = fora do ranking curado."""
    row, ex = res["_row"], res["_extra"]
    fii = classe == "FII"
    out = {"ticker": t, "nome": nome or t, "classe": classe, "segmento": segmento or "—", "posicao": None, "score": res["total"],
           "p1": res["p1"], "p2": res["p2"], "p3": res["p3"], "p4": res["p4"], "cobertura": round(res["cobertura"] * 100, 2),
           "status": res["status"], "confianca": "Automática", "sinal": "adicionado",
           "tese": "Nota automática calculada só com dados públicos, sem análise qualitativa.",
           "risco": (f"Queda máxima de {abs(metricas['queda_max']):.1f}% em 5 anos".replace(".", ",") if metricas and metricas.get("queda_max") is not None else "Risco não calculado")
                    + (f"; oscilação de {metricas['vol_anual']:.1f}% ao ano".replace(".", ",") if metricas and metricas.get("vol_anual") is not None else "") + " (histórico de preço).",
           "nota": "Modelo do ranking com dados automáticos (Yahoo e Fundamentus); sem ajustes manuais. Tipo assumido: " + res["tipo_assumido"] + ".",
           "pvp": num(row["pvp"]), "balanco": fund.get("balanco") or fund.get("relatorio"), **stats, "adicionado": True}
    if fii:
        out.update(dy=r2(ex.get("dy")), ffo_yield=r2(ex.get("ffoy")), cobertura_ffo=r2(ex.get("cov"), 100), passivo_ativo=r2(ex.get("lev")),
                   venda_ativos_pct=r2(ex.get("va"), 100), vacancia=num(row["vacancia"]),
                   patrimonio_bi=r2(num(row["plf"]) / 1e9) if num(row["plf"]) is not None else None,
                   vp_cota=r2(num(row["plf"]) / num(row["cotas"])) if num(row["plf"]) is not None and num(row["cotas"]) else None)
    else:
        out.update(dy=num(row["dy"]), dy_recorrente=False, pl_ratio=num(row["pe"]), pl_recorrente=False,
                   ev_ebitda=fund.get("ev_ebitda"), margem_liq=fund.get("margem_liq"),
                   roe=r2(ex.get("roe12"), 100), roe_n=r2(ex.get("roen"), 100), ms=r2(ex.get("ms"), 100),
                   valor_justo=r2(ex["pvp_just"] * num(row["preco"]) / num(row["pvp"])) if num(row["pvp"]) and num(row["preco"]) else None,
                   earnings_yield=r2(ex.get("ey"), 100), payout=r2(ex.get("payout"), 100), alavancagem=num(row["dl_ebitda"]),
                   alavancagem_tipo="DL/EBITDA", cet1=None, npl90=None, cobertura_pdd=None,
                   patrimonio_bi=r2(num(row["pl"]) / 1e9) if num(row["pl"]) is not None else None)
    return out


def construir_ficha(t, nome, serie, fund, cfg_, fii_mediana, rows=None, segmento=None):
    m = metricas_serie(serie["d"], serie["c"], serie.get("div") or [], cfg_) if serie else None
    classe = "FII" if fund and (fund.get("ffo12") is not None or fund.get("relatorio")) else "Ação"
    ficha = {"ticker": t, "nome": nome or t, "classe": classe, "data_ref": cfg_["data_ref"], "metricas": m,
             "fundamentos": None, "score": None, "motivo": None, "serie": amostra_semanal(serie["d"], serie["c"], cfg_["data_ref"]) if serie else []}
    if fund:
        ficha["fundamentos"] = {k: fund.get(k) for k in ("pl", "pvp", "dy", "roic", "lc", "cresc", "margem_liq", "ev_ebitda", "balanco", "div12", "vacancia", "n_imoveis")}
    if not m:
        ficha["motivo"] = "sem histórico de preços (Yahoo)"
    elif not fund:
        ficha["motivo"] = "sem dados do Fundamentus"
    else:
        if fund.get("preco") and m["preco"] and abs(fund["preco"] / m["preco"] - 1) > 0.15:
            ficha["aviso_preco"] = f"cotação do Fundamentus ({fund['preco']}) difere do Yahoo ({m['preco']}) em mais de 15%"
        ficha["score"], ficha["motivo"] = pontuar_extra(classe, fund, m["var_estresse"], fii_mediana)
    ficha["ativo"], ficha["precos"] = None, []
    if ficha["score"] and rows:
        try:
            ficha["ativo"] = linha_ativo(t, nome, segmento, classe, ficha["score"], fund, price_stats(rows, cfg_), m)
            ficha["precos"] = precos_extra(t, rows, cfg_)
        except (KeyError, ValueError, ZeroDivisionError, TypeError, AttributeError):  # janela de 3 meses curta demais (ativo novo): fica so na aba do ativo
            ficha["ativo"], ficha["precos"] = None, []
    if ficha["score"]:
        ficha["score"] = {k: v for k, v in ficha["score"].items() if not k.startswith("_")}
    return ficha


def cmd_extras():
    """dados/extras.json: ficha automatica de cada ativo em config.json 'extras' (preco, indicadores, nota parcial, serie semanal)."""
    c = cfg()
    OUT.mkdir(exist_ok=True)
    longas = json.loads((LONGOS / "serie_longa.json").read_text(encoding="utf-8")).get("ativos", {}) if (LONGOS / "serie_longa.json").exists() else {}
    ent = read_csv(ENTRADA)
    med = next((num(r["fii_mediana"]) for r in ent if r["classe"] == "FII" and r.get("fii_mediana")), None)
    cat = {x["ticker"]: x for x in json.loads((OUT / "catalogo.json").read_text(encoding="utf-8"))} if (OUT / "catalogo.json").exists() else {}
    p1, p2 = janela_unix()
    fichas, falhas = [], {}
    for t in c.get("extras", []):
        try:
            fund = parse(cells(t))
            if fund.get("preco") is None and fund.get("pvp") is None:
                fund = None
        except Exception as e:  # noqa: BLE001 - rede/formato: o ativo fica sem fundamentos, nunca derruba o pipeline
            fund, falhas[t] = None, f"Fundamentus: {e}"
        try:
            rows = baixar_rows(t, p1, p2)["rows"]
        except Exception as e:  # noqa: BLE001
            rows, falhas[t] = None, (falhas.get(t, "") + f" Yahoo (3 meses): {e}").strip()
        s = longas.get(t)
        fichas.append(construir_ficha(t, (s or {}).get("nome"), s, fund, c, med, rows, (cat.get(t) or {}).get("segmento")))
        print(f"{t:8s} {'nota ' + str(fichas[-1]['score']['total']) if fichas[-1]['score'] else 'sem nota: ' + str(fichas[-1]['motivo'])}")
        time.sleep(0.5)
    saida = {"gerado_em": dt.datetime.now(BRT).isoformat(timespec="seconds"), "data_ref": c["data_ref"], "fichas": fichas, "falhas": falhas,
             "aviso": "Nota automática parcial: mesmo modelo do ranking, só com dados públicos automáticos (Yahoo e Fundamentus), sem ajustes manuais. Não é recomendação."}
    (OUT / "extras.json").write_text(json.dumps(saida, ensure_ascii=False), encoding="utf-8")
    print(f"extras.json: {len(fichas)} ativos")


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

    cmd_catalogo()

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


def teste_catalogo(ent):
    ranking = {r["ticker"] for r in ent}
    bruto = [{"ticker": "AAAA3", "nome": "A | A S.A.", "segmento": "FII papel | FII papel CDI", "confianca": "Baixa | Alta", "sinal": "validar | neutro",
              "tese": "Cadastro para triagem; tese x. | Boa", "risco": "Validar cotação. | Juros", "nota": "Pendente de análise. | Ok", "travar": ""},
             {"ticker": "BBBB4", "nome": "B", "segmento": "Bancário", "confianca": "Baixa", "sinal": "validar",
              "tese": "Cadastro para triagem; tese x.", "risco": "Validar cotação.", "nota": "Pendente de análise.", "travar": ""},
             {"ticker": "CYRE3", "nome": "C", "segmento": "x", "confianca": "Alta", "sinal": "oportunidade", "tese": "t", "risco": "r", "nota": "n", "travar": ""}]
    c = {x["ticker"]: x for x in monta_catalogo(bruto, ranking)}
    assert set(c) == {"AAAA3", "BBBB4"}, "ativo do ranking deve ficar fora do catalogo"
    a, b = c["AAAA3"], c["BBBB4"]
    assert (a["nome"], a["segmento"], a["classe"], a["status"], a["sinal"], a["confianca"], a["tese"]) == ("A S.A.", "FII papel CDI", "FII", "preliminar", "neutro", "Alta", "Boa")
    assert (b["status"], b["sinal"], b["confianca"], b["tese"], b["classe"]) == ("sem-analise", "validar", "Baixa", "", "Ação")
    for x in ({**bruto[0], "ticker": "AAAA"}, {**bruto[0], "sinal": "compre"}, bruto[0] | {}):
        pass
    try:
        monta_catalogo([bruto[0], bruto[0]], ranking)
        raise SystemExit("ticker repetido deveria falhar")
    except AssertionError:
        pass
    if (OUT / "catalogo.json").exists():
        cat = json.loads((OUT / "catalogo.json").read_text(encoding="utf-8"))
        assert not ({x["ticker"] for x in cat} & ranking) and len({x["ticker"] for x in cat}) == len(cat)
        assert all(x["status"] in ("preliminar", "sem-analise") for x in cat)
        print(f"ok: catalogo com {len(cat)} ativos fora do ranking")


def teste_extras(ent):
    assert extrair_tickers("Adicionar ativo: prio3, TAEE11 e BBFI11B; xx PETR4 petr4 AB12") == ["PRIO3", "TAEE11", "BBFI11B", "PETR4"]
    assert extrair_tickers("ABCDEF3 B3SA3") == ["B3SA3"] and extrair_tickers(None) == []
    # metricas da serie, conferidas contra aritmetica direta
    ref = dt.date(2026, 10, 26)
    dias = [(ref - dt.timedelta(days=k)).isoformat() for k in range(500, -1, -1)]
    c = [10 + 0.01 * i for i in range(len(dias))]
    c[-3] = c[-4] * 0.5                       # queda de 50% no dia 24/10 (so para exercitar o drawdown)
    cfg_ = {"data_ref": ref.isoformat(), "data_estresse": ref.isoformat(), "data_pre_estresse": (ref - dt.timedelta(days=3)).isoformat()}
    div = [((ref - dt.timedelta(days=100)).isoformat(), 0.5), ((ref - dt.timedelta(days=400)).isoformat(), 9.0)]
    m = metricas_serie(dias, c, div, cfg_)
    i = {d: k for k, d in enumerate(dias)}
    ult = c[-1]
    assert m["preco"] == round(ult, 2) and m["data_preco"] == ref.isoformat()
    assert abs(m["var_12m"] - round((ult / c[i[(ref - dt.timedelta(days=365)).isoformat()]] - 1) * 100, 2)) < 1e-9
    assert abs(m["var_1m"] - round((ult / c[i[(ref - dt.timedelta(days=30)).isoformat()]] - 1) * 100, 2)) < 1e-9
    assert abs(m["dy12_calc"] - round(0.5 / ult * 100, 2)) < 1e-9, "so dividendos dos ultimos 12 meses"
    assert abs(m["var_estresse"] - round((c[-1] / c[-4] - 1) * 100, 2)) < 1e-9
    pico = max(c[:-2]); assert abs(m["queda_max"] - round((c[-3] / pico - 1) * 100, 2)) < 1e-9 and m["queda_max"] < -45
    assert m["vol_anual"] > 0 and metricas_serie(dias[:5], c[:5], [], cfg_)["vol_anual"] is None
    assert len(amostra_semanal(dias, c, cfg_["data_ref"])) < 80 and amostra_semanal(dias, c, cfg_["data_ref"])[-1][0] == ref.isoformat()
    # o caminho automatico reproduz a nota do ranking quando as entradas sao as mesmas (acao e FII)
    base = {x["ticker"]: x for x in score.run()}
    geral = next(r for r in ent if r["classe"] == "ACAO" and r["tipo"] == "geral" and not r["ll12_rec"] and not r["dy_rec"] and r["dl_ebitda"])
    ebitda = 1e9
    f = {k: num(geral[k]) for k in ("pl", "ll12", "ll3", "pvp", "dy", "roic", "lc", "cresc")}
    f.update(preco=num(geral["preco"]), pe=num(geral["pe"]), dl=num(geral["dl_ebitda"]) * ebitda, ev=ebitda * 5, ev_ebitda=5)
    f_acao = dict(f)
    r, motivo = pontuar_extra("Ação", f, num(geral["var_stress"]), None)
    assert motivo is None and abs(r["total"] - base[geral["ticker"]]["total"]) < 0.06, (geral["ticker"], r, base[geral["ticker"]]["total"])
    tij = next(r for r in ent if r["classe"] == "FII" and r["tipo"] == "tijolo")
    f = {k: num(tij[k]) for k in ("preco", "pvp", "div12", "ffo12", "ffo3", "rend12", "venda_ativos12", "ativos", "plf", "cotas", "vacancia", "n_imoveis")}
    f.update(vol=num(tij["vol_mi"]) * 1e6, relatorio="x")
    r, motivo = pontuar_extra("FII", f, num(tij["var_stress"]), num(tij["fii_mediana"]))
    assert motivo is None and abs(r["total"] - base[tij["ticker"]]["total"]) < 0.06, (tij["ticker"], r, base[tij["ticker"]]["total"])
    cfg_real = cfg()
    fa, ff = dict(f_acao), dict(f)

    # linha no formato de ativos.json e serie de precos (mesmas chaves que os ativos do ranking)
    ts0 = int(dt.datetime(2026, 10, 1, 13, tzinfo=dt.timezone.utc).timestamp())
    js = {"chart": {"result": [{"meta": {"longName": "Teste SA"}, "timestamp": [ts0 + 86400 * k for k in range(30)] + [ts0 + 86400 * 30],
                                "indicators": {"quote": [{"open": [1.0] * 31, "high": [2.0] * 31, "low": [0.5] * 31, "close": [1.5] * 30 + [None], "volume": [100] * 31}]}}]}}
    nome, rws = rows_de_chart(js)
    assert nome == "Teste SA" and len(rws) == 30 and rws[0]["c"] == 1.5, "pregao sem fechamento deve ser descartado"
    ref = dt.date.fromisoformat(cfg_real["data_ref"])
    dd = [(ref - dt.timedelta(days=k)).isoformat() for k in range(120, -1, -1)]
    rows = [{"d": d, "o": 10 + 0.01 * i, "h": 10.3 + 0.01 * i, "l": 9.7 + 0.01 * i, "c": 10 + 0.01 * i, "v": 1000 + i} for i, d in enumerate(dd)]
    ativos_real = json.loads((OUT / "ativos.json").read_text(encoding="utf-8"))
    for classe, orig, fund in (("Ação", geral, fa), ("FII", tij, ff)):
        fch = construir_ficha("TSTE3", "Teste", {"d": dd, "c": [r["c"] for r in rows], "div": []}, fund, cfg_real, num(tij["fii_mediana"]), rows, "Segmento X")
        a = fch["ativo"]
        assert a and a["posicao"] is None and a["sinal"] == "adicionado" and a["classe"] == classe and a["segmento"] == "Segmento X"
        ref_keys = set(next(x for x in ativos_real if x["classe"] == classe))
        faltam = ref_keys - set(a)
        assert not faltam, f"{classe}: chaves do ranking ausentes na linha adicionada: {faltam}"
        assert a["preco_atual"] == round(rows[-1]["c"], 2) and a["score"] == fch["score"]["total"] and "_row" not in fch["score"]
        assert abs(a["var_estresse"] - fch["metricas"]["var_estresse"]) < 0.011, "var_estresse (OHLC) = var_estresse (fechamentos)"
        pr = fch["precos"]
        assert pr and all(x["ticker"] == "TSTE3" for x in pr) and pr[-1]["data"] == cfg_real["data_ref"]
        assert [x["base100"] for x in pr if x["data"] == cfg_real["data_1m"]] == [100.0], "base100 = 100 em data_1m"

    # dado faltando nunca vira nota inventada
    assert pontuar_extra("Ação", {"pl": None}, -5.0, None)[0] is None and pontuar_extra("Ação", f, None, None)[0] is None
    assert pontuar_extra("Ação", {**{k: None for k in LABELS}, "pl": -1.0, "ll12": 1, "ll3": 1, "pvp": 1}, -5.0, None)[0] is None
    fch = construir_ficha("ZZZZ3", None, None, None, cfg_, None)
    assert fch["score"] is None and fch["motivo"] and fch["serie"] == []
    if (OUT / "extras.json").exists():
        ex = json.loads((OUT / "extras.json").read_text(encoding="utf-8"))
        assert len({x["ticker"] for x in ex["fichas"]}) == len(ex["fichas"]) and not ({x["ticker"] for x in ex["fichas"]} & {r["ticker"] for r in ent})
    print("ok: ativos adicionados (metricas da serie, mesma nota do ranking para as mesmas entradas, faltas sem nota)")


def cmd_teste():
    ent, nts = read_csv(ENTRADA), notas()
    ativos = json.loads((OUT / "ativos.json").read_text(encoding="utf-8"))
    assert {r["ticker"] for r in ent} == set(nts) == {a["ticker"] for a in ativos}, "tickers divergem"
    # CSV salvo por editor/planilha com ';' e ',' misturados perde colunas e corta textos: toda linha precisa ter todas as colunas
    cols = ["ticker", "nome", "segmento", "confianca", "sinal", "tese", "risco", "nota", "travar"]
    for t, n in nts.items():
        assert list(n.keys()) == cols and all(v is not None for v in n.values()), f"notas_ativos.csv: linha de {t} com colunas faltando ou sobrando"
        assert n["sinal"] in SINAIS_OK, f"notas_ativos.csv: sinal invalido em {t}: {n['sinal']}"
    for a in ativos:
        assert 0 <= a["score"] <= 1000
        assert abs(sum(a[k] or 0 for k in ("p1", "p2", "p3", "p4")) - a["score"]) < 0.5, a["ticker"]
    assert [a["posicao"] for a in ativos] == list(range(1, len(ativos) + 1))
    assert br("1.234,5%") == 1234.5 and br("-") is None and norm("Cotação") == "cotacao"
    assert pick(["P/L", "6,91", "Lucro Líquido", "1", "Lucro Líquido", "2"], "Lucro Líquido", 1) == "2"
    print(f"ok: {len(ativos)} ativos consistentes")
    teste_catalogo(ent)
    teste_extras(ent)
    teste_precos_e_score(ent, ativos)
    teste_historico()


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    {"precos": cmd_precos, "build": cmd_build, "snapshot": cmd_snapshot, "teste": cmd_teste,
     "nova-versao": cmd_nova_versao, "catalogo": cmd_catalogo, "adicionar": cmd_adicionar, "extras": cmd_extras, "auto-datas": cmd_auto_datas, "site": cmd_site, "historico": cmd_historico,
     "fundamentus": lambda: cmd_fundamentus(apply="--nao-aplicar" not in sys.argv)}.get(cmd, lambda: print(__doc__))()
