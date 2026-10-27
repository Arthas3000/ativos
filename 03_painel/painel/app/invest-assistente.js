/* Assistente de alocação de aportes (Seção 7 do contrato).
   Renderiza em #inv-assistente (criado pela aba Corretora). Material educacional;
   não é recomendação. Nada é registrado sem o passo 5 confirmado. */
(function () {
  'use strict';
  var INV = window.INV, CALC = window.INVCalc;
  if (!INV || !CALC) return;

  var ROOT_ID = 'inv-assistente';
  var PASSOS = ['Ativos', 'Orçamento e regras', 'Cálculo', 'Proposta', 'Revisar e registrar'];
  var uid = 0;

  /* ---------- estado em memória (persistido como rascunho) ---------- */
  var S = null;           // rascunho
  var plano = null;       // resultado de planejarAportes (não persiste)
  var erroPlano = null;
  var ui = { busca: '', buscando: false, msgCot: '', resultado: null, erros5: [], mostrarErros2: false, pendente: false, erroReg: '' };
  var salvandoTimer = null, ignorarMudou = false;

  function novoRascunho() {
    return { passo: 1, sel: [], orcamento: '', orcamentoEditado: false, reserva: '', alvos: {}, tetos: {},
      salvarAlvos: false, intens: null, taxaFixa: null, taxaPct: null, precos: {}, qtdEdit: {}, exec: {}, confirma: false };
  }
  function carregarRascunho() {
    var base = novoRascunho(), r = null;
    try { r = INV.estado().rascunhos.assistente; } catch (e) { r = null; }
    if (r && typeof r === 'object') {
      Object.keys(base).forEach(function (k) { if (r[k] !== undefined && r[k] !== null) base[k] = r[k]; });
      if (!Array.isArray(base.sel)) base.sel = [];
    }
    if (base.passo > 3) base.passo = 3;           // o plano não persiste: recalcula a partir do passo 3
    S = base;
  }
  function persistir(imediato) {
    if (salvandoTimer) clearTimeout(salvandoTimer);
    function gravar() {
      salvandoTimer = null;
      var copia = JSON.parse(JSON.stringify(S));
      ignorarMudou = true;
      try { INV.salvar(function (c) { c.rascunhos = c.rascunhos || {}; c.rascunhos.assistente = copia; }); }
      catch (e) { /* rascunho é conveniência; segue sem ele */ }
      setTimeout(function () { ignorarMudou = false; }, 80);
    }
    if (imediato) gravar(); else salvandoTimer = setTimeout(gravar, 500);
  }

  /* ---------- helpers ---------- */
  function h(tag, attrs) {
    var n = document.createElement(tag), i, k, v, c;
    if (attrs) for (k in attrs) {
      v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.indexOf('on') === 0 && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : String(v));
    }
    for (i = 2; i < arguments.length; i++) {
      c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      if (Array.isArray(c)) c.forEach(function (x) { if (x !== null && x !== undefined && x !== false) n.appendChild(typeof x === 'object' ? x : document.createTextNode(String(x))); });
      else n.appendChild(typeof c === 'object' ? c : document.createTextNode(String(c)));
    }
    return n;
  }
  function nid(p) { uid += 1; return 'inva-' + p + '-' + uid; }
  function brl(c) { return CALC.fmtBRL(c); }
  function pct(n, d, sinal) {
    if (n === null || n === undefined || !isFinite(n)) return '—';
    var s = Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: d === undefined ? 1 : d, maximumFractionDigits: d === undefined ? 1 : d });
    return (sinal ? (n > 0 ? '+' : n < 0 ? '−' : '') : (n < 0 ? '−' : '')) + s + '%';
  }
  function pp(n) { return n === null || !isFinite(n) ? '—' : (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + ' p.p.'; }
  function reaisTxt(c) { return c === null || c === undefined ? '' : (c / 100).toFixed(2).replace('.', ','); }
  function numTxt(txt) {            // percentuais/decimais pt-BR; vazio -> null; inválido -> NaN
    if (txt === null || txt === undefined) return null;
    var t = String(txt).trim().replace('%', '').trim();
    if (t === '') return null;
    if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) t = t.replace(/\./g, '');
    t = t.replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(t) ? parseFloat(t) : NaN;
  }
  function fmtData(iso) { return iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(8, 10) + '/' + iso.slice(5, 7) + '/' + iso.slice(0, 4) : (iso || ''); }
  function agoraLocal() {
    var d = new Date(), p = function (x) { return (x < 10 ? '0' : '') + x; };
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + 'T' + p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function root() { return document.getElementById(ROOT_ID); }
  function cfg() { try { return INV.estado().config || {}; } catch (e) { return {}; } }
  function universo() { try { return INV.universo() || []; } catch (e) { return []; } }
  function ativo(t) { for (var i = 0, u = universo(); i < u.length; i++) if (u[i].ticker === t) return u[i]; return null; }
  function loteDe(t) { var a = ativo(t); return a && a.lote > 0 ? Math.floor(a.lote) : 1; }
  function taxaFixaCent() { var v = S.taxaFixa !== null ? CALC.toCents(S.taxaFixa) : (cfg().taxaFixaCent || 0); return v === null ? NaN : v; }
  function taxaPctVal() { var v = S.taxaPct !== null ? numTxt(S.taxaPct) : (cfg().taxaPct || 0); return v === null ? 0 : v; }
  function intensVal() { var v = S.intens !== null ? numTxt(S.intens) : ((cfg().intensidadeScore === undefined ? 0.3 : cfg().intensidadeScore) * 100); return v === null ? 0 : v; }
  function refPreco(t) { try { return INV.precoReferencia(t) || {}; } catch (e) { return {}; } }
  function posicoesReais() { try { return CALC.posicoes(CALC.efetivas(INV.estado().transacoes || [])); } catch (e) { return {}; } }
  function caixaReal() { try { return CALC.caixa(CALC.efetivas(INV.estado().transacoes || [])); } catch (e) { return 0; } }
  function precoEscolhido(t) {      // centavos|null; só do que o usuário vê/edita no passo 2
    var p = S.precos[t];
    if (p && p.txt !== undefined && p.txt !== '') { var c = CALC.toCents(p.txt); return c !== null && c > 0 ? c : null; }
    var r = refPreco(t); return r.precoCent > 0 ? r.precoCent : null;
  }
  function precoInfo(t) {
    var p = S.precos[t];
    if (p && p.estado) return p;
    var r = refPreco(t);
    return { estado: r.estado || 'indisponivel', fonte: r.fonte || null, em: r.em || null };
  }
  var ROTULO_ESTADO = { 'ao-vivo': 'ao vivo', atrasado: 'atrasado', manual: 'manual', indisponivel: 'indisponível' };
  function chip(info) {
    var est = (info && info.estado) || 'indisponivel';
    var txt = ROTULO_ESTADO[est] || est;
    if (info && info.em && est !== 'indisponivel') txt += ' · ' + fmtData(String(info.em).slice(0, 10));
    return h('span', { class: 'inv-chip inv-chip-' + est, title: info && info.fonte ? 'Fonte: ' + info.fonte : null }, txt);
  }
  function aviso(txt, tipo) {
    var t = tipo || 'info';
    return h('p', { class: 'pb-note inv-aviso inv-aviso-' + t + (t === 'bad' ? ' neg' : t === 'warn' ? ' warn' : ''), role: t === 'bad' ? 'alert' : null }, txt);
  }
  function btn(txt, fn, extra) {
    return h('button', { type: 'button', class: 'pb-btn' + (extra && extra.cls ? ' ' + extra.cls : ''), onclick: fn, disabled: extra && extra.disabled, 'aria-describedby': extra && extra.desc }, txt);
  }
  function campo(o) {               // {id, rotulo, valor, onInput, ajuda, erroId, inputmode, oculto, extra}
    var id = o.id, ajuda = o.ajuda ? nid('aj') : null;
    var inp = h('input', { id: id, type: o.tipo || 'text', class: 'pb-in', value: o.valor === null || o.valor === undefined ? '' : o.valor,
      inputmode: o.inputmode || 'decimal', autocomplete: 'off', 'aria-describedby': (o.erroId || '') + (ajuda ? ' ' + ajuda : '') || null, 'aria-invalid': 'false' });
    inp.addEventListener('input', function () { o.onInput(inp.value, inp); });
    var lab = h('label', { for: id, class: o.oculto ? 'inv-sr' : null }, o.rotulo);
    var err = o.erroId ? h('span', { id: o.erroId, class: 'inv-err', 'aria-live': 'polite' }) : null;
    return o.oculto ? h('span', null, lab, inp, err) : h('div', { class: 'inv-field' }, lab, inp, ajuda ? h('span', { id: ajuda, class: 'pb-note' }, o.ajuda) : null, err);
  }
  function setErro(erroId, inputId, msg) {
    var e = document.getElementById(erroId), i = document.getElementById(inputId);
    if (e) e.textContent = msg || '';
    if (i) i.setAttribute('aria-invalid', msg ? 'true' : 'false');
  }

  /* ---------- CSS mínimo próprio (tokens existentes) ---------- */
  function css() {
    if (document.getElementById('inv-assistente-css')) return;
    var st = document.createElement('style'); st.id = 'inv-assistente-css';
    st.textContent = '#inv-assistente .inv-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}' +
      '#inv-assistente .inv-steps{display:flex;flex-wrap:wrap;gap:var(--cds-gap-sm);list-style:none;margin:0 0 var(--cds-gap-md);padding:0}' +
      '#inv-assistente .inv-steps li{padding:.25rem .6rem;border:1px solid var(--color-border,currentColor);border-radius:999px;font-size:var(--cds-font-size-caption);color:var(--color-fg-muted)}' +
      '#inv-assistente .inv-steps li[aria-current="step"]{color:var(--color-fg);font-weight:600;border-color:var(--c0,currentColor)}' +
      '#inv-assistente .inv-err{color:var(--color-bad);font-size:var(--cds-font-size-caption);display:block}' +
      '#inv-assistente .inv-actions{display:flex;flex-wrap:wrap;gap:var(--cds-gap-sm);align-items:center;margin-top:var(--cds-gap-md)}' +
      '#inv-assistente .inv-form{display:grid;gap:var(--cds-gap-md);grid-template-columns:repeat(auto-fit,minmax(min(100%,12rem),1fr))}' +
      '#inv-assistente .inv-field{display:flex;flex-direction:column;gap:.25rem}' +
      '#inv-assistente table .pb-in{width:6.5rem;max-width:100%}' +
      '#inv-assistente .inv-stack{display:flex;flex-direction:column;gap:var(--cds-gap-md)}' +
      '#inv-assistente input:focus-visible,#inv-assistente button:focus-visible{outline:2px solid var(--c0,currentColor);outline-offset:2px}';
    document.head.appendChild(st);
  }

  /* ---------- plano e cálculo ---------- */
  function validar2() {
    var er = {}, geral = [], i, t, v, soma = 0, orc, res;
    orc = CALC.toCents(S.orcamento);
    if (orc === null || orc <= 0) er.orcamento = 'Informe um valor maior que zero.';
    res = S.reserva === '' ? 0 : CALC.toCents(S.reserva);
    if (res === null || res < 0) er.reserva = 'Informe um valor igual ou maior que zero.';
    else if (orc !== null && orc > 0 && res >= orc) er.reserva = 'A reserva precisa ser menor que o orçamento.';
    if (isNaN(taxaFixaCent()) || taxaFixaCent() < 0) er.taxaFixa = 'Valor inválido.';
    v = S.taxaPct !== null ? numTxt(S.taxaPct) : 0;
    if (isNaN(v) || v < 0 || v > 100) er.taxaPct = 'Informe de 0 a 100.';
    v = S.intens !== null ? numTxt(S.intens) : 0;
    if (isNaN(v) || v < 0 || v > 100) er.intens = 'Informe de 0 a 100.';
    if (!S.sel.length) geral.push('Selecione ao menos um ativo no passo 1.');
    for (i = 0; i < S.sel.length; i++) {
      t = S.sel[i];
      var a = numTxt(S.alvos[t]), m = numTxt(S.tetos[t]);
      if (isNaN(a) || (a !== null && (a < 0 || a > 100))) er['alvo-' + t] = 'Alvo de 0 a 100.';
      else soma += a || 0;
      if (isNaN(m) || (m !== null && (m <= 0 || m > 100))) er['teto-' + t] = 'Teto de 0 a 100.';
      else if (m !== null && a !== null && !isNaN(a) && m < a) er['teto-' + t] = 'O teto não pode ser menor que o alvo.';
      var pt = S.precos[t];
      if (pt && pt.txt !== undefined && pt.txt !== '') { var pc = CALC.toCents(pt.txt); if (pc === null || pc <= 0) er['preco-' + t] = 'Preço inválido.'; }
    }
    if (soma > 100.0000001) er.soma = 'A soma dos alvos (' + pct(soma) + ') passa de 100%.';
    return { erros: er, geral: geral, soma: soma, vazio: !Object.keys(er).length && !geral.length };
  }

  function calcular() {
    plano = null; erroPlano = null;
    var v = validar2();
    if (!v.vazio) { erroPlano = v.geral.length ? v.geral[0] : 'Corrija os campos do passo 2 antes de calcular.'; return; }
    var pos = posicoesReais(), outros = 0, atvs = [], tf = taxaFixaCent();
    Object.keys(pos).forEach(function (t) {
      if (S.sel.indexOf(t) >= 0) return;
      var pr = refPreco(t).precoCent; if (pr > 0) outros += pos[t].qtd * pr;
    });
    S.sel.forEach(function (t) {
      var a = ativo(t), pc = precoEscolhido(t), q = pos[t] ? pos[t].qtd : 0;
      var m = numTxt(S.tetos[t]);
      atvs.push({ ticker: t, precoCent: pc, lote: loteDe(t), valorAtualCent: pc ? q * pc : 0, alvoPct: numTxt(S.alvos[t]) || 0,
        maxPct: m === null || isNaN(m) ? null : m, score: a && a.score !== null && a.score !== undefined ? a.score : null });
    });
    try {
      plano = CALC.planejarAportes({ orcamentoCent: CALC.toCents(S.orcamento), reservaCent: S.reserva === '' ? 0 : CALC.toCents(S.reserva),
        taxaFixaCent: tf, taxaPct: taxaPctVal(), intensidadeScore: Math.min(1, Math.max(0, intensVal() / 100)), outrosCent: outros, ativos: atvs });
      plano._semPosSemPreco = atvs.filter(function (x) { return !x.precoCent && pos[x.ticker]; }).map(function (x) { return x.ticker; });
      S.qtdEdit = {}; S.exec = {}; S.confirma = false;
    } catch (e) { erroPlano = (e && e.message) || 'Não foi possível calcular.'; }
  }

  /* linhas da proposta com edição do usuário (recalcula bruto/taxas/total) */
  function linhasEditadas() {
    var tf = taxaFixaCent(), tp = taxaPctVal(), soma = 0, somaBruto = 0, somaTaxas = 0, bad = false;
    var baseV = plano.totalCarteiraDepoisCent - plano.linhas.reduce(function (s, l) { return s + l.brutoCent; }, 0);
    var rows = plano.linhas.map(function (l) {
      var q = S.qtdEdit[l.ticker] !== undefined ? S.qtdEdit[l.ticker] : l.qtd;
      var bruto = l.precoCent ? q * l.precoCent : 0;
      var tx = CALC.taxas({ brutoCent: bruto, qtd: q, taxaFixaCent: tf, taxaPct: tp });
      soma += bruto + tx; somaBruto += bruto; somaTaxas += tx;
      return { l: l, qtd: q, bruto: bruto, taxas: tx, total: bruto + tx };
    });
    var base = baseV + somaBruto;
    rows.forEach(function (r) { r.depoisPct = base > 0 ? (r.l.valorAtualCent + r.bruto) / base * 100 : 0; });
    var orc = CALC.toCents(S.orcamento), disp = plano.disponivelCent;
    return { rows: rows, total: soma, taxas: somaTaxas, sobra: orc - soma, excede: soma > disp, bad: bad, orc: orc, disp: disp, base: base };
  }

  /* ---------- render ---------- */
  function focoAtual() {
    var el = document.activeElement, r = root();
    if (!el || !r || !r.contains(el) || !el.id) return null;
    var o = { id: el.id };
    try { o.s = el.selectionStart; o.e = el.selectionEnd; } catch (e) { /* tipos sem seleção */ }
    return o;
  }
  function devolverFoco(o) {
    if (!o) return;
    var el = document.getElementById(o.id);
    if (!el) return;
    try { el.focus({ preventScroll: true }); if (o.s !== undefined && o.s !== null && el.setSelectionRange) el.setSelectionRange(o.s, o.e); } catch (e) { /* ok */ }
  }
  function render(manterFoco) {
    var r = root();
    if (!r) return;
    css();
    if (!S) carregarRascunho();
    var foco = manterFoco ? focoAtual() : null;
    if (S.passo >= 3 && !plano && !erroPlano) calcular();
    var corpo;
    switch (S.passo) {
      case 1: corpo = passo1(); break;
      case 2: corpo = passo2(); break;
      case 3: corpo = passo3(); break;
      case 4: corpo = passo4(); break;
      default: corpo = passo5();
    }
    var passos = h('ol', { class: 'inv-steps', 'aria-label': 'Passos do assistente' });
    PASSOS.forEach(function (n, i) {
      passos.appendChild(h('li', { 'aria-current': i + 1 === S.passo ? 'step' : null }, (i + 1) + '. ' + n));
    });
    var titulo = h('h3', { id: 'inv-asst-titulo', tabindex: '-1' }, 'Passo ' + S.passo + ' de 5 — ' + PASSOS[S.passo - 1]);
    var caixa = h('div', { class: 'pb-card inv-asst' },
      h('p', { class: 'pb-note' }, 'Material educacional; não é recomendação de investimento. O assistente só calcula uma proposta: nada é comprado nem registrado sem a sua confirmação no passo 5.'),
      passos, titulo, corpo);
    while (r.firstChild) r.removeChild(r.firstChild);
    r.appendChild(caixa);
    ui.pendente = false;
    devolverFoco(foco);
  }
  function irPara(p, focarTitulo) {
    S.passo = p; persistir(true); render(false);
    if (focarTitulo !== false) { var t = document.getElementById('inv-asst-titulo'); if (t) try { t.focus({ preventScroll: false }); } catch (e) { /* ok */ } }
  }
  function nav(voltar, avancar, extra) {
    return h('div', { class: 'inv-actions' },
      voltar === null ? null : btn('Voltar', voltar),
      avancar === null ? null : btn(extra && extra.rotulo || 'Avançar', avancar, { disabled: extra && extra.bloqueado, desc: extra && extra.desc, cls: 'pb-btn-primary' }),
      btn('Recomeçar', function () { plano = null; erroPlano = null; ui.resultado = null; S = novoRascunho(); persistir(true); render(false); }));
  }

  /* --- passo 1 --- */
  function passo1() {
    var u = universo(), pos = posicoesReais(), precos = {}, aloc = null, tab;
    Object.keys(pos).forEach(function (t) { precos[t] = refPreco(t).precoCent || null; });
    try { aloc = CALC.alocacao(pos, precos); } catch (e) { aloc = null; }
    var expo = {}; if (aloc && aloc.linhas) aloc.linhas.forEach(function (l) { expo[l.ticker] = l.pct; });
    var alvosSalvos = {}; try { alvosSalvos = INV.estado().alvos || {}; } catch (e) { /* ok */ }
    var buscaId = nid('busca');
    var busca = h('input', { id: buscaId, type: 'search', class: 'pb-in', placeholder: 'Ticker, nome ou classe', autocomplete: 'off', value: ui.busca });
    var tbody = h('tbody');
    var cont = h('span', { 'aria-live': 'polite', class: 'pb-note' });
    function atualizarCont() { cont.textContent = S.sel.length + ' ativo(s) selecionado(s).'; }
    u.forEach(function (a) {
      var id = nid('sel'), ref = refPreco(a.ticker), on = S.sel.indexOf(a.ticker) >= 0;
      var cb = h('input', { type: 'checkbox', id: id, checked: on, onchange: function (ev) {
        var i = S.sel.indexOf(a.ticker);
        if (ev.target.checked && i < 0) S.sel.push(a.ticker); else if (!ev.target.checked && i >= 0) S.sel.splice(i, 1);
        plano = null; erroPlano = null; atualizarCont(); persistir();
      } });
      var tr = h('tr', { 'data-busca': (a.ticker + ' ' + (a.nome || '') + ' ' + (a.classe || '')).toLowerCase() },
        h('td', null, cb, ' ', h('label', { for: id }, h('strong', null, a.ticker), h('span', { class: 'inv-sr' }, ' selecionar'))),
        h('td', { class: 'l pb-hide-sm' }, a.nome || ''),
        h('td', null, a.classe || ''),
        h('td', null, ref.precoCent > 0 ? brl(ref.precoCent) : '—', ' ', chip(ref)),
        h('td', null, alvosSalvos[a.ticker] !== undefined && alvosSalvos[a.ticker] !== null ? pct(alvosSalvos[a.ticker]) : '—'),
        h('td', null, expo[a.ticker] !== undefined && expo[a.ticker] !== null ? pct(expo[a.ticker]) : (pos[a.ticker] ? 'sem preço' : '0,0%')),
        h('td', { class: 'pb-hide-sm' }, a.score !== null && a.score !== undefined ? PBnum(a.score) : '—'));
      tbody.appendChild(tr);
    });
    function filtrar() {
      var q = busca.value.trim().toLowerCase();
      ui.busca = busca.value;
      Array.prototype.forEach.call(tbody.children, function (tr) { tr.hidden = q !== '' && tr.getAttribute('data-busca').indexOf(q) < 0; });
    }
    busca.addEventListener('input', filtrar);
    tab = h('div', { class: 'pb-tablewrap' }, h('table', { class: 'pb-table' },
      h('caption', { class: 'inv-sr' }, 'Ativos disponíveis para o aporte'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', class: 'l' }, 'Ativo'), h('th', { scope: 'col', class: 'l pb-hide-sm' }, 'Nome'), h('th', { scope: 'col', class: 'l' }, 'Classe'),
        h('th', { scope: 'col' }, 'Preço de referência'), h('th', { scope: 'col' }, 'Alvo atual'), h('th', { scope: 'col' }, 'Exposição atual'),
        h('th', { scope: 'col', class: 'pb-hide-sm' }, 'Score'))),
      tbody));
    atualizarCont(); filtrar();
    return h('div', { class: 'inv-stack' },
      h('p', { class: 'pb-note' }, 'Escolha os ativos que podem receber este aporte. Exposição atual = % do valor de mercado da carteira real registrada (sem simulações). Preço de referência: último fechamento ou valor manual; confirme a cotação no passo 2.'),
      h('div', { class: 'pb-controls' }, h('label', { for: buscaId }, 'Buscar ativo'), busca, cont),
      tab,
      ativoSemPreco() ? aviso('Há ativos selecionados sem preço de referência: eles não receberão valor até você informar o preço no passo 2.', 'warn') : null,
      nav(null, function () {
        if (!S.sel.length) { ui.msgCot = 'Selecione ao menos um ativo para continuar.'; render(false); return; }
        ui.msgCot = ''; irPara(2);
      }),
      ui.msgCot ? aviso(ui.msgCot, 'bad') : null);
  }
  function PBnum(n) { try { return window.PB && window.PB.num ? window.PB.num(n, 0) : String(Math.round(n)); } catch (e) { return String(Math.round(n)); } }
  function ativoSemPreco() { return S.sel.some(function (t) { return !refPreco(t).precoCent; }); }

  /* --- passo 2 --- */
  function passo2() {
    var u = {}, alvosSalvos = {};
    try { alvosSalvos = INV.estado().alvos || {}; } catch (e) { /* ok */ }
    if (!S.orcamentoEditado && !S.orcamento) { var cx = caixaReal(); if (cx > 0) S.orcamento = reaisTxt(cx); }
    S.sel.forEach(function (t) {
      if (S.alvos[t] === undefined) S.alvos[t] = alvosSalvos[t] !== undefined && alvosSalvos[t] !== null ? String(alvosSalvos[t]).replace('.', ',') : '';
      if (S.tetos[t] === undefined) S.tetos[t] = '';
      if (!S.precos[t]) { var r = refPreco(t); S.precos[t] = { txt: r.precoCent > 0 ? reaisTxt(r.precoCent) : '', manual: false, estado: r.estado || 'indisponivel', fonte: r.fonte || null, em: r.em || null }; }
    });
    var cfgv = cfg();
    function rev() { if (ui.mostrarErros2) pintarErros2(); }
    var somaEl = h('p', { class: 'pb-note', id: 'inva-soma', 'aria-live': 'polite' });
    var somaErr = h('span', { id: 'err-soma', class: 'inv-err', role: 'alert' });
    function atualizarSoma() {
      var s = 0; S.sel.forEach(function (t) { var a = numTxt(S.alvos[t]); if (a && !isNaN(a)) s += a; });
      somaEl.textContent = 'Soma dos alvos: ' + pct(s) + ' da carteira total (o restante fica sem meta).';
    }
    var f = h('div', { class: 'inv-form' },
      campo({ id: 'inva-orc', rotulo: 'Caixa para esta rodada (R$)', valor: S.orcamento, erroId: 'err-orcamento', ajuda: 'Pré-preenchido com o caixa disponível registrado: ' + brl(caixaReal()) + '. Edite se quiser.',
        onInput: function (v) { S.orcamento = v; S.orcamentoEditado = true; plano = null; persistir(); rev(); } }),
      campo({ id: 'inva-res', rotulo: 'Reserva que não será usada (R$)', valor: S.reserva, erroId: 'err-reserva',
        onInput: function (v) { S.reserva = v; plano = null; persistir(); rev(); } }),
      campo({ id: 'inva-tf', rotulo: 'Corretagem fixa por ordem (R$)', valor: S.taxaFixa !== null ? S.taxaFixa : reaisTxt(cfgv.taxaFixaCent || 0), erroId: 'err-taxaFixa',
        onInput: function (v) { S.taxaFixa = v; plano = null; persistir(); rev(); } }),
      campo({ id: 'inva-tp', rotulo: 'Emolumentos e taxas (%)', valor: S.taxaPct !== null ? S.taxaPct : String(cfgv.taxaPct || 0).replace('.', ','), erroId: 'err-taxaPct',
        onInput: function (v) { S.taxaPct = v; plano = null; persistir(); rev(); } }),
      campo({ id: 'inva-int', rotulo: 'Intensidade do score (0–100%)', valor: S.intens !== null ? S.intens : String(Math.round((cfgv.intensidadeScore === undefined ? 0.3 : cfgv.intensidadeScore) * 100)), erroId: 'err-intens',
        onInput: function (v) { S.intens = v; plano = null; persistir(); rev(); } }));
    var tbody = h('tbody');
    S.sel.forEach(function (t) {
      var a = ativo(t) || { ticker: t }, rowPrecos = S.precos[t], idP = 'inva-preco-' + t;
      var chipTd = h('span', { 'data-chip': t }, chip(rowPrecos));
      tbody.appendChild(h('tr', null,
        h('th', { scope: 'row', class: 'l' }, t, h('span', { class: 'pb-note' }, ' lote ' + loteDe(t))),
        h('td', null, campo({ id: idP, rotulo: 'Preço de ' + t + ' (R$)', oculto: true, valor: rowPrecos.txt, erroId: 'err-preco-' + t,
          onInput: function (v) {
            var p = S.precos[t]; p.txt = v; p.manual = true; p.estado = 'manual'; p.fonte = 'manual'; p.em = null; plano = null;
            chipTd.replaceChild(chip(p), chipTd.firstChild); persistir(); rev();
          } }), ' ', chipTd),
        h('td', null, campo({ id: 'inva-alvo-' + t, rotulo: 'Alvo de ' + t + ' (% da carteira)', oculto: true, valor: S.alvos[t], erroId: 'err-alvo-' + t,
          onInput: function (v) { S.alvos[t] = v; plano = null; atualizarSoma(); persistir(); rev(); } })),
        h('td', null, campo({ id: 'inva-teto-' + t, rotulo: 'Teto de ' + t + ' (% da carteira, opcional)', oculto: true, valor: S.tetos[t], erroId: 'err-teto-' + t,
          onInput: function (v) { S.tetos[t] = v; plano = null; persistir(); rev(); } })),
        h('td', { class: 'pb-hide-sm' }, a.score !== null && a.score !== undefined ? PBnum(a.score) : 'sem score')));
    });
    var cotStatus = h('p', { class: 'pb-note', 'aria-live': 'polite', id: 'inva-cotstatus' }, ui.buscando ? 'Buscando cotações…' : ui.msgCot);
    var cbSalvar = h('input', { type: 'checkbox', id: 'inva-salvaralvos', checked: !!S.salvarAlvos, onchange: function (ev) { S.salvarAlvos = ev.target.checked; persistir(); } });
    var corpo = h('div', { class: 'inv-stack' }, f,
      h('p', { class: 'pb-note' }, 'O score do painel (0–1000) só reordena a prioridade entre ativos abaixo da meta. Já inclui queda, solidez, qualidade e proventos; por isso não somamos outros indicadores (evita contar duas vezes). Ativo sem score é tratado como neutro. O score não prevê retorno.'),
      h('div', { class: 'pb-controls' },
        btn('Buscar cotações', function () { buscarCotacoes(); }, { desc: 'inva-cotstatus' }),
        h('span', { class: 'pb-note' }, 'Editar um preço o torna manual; buscar cotações não sobrescreve preços manuais.')),
      cotStatus,
      h('div', { class: 'pb-tablewrap' }, h('table', { class: 'pb-table' },
        h('caption', { class: 'inv-sr' }, 'Preço, alvo e teto por ativo'),
        h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'l' }, 'Ativo'), h('th', { scope: 'col' }, 'Preço (R$)'),
          h('th', { scope: 'col' }, 'Alvo %'), h('th', { scope: 'col' }, 'Teto % (opcional)'), h('th', { scope: 'col', class: 'pb-hide-sm' }, 'Score'))),
        tbody)),
      somaEl, somaErr,
      h('div', { class: 'pb-controls' }, cbSalvar, h('label', { for: 'inva-salvaralvos' }, 'Salvar estes alvos na carteira ao avançar (opcional)')),
      nav(function () { irPara(1); }, function () {
        ui.mostrarErros2 = true;
        var v = validar2();
        pintarErros2();
        if (!v.vazio) {
          var primeiro = Object.keys(v.erros)[0], el = primeiro ? document.getElementById(idDoErro(primeiro)) : null;
          if (el) el.focus();
          return;
        }
        if (S.salvarAlvos) {
          try { ignorarMudou = true; S.sel.forEach(function (t) { var a = numTxt(S.alvos[t]); INV.definirAlvo(t, a === null ? null : a); }); }
          catch (e) { ui.msgCot = 'Não foi possível salvar os alvos: ' + e.message; }
          setTimeout(function () { ignorarMudou = false; }, 80);
        }
        plano = null; erroPlano = null; irPara(3);
      }));
    setTimeout(function () { atualizarSoma(); if (ui.mostrarErros2) pintarErros2(); }, 0);
    atualizarSoma();
    return corpo;
  }
  function idDoErro(chave) {
    if (chave === 'orcamento') return 'inva-orc'; if (chave === 'reserva') return 'inva-res'; if (chave === 'taxaFixa') return 'inva-tf';
    if (chave === 'taxaPct') return 'inva-tp'; if (chave === 'intens') return 'inva-int'; if (chave === 'soma') return 'inva-salvaralvos';
    return 'inva-' + chave;
  }
  function pintarErros2() {
    var v = validar2(), er = v.erros;
    ['orcamento', 'reserva', 'taxaFixa', 'taxaPct', 'intens'].forEach(function (k) { setErro('err-' + k, idDoErro(k), er[k]); });
    S.sel.forEach(function (t) { ['alvo', 'teto', 'preco'].forEach(function (k) { setErro('err-' + k + '-' + t, 'inva-' + k + '-' + t, er[k + '-' + t]); }); });
    var s = document.getElementById('err-soma'); if (s) s.textContent = er.soma || '';
  }
  function buscarCotacoes() {
    if (ui.buscando) return;
    ui.buscando = true;
    var el = document.getElementById('inva-cotstatus'); if (el) el.textContent = 'Buscando cotações…';
    var n = 0, falhas = 0, tickers = S.sel.slice();
    Promise.all(tickers.map(function (t) {
      return Promise.resolve().then(function () { return INV.cotacao(t); }).then(function (c) {
        var p = S.precos[t] || (S.precos[t] = { txt: '', manual: false });
        if (p.manual) return;
        if (c && c.precoCent > 0) { p.txt = reaisTxt(c.precoCent); p.estado = c.estado; p.fonte = c.fonte; p.em = c.em; n += 1; }
        else { p.estado = (c && c.estado) || 'indisponivel'; p.fonte = null; p.em = null; falhas += 1; }
      }).catch(function () { falhas += 1; });
    })).then(function () {
      ui.buscando = false;
      ui.msgCot = 'Cotações atualizadas: ' + n + (falhas ? '; ' + falhas + ' sem cotação (informe o preço manualmente).' : '.') + ' Preços editados por você foram mantidos.';
      plano = null; persistir();
      if (S.passo === 2 && root()) render(true);
    });
  }

  /* --- passo 3 --- */
  function passo3() {
    var div = h('div', { class: 'inv-stack', 'aria-live': 'polite' });
    if (erroPlano) {
      div.appendChild(aviso('Não foi possível calcular: ' + erroPlano, 'bad'));
      div.appendChild(nav(function () { irPara(2); }, null));
      return div;
    }
    var pl = plano;
    div.appendChild(h('p', null, 'Cálculo concluído: ' + pl.linhas.length + ' ativo(s), disponível ' + brl(pl.disponivelCent) + ' (orçamento menos reserva), prioridade 1 = metas de alocação, 2 = score (intensidade ' + pct(intensVal(), 0) + '), 3 = quantidades inteiras no lote com custos.'));
    if (pl.avisos && pl.avisos.length) pl.avisos.forEach(function (a) { div.appendChild(aviso(a, 'warn')); });
    if (pl._semPosSemPreco && pl._semPosSemPreco.length) div.appendChild(aviso('Sem preço para ' + pl._semPosSemPreco.join(', ') + ': o valor atual dessas posições entrou como zero e a exposição está subestimada.', 'warn'));
    div.appendChild(nav(function () { irPara(2); }, function () { irPara(4); }, { rotulo: 'Ver proposta' }));
    return div;
  }

  /* --- passo 4 --- */
  function passo4() {
    var div = h('div', { class: 'inv-stack' });
    if (erroPlano || !plano) {
      div.appendChild(aviso('Não foi possível calcular: ' + (erroPlano || 'sem plano.'), 'bad'));
      div.appendChild(nav(function () { irPara(2); }, null));
      return div;
    }
    var cel = {};  // refs para atualização imediata
    var tbody = h('tbody');
    var totEl = h('div', { class: 'pb-tiles', 'aria-live': 'polite' });
    var avisoEl = h('div', { 'aria-live': 'polite' });
    var errosQtd = {};
    var btnAv = null;
    function tile(rot, val, cls) { return h('div', { class: 'pb-card' }, h('span', { class: 'pb-label' }, rot), h('span', { class: 'pb-big' + (cls ? ' ' + cls : '') }, val)); }
    function atualizar() {
      var L = linhasEditadas();
      L.rows.forEach(function (r) {
        var c = cel[r.l.ticker];
        c.total.textContent = brl(r.total); c.taxas.textContent = brl(r.taxas); c.bruto.textContent = brl(r.bruto);
        c.depois.textContent = pct(r.depoisPct);
      });
      while (totEl.firstChild) totEl.removeChild(totEl.firstChild);
      totEl.appendChild(tile('Orçamento', brl(L.orc)));
      totEl.appendChild(tile('Reserva', brl(L.orc - L.disp)));
      totEl.appendChild(tile('Investido (com custos)', brl(L.total), L.excede ? 'neg' : ''));
      totEl.appendChild(tile('Custos', brl(L.taxas)));
      totEl.appendChild(tile('Sobra (inclui reserva)', brl(L.sobra), L.sobra < 0 ? 'neg' : ''));
      while (avisoEl.firstChild) avisoEl.removeChild(avisoEl.firstChild);
      if (L.excede) avisoEl.appendChild(aviso('O total ' + brl(L.total) + ' ultrapassa o disponível ' + brl(L.disp) + ' (orçamento menos reserva). Reduza alguma quantidade para avançar.', 'bad'));
      var nErr = Object.keys(errosQtd).filter(function (k) { return errosQtd[k]; }).length;
      if (nErr) avisoEl.appendChild(aviso('Corrija as quantidades inválidas para avançar.', 'bad'));
      if (btnAv) btnAv.disabled = L.excede || nErr > 0;
      desenharGrafico(L);
    }
    plano.linhas.forEach(function (l) {
      var a = ativo(l.ticker) || {}, idQ = 'inva-qtd-' + l.ticker, errId = 'err-qtd-' + l.ticker, tr;
      var q = S.qtdEdit[l.ticker] !== undefined ? S.qtdEdit[l.ticker] : l.qtd, lote = l.lote || 1;
      var c = cel[l.ticker] = { total: h('td'), taxas: h('td'), bruto: h('span'), depois: h('td') };
      var qin = campo({ id: idQ, rotulo: 'Quantidade de ' + l.ticker + ' (múltiplos de ' + lote + ')', oculto: true, valor: String(q), erroId: errId, inputmode: 'numeric',
        onInput: function (v, inp) {
          var t = v.trim(), n = /^\d+$/.test(t) ? parseInt(t, 10) : NaN, msg = '';
          if (!l.precoCent) msg = 'Sem preço: não é possível comprar.';
          else if (isNaN(n)) msg = 'Informe um número inteiro maior ou igual a zero.';
          else if (n % lote !== 0) msg = 'Use múltiplos do lote (' + lote + ').';
          errosQtd[l.ticker] = msg; setErro(errId, idQ, msg);
          if (!msg) { S.qtdEdit[l.ticker] = n; S.exec = {}; }
          atualizar();
        } });
      tr = h('tr', null,
        h('th', { scope: 'row', class: 'l' }, l.ticker),
        h('td', { class: 'pb-hide-sm' }, a.classe || ''),
        h('td', null, l.precoCent ? brl(l.precoCent) : '—', ' ', chip(precoInfo(l.ticker))),
        h('td', null, pct(l.atualPct)),
        h('td', null, pct(l.alvoPct)),
        h('td', { class: l.gapPct > 0 ? 'pos' : l.gapPct < 0 ? 'neg' : '' }, pp(l.gapPct)),
        h('td', { class: 'pb-hide-sm' }, l.score !== null && l.score !== undefined ? PBnum(l.score) + ' (×' + (l.fatorScore === null || l.fatorScore === undefined ? '1,00' : l.fatorScore.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })) + ')' : 'neutro'),
        h('td', null, brl(l.propostoCent)),
        h('td', null, qin),
        h('td', null, c.taxas), h('td', null, c.total), c.depois,
        h('td', { class: 'l pb-hide-sm' }, l.motivo || ''));
      tbody.appendChild(tr);
    });
    var graf = h('div', { class: 'pb-chart', id: 'inva-grafico', role: 'img', 'aria-label': 'Gráfico de participação atual, depois da proposta e alvo por ativo' });
    var legenda = h('div', { class: 'pb-legend' });
    [['Atual', 'var(--c3, #888)'], ['Depois', 'var(--c0, #4a8)'], ['Alvo', 'var(--c4, #c84)']].forEach(function (x) {
      legenda.appendChild(h('span', null, h('i', { style: 'display:inline-block;width:.7rem;height:.7rem;margin-right:.3rem;background:' + x[1] }), x[0]));
    });
    function desenharGrafico(L) {
      var d3 = window.d3, box = document.getElementById('inva-grafico');
      if (!d3 || !box) return;
      try {
        d3.select(box).selectAll('*').remove();
        var w = Math.max(280, box.clientWidth || 320), rowH = 44, m = { t: 6, r: 12, b: 22, l: 64 };
        var hgt = m.t + m.b + L.rows.length * rowH;
        var max = d3.max(L.rows, function (r) { return Math.max(r.l.atualPct || 0, r.depoisPct || 0, r.l.alvoPct || 0); }) || 10;
        var x = d3.scaleLinear().domain([0, max * 1.1]).range([m.l, w - m.r]);
        var y = d3.scaleBand().domain(L.rows.map(function (r) { return r.l.ticker; })).range([m.t, hgt - m.b]).padding(0.2);
        var y2 = d3.scaleBand().domain(['a', 'd', 't']).range([0, y.bandwidth()]).padding(0.1);
        var svg = d3.select(box).append('svg').attr('viewBox', '0 0 ' + w + ' ' + hgt).attr('width', '100%').attr('role', 'presentation');
        var ax = svg.append('g').attr('transform', 'translate(0,' + (hgt - m.b) + ')').call(d3.axisBottom(x).ticks(5).tickFormat(function (v) { return v + '%'; }));
        var ay = svg.append('g').attr('transform', 'translate(' + m.l + ',0)').call(d3.axisLeft(y));
        if (window.PB && window.PB.cleanAxis) { window.PB.cleanAxis(ax); window.PB.cleanAxis(ay); }
        var cores = { a: 'var(--c3, #888)', d: 'var(--c0, #4a8)', t: 'var(--c4, #c84)' };
        var nomes = { a: 'Atual', d: 'Depois', t: 'Alvo' };
        L.rows.forEach(function (r) {
          var vals = { a: r.l.atualPct || 0, d: r.depoisPct || 0, t: r.l.alvoPct || 0 };
          ['a', 'd', 't'].forEach(function (k) {
            var rect = svg.append('rect').attr('x', x(0)).attr('y', y(r.l.ticker) + y2(k)).attr('height', y2.bandwidth())
              .attr('width', Math.max(0, x(vals[k]) - x(0))).attr('fill', cores[k]);
            rect.append('title').text(r.l.ticker + ' — ' + nomes[k] + ': ' + pct(vals[k]));
          });
        });
      } catch (e) { box.textContent = ''; }
    }
    div.appendChild(h('p', null, h('strong', null, 'Proposta — nada foi comprado.')));
    div.appendChild(h('p', { class: 'pb-note' }, 'Quantidades são estimativas calculadas com preços de referência e custos da configuração; edite as quantidades (múltiplos do lote) se quiser. Os totais recalculam na hora.'));
    div.appendChild(totEl);
    div.appendChild(avisoEl);
    (plano.avisos || []).forEach(function (a) { div.appendChild(aviso(a, 'warn')); });
    div.appendChild(h('div', { class: 'pb-tablewrap' }, h('table', { class: 'pb-table' },
      h('caption', { class: 'inv-sr' }, 'Proposta de compra por ativo'),
      h('thead', null, h('tr', null,
        h('th', { scope: 'col', class: 'l' }, 'Ativo'), h('th', { scope: 'col', class: 'l pb-hide-sm' }, 'Classe'), h('th', { scope: 'col' }, 'Preço'),
        h('th', { scope: 'col' }, 'Atual %'), h('th', { scope: 'col' }, 'Alvo %'), h('th', { scope: 'col' }, 'Gap'), h('th', { scope: 'col', class: 'pb-hide-sm' }, 'Score (fator)'),
        h('th', { scope: 'col' }, 'Valor proposto'), h('th', { scope: 'col' }, 'Qtd'), h('th', { scope: 'col' }, 'Custos'), h('th', { scope: 'col' }, 'Total'),
        h('th', { scope: 'col' }, 'Depois %'), h('th', { scope: 'col', class: 'l pb-hide-sm' }, 'Motivo'))),
      tbody)));
    div.appendChild(graf); div.appendChild(legenda);
    div.appendChild(h('p', { class: 'pb-note' }, 'Quantidades inteiras; a B3 não negocia fração de ação. Resultados passados não garantem futuros.'));
    var navEl = nav(function () { irPara(3); }, function () { S.exec = S.exec || {}; ui.erros5 = []; ui.resultado = null; irPara(5); }, { rotulo: 'Revisar e registrar' });
    btnAv = navEl.children[1];
    div.appendChild(navEl);
    setTimeout(function () { atualizar(); }, 0);
    atualizar();
    return div;
  }

  /* --- passo 5 --- */
  function passo5() {
    var div = h('div', { class: 'inv-stack' });
    if (ui.resultado) return resultado(div);
    if (erroPlano || !plano) {
      div.appendChild(aviso('Não foi possível calcular: ' + (erroPlano || 'sem plano.'), 'bad'));
      div.appendChild(nav(function () { irPara(2); }, null));
      return div;
    }
    var L = linhasEditadas(), tf = taxaFixaCent(), tp = taxaPctVal(), caixa = caixaReal();
    var linhas = L.rows.filter(function (r) { return r.qtd > 0 && r.l.precoCent; });
    linhas.forEach(function (r) {
      var t = r.l.ticker;
      if (!S.exec[t]) S.exec[t] = { marcado: true, preco: reaisTxt(r.l.precoCent), qtd: String(r.qtd) };
    });
    var tbody = h('tbody'), cel = {}, errGeral = h('div', { 'aria-live': 'polite', id: 'inva-err5' }), totalEl = h('p', { 'aria-live': 'polite', class: 'pb-note' });
    var btnReg = null;
    function calcLinha(t) {
      var e = S.exec[t], p = CALC.toCents(e.preco), q = /^\d+$/.test(String(e.qtd).trim()) ? parseInt(e.qtd, 10) : NaN, erros = [];
      if (p === null || p <= 0) erros.push('preço inválido'); if (isNaN(q) || q <= 0) erros.push('quantidade inválida');
      if (!erros.length && q % loteDe(t) !== 0) erros.push('fora do lote de ' + loteDe(t) + ' (aviso)');
      var bruto = erros.length && (p === null || isNaN(q)) ? 0 : p * q, tx = isNaN(q) || q <= 0 ? 0 : CALC.taxas({ brutoCent: bruto, qtd: q, taxaFixaCent: tf, taxaPct: tp });
      return { p: p, q: q, bruto: bruto, taxas: tx, total: bruto + tx, erros: erros };
    }
    function atualizar() {
      var soma = 0, n = 0, msgs = [];
      linhas.forEach(function (r) {
        var t = r.l.ticker, c = calcLinha(t), e = S.exec[t];
        cel[t].taxas.textContent = brl(c.taxas); cel[t].total.textContent = brl(c.total);
        if (e.marcado) { n += 1; soma += c.total; }
      });
      totalEl.textContent = n + ' compra(s) marcada(s). Total a registrar: ' + brl(soma) + '. Caixa registrado: ' + brl(caixa) + '.';
      if (soma > caixa) { while (errGeral.firstChild) errGeral.removeChild(errGeral.firstChild); errGeral.appendChild(aviso('Atenção: o total ultrapassa o caixa registrado (' + brl(caixa) + '). O registro continua permitido, mas o caixa ficará negativo.', 'warn')); }
      else while (errGeral.firstChild) errGeral.removeChild(errGeral.firstChild);
      if (btnReg) { btnReg.textContent = 'Registrar ' + n + ' compra' + (n === 1 ? '' : 's'); btnReg.disabled = !(S.confirma && n > 0); }
      persistir();
    }
    linhas.forEach(function (r) {
      var t = r.l.ticker, e = S.exec[t], idC = 'inva-exec-' + t;
      cel[t] = { taxas: h('td'), total: h('td') };
      tbody.appendChild(h('tr', null,
        h('td', null, h('input', { type: 'checkbox', id: idC, checked: !!e.marcado, onchange: function (ev) { e.marcado = ev.target.checked; atualizar(); } }), ' ', h('label', { for: idC }, h('strong', null, t), h('span', { class: 'inv-sr' }, ' executada'))),
        h('td', null, campo({ id: 'inva-ep-' + t, rotulo: 'Preço executado de ' + t + ' (R$)', oculto: true, valor: e.preco, erroId: 'err-ep-' + t, onInput: function (v) { e.preco = v; atualizar(); } })),
        h('td', null, campo({ id: 'inva-eq-' + t, rotulo: 'Quantidade executada de ' + t, oculto: true, valor: e.qtd, inputmode: 'numeric', erroId: 'err-eq-' + t, onInput: function (v) { e.qtd = v; atualizar(); } })),
        cel[t].taxas, cel[t].total));
    });
    var cbGeral = h('input', { type: 'checkbox', id: 'inva-confirma', checked: !!S.confirma, onchange: function (ev) { S.confirma = ev.target.checked; atualizar(); } });
    div.appendChild(h('p', null, h('strong', null, 'Registrar só o que foi executado na corretora.')));
    div.appendChild(h('p', { class: 'pb-note' }, 'Para cada linha, confirme o preço e a quantidade realmente executados. Desmarque o que não foi executado. Nada é registrado até você confirmar e clicar no botão.'));
    if (!linhas.length) {
      div.appendChild(aviso('A proposta não tem compras com quantidade maior que zero. Volte e ajuste o orçamento ou as quantidades.', 'warn'));
      div.appendChild(nav(function () { irPara(4); }, null));
      return div;
    }
    div.appendChild(h('div', { class: 'pb-tablewrap' }, h('table', { class: 'pb-table' },
      h('caption', { class: 'inv-sr' }, 'Ordens para registrar'),
      h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'l' }, 'Executada?'), h('th', { scope: 'col' }, 'Preço executado'),
        h('th', { scope: 'col' }, 'Qtd executada'), h('th', { scope: 'col' }, 'Custos'), h('th', { scope: 'col' }, 'Total'))), tbody)));
    div.appendChild(totalEl); div.appendChild(errGeral);
    div.appendChild(h('div', { class: 'pb-controls' }, cbGeral, h('label', { for: 'inva-confirma' }, 'Confirmo que as ordens marcadas foram executadas na corretora.')));
    var erroReg = h('div', { id: 'inva-erroreg', 'aria-live': 'polite', role: 'alert' });
    if (ui.erroReg) erroReg.appendChild(aviso(ui.erroReg, 'bad'));
    div.appendChild(erroReg);
    var navEl = nav(function () { irPara(4); }, function () { registrar(linhas, calcLinha, caixa); }, { rotulo: 'Registrar compras', bloqueado: true, desc: 'inva-erroreg' });
    btnReg = navEl.children[1];
    div.appendChild(navEl);
    atualizar();
    return div;
  }

  function registrar(linhas, calcLinha, caixaAntes) {
    var tf = taxaFixaCent(), tp = taxaPctVal(), txs = [], erros = [];
    var pos = posicoesReais();
    var agora = agoraLocal();
    if (!S.confirma) { ui.erroReg = 'Marque a confirmação de execução na corretora.'; render(false); return; }
    linhas.forEach(function (r) {
      var t = r.l.ticker, e = S.exec[t];
      if (!e.marcado) return;
      var c = calcLinha(t);
      if (c.erros.some(function (x) { return x.indexOf('(aviso)') < 0; })) { erros.push(t + ': ' + c.erros.join(', ') + '.'); return; }
      var p = S.precos[t] || {}, info = precoInfo(t);
      var editou = e.preco !== reaisTxt(r.l.precoCent) || p.manual;
      var fonte = editou ? 'manual' : (info.fonte === 'brapi' || info.fonte === 'fechamento' || info.fonte === 'manual' ? info.fonte : 'manual');
      var total = c.bruto + c.taxas;
      var tx = { tipo: 'compra', ticker: t, data: agora, qtd: c.q, precoCent: c.p, taxasCent: c.taxas, valorCent: total, moeda: 'BRL',
        status: 'executada', fontePreco: fonte, obs: 'Assistente de alocação', substitui: null };
      var ve; try { ve = CALC.validarTx(tx, { posicoes: pos }); } catch (er) { ve = [er.message]; }
      if (ve && ve.length) erros.push(t + ': ' + ve.join('; '));
      txs.push(tx);
    });
    if (!txs.length && !erros.length) erros.push('Nenhuma ordem marcada como executada.');
    if (erros.length) { ui.erroReg = 'Nada foi registrado. Corrija: ' + erros.join(' '); render(true); return; }
    var feitos = [];
    try { ignorarMudou = true; txs.forEach(function (tx) { INV.adicionarTx(tx); feitos.push(tx.ticker); }); }
    catch (er) {
      setTimeout(function () { ignorarMudou = false; }, 80);
      ui.erroReg = 'Falha ao gravar' + (feitos.length ? ' (já registrados: ' + feitos.join(', ') + ')' : ' (nada foi registrado)') + ': ' + er.message;
      render(true); return;
    }
    setTimeout(function () { ignorarMudou = false; }, 80);
    var total = txs.reduce(function (s, x) { return s + x.valorCent; }, 0);
    ui.resultado = { n: txs.length, total: total, tickers: feitos, caixaDepois: caixaAntes - total };
    ui.erroReg = '';
    S = novoRascunho(); plano = null; erroPlano = null;
    persistir(true);
    render(false);
  }
  function resultado(div) {
    var r = ui.resultado;
    div.appendChild(aviso(r.n + ' compra(s) registrada(s): ' + r.tickers.join(', ') + '. Total ' + brl(r.total) + '. Caixa registrado agora: ' + brl(r.caixaDepois) + '.', 'info'));
    div.appendChild(h('p', { class: 'pb-note' }, 'O rascunho do assistente foi limpo. Confira as transações na tabela da aba Corretora.'));
    div.appendChild(h('div', { class: 'inv-actions' }, btn('Novo aporte', function () { ui.resultado = null; render(false); })));
    return div;
  }

  /* ---------- ciclo de vida ---------- */
  function aoMudar() {
    setTimeout(function () {       // depois que a aba Corretora terminar de re-renderizar (ela recria o container vazio)
      var r0 = root();
      if (r0 && !r0.firstChild) { render(false); return; }
      aoMudarAgora();
    }, 0);
  }
  function aoMudarAgora() {
    if (ignorarMudou) return;
    var r = root();
    if (!r) return;
    if (S && S.passo >= 3) { /* mantém o plano em memória: não troca números sob os olhos do usuário */ }
    var foco = document.activeElement;
    if (foco && r.contains(foco) && /^(INPUT|SELECT|TEXTAREA)$/.test(foco.tagName)) { ui.pendente = true; return; }   // preserva o que está sendo editado
    if (S && S.passo <= 2) { render(true); }
  }
  function iniciar() {
    carregarRascunho();
    try { INV.on('mudou', aoMudar); } catch (e) { /* sem eventos */ }
    document.addEventListener('focusout', function () {
      if (!ui.pendente) return;
      setTimeout(function () {
        var r = root(), f = document.activeElement;
        if (r && ui.pendente && !(f && r.contains(f) && /^(INPUT|SELECT|TEXTAREA)$/.test(f.tagName))) { ui.pendente = false; if (S.passo <= 2) render(true); }
      }, 0);
    });
    try { INV.aoMostrar('corretora', function () { var r = root(); if (r && !r.firstChild) render(false); }); } catch (e) { /* ok */ }
    render(false);
  }
  iniciar();
})();
