/* Aba Simulação (T4) — simulação histórica de carteira.
   Usa só window.INV (store) e window.INVCalc.simular. Material educacional; não é recomendação. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || !window.INV || !window.INVCalc || !window.PB || typeof INVCalc.simular !== 'function') return;
  var INV = window.INV, PB = window.PB, CALC = window.INVCalc;
  if (typeof INV.aba !== 'function') return;

  /* ---------- utilidades ---------- */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k === 'for') e.htmlFor = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) add(e, arguments[i]);
    return e;
  }
  function add(e, k) {
    if (k === null || k === undefined || k === false) return;
    if (Array.isArray(k)) k.forEach(function (x) { add(e, x); });
    else e.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  }
  function ui(name, fb) { return (INV.ui && typeof INV.ui[name] === 'function') ? INV.ui[name] : fb; }
  var parseNum = ui('parseNumero', function (s) {
    if (typeof s === 'number') return isFinite(s) ? s : null;
    s = String(s === null || s === undefined ? '' : s).replace(/[R$\s]/g, '');
    if (!s) return null;
    if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    var n = Number(s); return isFinite(n) ? n : null;
  });
  var fmtData = ui('fmtData', function (d) { return d ? d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4) : '—'; });
  function money(x) {
    if (x === null || x === undefined || !isFinite(x)) return '—';
    return (x < 0 ? '-R$ ' : 'R$ ') + PB.num(Math.abs(x), 2);
  }
  function pct(x, d) { return (x === null || x === undefined || !isFinite(x)) ? '—' : PB.sig(x, d === undefined ? 2 : d) + '%'; }
  function pctPlain(x, d) { return (x === null || x === undefined || !isFinite(x)) ? '—' : PB.num(x, d === undefined ? 2 : d) + '%'; }
  function sgn(x) { return (x === null || x === undefined) ? '' : x > 0 ? 'pos' : x < 0 ? 'neg' : ''; }
  function fmtIn(x, d) { return PB.num(x, d === undefined ? 2 : d); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function validDate(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d) && d.toISOString().slice(0, 10) === s;
  }
  function addMeses(s, n) {
    var d = new Date(s + 'T00:00:00Z'), day = d.getUTCDate();
    d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + n);
    var last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  }
  function aviso(texto, tipo) {
    var f = ui('aviso', null);
    if (f) { try { var n = f(texto, tipo); if (n && n.nodeType) return n; } catch (e) { /* usa o local */ } }
    return h('p', { class: 'pb-note ' + (tipo === 'bad' ? 'neg' : tipo === 'warn' ? 'warn' : ''), role: tipo === 'bad' ? 'alert' : null }, texto);
  }

  /* ---------- CSS mínimo desta aba ---------- */
  if (!document.getElementById('inv-sim-css')) {
    var st = document.createElement('style'); st.id = 'inv-sim-css';
    st.textContent = [
      '.inv-sim .inv-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
      '.inv-sim .inv-sim-grid{display:grid;gap:var(--cds-gap-sm);grid-template-columns:repeat(auto-fit,minmax(min(100%,11rem),1fr))}',
      '.inv-sim .inv-field{display:grid;gap:2px;align-content:start;min-width:0}',
      '.inv-sim .inv-field .pb-in{width:100%;box-sizing:border-box;min-width:0}',
      '.inv-sim .inv-err{color:var(--color-bad);font-size:var(--cds-font-size-caption)}',
      '.inv-sim .inv-err[hidden]{display:none}',
      '.inv-sim fieldset{border:1px solid var(--color-border-line);border-radius:var(--cds-radius);margin:0;padding:var(--cds-pad-sm);min-width:0;display:grid;gap:var(--cds-gap-xs)}',
      '.inv-sim legend{padding:0 var(--cds-pad-xs);font-size:var(--cds-font-size-caption);color:var(--color-fg-muted)}',
      '.inv-sim .inv-sim-list{max-height:15rem;overflow:auto;display:grid;gap:2px;border:1px solid var(--color-border-line);border-radius:var(--cds-radius);padding:var(--cds-pad-xs)}',
      '.inv-sim .inv-sim-opt{display:flex;gap:.5rem;align-items:flex-start;padding:2px var(--cds-pad-xs);min-width:0}',
      '.inv-sim .inv-sim-opt[hidden]{display:none}',
      '.inv-sim input[type=checkbox],.inv-sim input[type=radio]{margin-top:.25rem}',
      '.inv-sim input:focus-visible,.inv-sim select:focus-visible,.inv-sim .pb-btn:focus-visible{outline:2px solid var(--color-fg);outline-offset:2px}',
      '.inv-sim .pb-btn[disabled]{opacity:.5;cursor:not-allowed}',
      '.inv-sim .inv-actions{display:flex;flex-wrap:wrap;gap:var(--cds-gap-sm);align-items:center}',
      '.inv-sim ul.inv-sim-ul{margin:0;padding-left:1.2rem;display:grid;gap:2px;font-size:var(--cds-font-size-caption);color:var(--color-fg-muted)}',
      '.inv-sim .pb-tablewrap:focus-visible{outline:2px solid var(--color-fg);outline-offset:2px}'
    ].join('\n');
    document.head.appendChild(st);
  }

  /* ---------- estado ---------- */
  var DEFAULTS = function () {
    return { sel: [], pesos: {}, auto: true, ini: fmtIn(10000), mensal: fmtIn(1000), dia: '1', periodo: '3a', di: '', df: '',
      estrategia: 'pesos', dividendos: 'reinvestir', custo: '0', inteiros: false, bibov: true, bcdi: true };
  };
  var S = DEFAULTS();
  var R = null;            // último resultado {r, meta}
  var F = {};              // campos registrados: id -> {input, err}
  var sigUniverso = null;
  var saveTimer = null, ignorarMudou = 0;

  function carregarRascunho() {
    try {
      var d = INV.estado().rascunhos && INV.estado().rascunhos.simulacao;
      if (d && typeof d === 'object') {
        var base = DEFAULTS();
        Object.keys(base).forEach(function (k) { if (d[k] !== undefined && d[k] !== null && typeof d[k] === typeof base[k]) base[k] = d[k]; });
        if (!Array.isArray(base.sel)) base.sel = [];
        S = base;
      }
    } catch (e) { /* mantém padrão */ }
  }
  function agendarSalvar() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var copia = JSON.parse(JSON.stringify(S));
        ignorarMudou++;
        INV.salvar(function (c) { c.rascunhos = c.rascunhos || {}; c.rascunhos.simulacao = copia; });
      } catch (e) { /* rascunho é conveniência */ }
      finally { setTimeout(function () { ignorarMudou = Math.max(0, ignorarMudou - 1); }, 0); }
    }, 400);
  }

  /* ---------- dados ---------- */
  function serie() { try { return INV.serie(); } catch (e) { return { status: 'erro' }; } }
  function indices() { try { return INV.indices(); } catch (e) { return { status: 'erro' }; } }
  function ativosComSerie() {
    var s = serie(), out = [];
    if (!s || s.status !== 'ok' || !s.data || !s.data.ativos) return out;
    INV.universo().filter(function (a) { return a.temSerie && s.data.ativos[a.ticker] && s.data.ativos[a.ticker].d && s.data.ativos[a.ticker].d.length; })
      .forEach(function (a) { out.push(a); });
    return out;
  }
  function info(t) {
    var s = serie(), x = s.data && s.data.ativos && s.data.ativos[t];
    return x && x.d && x.d.length ? { ini: x.d[0], fim: x.d[x.d.length - 1] } : null;
  }
  function limites() {
    var ts = S.sel.length ? S.sel : ativosComSerie().map(function (a) { return a.ticker; });
    var ini = null, fim = null;
    ts.forEach(function (t) {
      var i = info(t); if (!i) return;
      if (ini === null || i.ini > ini) ini = i.ini;
      if (fim === null || i.fim > fim) fim = i.fim;
    });
    var s = serie();
    if (fim && s.data && s.data.data_ref && validDate(s.data.data_ref) && s.data.data_ref < fim) fim = s.data.data_ref;
    return { ini: ini, fim: fim };
  }
  var PERIODOS = [['12m', 12, 'Últimos 12 meses'], ['3a', 36, 'Últimos 3 anos'], ['5a', 60, 'Últimos 5 anos']];
  function periodoOk(meses, lim) { return !!(lim.ini && lim.fim && addMeses(lim.fim, -meses) >= lim.ini); }

  /* ---------- campos ---------- */
  function errId(id) { return 'sim-' + id + '-err'; }
  function helpId(id) { return 'sim-' + id + '-help'; }
  function regErr(id, msgEl, ctl) { F[id] = { err: msgEl, input: ctl }; }
  function setErr(id, msg) {
    var f = F[id]; if (!f) return;
    f.err.textContent = msg || ''; f.err.hidden = !msg;
    if (f.input) f.input.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }
  function campo(id, rotulo, valor, ajuda, extra, onVal) {
    var attrs = { id: 'sim-' + id, class: 'pb-in', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: valor,
      'aria-describedby': (ajuda ? helpId(id) + ' ' : '') + errId(id) };
    Object.keys(extra || {}).forEach(function (k) { attrs[k] = extra[k]; });
    var inp = h('input', attrs);
    inp.addEventListener('input', function () { onVal(inp.value); setErr(id, ''); agendarSalvar(); });
    var err = h('div', { class: 'inv-err', id: errId(id), hidden: true });
    regErr(id, err, inp);
    return h('div', { class: 'inv-field' }, h('label', { for: 'sim-' + id }, rotulo), inp,
      ajuda ? h('small', { class: 'pb-note', id: helpId(id) }, ajuda) : null, err);
  }
  function seletor(id, rotulo, opcoes, valor, ajuda, onVal) {
    var sel = h('select', { id: 'sim-' + id, class: 'pb-in', 'aria-describedby': (ajuda ? helpId(id) : '') });
    opcoes.forEach(function (o) { sel.appendChild(h('option', { value: o[0], selected: o[0] === valor }, o[1])); });
    sel.addEventListener('change', function () { onVal(sel.value); agendarSalvar(); });
    return h('div', { class: 'inv-field' }, h('label', { for: 'sim-' + id }, rotulo), sel,
      ajuda ? h('small', { class: 'pb-note', id: helpId(id) }, ajuda) : null);
  }

  /* ---------- montagem ---------- */
  var root = INV.aba({ id: 'simulacao', rotulo: 'Simulação' });
  if (!root) return;
  root.classList.add('inv-sim');
  var top = h('div', { class: 'pb-page', style: 'display:grid;gap:var(--cds-gap-md)' });
  var res = h('div', { class: 'pb-page', style: 'display:grid;gap:var(--cds-gap-md)' });
  root.append(top, res);

  var elSoma, elPesos, elLista, elPeriodo, elStatus, btnSim, elEstEstrategia;

  function cardCarregando(msg) {
    return h('div', { class: 'pb-card' }, h('h2', null, 'Simulação histórica'), h('p', { class: 'pb-note', 'aria-live': 'polite' }, msg));
  }
  function cardIndisponivel(msg) {
    return h('div', { class: 'pb-card' }, h('h2', null, 'Simulação histórica'),
      h('p', { class: 'pb-text' }, 'Histórico longo indisponível' + (msg ? ' (' + msg + ')' : '') + '.'),
      h('p', { class: 'pb-text' }, 'O histórico de 5 anos (preços diários e dividendos) é gerado pelo GitHub Actions. Ele chega ao app quando você toca em "Atualizar dados" e a execução termina; depois recarregue a página. Até lá, a simulação fica desligada — nada é inventado.'),
      h('p', { class: 'pb-disc' }, 'Material educacional; não é recomendação de investimento.'));
  }

  function render() {
    F = {};
    var s = serie();
    sigUniverso = assinatura();
    if (!s || s.status === 'carregando') { top.replaceChildren(cardCarregando('Carregando o histórico longo…')); return; }
    var lista = ativosComSerie();
    if (s.status !== 'ok' || !lista.length) { top.replaceChildren(cardIndisponivel(s.mensagem)); return; }
    var validos = {}; lista.forEach(function (a) { validos[a.ticker] = a; });
    S.sel = S.sel.filter(function (t) { return validos[t]; });

    var card = h('form', { class: 'pb-card', novalidate: true, 'aria-label': 'Parâmetros da simulação' });
    card.addEventListener('submit', function (ev) { ev.preventDefault(); simular(); });
    card.append(
      h('h2', null, 'Simulação histórica de carteira'),
      h('p', { class: 'pb-note' }, 'Mostra o que teria acontecido com aportes na carteira escolhida, com preços e dividendos do passado. Resultado histórico simulado. Não garante resultado futuro.'),
      blocoAtivos(lista),
      h('div', { class: 'inv-sim-grid' },
        campo('ini', 'Aporte inicial (R$)', S.ini, null, null, function (v) { S.ini = v; }),
        campo('mensal', 'Aporte mensal (R$)', S.mensal, null, null, function (v) { S.mensal = v; }),
        campo('dia', 'Dia do aporte mensal (1 a 28)', S.dia, 'Compra no 1º pregão em ou depois desse dia.', { inputmode: 'numeric' }, function (v) { S.dia = v; })),
      blocoPeriodo(),
      h('div', { class: 'inv-sim-grid' },
        seletor('estrategia', 'Estratégia', [['pesos', 'Análise histórica: pesos fixos'], ['rebalancear-aportes', 'Estratégia: aporte no que está abaixo do peso']], S.estrategia,
          null, function (v) { S.estrategia = v; atualizarAvisoEstrategia(); }),
        seletor('dividendos', 'Dividendos', [['reinvestir', 'Reinvestir no mesmo ativo'], ['caixa', 'Acumular em caixa (sem rendimento)'], ['ignorar', 'Ignorar (só retorno de preço)']], S.dividendos,
          null, function (v) { S.dividendos = v; }),
        campo('custo', 'Custo por compra (%)', S.custo, 'Descontado do valor de cada compra.', null, function (v) { S.custo = v; })),
      elEstEstrategia = h('p', { class: 'pb-note', id: 'sim-estrategia-aviso' }),
      h('div', { class: 'pb-controls' },
        h('label', { class: 'inv-sim-opt' }, h('input', { type: 'checkbox', id: 'sim-inteiros', checked: S.inteiros, onchange: function (e) { S.inteiros = e.target.checked; agendarSalvar(); } }),
          h('span', null, 'Comprar só unidades inteiras (o troco fica em caixa até o próximo aporte)'))),
      h('fieldset', null, h('legend', null, 'Comparar com'),
        h('div', { class: 'pb-controls' },
          h('label', { class: 'inv-sim-opt' }, h('input', { type: 'checkbox', id: 'sim-bibov', checked: S.bibov, onchange: function (e) { S.bibov = e.target.checked; agendarSalvar(); } }), h('span', null, 'Ibovespa (retorno total)')),
          h('label', { class: 'inv-sim-opt' }, h('input', { type: 'checkbox', id: 'sim-bcdi', checked: S.bcdi, onchange: function (e) { S.bcdi = e.target.checked; agendarSalvar(); } }), h('span', null, 'CDI'))),
        h('small', { class: 'pb-note' }, 'Os benchmarks recebem os mesmos aportes nas mesmas datas.')),
      h('div', { class: 'inv-actions' },
        btnSim = h('button', { type: 'submit', class: 'pb-btn', id: 'sim-rodar' }, 'Simular'),
        elStatus = h('span', { class: 'pb-note', id: 'sim-status', role: 'status', 'aria-live': 'polite' }))
    );
    top.replaceChildren(card);
    atualizarAvisoEstrategia();
    desenharPesos();
    desenharPeriodo();
  }

  function atualizarAvisoEstrategia() {
    if (!elEstEstrategia) return;
    elEstEstrategia.textContent = S.estrategia === 'pesos'
      ? 'Pesos fixos: cada aporte é dividido pelos pesos escolhidos. Atenção: os pesos foram escolhidos hoje, conhecendo o passado (viés de retrospectiva).'
      : 'Aporte no que está abaixo do peso: cada aporte vai para os ativos mais abaixo do peso-alvo, usando só valores do próprio dia e sem vender nada.';
  }

  function blocoAtivos(lista) {
    var busca = h('input', { type: 'search', class: 'pb-in', id: 'sim-busca', autocomplete: 'off', 'aria-controls': 'sim-lista' });
    elLista = h('div', { class: 'inv-sim-list', id: 'sim-lista', role: 'group', 'aria-labelledby': 'sim-ativos-leg' });
    var itens = lista.map(function (a) {
      var i = info(a.ticker);
      var cb = h('input', { type: 'checkbox', value: a.ticker, id: 'sim-a-' + a.ticker, checked: S.sel.indexOf(a.ticker) >= 0 });
      cb.addEventListener('change', function () {
        var k = S.sel.indexOf(a.ticker);
        if (cb.checked && k < 0) S.sel.push(a.ticker); else if (!cb.checked && k >= 0) S.sel.splice(k, 1);
        if (S.auto) igualar(true);
        setErr('ativos', ''); setErr('pesos', '');
        desenharPesos(); desenharPeriodo(); agendarSalvar();
      });
      var op = h('label', { class: 'inv-sim-opt', for: 'sim-a-' + a.ticker, 'data-q': (a.ticker + ' ' + (a.nome || '') + ' ' + (a.classe || '')).toLowerCase() }, cb,
        h('span', null, h('b', null, a.ticker), ' ', a.nome || '', ' ', h('span', { class: 'pb-label' }, '· ' + (a.classe || '') + (i ? ' · dados de ' + fmtData(i.ini) + ' a ' + fmtData(i.fim) : ''))));
      return op;
    });
    elLista.append.apply(elLista, itens);
    busca.addEventListener('input', function () {
      var q = busca.value.trim().toLowerCase();
      itens.forEach(function (op) { op.hidden = !!q && op.getAttribute('data-q').indexOf(q) < 0; });
    });
    var err = h('div', { class: 'inv-err', id: errId('ativos'), hidden: true });
    regErr('ativos', err, null);
    elPesos = h('div', { style: 'display:grid;gap:var(--cds-gap-xs)' });
    elSoma = h('div', { class: 'pb-note', id: 'sim-soma', role: 'status', 'aria-live': 'polite' });
    var errP = h('div', { class: 'inv-err', id: errId('pesos'), hidden: true });
    regErr('pesos', errP, null);
    return h('div', { style: 'display:grid;gap:var(--cds-gap-sm)' },
      h('div', { class: 'inv-field' }, h('label', { for: 'sim-busca', id: 'sim-ativos-leg' }, 'Ativos com histórico (busque e marque os que entram na carteira)'), busca),
      elLista, err,
      h('fieldset', { 'aria-describedby': errId('pesos') }, h('legend', null, 'Pesos da carteira (%)'),
        elPesos,
        h('div', { class: 'pb-controls' },
          h('button', { type: 'button', class: 'pb-btn', onclick: function () { igualar(true); S.auto = true; desenharPesos(); agendarSalvar(); } }, 'Pesos iguais'), elSoma),
        errP));
  }

  function igualar(silencioso) {
    var n = S.sel.length; if (!n) return;
    var base = Math.floor(10000 / n) / 100, acc = 0;
    S.sel.forEach(function (t, i) {
      var v = i === n - 1 ? Math.round((100 - acc) * 100) / 100 : base;
      acc += v; S.pesos[t] = fmtIn(v);
    });
    if (!silencioso) agendarSalvar();
  }
  function somaPesos() {
    var soma = 0, ok = true;
    S.sel.forEach(function (t) { var v = parseNum(S.pesos[t]); if (v === null) ok = false; else soma += v; });
    return { soma: soma, ok: ok };
  }
  function atualizarSoma() {
    if (!elSoma) return;
    if (!S.sel.length) { elSoma.textContent = 'Nenhum ativo marcado.'; elSoma.className = 'pb-note'; return; }
    var r = somaPesos(), certo = r.ok && Math.abs(r.soma - 100) < 0.005;
    elSoma.textContent = 'Soma dos pesos: ' + PB.num(r.soma, 2) + '%' + (certo ? ' (ok)' : ' — precisa ser 100%');
    elSoma.className = 'pb-note ' + (certo ? 'pos' : 'warn');
  }
  function desenharPesos() {
    if (!elPesos) return;
    if (!S.sel.length) { elPesos.replaceChildren(h('p', { class: 'pb-note' }, 'Marque ao menos um ativo acima para definir os pesos.')); atualizarSoma(); return; }
    var linhas = S.sel.map(function (t) {
      var id = 'peso-' + t;
      var inp = h('input', { id: 'sim-' + id, class: 'pb-in', type: 'text', inputmode: 'decimal', autocomplete: 'off', value: S.pesos[t] === undefined ? '' : S.pesos[t],
        'aria-describedby': errId(id), style: 'width:7rem' });
      var err = h('div', { class: 'inv-err', id: errId(id), hidden: true });
      regErr(id, err, inp);
      inp.addEventListener('input', function () { S.pesos[t] = inp.value; S.auto = false; setErr(id, ''); setErr('pesos', ''); atualizarSoma(); agendarSalvar(); });
      return h('div', { class: 'inv-field', style: 'grid-template-columns:minmax(0,1fr) auto;align-items:center;column-gap:var(--cds-gap-sm)' },
        h('label', { for: 'sim-' + id }, 'Peso de ' + t + ' (%)'), inp, h('span', { style: 'grid-column:1/-1' }, err));
    });
    elPesos.replaceChildren.apply(elPesos, linhas);
    atualizarSoma();
  }

  function blocoPeriodo() {
    elPeriodo = h('fieldset', { 'aria-describedby': errId('periodo') });
    return elPeriodo;
  }
  function desenharPeriodo() {
    if (!elPeriodo) return;
    var lim = limites(), ops = [];
    var ativo = S.periodo;
    var cur = PERIODOS.filter(function (p) { return p[0] === ativo; })[0];
    if (cur && !periodoOk(cur[1], lim)) {
      var melhor = PERIODOS.slice().reverse().filter(function (p) { return periodoOk(p[1], lim); })[0];
      S.periodo = melhor ? melhor[0] : 'custom';
    }
    if (S.periodo === 'custom') {
      if (!validDate(S.df) && lim.fim) S.df = lim.fim;
      if (!validDate(S.di) && lim.fim) { var a = addMeses(lim.fim, -36); S.di = lim.ini && a < lim.ini ? lim.ini : a; }
    }
    var legenda = h('legend', null, 'Período');
    var radios = PERIODOS.map(function (p) {
      var ok = periodoOk(p[1], lim);
      var rid = 'sim-per-' + p[0];
      var r = h('input', { type: 'radio', name: 'sim-periodo', id: rid, value: p[0], checked: S.periodo === p[0], disabled: !ok });
      r.addEventListener('change', function () { S.periodo = p[0]; setErr('periodo', ''); desenharPeriodo(); agendarSalvar(); });
      return h('label', { class: 'inv-sim-opt', for: rid }, r,
        h('span', null, p[2], !ok ? h('span', { class: 'pb-label' }, lim.ini ? ' — indisponível: o histórico dos ativos marcados começa em ' + fmtData(lim.ini) : ' — indisponível: sem dados') : (lim.fim ? h('span', { class: 'pb-label' }, ' (de ' + fmtData(addMeses(lim.fim, -p[1])) + ' a ' + fmtData(lim.fim) + ')') : null)));
    });
    var rc = h('input', { type: 'radio', name: 'sim-periodo', id: 'sim-per-custom', value: 'custom', checked: S.periodo === 'custom' });
    rc.addEventListener('change', function () { S.periodo = 'custom'; desenharPeriodo(); agendarSalvar(); });
    radios.push(h('label', { class: 'inv-sim-opt', for: 'sim-per-custom' }, rc, h('span', null, 'Personalizado')));
    var extra = null;
    if (S.periodo === 'custom') {
      var di = h('input', { type: 'date', class: 'pb-in', id: 'sim-di', value: S.di, min: lim.ini || null, max: lim.fim || null, 'aria-describedby': errId('di') });
      var df = h('input', { type: 'date', class: 'pb-in', id: 'sim-df', value: S.df, min: lim.ini || null, max: lim.fim || null, 'aria-describedby': errId('df') });
      var e1 = h('div', { class: 'inv-err', id: errId('di'), hidden: true }), e2 = h('div', { class: 'inv-err', id: errId('df'), hidden: true });
      regErr('di', e1, di); regErr('df', e2, df);
      di.addEventListener('input', function () { S.di = di.value; setErr('di', ''); agendarSalvar(); });
      df.addEventListener('input', function () { S.df = df.value; setErr('df', ''); agendarSalvar(); });
      extra = h('div', { class: 'inv-sim-grid' },
        h('div', { class: 'inv-field' }, h('label', { for: 'sim-di' }, 'Data inicial'), di, e1),
        h('div', { class: 'inv-field' }, h('label', { for: 'sim-df' }, 'Data final'), df, e2));
    }
    var dispo = h('small', { class: 'pb-note' }, lim.ini && lim.fim ? 'Há dados dos ativos marcados de ' + fmtData(lim.ini) + ' a ' + fmtData(lim.fim) + '.' : 'Sem dados de preço para os ativos marcados.');
    var err = h('div', { class: 'inv-err', id: errId('periodo'), hidden: true });
    regErr('periodo', err, null);
    elPeriodo.replaceChildren.apply(elPeriodo, [legenda].concat(radios, [extra, dispo, err]));
  }

  /* ---------- validação e execução ---------- */
  function limparErros() { Object.keys(F).forEach(function (k) { setErr(k, ''); }); }
  function validar() {
    limparErros();
    var erros = [], v = {};
    function e(id, msg) { erros.push([id, msg]); setErr(id, msg); }
    if (!S.sel.length) e('ativos', 'Marque ao menos um ativo.');
    var soma = 0, pesos = {};
    S.sel.forEach(function (t) {
      var n = parseNum(S.pesos[t]);
      if (n === null || n <= 0) e('peso-' + t, 'Informe um peso maior que zero para ' + t + '.');
      else if (n > 100) e('peso-' + t, 'O peso de ' + t + ' não pode passar de 100%.');
      else { pesos[t] = n; soma += n; }
    });
    if (S.sel.length && Object.keys(pesos).length === S.sel.length && Math.abs(soma - 100) > 0.01) e('pesos', 'Os pesos somam ' + PB.num(soma, 2) + '%; precisam somar 100%. Use "Pesos iguais" ou ajuste.');
    var ini = parseNum(S.ini), men = parseNum(S.mensal), dia = parseNum(S.dia), custo = parseNum(S.custo === '' ? '0' : S.custo);
    if (ini === null || ini < 0) e('ini', 'Informe um valor igual ou maior que zero (ex.: 10.000,00).');
    if (men === null || men < 0) e('mensal', 'Informe um valor igual ou maior que zero (ex.: 1.000,00).');
    if (ini !== null && men !== null && ini <= 0 && men <= 0) e('ini', 'Informe um aporte inicial ou mensal maior que zero.');
    if (dia === null || dia !== Math.floor(dia) || dia < 1 || dia > 28) e('dia', 'Informe um dia inteiro de 1 a 28.');
    if (custo === null || custo < 0 || custo >= 100) e('custo', 'Informe um percentual de 0 a menos de 100 (ex.: 0,05).');
    var lim = limites(), inicio, fim;
    var per = PERIODOS.filter(function (p) { return p[0] === S.periodo; })[0];
    if (per) {
      if (!periodoOk(per[1], lim)) e('periodo', 'Este período não tem dados suficientes. Escolha outro.');
      else { fim = lim.fim; inicio = addMeses(lim.fim, -per[1]); }
    } else {
      inicio = S.di; fim = S.df;
      if (!validDate(inicio)) e('di', 'Informe a data inicial.');
      if (!validDate(fim)) e('df', 'Informe a data final.');
      if (validDate(inicio) && validDate(fim)) {
        if (inicio >= fim) e('df', 'A data final precisa ser depois da inicial.');
        else if (lim.fim && fim > lim.fim) e('df', 'Não há dados depois de ' + fmtData(lim.fim) + '.');
        else if (lim.fim && inicio > lim.fim) e('di', 'Não há dados depois de ' + fmtData(lim.fim) + '.');
      }
    }
    if (erros.length) return { erros: erros };
    var tot = 0; S.sel.forEach(function (t) { tot += pesos[t]; });
    Object.keys(pesos).forEach(function (t) { pesos[t] = pesos[t] * 100 / tot; });  // normaliza resíduos de arredondamento
    v.pesos = pesos; v.ini = ini; v.men = men; v.dia = dia; v.custo = custo; v.inicio = inicio; v.fim = fim;
    return { v: v, erros: [] };
  }

  function simular() {
    var chk = validar();
    if (chk.erros.length) {
      elStatus.textContent = chk.erros.length === 1 ? 'Corrija 1 campo antes de simular.' : 'Corrija ' + chk.erros.length + ' campos antes de simular.';
      elStatus.className = 'pb-note neg';
      var f = F[chk.erros[0][0]];
      var alvo = f && (f.input || null);
      if (!alvo && chk.erros[0][0] === 'ativos') alvo = document.getElementById('sim-busca');
      if (!alvo && chk.erros[0][0] === 'pesos') alvo = document.getElementById('sim-peso-' + S.sel[0]);
      if (!alvo && chk.erros[0][0] === 'periodo') alvo = document.querySelector('input[name="sim-periodo"]:checked') || document.getElementById('sim-per-custom');
      if (alvo && alvo.focus) alvo.focus();
      return;
    }
    var v = chk.v, s = serie(), ix = indices();
    var series = {}; S.sel.forEach(function (t) { series[t] = s.data.ativos[t]; });
    var ibov = null, cdi = null, ipca = null, notas = [];
    if (S.bibov) { var ib = s.data.ativos.IBOV; if (ib && ib.d && ib.d.length) ibov = { d: ib.d, c: ib.c }; else notas.push('Ibovespa indisponível na série longa.'); }
    if (ix && ix.status === 'ok' && ix.data) {
      if (S.bcdi) { var c = ix.data.cdi; if (c && c.d && c.d.length) cdi = { d: c.d, v: c.v }; else notas.push('CDI indisponível no arquivo de índices.'); }
      var ip = ix.data.ipca; if (ip && ip.m && ip.m.length) ipca = { m: ip.m, v: ip.v };
    } else if (S.bcdi) notas.push('CDI e IPCA indisponíveis (arquivo de índices não carregou).');
    var p = { series: series, pesos: v.pesos, inicio: v.inicio, fim: v.fim, aporteInicial: v.ini, aporteMensal: v.men, diaAporte: v.dia,
      estrategia: S.estrategia, dividendos: S.dividendos, custoPct: v.custo, inteiros: !!S.inteiros, ibov: ibov, cdi: cdi, ipca: ipca };
    agendarSalvar();
    btnSim.disabled = true; btnSim.setAttribute('aria-busy', 'true');
    elStatus.className = 'pb-note'; elStatus.textContent = 'Calculando…';
    res.replaceChildren(h('div', { class: 'pb-card', 'aria-live': 'polite' }, h('p', { class: 'pb-note' }, 'Calculando…')));
    setTimeout(function () {
      try {
        var r = CALC.simular(p);
        R = { r: r, notas: notas, estrategia: S.estrategia, tickers: S.sel.slice(), bench: { ibov: !!ibov, cdi: !!cdi } };
        mostrar();
        elStatus.className = 'pb-note pos';
        elStatus.textContent = 'Simulação concluída: valor final ' + money(r.resumo.valorFinal) + '.';
      } catch (err) {
        R = null;
        res.replaceChildren(h('div', { class: 'pb-card' }, aviso('Não foi possível simular: ' + (err && err.message ? err.message : String(err)), 'bad')));
        elStatus.className = 'pb-note neg';
        elStatus.textContent = 'A simulação falhou.';
      } finally {
        btnSim.disabled = false; btnSim.removeAttribute('aria-busy');
      }
    }, 30);
  }

  /* ---------- resultado ---------- */
  function tile(rotulo, valor, nota, cls) {
    return h('div', { class: 'pb-card' }, h('span', { class: 'pb-label' }, rotulo), h('span', { class: 'pb-big ' + (cls || '') }, valor), nota ? h('span', { class: 'pb-note' }, nota) : null);
  }
  function tabela(cols, linhas, rotulo) {
    var thead = h('thead', null, h('tr', null, cols.map(function (c) { return h('th', { scope: 'col', class: (c.l ? 'l ' : '') + (c.sm ? 'pb-hide-sm' : '') }, c.t); })));
    var tbody = h('tbody', null, linhas.map(function (l) {
      return h('tr', null, l.map(function (cel, i) {
        var o = (cel && typeof cel === 'object' && !cel.nodeType) ? cel : { v: cel };
        return h('td', { class: (cols[i].l ? 'l ' : '') + (cols[i].sm ? 'pb-hide-sm ' : '') + (o.c || '') }, o.v);
      }));
    }));
    return h('div', { class: 'pb-tablewrap', tabindex: '0', role: 'region', 'aria-label': rotulo }, h('table', { class: 'pb-table' }, h('caption', { class: 'inv-sr' }, rotulo), thead, tbody));
  }
  function mostrar() {
    var r = R.r, s = r.resumo, ia = r.benchmarks || {};
    var tiles = h('div', { class: 'pb-tiles' },
      tile('Aporte inicial', money(s.inicial)),
      tile('Aportes adicionais', money(s.aportesAdicionais), r.aportes ? r.aportes.length + ' registros de aporte' : null),
      tile('Total investido', money(s.totalInvestido)),
      tile('Valor final', money(s.valorFinal), 'em ' + fmtData(r.fimEfetivo)),
      tile(s.lucro < 0 ? 'Prejuízo' : 'Lucro', money(s.lucro), null, sgn(s.lucro)),
      tile('Retorno acumulado', pct(s.retornoAcumulado), 'lucro ÷ total investido', sgn(s.retornoAcumulado)),
      tile('TWR (retorno da carteira)', pct(s.twr), s.twrAnual !== null && s.twrAnual !== undefined ? pctPlain(s.twrAnual) + ' ao ano' : 'anualizado só para períodos de 1 ano ou mais', sgn(s.twr)),
      tile('XIRR (retorno dos seus aportes)', s.xirr !== null && s.xirr !== undefined ? pctPlain(s.xirr) + ' a.a.' : '—', s.xirr === null || s.xirr === undefined ? 'não calculável neste caso' : 'considera as datas dos aportes', sgn(s.xirr)),
      tile('IPCA no período', s.ipcaAcum !== null && s.ipcaAcum !== undefined ? pct(s.ipcaAcum) : '—', s.ipcaAcum === null || s.ipcaAcum === undefined ? 'série de IPCA indisponível' : null),
      tile('Retorno real (TWR − IPCA)', s.twrReal !== null && s.twrReal !== undefined ? pct(s.twrReal) : '—',
        s.valorFinalReal !== null && s.valorFinalReal !== undefined ? 'valor final em reais do início: ' + money(s.valorFinalReal) : null, sgn(s.twrReal)));

    var cardRes = h('div', { class: 'pb-card' },
      h('h2', null, 'Resultado'),
      h('p', { class: 'pb-note' }, 'Período efetivo: ' + fmtData(r.inicioEfetivo) + ' a ' + fmtData(r.fimEfetivo) + (s.dias ? ' (' + PB.f0.format(s.dias) + ' dias corridos)' : '') + '. Dividendos recebidos: ' + money(s.dividendos) + '; custos: ' + money(s.custos) + '.'),
      tiles);

    var legenda = h('div', { class: 'pb-legend', id: 'sim-legend' });
    var chartBox = h('div', { class: 'pb-chart', id: 'sim-chart', style: 'height:300px', role: 'img',
      'aria-label': 'Gráfico de linhas: valor da carteira, total investido' + (R.bench.ibov ? ', Ibovespa' : '') + (R.bench.cdi ? ', CDI' : '') + ' entre ' + fmtData(r.inicioEfetivo) + ' e ' + fmtData(r.fimEfetivo) + '. Os valores finais estão nas tabelas abaixo.' });
    var cardGraf = h('div', { class: 'pb-card' }, h('h2', null, 'Evolução do patrimônio'), legenda, chartBox);

    var cols1 = [{ t: 'Ativo', l: true }, { t: 'Investido' }, { t: 'Valor final' }, { t: 'Lucro' }, { t: 'Dividendos', sm: true }, { t: 'Contribuição', sm: true }, { t: 'Retorno de preço' }];
    var linhas1 = (r.porAtivo || []).map(function (a) {
      return [{ v: a.ticker, c: '' }, money(a.investido), money(a.valorFinal), { v: money(a.lucro), c: sgn(a.lucro) }, money(a.dividendos),
        a.contribuicaoPct === null || a.contribuicaoPct === undefined ? '—' : { v: pct(a.contribuicaoPct, 1), c: sgn(a.contribuicaoPct) },
        { v: pct(a.retornoPrecoPct), c: sgn(a.retornoPrecoPct) }];
    });
    var cardAt = h('div', { class: 'pb-card' }, h('h2', null, 'Por ativo'), tabela(cols1, linhas1, 'Resultado por ativo'),
      h('p', { class: 'pb-note' }, 'Retorno de preço = variação do fechamento entre o início e o fim efetivos, sem dividendos.'));

    var cols2 = [{ t: 'Comparação', l: true }, { t: 'Valor final' }, { t: 'Lucro' }, { t: 'Retorno s/ investido' }, { t: 'TWR', sm: true }, { t: 'XIRR a.a.', sm: true }];
    var linhas2 = [[{ v: 'Sua carteira simulada', c: '' }, money(s.valorFinal), { v: money(s.lucro), c: sgn(s.lucro) }, { v: pct(s.retornoAcumulado), c: sgn(s.retornoAcumulado) }, pct(s.twr), s.xirr === null || s.xirr === undefined ? '—' : pctPlain(s.xirr)]];
    [['IBOV', 'Ibovespa (retorno total)'], ['CDI', 'CDI']].forEach(function (b) {
      var x = ia[b[0]];
      if (!x) return;
      var ret = s.totalInvestido ? x.lucro / s.totalInvestido * 100 : null;
      linhas2.push([b[1], money(x.valorFinal), { v: money(x.lucro), c: sgn(x.lucro) }, { v: pct(ret), c: sgn(ret) }, pct(x.twr), x.xirr === null || x.xirr === undefined ? '—' : pctPlain(x.xirr)]);
    });
    var cardBm = h('div', { class: 'pb-card' }, h('h2', null, 'Comparação com benchmarks'), tabela(cols2, linhas2, 'Comparação com benchmarks'),
      linhas2.length === 1 ? h('p', { class: 'pb-note' }, 'Nenhum benchmark selecionado ou disponível.') : h('p', { class: 'pb-note' }, 'Benchmarks com os mesmos aportes nas mesmas datas.'));

    var avisos = (r.avisos || []).concat(R.notas || []);
    var cardPrem = h('div', { class: 'pb-card' }, h('h2', null, 'Premissas e avisos'),
      R.estrategia === 'pesos' ? aviso('Viés de retrospectiva: os pesos foram escolhidos hoje, conhecendo o passado. Isso torna o resultado mais favorável do que seria numa decisão tomada na época.', 'warn') : null,
      avisos.map(function (a) { return aviso(a, 'warn'); }),
      (r.premissas && r.premissas.length) ? h('ul', { class: 'inv-sim-ul' }, r.premissas.map(function (p) { return h('li', null, p); })) : null,
      h('p', { class: 'pb-disc' }, 'Resultado histórico simulado. Não garante resultado futuro. Material educacional; não é recomendação de investimento.'));

    res.replaceChildren(cardRes, cardGraf, cardAt, cardBm, cardPrem);
    desenharGrafico();
  }

  var COR = { carteira: 'var(--c0)', investido: 'var(--cds-chart-reference)', ibov: 'var(--c1)', cdi: 'var(--c2)' };

  function desenharGrafico() {
    var box = document.getElementById('sim-chart');
    if (!R || !box || !PB.visible(box)) return;
    var r = R.r, b = r.benchmarks || {};
    var dt = function (s) { return new Date(s + 'T00:00:00Z'); };
    var series = [
      { k: 'carteira', nome: 'Valor da carteira', cor: COR.carteira, pts: r.linhas.map(function (l) { return { d: dt(l.data), s: l.data, v: l.valor }; }) },
      { k: 'investido', nome: 'Total investido', cor: COR.investido, step: true, dash: '5 4', pts: r.linhas.map(function (l) { return { d: dt(l.data), s: l.data, v: l.investido }; }) }
    ];
    if (b.IBOV && b.IBOV.linhas) series.push({ k: 'ibov', nome: 'Ibovespa (mesmos aportes)', cor: COR.ibov, pts: b.IBOV.linhas.map(function (l) { return { d: dt(l.data), s: l.data, v: l.valor }; }) });
    if (b.CDI && b.CDI.linhas) series.push({ k: 'cdi', nome: 'CDI (mesmos aportes)', cor: COR.cdi, pts: b.CDI.linhas.map(function (l) { return { d: dt(l.data), s: l.data, v: l.valor }; }) });

    var leg = document.getElementById('sim-legend');
    if (leg) leg.replaceChildren.apply(leg, series.map(function (s) {
      return h('span', null, h('span', { class: 'pb-sw', style: 'background:' + s.cor }), s.nome);
    }));

    var W = box.clientWidth || 320, H = 300, m = { l: W < 480 ? 52 : 64, r: 10, t: 10, b: 26 };
    var todos = [].concat.apply([], series.map(function (s) { return s.pts; }));
    if (!todos.length) return;
    var x = d3.scaleUtc(d3.extent(todos, function (p) { return p.d; }), [m.l, W - m.r]);
    var ymax = d3.max(todos, function (p) { return p.v; }) || 1;
    var y = d3.scaleLinear([0, ymax * 1.05], [H - m.b, m.t]).nice();
    var abrev = function (v) { return v >= 1e6 ? PB.num(v / 1e6, 1) + ' mi' : v >= 1e3 ? PB.num(v / 1e3, 0) + ' mil' : PB.num(v, 0); };
    var svg = d3.create('svg').attr('width', '100%').attr('viewBox', '0 0 ' + W + ' ' + H).attr('height', H);
    svg.append('g').selectAll('line').data(y.ticks(5)).join('line').attr('x1', m.l).attr('x2', W - m.r)
      .attr('y1', function (d) { return y(d); }).attr('y2', function (d) { return y(d); }).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').attr('transform', 'translate(0,' + (H - m.b) + ')').call(d3.axisBottom(x).ticks(W < 480 ? 4 : 7).tickFormat(d3.utcFormat('%m/%Y'))).call(PB.cleanAxis);
    svg.append('g').attr('transform', 'translate(' + m.l + ',0)').call(d3.axisLeft(y).ticks(5).tickFormat(function (d) { return 'R$ ' + abrev(d); })).call(PB.cleanAxis).call(function (g) { g.select('.domain').remove(); });
    series.forEach(function (s) {
      var line = d3.line().x(function (p) { return x(p.d); }).y(function (p) { return y(p.v); });
      if (s.step) line.curve(d3.curveStepAfter);
      svg.append('path').attr('d', line(s.pts)).attr('fill', 'none').attr('stroke', s.cor)
        .attr('stroke-width', s.k === 'carteira' ? 2.2 : 1.6).attr('stroke-linejoin', 'round').attr('stroke-linecap', 'round')
        .attr('stroke-dasharray', s.dash || null);
    });
    var foco = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-reference)').attr('stroke-dasharray', '2 3').style('display', 'none');
    var tip = PB.tipFor(box);
    var base = series[0].pts, bis = d3.bisector(function (p) { return p.d; }).center;
    var maps = series.map(function (s) { var mp = {}; s.pts.forEach(function (p) { mp[p.s] = p.v; }); return mp; });
    svg.append('rect').attr('x', m.l).attr('y', 0).attr('width', Math.max(0, W - m.l - m.r)).attr('height', H).attr('fill', 'transparent')
      .on('pointermove', function (ev) {
        var mx = d3.pointer(ev)[0], p = base[bis(base, x.invert(mx))]; if (!p) return;
        foco.style('display', null).attr('x1', x(p.d)).attr('x2', x(p.d));
        var linhas = [[fmtData(p.s)]];
        series.forEach(function (s, i) { if (maps[i][p.s] !== undefined) linhas.push([s.nome, money(maps[i][p.s])]); });
        tip.show(ev, linhas);
      })
      .on('pointerleave', function () { tip.hide(); foco.style('display', 'none'); });
    box.replaceChildren.apply(box, [svg.node()].concat([].slice.call(box.querySelectorAll('.pb-tip'))));
  }

  /* ---------- ciclo de vida ---------- */
  function assinatura() {
    var s = serie(), ix = indices(), n = 0;
    try { n = ativosComSerie().map(function (a) { return a.ticker; }).join(','); } catch (e) { n = '?'; }
    return [s && s.status, ix && ix.status, n].join('|');
  }

  carregarRascunho();
  render();
  INV.on('mudou', function () {
    if (ignorarMudou) return;
    var a = assinatura();
    if (a !== sigUniverso) render();
  });
  INV.aoMostrar('simulacao', desenharGrafico);
})();
