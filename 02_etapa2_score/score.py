"""Score de oportunidade 0-1000 (Etapa 2). Reproduzivel: python score.py
Entradas: dados_entrada.csv (mesma pasta). Saidas: resultado_score.csv + sensibilidade no stdout.
Metodologia completa: relatorio_etapa2.md, Secao 5."""
import csv, os

HERE = os.path.dirname(os.path.abspath(__file__))
KE, G = 0.18, 0.05            # custo de capital proprio nominal e crescimento perpetuo
CDI_LIQ = 14.80 * 0.85        # DI jan/28 (26/10/2026) liquido de IR 15% -> referencia FII isento
IBOV_STRESS = -13.88          # Ibovespa 23/10 -> 26/10/2026
MAX = {"P1": 300, "P2": 250, "P3": 250, "P4": 200}
SCENARIOS = {
    "pesos iguais 250x4": ({"P1": 250, "P2": 250, "P3": 250, "P4": 250}, KE),
    "P1 200/P2 300/P3 300/P4 200": ({"P1": 200, "P2": 300, "P3": 300, "P4": 200}, KE),
    "P1 360/P2 220/P3 220/P4 200": ({"P1": 360, "P2": 220, "P3": 220, "P4": 200}, KE),
    "Ke 16%": (MAX, 0.16), "Ke 20%": (MAX, 0.20),
}


def clip(x, lo=0.0, hi=1.0):
    return max(lo, min(hi, x))


def num(v):
    return None if v in ("", "N/D", None) else float(v)


def pillar(items, cap):
    """items: [(pontos ou None, peso_max)]. Peso de dado ausente e redistribuido no pilar."""
    got = [(p, w) for p, w in items if p is not None]
    avail = sum(w for _, w in got)
    if avail == 0:
        return None, 0
    return sum(p for p, _ in got) / avail * cap, avail


def stock(r, ke=KE):
    pl, ll12, ll3 = num(r["pl"]), num(r["ll12"]), num(r["ll3"])
    pvp, pe, dy = num(r["pvp"]), num(r["pe"]), num(r["dy"]) or 0.0
    if num(r.get("ll12_rec")):    # lucro recorrente oficial de 4 tri substitui o contabil
        pe = pe * ll12 / num(r["ll12_rec"]) if pe else None
        ll12 = num(r["ll12_rec"])
    if num(r.get("dy_rec")) is not None:   # DY sem proventos extraordinarios identificados
        dy = num(r["dy_rec"])
    roe12 = ll12 / pl
    roe3a = ll3 * 4 / pl
    # commodities: so ROE 12m (evita extrapolar trimestre de pico; regra da Etapa 1)
    roen = roe12 if r["tipo"] == "commodity" else (roe12 + roe3a) / 2
    bank = r["tipo"] == "banco"
    q = clip((roen - G) / (ke - G))
    pvp_just = max(0.0, (roen - G) / (ke - G))
    ms = pvp_just / pvp - 1 if pvp and pvp > 0 else None
    rel = num(r["var_stress"]) - IBOV_STRESS
    trend = clip((roe3a / roe12 - 0.5) / 0.5) if roe12 > 0 else 0.0
    p1 = pillar([
        (150 * clip((ms + 0.30) / 0.80) if ms is not None else None, 150),
        (60 * clip(-rel / 40) * q, 60),
        (90 * trend, 90),
    ], 300)

    ey = 1 / pe if pe and pe > 0 else 0.0
    if bank:
        a = 100 * clip((num(r["cet1"]) - 9.5) / 3.5) if r["cet1"] else None
        b = 50 * clip((num(r["cobertura"]) - 100) / 100) if r["cobertura"] else None
    else:
        if r["tipo"] == "incorporadora":
            a = 100 * clip(1 - num(r["dl_pl"]) / 1.0)
        else:
            lev = num(r["dl_ebitda"])
            a = 100 * clip((4 - lev) / 4) if lev is not None else None
        b = 50 * clip((num(r["lc"]) - 0.8) / 1.2) if r["lc"] else None
    p2 = pillar([(a, 100), (b, 50), (100 * clip(ey / ke), 100)], 250)

    if bank:
        b3 = 75 * clip((6 - num(r["npl90"])) / 3.5) if r["npl90"] else None
    else:
        b3 = 75 * clip(num(r["roic"]) / 20) if r["roic"] else None
    c3 = 50 * clip((num(r["cresc"]) + 5) / 20) if r["cresc"] else None
    d3 = 12.5 * (ll12 > 0) + 12.5 * (ll3 > 0)
    p3v, p3a = pillar([(100 * clip(roen / 0.25), 100), (b3, 75), (c3, 50), (d3, 25)], 250)
    if p3v is not None and r["estatal"] == "1":
        p3v = max(0.0, p3v - 15)      # desconto de governanca/ingerencia (Etapa 1, Pilar 2)

    payout = dy / 100 * pe if pe and pe > 0 else None
    if dy <= 0 or payout is None:
        b4 = 0.0
    elif payout <= 0.6:
        b4 = 80.0
    elif payout <= 1.0:
        b4 = 80 - (payout - 0.6) / 0.4 * 60
    else:
        b4 = 0.0
    if bank:
        ok_bal = num(r["cet1"]) >= 11 if r["cet1"] else False
    elif r["tipo"] == "incorporadora":
        ok_bal = num(r["dl_pl"]) < 0.6
    else:
        ok_bal = num(r["dl_ebitda"]) is not None and num(r["dl_ebitda"]) < 3
    c4 = 20 * (ll3 > 0) + 20 * ok_bal
    p4 = pillar([(80 * clip(dy / 10), 80), (b4, 80), (c4, 40)], 200)
    extra = dict(roe12=roe12, roe3a=roe3a, roen=roen, pvp_just=pvp_just, ms=ms, ey=ey, payout=payout)
    return [p1, p2, (p3v, p3a), p4], extra


def fii(r):
    pvp, price, div = num(r["pvp"]), num(r["preco"]), num(r["div12"])
    ffo12, ffo3, rend = num(r["ffo12"]), num(r["ffo3"]), num(r["rend12"])
    dy = div / price * 100
    ffoy = ffo12 / num(r["cotas"]) / price * 100
    cov = ffo12 / rend
    qf = 0.5 + 0.5 * clip((cov - 0.7) / 0.3)
    rel = num(r["var_stress"]) - num(r["fii_mediana"])
    p1 = pillar([
        (150 * clip((1.05 - pvp) / 0.25) * qf, 150),
        (60 * clip(-rel / 10) * qf, 60),
        (90 * clip((ffo3 * 4 / ffo12 - 0.7) / 0.3), 90),
    ], 300)
    lev = (num(r["ativos"]) - num(r["plf"])) / num(r["ativos"]) * 100
    p2 = pillar([
        (100 * clip((25 - lev) / 23), 100),
        (50 * clip((num(r["vol_mi"]) - 2) / 18), 50),
        (100 * clip((ffoy - 6) / (CDI_LIQ - 6)), 100),
    ], 250)
    plbi = num(r["plf"]) / 1e9
    d3 = 12.5 * (ffo12 > 0) + 12.5 * (ffo3 > 0)
    if r["tipo"] == "papel":
        cred = num(r["credito"])
        perfil = {"HG": 75, "Misto": 40, "HY": 10}.get(r["perfil"])
        p3 = pillar([(cred, 100), (perfil, 75), (50 * clip((plbi - 0.5) / 4.5), 50), (d3, 25)], 250)
    else:
        vac, n = num(r["vacancia"]), num(r["n_imoveis"])
        p3 = pillar([
            (100 * clip((15 - vac) / 12) if vac is not None else None, 100),
            (75 * clip((n - 3) / 27) if n is not None else None, 75),
            (50 * clip((plbi - 0.5) / 4.5), 50), (d3, 25)], 250)
    va = num(r["venda_ativos12"]) / rend
    p4 = pillar([
        (80 * clip((dy - 6) / 7), 80),
        (80 * clip((cov - 0.7) / 0.3), 80),
        (40 * clip(1 - va / 0.15), 40),
    ], 200)
    extra = dict(dy=dy, ffoy=ffoy, cov=cov, lev=lev, va=va)
    return [p1, p2, p3, p4], extra


def run(weights=MAX, ke=KE):
    rows = list(csv.DictReader(open(os.path.join(HERE, "dados_entrada.csv"), encoding="utf-8-sig"), delimiter=";"))
    out = []
    for r in rows:
        pillars, extra = fii(r) if r["classe"] == "FII" else stock(r, ke)
        names = ["P1", "P2", "P3", "P4"]
        pts = {n: (v / MAX[n] * weights[n] if v is not None else None) for n, (v, _) in zip(names, pillars)}
        coverage = sum(a for _, a in pillars) / 1000
        total = sum(v for v in pts.values() if v is not None)
        status = "definitivo" if coverage >= 0.90 else "provisorio" if coverage >= 0.75 else "nao calculavel"
        out.append(dict(ticker=r["ticker"], total=total, coverage=coverage, status=status, **pts, **extra))
    return sorted(out, key=lambda x: -x["total"])


if __name__ == "__main__":
    base = run()
    keys = ["ticker", "total", "P1", "P2", "P3", "P4", "coverage", "status"]
    with open(os.path.join(HERE, "resultado_score.csv"), "w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f, delimiter=";")
        w.writerow(keys + ["detalhes"])
        for x in base:
            det = {k: round(v, 4) for k, v in x.items() if k not in keys and isinstance(v, float)}
            w.writerow([x["ticker"]] + [f"{x[k]:.1f}".replace(".", ",") if isinstance(x[k], float) else x[k] for k in keys[1:]] + [det])
    for x in base:
        print(f'{x["ticker"]:7s} {x["total"]:6.1f}  P1 {x["P1"]:5.1f} P2 {x["P2"]:5.1f} P3 {x["P3"]:5.1f} P4 {x["P4"]:5.1f}  cob {x["coverage"]:.2f} {x["status"]}')
    rank = {x["ticker"]: i + 1 for i, x in enumerate(base)}
    print("\nSensibilidade (posicao no cenario | variacao vs base):")
    for name, (wts, ke) in SCENARIOS.items():
        res = run(wts, ke)
        print(f"- {name}: " + ", ".join(f'{x["ticker"]}#{i+1}({i+1-rank[x["ticker"]]:+d})' for i, x in enumerate(res[:8])))

    # checagens minimas do modelo
    assert all(0 <= x["total"] <= 1000 for x in base)
    assert clip(2) == 1 and clip(-1) == 0
