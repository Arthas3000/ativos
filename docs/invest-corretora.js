/* Aba "Corretora" do Painel B3 (contrato spec.md, seção 6).
   Usa só window.INV (store) e window.INVCalc (núcleo). Dinheiro em centavos inteiros.
   Material educacional: este módulo não envia ordens; só registra o que o usuário informa como executado. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const INV = window.INV, C = window.INVCalc, PB = window.PB;
  if (!INV || !C || !PB || typeof INV.aba !== 'function') return;

  const ID = 'corretora';
  const CLASSES = ['Ação', 'FII', 'ETF', 'BDR', 'Outro'];
  const TIPOS = { compra: 'Compra', venda: 'Venda', deposito: 'Depósito', retirada: 'Retirada', cancelamento: 'Anulação' };
  const FONTES = { brapi: 'brapi.dev', fechamento: 'fechamento (Actions)', manual: 'manual' };
  const ESTADOS = { 'ao-vivo': 'ao vivo', atrasado: 'atrasado', manual: 'manual', indisponivel: 'indisponível' };

  /* ---------- utilidades ---------- */
  const h = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (v === undefined || v === null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'text') e.textContent = v;
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') e.addEventListener(k.slice(2), v);
        else if (k === 'value' || k === 'checked' || k === 'disabled' || k === 'hidden' || k === 'selected') e[k] = v;
        else if (v === true) e.setAttribute(k, '');
        else e.setAttribute(k, String(v));
      });
    }
    const add = (x) => {
      if (x === undefined || x === null || x === false) return;
      if (Array.isArray(x)) x.forEach(add);
      else e.appendChild(typeof x === 'object' ? x : document.createTextNode(String(x)));
    };
    kids.forEach(add);
    return e;
  };
  const nf = (d) => new Intl.NumberFormat('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtN = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(+x)) ? '—' : nf(d).format(+x);
  const fmtS = (x, d = 2) => (x === null || x === undefined || !Number.isFinite(+x)) ? '—' : (x > 0 ? '+' : '') + nf(d).format(+x);
  const brl = (c) => C.fmtBRL(c);
  const brlS = (c) => (c === null || c === undefined) ? '—' : (c > 0 ? '+' : '') + C.fmtBRL(c);
  const cls = (x) => (x === null || x === undefined || x === 0) ? '' : x > 0 ? 'pos' : 'neg';
  const inCents = (c) => (c === null || c === undefined) ? '' : (c / 100).toFixed(2).replace('.', ',');
  const pctIn = (x) => (x === null || x === undefined) ? '' : String(Math.round(x * 100) / 100).replace('.', ',');
  const pad = (n) => (n < 10 ? '0' : '') + n;
  const agoraLocal = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const fmtData = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] : (s || '—'); };
  const fmtDH = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(s || ''); return m ? m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5] : fmtData(s); };
  const msgErro = (e) => (e && e.message) ? e.message : String(e || 'Erro desconhecido');

  const parseNum = (s) => {
    if (s === null || s === undefined) return null;
    if (typeof s === 'number') return Number.isFinite(s) ? s : null;
    let t = String(s).replace(/R\$|%|\s/g, '');
    if (!t) return null;
    if (t.indexOf(',') >= 0) t = t.replace(/\./g, '').replace(',', '.');
    else if ((t.match(/\./g) || []).length > 1) t = t.replace(/\./g, '');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };
  const money = (s) => { if (s === null || s === undefined || String(s).trim() === '') return null; const c = C.toCents(String(s)); return Number.isFinite(c) ? c : null; };
  const inteiro = (s) => {
    const t = String(s === null || s === undefined ? '' : s).trim();
    if (!/^(\d{1,3}(\.\d{3})+|\d+)$/.test(t)) return null;
    const n = Number(t.replace(/\./g, ''));
    return Number.isSafeInteger(n) ? n : null;
  };
  const dtValida = (s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s || '') && !Number.isNaN(Date.parse(String(s).slice(0, 16)));
  const lerInv = (fn, pad0) => { try { return fn(); } catch (e) { return pad0; } };
  const hojeISO = () => agoraLocal().slice(0, 10);
  // modo Fácil: mesma tela, menos colunas e formulários curtos (o INVModo carrega depois; o atributo do <html> já vale)
  const modoFacil = () => (window.INVModo ? window.INVModo.atual() === 'facil' : document.documentElement.getAttribute('data-modo') === 'facil');
  const soAv = (n) => { n.setAttribute('data-so-avancado', '1'); return n; };
  // código digitado (com ou sem o F do fracionário, ou "PETR4 — Petrobras") → ticker válido ou null
  const tickerDe = (txt) => {
    const t = String(txt || '').trim().toUpperCase().split(/[\s—–]+/)[0];
    const v = t && C.validarTicker ? C.validarTicker(t) : null;
    return v && v.ok && /^[A-Z]{4}\d{1,2}$/.test(v.ticker) ? v.ticker : null;
  };
  const codNeg = (t) => lerInv(() => INV.codigoNegociacao(t), t);

  const injetarCss = () => {
    if (document.getElementById('inv-cor-css')) return;
    const st = document.createElement('style');
    st.id = 'inv-cor-css';
    st.textContent = [
      '.inv-cor-grid { display: grid; gap: var(--cds-gap-sm); grid-template-columns: repeat(auto-fit, minmax(min(100%, 11rem), 1fr)); align-items: start; }',
      '.inv-cor-field { display: grid; gap: 2px; min-width: 0; }',
      '.inv-cor-field .pb-in { width: 100%; box-sizing: border-box; min-width: 0; }',
      '.inv-cor-narrow { width: 5.5rem; }',
      '.inv-cor-riscada td { text-decoration: line-through; color: var(--color-fg-muted); }',
      '.inv-cor-armaz { display: grid; gap: var(--cds-gap-sm); }',
      '.inv-cor-armaz:empty { display: none; }',
      '.inv-cor-banner { border: 1px solid var(--color-warn); border-radius: var(--cds-radius); padding: var(--cds-pad-xs) var(--cds-pad-sm); margin: 0; font-size: var(--cds-font-size-caption); }',
      '.inv-cor-sub { border-top: 1px solid var(--color-border-line); padding-top: var(--cds-pad-sm); display: grid; gap: var(--cds-gap-sm); }',
      '.inv-cor-row { display: flex; flex-wrap: wrap; gap: var(--cds-gap-sm); align-items: center; }',
      '.inv-cor-item { border-bottom: 1px solid var(--color-border-line); padding: var(--cds-pad-xs) 0; display: grid; gap: var(--cds-gap-xs); }',
      '.inv-cor-list { list-style: none; margin: 0; padding: 0; }',
      '.inv-cor-check { display: flex; gap: .5rem; align-items: flex-start; font-size: var(--cds-font-size-caption); }'
    ].join('\n');
    document.head.appendChild(st);
  };

  /* campo com <label>, ajuda e erro ligados por aria-describedby */
  const campo = (id, rotulo, o) => {
    o = o || {};
    let input;
    if (o.select) {
      input = h('select', { class: 'pb-in', id });
      o.select.forEach(([v, t]) => input.appendChild(h('option', { value: v }, t)));
    } else {
      input = h('input', { class: 'pb-in', id, type: o.tipo || 'text', autocomplete: 'off', inputmode: o.inputmode, placeholder: o.placeholder, maxlength: o.maxlength });
    }
    if (o.valor !== undefined) input.value = o.valor;
    const ajuda = o.ajuda ? h('small', { class: 'pb-note', id: id + '-aj' }, o.ajuda) : null;
    const erro = h('small', { class: 'inv-err', id: id + '-er', hidden: true });
    const wrap = h('div', { class: 'inv-field inv-cor-field' }, h('label', { for: id }, rotulo), input, ajuda, erro);
    const base = ajuda ? ajuda.id : '';
    if (base) input.setAttribute('aria-describedby', base);
    const setErro = (m) => {
      erro.textContent = m || ''; erro.hidden = !m;
      input.setAttribute('aria-invalid', m ? 'true' : 'false');
      const ids = [base, m ? erro.id : ''].filter(Boolean).join(' ');
      if (ids) input.setAttribute('aria-describedby', ids); else input.removeAttribute('aria-describedby');
    };
    return { wrap, input, setErro };
  };

  const chipEstado = (c) => {
    if (!c) return h('span', { class: 'pb-chip inv-chip-indisponivel' }, 'sem cotação');
    let e = null;
    if (INV.ui && typeof INV.ui.estadoPreco === 'function') { try { e = INV.ui.estadoPreco(c); } catch (x) { e = null; } }
    if (e && typeof e === 'object' && e.nodeType === 1) return e;
    const est = ESTADOS[c.estado] || 'indisponível';
    const quando = c.em ? ' · ' + fmtDH(c.em) : '';
    const fonte = c.fonte ? ' · ' + (FONTES[c.fonte] || c.fonte) : '';
    return h('span', { class: 'pb-chip inv-chip inv-chip-' + (c.estado || 'indisponivel') }, est + quando + fonte);
  };
  const avisoEl = (texto, tipo) => {
    if (INV.ui && typeof INV.ui.aviso === 'function') { try { const e = INV.ui.aviso(texto, tipo || 'info'); if (e && e.nodeType === 1) return e; } catch (x) { /* usa o próprio */ } }
    return h('p', { class: 'pb-note' + (tipo === 'bad' ? ' neg' : tipo === 'warn' ? ' warn' : '') }, texto);
  };
  const card = (titulo, ...kids) => h('div', { class: 'pb-card' }, h('h2', null, titulo), kids);
  const tile = (rotulo, grande, nota, classe) => h('div', { class: 'pb-card' },
    h('span', { class: 'pb-label' }, rotulo), h('span', { class: 'pb-big ' + (classe || '') }, grande), h('span', { class: 'pb-note' }, nota || ''));
  const kv = (rotulo, valor) => h('div', null, h('span', { class: 'pb-label' }, rotulo), h('b', null, valor));
  const emEdicao = (el) => { const a = document.activeElement; return !!(a && el.contains(a) && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)); };

  /* ---------- estado local da aba (nada disso é persistido) ---------- */
  const S = {
    tipo: 'compra', ticker: null, cot: null, cotCarregando: false, cotErro: '', seq: 0,
    precoManual: false, precoEditado: false, execPrecoTocado: false, qtdTocada: false, taxasTocadas: false,
    dataTocada: false, cxDataTocada: false,
    editandoId: null, fonteBase: null, editandoCaixa: null,
    todas: false, cancelandoId: null, motivo: '', removendo: null, editandoAtivo: null, errosAtivo: {},
    listaSig: ''
  };
  let D = null;           // último conjunto de dados derivados
  const R = {};           // referências de DOM

  const dados = () => {
    const st = INV.estado();
    const txs = st.transacoes || [];
    const ef = C.efetivas(txs);
    const pos = C.posicoes(ef);
    const caixa = C.caixa(ef);
    const refs = {}, precos = {};
    Object.keys(pos).forEach((t) => {
      const r = lerInv(() => INV.precoReferencia(t), null);
      refs[t] = r;
      precos[t] = (r && Number.isFinite(r.precoCent)) ? r.precoCent : null;
    });
    return { st, txs, ef, pos, caixa, refs, precos, aloc: C.alocacao(pos, precos) };
  };
  INV.carteiraDados = dados;   // leitura dos mesmos dados derivados (Resumo do modo Fácil)
  const efSem = (d, id) => id ? d.ef.filter((t) => t.id !== id) : d.ef;
  const cfg = () => {
    const c = lerInv(() => INV.estado().config, {}) || {};
    return { taxaFixaCent: Number.isFinite(c.taxaFixaCent) ? c.taxaFixaCent : 0, taxaPct: Number.isFinite(c.taxaPct) ? c.taxaPct : 0 };
  };
  const loteAtual = () => { const a = S.ticker ? INV.ativo(S.ticker) : null; return (a && a.lote > 0) ? Math.floor(a.lote) : 1; };

  /* ---------- montagem do DOM estático ---------- */
  const sec = INV.aba({ id: ID, rotulo: 'Minha carteira' });
  if (!sec) return;
  injetarCss();

  /* 1. Resumo */
  R.tiles = h('div', { class: 'pb-tiles' });
  R.avisosResumo = h('div', { 'aria-live': 'polite' });
  R.conc = h('div');
  R.avisosArm = h('div', { class: 'inv-cor-armaz', 'aria-live': 'polite' });
  const cResumo = card('Resumo da carteira real',
    h('p', { class: 'pb-note' }, 'Só o que você registrou, pelo preço mais recente disponível. Não é recomendação.'),
    R.tiles, R.avisosResumo);

  /* 2. Posições */
  R.msgAlvo = h('p', { class: 'pb-note', 'aria-live': 'polite' });
  R.tabPos = h('div', { class: 'pb-tablewrap' });
  R.legend = h('div', { class: 'pb-legend' });
  R.chart = h('div', { class: 'pb-chart' });
  const cPos = card('Posições',
    h('p', { class: 'pb-note' }, 'Quanto você tem de cada ativo, o preço médio que pagou e quanto vale hoje. ', h('span', { 'data-so-avancado': '1' }, 'O % atual é calculado sobre o valor das posições com preço (sem o caixa). O alvo % é salvo neste aparelho.'), h('span', { 'data-so-facil': '1' }, 'O alvo % (meta de distribuição) é definido no modo Avançado.')),
    R.tabPos, R.msgAlvo,
    h('h3', null, 'Atual × alvo'), R.legend, R.chart);
  R.legend.appendChild(h('span', null, h('i', { class: 'pb-sw', style: 'background:' + cor(0) }), 'Atual'));
  R.legend.appendChild(h('span', null, h('i', { class: 'pb-sw', style: 'background:' + cor(1) }), 'Alvo'));

  /* 3. Comprar / vender */
  const F = {};
  R.tipoBtns = {};
  const tipoGrupo = h('div', { class: 'pb-controls', role: 'group', 'aria-label': 'Tipo de operação' });
  [['compra', 'Comprar'], ['venda', 'Vender']].forEach(([t, r]) => {
    const b = h('button', { type: 'button', class: 'pb-btn', 'aria-pressed': t === S.tipo ? 'true' : 'false' }, r);
    b.addEventListener('click', () => { S.tipo = t; marcarTipo(); sincronizar(); });
    R.tipoBtns[t] = b; tipoGrupo.appendChild(b);
  });
  F.ativo = campo('cor-ativo', 'Ativo', { tipo: 'search', placeholder: 'Digite ticker ou nome', ajuda: 'Escolha um ativo da lista. Para usar um ativo que não está nela, cadastre-o na seção "Meus ativos".' });
  R.datalist = h('datalist', { id: 'cor-ativo-lista' });
  F.ativo.input.setAttribute('list', 'cor-ativo-lista');
  R.info = h('div', { class: 'pb-kv' });
  R.posHint = h('p', { class: 'pb-note', 'aria-live': 'polite' });
  R.cotBox = h('div', { class: 'inv-cor-row', role: 'status', 'aria-live': 'polite' });
  R.btnCot = h('button', { type: 'button', class: 'pb-btn' }, 'Atualizar cotação');
  R.btnUsarCot = h('button', { type: 'button', class: 'pb-btn', hidden: true }, 'Usar cotação');
  F.preco = campo('cor-preco', 'Preço (R$)', { inputmode: 'decimal', placeholder: '0,00', ajuda: 'Se você digitar, o preço fica "manual" e nenhuma cotação o sobrescreve.' });
  F.valor = campo('cor-valor', 'Valor a investir (R$)', { inputmode: 'decimal', placeholder: '0,00' });
  R.estimativa = h('div', { class: 'pb-kv', 'aria-live': 'polite' });
  R.estAviso = h('p', { class: 'pb-note warn', 'aria-live': 'polite' });

  F.data = campo('cor-data', 'Data e hora da execução', { tipo: 'datetime-local', valor: agoraLocal() });
  F.precoExec = campo('cor-preco-exec', 'Preço executado (R$)', { inputmode: 'decimal', placeholder: '0,00' });
  F.qtdExec = campo('cor-qtd-exec', 'Quantidade executada', { inputmode: 'numeric', placeholder: '0', ajuda: 'Número inteiro.' });
  F.taxasExec = campo('cor-taxas-exec', 'Taxas (R$)', { inputmode: 'decimal', placeholder: '0,00', ajuda: 'Pré-calculadas com os custos padrão; edite se a nota de corretagem for diferente.' });
  F.obs = campo('cor-obs', 'Observação (opcional)', { maxlength: 200 });
  R.totalExec = h('p', { class: 'pb-note', 'aria-live': 'polite' });
  R.caixaAviso = h('p', { class: 'pb-note warn', 'aria-live': 'polite' });
  R.banner = h('p', { class: 'inv-cor-banner', hidden: true, role: 'status' });
  R.confirma = h('input', { type: 'checkbox', id: 'cor-confirma' });
  R.erros = h('div', { class: 'inv-err', role: 'alert', id: 'cor-erros', hidden: true });
  R.ok = h('p', { class: 'pb-note pos', 'aria-live': 'polite' });
  R.btnReg = h('button', { type: 'submit', class: 'pb-btn inv-pri' }, 'Registrar operação');
  R.btnLimpar = h('button', { type: 'button', class: 'pb-btn' }, 'Limpar');
  R.btnRecalc = h('button', { type: 'button', class: 'pb-btn' }, 'Usar valores da estimativa');
  R.formReg = h('form', { class: 'inv-cor-sub', novalidate: true, 'aria-labelledby': 'cor-reg-t' },
    h('h3', { id: 'cor-reg-t' }, 'Registrar operação executada'),
    h('p', { class: 'pb-note' }, 'Só o que você informar aqui é gravado. Uma cotação nunca vira transação sozinha e este painel não envia ordens à corretora.'),
    R.banner,
    h('div', { class: 'inv-cor-grid' }, F.data.wrap, F.precoExec.wrap, F.qtdExec.wrap, F.taxasExec.wrap, F.obs.wrap),
    h('div', { class: 'inv-cor-row' }, R.btnRecalc),
    R.totalExec, R.caixaAviso,
    h('label', { class: 'inv-cor-check', for: 'cor-confirma' }, R.confirma, h('span', null, 'Confirmo que esta ordem foi executada na corretora')),
    R.erros,
    h('div', { class: 'inv-actions inv-cor-row' }, R.btnReg, R.btnLimpar),
    R.ok);
  const cTrade = soAv(card('Comprar ou vender um ativo',
    h('p', { class: 'pb-note' }, 'Em duas etapas: primeiro veja quanto dá para comprar (estimativa); depois, já com a ordem executada na sua corretora, registre o preço e a quantidade reais.'),
    tipoGrupo, F.ativo.wrap, R.datalist, R.info, R.posHint,
    h('div', { class: 'inv-cor-row' }, R.cotBox, R.btnCot, R.btnUsarCot),
    h('div', { class: 'inv-cor-grid' }, F.preco.wrap, F.valor.wrap),
    h('h3', null, 'Estimativa'), R.estimativa, R.estAviso,
    R.formReg));

  /* 4. Assistente (preenchido por invest-assistente.js) */
  const cAssist = soAv(card('Assistente de alocação (vários ativos)',
    h('p', { class: 'pb-note' }, 'Divide um aporte entre vários ativos, pelas metas de alocação e pelo score, em cinco passos. A proposta não é uma ordem: nada é comprado até você registrar o que executou.'),
    h('div', { id: 'inv-assistente' })));

  /* 3a. Registro rápido: compra ou venda numa tela só, com o preço que você pagou (é o formulário do modo Fácil) */
  const Q = { tipo: 'compra', editandoId: null, dataOrig: null, ticker: null, cot: null, seq: 0 };
  const FQ = {};
  R.qTipoBtns = {};
  const qTipo = h('div', { class: 'pb-controls', role: 'group', 'aria-label': 'Compra ou venda' });
  [['compra', 'Comprei'], ['venda', 'Vendi']].forEach(([t, r]) => {
    const b = h('button', { type: 'button', class: 'pb-btn', 'aria-pressed': t === Q.tipo ? 'true' : 'false' }, r);
    b.addEventListener('click', () => { Q.tipo = t; marcarQ(); dicaQ(); totalQ(); });
    R.qTipoBtns[t] = b; qTipo.appendChild(b);
  });
  FQ.ativo = campo('cor-q-ativo', 'Ativo', { tipo: 'search', placeholder: 'Ex.: PETR4', ajuda: 'Com ou sem o F do fracionário (PETR4 ou PETR4F).' });
  FQ.ativo.input.setAttribute('list', 'cor-ativo-lista');
  FQ.ativo.input.setAttribute('autocapitalize', 'characters');
  FQ.qtd = campo('cor-q-qtd', 'Quantidade de cotas', { inputmode: 'numeric', placeholder: '0' });
  FQ.preco = campo('cor-q-preco', 'Preço pago por cota (R$)', { inputmode: 'decimal', placeholder: '0,00' });
  FQ.data = campo('cor-q-data', 'Data', { tipo: 'date', valor: hojeISO() });
  FQ.taxas = campo('cor-q-taxas', 'Taxas (R$, opcional)', { inputmode: 'decimal', placeholder: '0,00' });
  R.qDica = h('div', { class: 'inv-cor-row', 'aria-live': 'polite' });
  R.qTotal = h('p', { class: 'pb-text', 'aria-live': 'polite' });
  R.qBanner = h('p', { class: 'inv-cor-banner', hidden: true, role: 'status' });
  R.qErro = h('div', { class: 'inv-err', role: 'alert', hidden: true });
  R.qOk = h('p', { class: 'pb-note pos', 'aria-live': 'polite' });
  R.qBtn = h('button', { type: 'submit', class: 'pb-btn inv-pri' }, 'Salvar compra');
  R.qLimpar = h('button', { type: 'button', class: 'pb-btn' }, 'Limpar');
  R.qForm = h('form', { novalidate: true, class: 'inv-cor-sub', style: 'border-top:0;padding-top:0', 'aria-label': 'Registrar compra ou venda' },
    R.qBanner, qTipo,
    h('div', { class: 'inv-cor-grid' }, FQ.ativo.wrap, FQ.qtd.wrap, FQ.preco.wrap, FQ.data.wrap, FQ.taxas.wrap),
    R.qDica, R.qTotal, R.qErro,
    h('div', { class: 'inv-actions inv-cor-row' }, R.qBtn, R.qLimpar), R.qOk);
  const cRapido = h('div', { class: 'pb-card', 'data-so-facil': '1' }, h('h2', null, 'Registrar compra ou venda'),
    h('p', { class: 'pb-note' }, 'Anote o que você executou na corretora. O app calcula o preço médio e o resultado.'), R.qForm);

  function marcarQ() {
    Object.keys(R.qTipoBtns).forEach((t) => R.qTipoBtns[t].setAttribute('aria-pressed', String(t === Q.tipo)));
    FQ.preco.wrap.querySelector('label').textContent = Q.tipo === 'compra' ? 'Preço pago por cota (R$)' : 'Preço de venda por cota (R$)';
    R.qBtn.textContent = Q.editandoId ? 'Salvar correção' : (Q.tipo === 'compra' ? 'Salvar compra' : 'Salvar venda');
  }
  function posDe(t, semId) {
    const ef = C.efetivas(lerInv(() => INV.estado().transacoes, []) || []).filter((x) => !semId || x.id !== semId);
    return C.posicoes(ef)[t] || null;
  }
  // preço de hoje (ao vivo com token da brapi; senão o último fechamento) e, na venda, quantas cotas você tem
  function dicaQ() {
    const t = tickerDe(FQ.ativo.input.value);
    if (t !== Q.ticker) { Q.ticker = t; Q.cot = null; }
    R.qDica.replaceChildren();
    if (!t) return;
    const p = posDe(t, Q.editandoId);
    const partes = [];
    if (Q.cot && Q.cot.precoCent) {
      partes.push(h('span', { class: 'pb-note' }, 'Preço de hoje: ' + brl(Q.cot.precoCent)), chipEstado(Q.cot),
        h('button', { type: 'button', class: 'pb-btn', onclick: () => { FQ.preco.input.value = inCents(Q.cot.precoCent); FQ.preco.setErro(''); totalQ(); } }, 'Usar este preço'));
    } else if (Q.cot) partes.push(h('span', { class: 'pb-note' }, 'Sem preço de hoje para ' + t + '. Digite o preço da nota.'));
    if (p) partes.push(h('span', { class: 'pb-note' }, 'Você tem ' + fmtN(p.qtd, 0) + ' cota(s) de ' + t + ', preço médio ' + brl(p.precoMedioCent) + '.'));
    else if (Q.tipo === 'venda') partes.push(h('span', { class: 'pb-note neg' }, 'Você não tem ' + t + ' registrado.'));
    R.qDica.append(...partes);
    if (!Q.cot) {
      const seq = ++Q.seq;
      Promise.resolve(lerInv(() => INV.cotacao(t), null)).then((c) => { if (seq === Q.seq && t === Q.ticker) { Q.cot = c || { precoCent: null }; dicaQ(); } }, () => {});
    }
  }
  function totalQ() {
    const q = inteiro(FQ.qtd.input.value), p = money(FQ.preco.input.value);
    const tt = FQ.taxas.input.value.trim(), tx = tt === '' ? 0 : money(tt);
    if (!(q > 0) || !(p > 0) || tx === null || tx < 0) { R.qTotal.textContent = ''; return; }
    const bruto = q * p, total = Q.tipo === 'compra' ? bruto + tx : bruto - tx;
    R.qTotal.textContent = (Q.tipo === 'compra' ? 'Total pago: ' : 'Total recebido: ') + brl(total) + ' (' + fmtN(q, 0) + ' × ' + brl(p) + (tx ? (Q.tipo === 'compra' ? ' + ' : ' − ') + brl(tx) + ' de taxas' : '') + ').';
  }
  function limparQ(msg) {
    Q.editandoId = null; Q.dataOrig = null; Q.ticker = null; Q.cot = null; Q.seq++;
    [FQ.ativo, FQ.qtd, FQ.preco, FQ.taxas].forEach((f) => { f.input.value = ''; f.setErro(''); });
    FQ.data.input.value = hojeISO(); FQ.data.setErro('');
    R.qBanner.hidden = true; R.qErro.hidden = true; R.qErro.textContent = ''; R.qTotal.textContent = ''; R.qDica.replaceChildren();
    R.qOk.textContent = msg || '';
    marcarQ();
  }
  function salvarQ() {
    R.qOk.textContent = ''; R.qErro.hidden = true;
    let t = tickerDe(FQ.ativo.input.value);
    const q = inteiro(FQ.qtd.input.value), p = money(FQ.preco.input.value), d = FQ.data.input.value;
    const tt = FQ.taxas.input.value.trim(), tx = tt === '' ? 0 : money(tt);
    FQ.ativo.setErro(t ? '' : 'Digite um código válido (ex.: PETR4).');
    FQ.qtd.setErro(q > 0 ? '' : 'Informe quantas cotas (número inteiro).');
    FQ.preco.setErro(p > 0 ? '' : 'Informe o preço por cota.');
    FQ.taxas.setErro(tx !== null && tx >= 0 ? '' : 'Taxas inválidas (pode deixar vazio).');
    FQ.data.setErro(/^\d{4}-\d{2}-\d{2}$/.test(d) ? '' : 'Informe a data.');
    if (!t || !(q > 0) || !(p > 0) || tx === null || tx < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
    // hoje: grava a hora atual; outro dia: só a data (na correção, mantém a data/hora original se o dia não mudou)
    const data = Q.dataOrig && Q.dataOrig.slice(0, 10) === d ? Q.dataOrig : (d === hojeISO() ? agoraLocal() : d);
    const bruto = q * p;
    const tx0 = { tipo: Q.tipo, ticker: t, data, qtd: q, precoCent: p, taxasCent: tx, valorCent: Q.tipo === 'compra' ? bruto + tx : bruto - tx,
      moeda: 'BRL', status: 'executada', fontePreco: 'manual', obs: '', substitui: null };
    try {
      t = INV.garantirAtivo(t);
      const corrigindo = !!Q.editandoId;
      if (corrigindo) INV.corrigirTx(Q.editandoId, tx0); else INV.adicionarTx(tx0);
      const pos = posDe(t);
      limparQ((corrigindo ? 'Correção salva: ' : (Q.tipo === 'compra' ? 'Compra salva: ' : 'Venda salva: ')) + fmtN(q, 0) + ' ' + t + ' a ' + brl(p) + '.'
        + (pos ? ' Agora você tem ' + fmtN(pos.qtd, 0) + ' cota(s), preço médio ' + brl(pos.precoMedioCent) + '.' : ' Posição zerada.'));
    } catch (e) { R.qErro.textContent = msgErro(e); R.qErro.hidden = false; }
  }
  function carregarQ(tx) {
    limparQ('');
    Q.editandoId = tx.id; Q.dataOrig = tx.data; Q.tipo = tx.tipo;
    FQ.ativo.input.value = tx.ticker; FQ.qtd.input.value = String(tx.qtd); FQ.preco.input.value = inCents(tx.precoCent);
    FQ.taxas.input.value = tx.taxasCent ? inCents(tx.taxasCent) : ''; FQ.data.input.value = String(tx.data).slice(0, 10);
    R.qBanner.hidden = false;
    R.qBanner.textContent = 'Corrigindo ' + (TIPOS[tx.tipo] || tx.tipo).toLowerCase() + ' de ' + tx.ticker + ' de ' + fmtData(tx.data) + '. Ao salvar, ela é substituída.';
    marcarQ(); dicaQ(); totalQ();
    INV.ir(ID, 'operar');
    FQ.qtd.input.focus();
  }
  FQ.ativo.input.addEventListener('input', dicaQ);
  FQ.ativo.input.addEventListener('change', () => { const v = FQ.ativo.input.value.trim(); FQ.ativo.setErro(v && !tickerDe(v) ? 'Código inválido (ex.: PETR4).' : ''); dicaQ(); });
  [FQ.qtd, FQ.preco, FQ.taxas].forEach((f) => f.input.addEventListener('input', totalQ));
  R.qLimpar.addEventListener('click', () => limparQ(''));
  R.qForm.addEventListener('submit', (ev) => { ev.preventDefault(); salvarQ(); });

  /* 4a. Planejar compra: valor → quantas cotas (mercado fracionário: de 1 em 1) */
  const P = { ticker: null, cot: null, seq: 0, precoTocado: false, ultimo: null };
  const FP = {};
  FP.ativo = campo('cor-p-ativo', 'Ativo', { tipo: 'search', placeholder: 'Ex.: PETR4' });
  FP.ativo.input.setAttribute('list', 'cor-ativo-lista');
  FP.ativo.input.setAttribute('autocapitalize', 'characters');
  FP.valor = campo('cor-p-valor', 'Quanto quer investir (R$)', { inputmode: 'decimal', placeholder: 'Ex.: 1.000,00' });
  FP.preco = campo('cor-p-preco', 'Preço por cota (R$)', { inputmode: 'decimal', placeholder: '0,00', ajuda: 'Preenchido com o preço de hoje; pode alterar.' });
  R.pCot = h('div', { class: 'inv-cor-row', 'aria-live': 'polite' });
  R.pRes = h('div', { 'aria-live': 'polite', style: 'display:grid;gap:var(--cds-gap-sm)' });
  const cPlano = h('div', { class: 'pb-card' }, h('h2', null, 'Quantas cotas comprar'),
    h('p', { class: 'pb-note' }, 'Diga o ativo e quanto quer investir. A conta usa o mercado fracionário (de 1 em 1 cota) e os custos de Ajustes.'),
    h('div', { class: 'inv-cor-grid' }, FP.ativo.wrap, FP.valor.wrap, FP.preco.wrap), R.pCot, R.pRes);

  function cotP() {
    const t = P.ticker;
    R.pCot.replaceChildren();
    if (!t) return;
    if (!P.cot) { R.pCot.append(h('span', { class: 'pb-note' }, 'Buscando o preço de ' + t + '…')); return; }
    if (P.cot.precoCent) R.pCot.append(...[h('span', { class: 'pb-note' }, 'Preço de hoje: ' + brl(P.cot.precoCent)), chipEstado(P.cot),
      P.precoTocado ? h('button', { type: 'button', class: 'pb-btn', onclick: () => { P.precoTocado = false; FP.preco.input.value = inCents(P.cot.precoCent); calcP(); cotP(); } }, 'Usar o preço de hoje') : null].filter(Boolean));
    else R.pCot.append(h('span', { class: 'pb-note' }, 'Sem preço de hoje para ' + t + ': digite o preço por cota.'));
  }
  function selP() {
    const t = tickerDe(FP.ativo.input.value);
    if (t === P.ticker) { calcP(); return; }
    P.ticker = t; P.cot = null; P.precoTocado = false;
    if (!t) { FP.preco.input.value = ''; cotP(); calcP(); return; }
    cotP(); calcP();
    const seq = ++P.seq;
    Promise.resolve(lerInv(() => INV.cotacao(t), null)).then((c) => {
      if (seq !== P.seq || t !== P.ticker) return;
      P.cot = c || { precoCent: null };
      if (P.cot.precoCent && !P.precoTocado) FP.preco.input.value = inCents(P.cot.precoCent);
      cotP(); calcP();
    }, () => { if (seq === P.seq) { P.cot = { precoCent: null }; cotP(); } });
  }
  function calcP() {
    const t = P.ticker, v = money(FP.valor.input.value), p = money(FP.preco.input.value), c = cfg();
    P.ultimo = null;
    if (!t) { R.pRes.replaceChildren(FP.ativo.input.value.trim() ? h('p', { class: 'pb-note neg' }, 'Código inválido (ex.: PETR4).') : h('span')); return; }
    if (!(v > 0) || !(p > 0)) { R.pRes.replaceChildren(h('p', { class: 'pb-note' }, !(v > 0) ? 'Informe quanto quer investir.' : 'Informe o preço por cota.')); return; }
    const r = C.estimarQuantidade({ valorCent: v, precoCent: p, lote: 1, taxaFixaCent: c.taxaFixaCent, taxaPct: c.taxaPct });
    const pos = posDe(t), cod = codNeg(t);
    if (!(r.qtd > 0)) {
      R.pRes.replaceChildren(h('p', { class: 'pb-text neg' }, 'Com ' + brl(v) + ' não dá para comprar 1 cota de ' + t + ' (' + brl(p) + (r.aviso ? '; ' + r.aviso : '') + ').'));
      return;
    }
    P.ultimo = { ticker: t, qtd: r.qtd, precoCent: p };
    try { INV.preferencias.gravar((u) => { u.planejou = true; }); } catch (e) { /* ok */ }
    const depois = pos ? (pos.custoCent + r.totalCent) / (pos.qtd + r.qtd) : null;
    R.pRes.replaceChildren(...[
      h('div', { class: 'pb-tiles' },
        tile('Comprar', fmtN(r.qtd, 0) + (r.qtd === 1 ? ' cota' : ' cotas'), 'código ' + cod + (cod !== t ? ' (fracionário)' : '')),
        tile('Total', brl(r.totalCent), fmtN(r.qtd, 0) + ' × ' + brl(p) + (r.taxasCent ? ' + ' + brl(r.taxasCent) + ' de taxas' : '')),
        tile('Sobra', brl(r.sobraCent), r.sobraCent >= p ? 'não completa outra cota com as taxas' : 'menos que 1 cota')),
      pos ? h('p', { class: 'pb-note' }, 'Você já tem ' + fmtN(pos.qtd, 0) + ' cota(s) a ' + brl(pos.precoMedioCent) + '. Depois desta compra: ' + fmtN(pos.qtd + r.qtd, 0) + ' cotas, preço médio de cerca de ' + brl(Math.round(depois)) + '.') : null,
      h('div', { class: 'inv-actions' }, h('button', { type: 'button', class: 'pb-btn inv-pri', onclick: () => irRegistrar(t, 'compra', { qtd: r.qtd, precoCent: p }) }, 'Já comprei: registrar')),
      h('p', { class: 'pb-disc' }, 'Planejamento, não é ordem nem recomendação. O preço na corretora pode ser diferente.')].filter(Boolean));
  }
  FP.ativo.input.addEventListener('input', selP);
  FP.ativo.input.addEventListener('change', selP);
  FP.valor.input.addEventListener('input', calcP);
  FP.preco.input.addEventListener('input', () => { P.precoTocado = FP.preco.input.value.trim() !== ''; cotP(); calcP(); });

  // atalhos usados pela tela Hoje (lista de ativos) e pelo planejamento
  function irRegistrar(t, tipo, extra) {
    extra = extra || {};
    if (modoFacil()) {
      limparQ('');
      Q.tipo = tipo || 'compra'; FQ.ativo.input.value = t || '';
      if (extra.qtd) FQ.qtd.input.value = String(extra.qtd);
      if (extra.precoCent) FQ.preco.input.value = inCents(extra.precoCent);
      INV.ir(ID, 'operar'); marcarQ(); dicaQ(); totalQ();
      (extra.qtd ? FQ.preco : t ? FQ.qtd : FQ.ativo).input.focus();
    } else {
      limparTrade('');
      S.tipo = tipo || 'compra';
      if (t) { try { INV.garantirAtivo(t); } catch (e) { /* aparece como erro no campo */ } const a = INV.ativo(t); F.ativo.input.value = t + (a ? ' — ' + a.nome : ''); }
      if (extra.qtd && extra.precoCent) F.valor.input.value = inCents(extra.qtd * extra.precoCent);
      INV.ir(ID, 'operar'); marcarTipo(); selecionar(resolverTicker(F.ativo.input.value));
      (t ? F.valor : F.ativo).input.focus();
    }
  }
  function irPlanejar(t) {
    INV.ir(ID, 'aporte');
    FP.ativo.input.value = t || ''; selP();
    (t ? FP.valor : FP.ativo).input.focus();
  }
  INV.registrarOperacao = irRegistrar;
  INV.planejarCompra = irPlanejar;

  /* 5. Caixa */
  const FC = {};
  FC.tipo = campo('cor-cx-tipo', 'Tipo', { select: [['deposito', 'Depósito'], ['retirada', 'Retirada']] });
  FC.valor = campo('cor-cx-valor', 'Valor (R$)', { inputmode: 'decimal', placeholder: '0,00' });
  FC.data = campo('cor-cx-data', 'Data e hora', { tipo: 'datetime-local', valor: agoraLocal() });
  FC.obs = campo('cor-cx-obs', 'Observação (opcional)', { maxlength: 200 });
  R.cxSaldo = h('p', { class: 'pb-note', 'aria-live': 'polite' });
  R.cxAviso = h('p', { class: 'pb-note warn', 'aria-live': 'polite' });
  R.cxBanner = h('p', { class: 'inv-cor-banner', hidden: true, role: 'status' });
  R.cxMsg = h('p', { class: 'pb-note', 'aria-live': 'polite' });
  R.cxErro = h('div', { class: 'inv-err', role: 'alert', hidden: true });
  R.cxBtn = h('button', { type: 'submit', class: 'pb-btn inv-pri' }, 'Registrar movimento');
  R.cxCancel = h('button', { type: 'button', class: 'pb-btn', hidden: true }, 'Cancelar correção');
  R.cxForm = h('form', { novalidate: true, class: 'inv-cor-sub', 'aria-label': 'Depósito ou retirada de caixa' },
    R.cxBanner, h('div', { class: 'inv-cor-grid' }, FC.tipo.wrap, FC.valor.wrap, FC.data.wrap, FC.obs.wrap),
    R.cxAviso, R.cxErro, h('div', { class: 'inv-actions inv-cor-row' }, R.cxBtn, R.cxCancel), R.cxMsg);
  const cCaixa = card('Caixa',
    h('p', { class: 'pb-note' }, 'Registre depósitos e retiradas da conta na corretora. Compras reduzem e vendas aumentam o caixa automaticamente.'),
    R.cxSaldo, R.cxForm);

  /* 6. Transações */
  R.chkTodas = h('input', { type: 'checkbox', id: 'cor-todas' });
  R.txBusca = h('input', { type: 'search', class: 'pb-in', id: 'cor-tx-busca', placeholder: 'Ticker ou observação', autocomplete: 'off' });
  R.txTipo = h('select', { class: 'pb-in', id: 'cor-tx-tipo' },
    [['', 'Todos os tipos'], ['compra', 'Compras'], ['venda', 'Vendas'], ['deposito', 'Depósitos'], ['retirada', 'Retiradas']].map(([v, t]) => h('option', { value: v }, t)));
  R.txConta = h('span', { class: 'pb-note', 'aria-live': 'polite' });
  R.txMsg = h('p', { class: 'pb-note', 'aria-live': 'polite' });
  R.tabTx = h('div', { class: 'pb-tablewrap' });
  const cTx = card('Transações',
    h('p', { class: 'pb-note' }, 'Tudo o que você registrou, do mais recente para o mais antigo.', h('span', { 'data-so-avancado': '1' }, ' "Corrigir" grava uma versão nova que substitui a anterior; "Anular" tira a transação das contas. Nada é apagado: o histórico completo fica disponível na opção abaixo.')),
    h('div', { class: 'pb-controls inv-cor-filtros', 'data-so-avancado': '1' },
      h('label', { class: 'inv-sr', for: 'cor-tx-busca' }, 'Buscar transação'), R.txBusca,
      h('label', { class: 'inv-sr', for: 'cor-tx-tipo' }, 'Tipo de transação'), R.txTipo, R.txConta),
    h('label', { class: 'inv-cor-check', for: 'cor-todas', 'data-so-avancado': '1' }, R.chkTodas, h('span', null, 'Mostrar também as versões corrigidas e as anulações')),
    R.txMsg, R.tabTx);

  /* 7. Meus ativos */
  const FA = {};
  FA.ticker = campo('cor-at-ticker', 'Ticker', { maxlength: 8, placeholder: 'ex.: BOVA11', ajuda: 'Formato B3: 4 letras e 1 ou 2 dígitos.' });
  FA.nome = campo('cor-at-nome', 'Nome', { maxlength: 60 });
  FA.classe = campo('cor-at-classe', 'Classe', { select: CLASSES.map((c) => [c, c]) });
  FA.lote = campo('cor-at-lote', 'Lote', { inputmode: 'numeric', valor: '1', ajuda: '1 = fracionário; 100 = lote padrão.' });
  FA.preco = campo('cor-at-preco', 'Preço manual (R$, opcional)', { inputmode: 'decimal', placeholder: '0,00' });
  R.atMsg = h('p', { class: 'pb-note', 'aria-live': 'polite' });
  R.atErro = h('div', { class: 'inv-err', role: 'alert', hidden: true });
  R.atForm = h('form', { novalidate: true, class: 'inv-cor-sub', 'aria-label': 'Adicionar ativo próprio' },
    h('h3', null, 'Adicionar ativo'),
    h('div', { class: 'inv-cor-grid' }, FA.ticker.wrap, FA.nome.wrap, FA.classe.wrap, soAv(FA.lote.wrap), FA.preco.wrap),
    R.atErro, h('div', { class: 'inv-actions inv-cor-row' }, h('button', { type: 'submit', class: 'pb-btn inv-pri' }, 'Adicionar ativo')), R.atMsg);
  R.atLista = h('div');
  const cAtivos = card('Meus ativos',
    h('p', { class: 'pb-note' }, 'Ativos fora do painel que você registrou (só em reais, B3). Um código novo usado numa compra entra aqui sozinho.',
      h('span', { 'data-so-avancado': '1' }, ' Para aparecerem no Simulador, o ticker precisa entrar na lista "extras" (veja em Ajustes) e o histórico chega na próxima atualização de dados.')),
    h('div', { class: 'inv-cor-row', 'data-so-avancado': '1' }, h('button', { type: 'button', class: 'pb-btn', onclick: () => INV.ir('config', 'extras') }, 'Abrir Ajustes › Ativos extras')),
    R.atLista, R.atForm);

  /* 0. Primeiros passos e atalhos (no Resumo) */
  R.passos = h('ol', { class: 'inv-passos' });
  const cPassos = card('Primeiros passos',
    h('p', { class: 'pb-note' }, 'Para a carteira refletir o que você tem na corretora. Este quadro some quando tudo estiver feito.'),
    R.passos);
  const atalho = (rotulo, secao, pri) => h('button', { type: 'button', class: 'pb-btn' + (pri ? ' inv-pri' : ''), onclick: () => INV.ir(ID, secao) }, rotulo);
  const cAtalhos = card('O que você quer fazer?',
    h('div', { class: 'inv-atalhos' },
      atalho('Registrar compra ou venda', 'operar', true), atalho('Planejar compra', 'aporte'), atalho('Registrar depósito', 'caixa'),
      atalho('Ver posições', 'posicoes'), atalho('Ver transações', 'transacoes')));
  const PASSOS = [
    ['caixa', 'Registre o dinheiro que está na corretora', 'Um depósito com o saldo atual da conta.', (st, ef) => ef.some((t) => t.tipo === 'deposito')],
    ['operar', 'Registre o que você já tem', 'Uma compra para cada ativo, com preço e quantidade da nota.', (st, ef) => ef.some((t) => t.tipo === 'compra')],
    ['posicoes', 'Defina o alvo de cada ativo', 'Quanto da carteira cada um deve ter (em %).', (st) => Object.keys(st.alvos || {}).length > 0],
    ['aporte', 'Planeje o próximo aporte', 'O assistente divide o dinheiro novo entre os ativos abaixo do alvo.', (st, ef) => ef.some((t) => t.obs === 'Assistente de alocação')]
  ];
  // no Fácil: sem metas de alocação nem assistente; o caixa é opcional
  const PASSOS_FACIL = [
    ['operar', 'Registre o que você já tem', 'Uma compra por ativo, com a quantidade e o preço que você pagou.', (st, ef) => ef.some((t) => t.tipo === 'compra')],
    ['aporte', 'Planeje a próxima compra', 'Diga quanto quer investir e veja quantas cotas comprar.', () => !!lerInv(() => INV.preferencias.ler().planejou, false)],
    ['caixa', 'Opcional: registre o dinheiro na corretora', 'Um depósito com o saldo da conta, para acompanhar o caixa.', (st, ef) => ef.some((t) => t.tipo === 'deposito')]
  ];
  function desenharPassos() {
    let st, ef;
    try { st = INV.estado(); ef = C.efetivas(st.transacoes || []); } catch (e) { return; }
    const lista = modoFacil() ? PASSOS_FACIL : PASSOS;
    const feitos = lista.map((p) => !!p[3](st, ef));
    cPassos.hidden = (lista === PASSOS_FACIL ? feitos.slice(0, 2) : feitos).every(Boolean);   // o passo do caixa é opcional
    R.passos.replaceChildren(...lista.map((p, i) => h('li', { class: feitos[i] ? 'ok' : '' },
      h('span', { class: 'ck', 'aria-hidden': 'true' }, feitos[i] ? '✓' : String(i + 1)),
      h('span', { class: 't' }, h('b', null, p[1]), h('span', null, p[2]), h('span', { class: 'inv-sr' }, feitos[i] ? ' (feito)' : ' (a fazer)')),
      feitos[i] ? h('span') : h('button', { type: 'button', class: 'pb-btn', onclick: () => INV.ir(ID, p[0]) }, 'Fazer agora'))));
  }

  INV.secoes(sec, {
    id: ID, rotulo: 'Seções da carteira',
    antes: [R.avisosArm],
    itens: [
      { id: 'resumo', rotulo: 'Resumo', nodes: [cResumo, R.conc, cPassos, cAtalhos] },
      { id: 'posicoes', rotulo: 'Posições', nodes: [cPos],
 },
      { id: 'operar', rotulo: 'Comprar ou vender', nodes: [cRapido, cTrade] },
      { id: 'aporte', rotulo: 'Planejar compra', nodes: [cPlano, cAssist] },
      { id: 'caixa', rotulo: 'Caixa', nodes: [cCaixa] },
      { id: 'transacoes', rotulo: 'Transações', nodes: [cTx] },
      { id: 'ativos', rotulo: 'Meus ativos', nodes: [cAtivos] }
    ]
  });
  INV.on('mudou', desenharPassos);
  desenharPassos();

  function cor(i) { return (window.dash && window.dash.colors && window.dash.colors[i]) || ('var(--c' + i + ')'); }

  /* ---------- aviso de armazenamento (modo privado / só em memória / dados corrompidos): o mesmo de Configurações ---------- */
  function renderArmazenamento() {
    let nos = [];
    if (INV.ui && typeof INV.ui.avisosArmazenamento === 'function') nos = INV.ui.avisosArmazenamento();
    else {
      const arm = lerInv(() => INV.armazenamento(), null);
      if (arm && arm.persistente === false) nos.push(avisoEl('Este navegador não permite gravar dados locais (modo privado ou bloqueio). O app funciona só na memória e tudo se perde ao fechar a página. Em Configurações, use "Exportar backup" para guardar.', 'warn'));
      if (arm && (arm.corrompido || arm.copiaCorrompida)) nos.push(avisoEl('Havia dados ilegíveis no armazenamento local e o app começou vazio. Veja Ajustes › Backup para baixar a cópia ou importar um backup.', 'warn'));
    }
    R.avisosArm.replaceChildren(...nos);
  }

  /* ---------- renderização: resumo ---------- */
  function renderResumo(d) {
    let mercado = d.aloc.totalCent || 0, custoTot = 0, custoPrec = 0;
    const datas = [];
    Object.keys(d.pos).forEach((t) => {
      custoTot += d.pos[t].custoCent;
      if (d.precos[t] !== null) custoPrec += d.pos[t].custoCent;
      const r = d.refs[t];
      if (r && r.em && d.precos[t] !== null) datas.push(String(r.em).slice(0, 10));
    });
    datas.sort();
    const temPos = Object.keys(d.pos).length > 0;
    const res = temPos ? mercado - custoPrec : null;
    const resPct = (temPos && custoPrec > 0) ? res / custoPrec * 100 : null;
    const nota = !datas.length ? (temPos ? 'sem preços' : 'sem posições')
      : (datas[0] === datas[datas.length - 1] ? 'preços de ' + fmtData(datas[0]) : 'preços de ' + fmtData(datas[0]) + ' a ' + fmtData(datas[datas.length - 1]));
    // Fácil sem caixa registrado: o caixa ficaria negativo só por causa das compras; mostra o que importa
    const semCaixa = modoFacil() && !d.ef.some((t) => t.tipo === 'deposito' || t.tipo === 'retirada');
    if (semCaixa) R.tiles.replaceChildren(
      tile('Total investido', brl(custoTot), 'o que você pagou, com taxas'),
      tile('Valor hoje', brl(mercado), nota),
      tile('Resultado', brlS(res), resPct === null ? 'sobre o que você pagou' : fmtS(resPct, 2) + '% sobre o que você pagou', cls(res)));
    else R.tiles.replaceChildren(
      tile('Caixa disponível', brl(d.caixa), 'depósitos − retiradas − compras + vendas', d.caixa < 0 ? 'neg' : ''),
      tile('Valor de mercado das posições', brl(mercado), nota),
      tile('Total (caixa + posições)', brl(d.caixa + mercado), 'valores registrados por você'),
      tile('Custo das posições', brl(custoTot), 'inclui taxas pagas'),
      tile('Resultado não realizado', brlS(res), resPct === null ? 'sobre o custo dos ativos com preço' : fmtS(resPct, 2) + '% sobre o custo', cls(res)));
    const av = [];
    if (d.aloc.semPreco && d.aloc.semPreco.length) av.push(avisoEl('Sem preço de referência para: ' + d.aloc.semPreco.join(', ') + '. Esses ativos não entram no valor de mercado nem no resultado. Informe um preço manual em "Meus ativos" (ativos próprios) ou aguarde a próxima atualização de dados.', 'warn'));
    if (d.caixa < 0 && !semCaixa) av.push(avisoEl('O caixa registrado está negativo. Confira se falta registrar um depósito.', 'warn'));
    R.avisosResumo.replaceChildren(...av);
    // concentração: mesmo cálculo do Resumo do modo Fácil (INVCalc.concentracao); o detalhe aparece só no Avançado
    const vals = d.aloc.linhas.filter((l) => l.valorCent > 0).map((l) => l.valorCent);
    const modo = window.INVModo;
    R.conc.replaceChildren(...(vals.length && modo ? [modo.cartaoConcentracao(C.concentracao(vals))] : []));
  }

  /* ---------- renderização: posições ---------- */
  function renderPosicoes(d) {
    if (emEdicao(R.tabPos)) { R.tabPos.dataset.sujo = '1'; return; }
    delete R.tabPos.dataset.sujo;
    const alvos = d.st.alvos || {};
    const tickers = Array.from(new Set(Object.keys(d.pos).concat(Object.keys(alvos))));
    const linhasAloc = {};
    d.aloc.linhas.forEach((l) => { linhasAloc[l.ticker] = l; });
    const rows = tickers.map((t) => {
      const a = INV.ativo(t), p = d.pos[t] || null, l = linhasAloc[t] || null;
      const valor = l ? l.valorCent : null;
      const res = (p && valor !== null) ? valor - p.custoCent : null;
      return { t, a, p, ref: d.refs[t] || null, valor, res, resPct: (res !== null && p.custoCent > 0) ? res / p.custoCent * 100 : null, pct: p ? (l ? l.pct : null) : 0, alvo: alvos[t] === undefined ? null : alvos[t] };
    }).sort((x, y) => (y.valor === null ? -1 : y.valor) - (x.valor === null ? -1 : x.valor) || (x.t < y.t ? -1 : 1));
    if (!rows.length) {
      R.tabPos.replaceChildren(h('p', { class: 'pb-note' }, 'Nenhuma posição registrada ainda. Registre o que você já tem na corretora, uma compra por ativo.'),
        h('div', { class: 'inv-actions' }, h('button', { type: 'button', class: 'pb-btn inv-pri', onclick: () => irRegistrar('', 'compra') }, 'Registrar uma compra'), h('button', { type: 'button', class: 'pb-btn', onclick: () => INV.ir(ID, 'caixa') }, 'Registrar depósito')));
      return;
    }
    const fac = modoFacil();
    const th = (t, c) => h('th', { scope: 'col', class: c || '' }, t);
    const thead = h('thead', null, h('tr', null,
      th('Ticker', 'l'), fac ? null : th('Classe', 'l pb-hide-sm'), th('Qtd'), th(fac ? 'Preço médio pago' : 'Preço médio', fac ? '' : 'pb-hide-sm'), fac ? null : th('Custo', 'pb-hide-sm'),
      th(fac ? 'Preço hoje' : 'Preço de referência'), th('Valor'), th('Resultado'), th('% atual'), th('Alvo %')));
    const tbody = h('tbody');
    rows.forEach((r) => {
      let inp;
      if (fac) inp = h('span', null, r.alvo === null ? '—' : fmtN(r.alvo, 1) + '%');
      else {
        inp = h('input', { class: 'pb-in inv-cor-narrow', type: 'text', inputmode: 'decimal', value: pctIn(r.alvo), placeholder: '—', 'aria-label': 'Alvo percentual de ' + r.t });
        inp.addEventListener('change', () => salvarAlvo(r.t, inp));
      }
      const refCell = r.p
        ? h('td', null, r.ref && r.ref.precoCent != null ? brl(r.ref.precoCent) + ' ' : '— ', fac ? null : chipEstado(r.ref))
        : h('td', null, '—');
      tbody.appendChild(h('tr', null,
        h('td', { class: 'l' }, h('b', null, r.t), r.p ? '' : ' (sem posição)'),
        fac ? null : h('td', { class: 'l pb-hide-sm' }, r.a ? r.a.classe : '—'),
        h('td', null, r.p ? fmtN(r.p.qtd, 0) : '0'),
        h('td', { class: fac ? '' : 'pb-hide-sm' }, r.p ? brl(r.p.precoMedioCent) : '—'),
        fac ? null : h('td', { class: 'pb-hide-sm' }, r.p ? brl(r.p.custoCent) : '—'),
        refCell,
        h('td', null, r.valor === null ? '—' : brl(r.valor)),
        h('td', { class: cls(r.res) }, r.res === null ? '—' : brlS(r.res) + (r.resPct === null ? '' : ' (' + fmtS(r.resPct, 1) + '%)')),
        h('td', null, r.pct === null || r.pct === undefined ? '—' : fmtN(r.pct, 1) + '%'),
        h('td', null, inp)));
    });
    const soma = Object.keys(alvos).reduce((s, k) => s + (Number(alvos[k]) || 0), 0);
    R.tabPos.replaceChildren(h('table', { class: 'pb-table', 'aria-label': 'Posições reais' }, thead, tbody),
      fac && !Object.keys(alvos).length ? h('span') : h('p', { class: 'pb-note' + (soma > 100.0001 ? ' warn' : '') }, 'Soma dos alvos: ' + fmtN(soma, 1) + '%' + (soma > 100.0001 ? ' — acima de 100%.' : '.')));
  }
  function salvarAlvo(t, inp) {
    const txt = inp.value.trim();
    try {
      if (txt === '') { INV.definirAlvo(t, null); R.msgAlvo.className = 'pb-note'; R.msgAlvo.textContent = 'Alvo de ' + t + ' removido.'; return; }
      const v = parseNum(txt);
      if (v === null || v < 0 || v > 100) {
        R.msgAlvo.className = 'pb-note neg'; R.msgAlvo.textContent = 'Alvo de ' + t + ' inválido: informe um número entre 0 e 100.';
        inp.setAttribute('aria-invalid', 'true'); return;
      }
      inp.setAttribute('aria-invalid', 'false');
      INV.definirAlvo(t, v);
      R.msgAlvo.className = 'pb-note'; R.msgAlvo.textContent = 'Alvo de ' + t + ' salvo: ' + fmtN(v, 1) + '%.';
    } catch (e) { R.msgAlvo.className = 'pb-note neg'; R.msgAlvo.textContent = msgErro(e); }
  }

  /* gráfico atual × alvo */
  function renderGrafico(d) {
    const box = R.chart;
    const alvos = d.st.alvos || {};
    const linhasAloc = {};
    d.aloc.linhas.forEach((l) => { linhasAloc[l.ticker] = l; });
    const tickers = Array.from(new Set(Object.keys(d.pos).concat(Object.keys(alvos))));
    const rows = tickers.map((t) => ({ t, atual: d.pos[t] ? (linhasAloc[t] ? linhasAloc[t].pct : null) : 0, alvo: alvos[t] === undefined ? null : Number(alvos[t]) }))
      .sort((a, b) => ((b.atual === null ? -1 : b.atual) - (a.atual === null ? -1 : a.atual)) || (a.t < b.t ? -1 : 1));
    box.replaceChildren();
    R.legend.hidden = !rows.length;
    if (!rows.length) { box.appendChild(h('p', { class: 'pb-note' }, 'O gráfico aparece quando houver posições ou alvos definidos.')); return; }
    if (typeof d3 === 'undefined') { box.appendChild(h('p', { class: 'pb-note' }, 'Gráfico indisponível (biblioteca d3 não carregada). Os valores estão na tabela acima.')); return; }
    const W = box.clientWidth;
    if (!W) return;
    const rowH = 40, longest = rows.reduce((m, r) => Math.max(m, r.t.length), 0);
    const m = { l: longest * 8 + 14, r: 52, t: 6, b: 26 }, H = rows.length * rowH + m.t + m.b;
    const xmax = Math.max(10, ...rows.map((r) => Math.max(r.atual || 0, r.alvo || 0))) * 1.08;
    const x = d3.scaleLinear([0, xmax], [m.l, Math.max(m.l + 40, W - m.r)]);
    const y = d3.scaleBand(rows.map((r) => r.t), [m.t, H - m.b]).padding(0.2);
    const sub = d3.scaleBand(['atual', 'alvo'], [0, y.bandwidth()]).padding(0.12);
    const svg = d3.create('svg').attr('width', '100%').attr('viewBox', `0 0 ${W} ${H}`).attr('height', H).attr('role', 'img')
      .attr('aria-label', 'Barras horizontais com a participação atual e o alvo de cada ativo; os valores também estão na tabela de posições.');
    svg.append('g').selectAll('line').data(x.ticks(5)).join('line')
      .attr('x1', (v) => x(v)).attr('x2', (v) => x(v)).attr('y1', m.t).attr('y2', H - m.b).attr('stroke', 'var(--cds-chart-grid)');
    svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(d3.axisBottom(x).ticks(5).tickFormat((v) => v + '%')).call(PB.cleanAxis).call((g) => g.select('.domain').remove());
    box.appendChild(svg.node());
    const tip = PB.tipFor(box);
    rows.forEach((r) => {
      svg.append('text').attr('x', m.l - 8).attr('y', y(r.t) + y.bandwidth() / 2).attr('dy', '0.35em').attr('text-anchor', 'end')
        .attr('fill', 'var(--color-fg)').style('font-size', 'var(--cds-font-size-caption)').text(r.t);
      [['atual', r.atual, 0, 'Atual'], ['alvo', r.alvo, 1, 'Alvo']].forEach(([k, v, ci, nome]) => {
        const yy = y(r.t) + sub(k), hh = sub.bandwidth();
        if (v === null || v === undefined) {
          svg.append('text').attr('x', x(0) + 4).attr('y', yy + hh / 2).attr('dy', '0.35em').attr('fill', 'var(--color-fg-muted)')
            .style('font-size', 'var(--cds-font-size-caption)').text(k === 'atual' ? 'sem preço' : 'sem alvo');
          return;
        }
        svg.append('rect').attr('x', x(0)).attr('y', yy).attr('width', Math.max(1, x(v) - x(0))).attr('height', hh).attr('fill', cor(ci))
          .on('mousemove', (ev) => tip.show(ev, [[r.t], [nome, fmtN(v, 1) + '%'], ['Atual', r.atual === null ? 'sem preço' : fmtN(r.atual, 1) + '%'], ['Alvo', r.alvo === null ? 'sem alvo' : fmtN(r.alvo, 1) + '%']]))
          .on('mouseleave', tip.hide);
        svg.append('text').attr('x', x(v) + 5).attr('y', yy + hh / 2).attr('dy', '0.35em').attr('fill', 'var(--color-fg)')
          .style('font-size', 'var(--cds-font-size-caption)').text(fmtN(v, 1) + '%');
      });
    });
  }

  /* ---------- formulário de compra/venda ---------- */
  function marcarTipo() {
    Object.keys(R.tipoBtns).forEach((t) => R.tipoBtns[t].setAttribute('aria-pressed', String(t === S.tipo)));
    F.valor.wrap.querySelector('label').textContent = S.tipo === 'compra' ? 'Valor a investir (R$)' : 'Valor a vender (R$)';
    R.btnReg.textContent = S.editandoId ? 'Salvar correção' : (S.tipo === 'venda' ? 'Registrar venda' : 'Registrar compra');
  }
  function resolverTicker(txt) {
    const t = String(txt || '').trim().toUpperCase().split(/[\s—–-]+/)[0];
    return (t && INV.ativo(t)) ? t : null;
  }
  function atualizarLista() {
    const u = lerInv(() => INV.universo(), []) || [];
    const sig = u.map((a) => a.ticker + a.nome).join('|');
    if (sig === S.listaSig) return;
    S.listaSig = sig;
    R.datalist.replaceChildren(...u.map((a) => h('option', { value: a.ticker + ' — ' + a.nome })));
  }
  function renderInfo() {
    R.info.replaceChildren();
    const a = S.ticker ? INV.ativo(S.ticker) : null;
    if (!a) { R.posHint.textContent = ''; return; }
    R.info.append(kv('Ticker', a.ticker), kv('Nome', a.nome), kv('Classe', a.classe), kv('Mercado', 'B3'), kv('Moeda', 'BRL'), kv('Lote', String(loteAtual())));
  }
  function renderCot() {
    R.cotBox.replaceChildren();
    R.btnCot.disabled = !S.ticker || S.cotCarregando;
    R.btnUsarCot.hidden = !(S.ticker && S.precoManual);
    if (!S.ticker) { R.cotBox.appendChild(h('span', { class: 'pb-note' }, 'Escolha um ativo para ver a cotação.')); return; }
    if (S.cotCarregando) { R.cotBox.appendChild(h('span', { class: 'pb-note' }, 'Buscando cotação…')); return; }
    if (S.precoManual) R.cotBox.appendChild(h('span', { class: 'pb-chip inv-chip inv-chip-manual' }, 'preço manual (digitado por você)'));
    if (S.cot) {
      const c = S.cot;
      if (!S.precoManual) R.cotBox.appendChild(chipEstado(c));
      if (c.precoCent != null) {
        const q = S.precoManual ? 'Cotação disponível: ' : 'Cotação: ';
        R.cotBox.appendChild(h('span', { class: 'pb-note' }, q + brl(c.precoCent) + (c.em ? ' em ' + fmtDH(c.em) : '') + (c.fonte ? ' (' + (FONTES[c.fonte] || c.fonte) + ')' : '') + '.'));
      }
      if (c.mensagem) R.cotBox.appendChild(h('span', { class: 'pb-note' + (c.estado === 'indisponivel' ? ' neg' : '') }, c.mensagem));
    } else if (S.cotErro) {
      R.cotBox.appendChild(h('span', { class: 'pb-note neg' }, 'Não foi possível obter a cotação: ' + S.cotErro + ' Digite o preço manualmente.'));
    }
  }
  function buscarCot(forcar) {
    const tk = S.ticker;
    if (!tk) return;
    const seq = ++S.seq;
    S.cotCarregando = true; S.cotErro = ''; renderCot();
    const fim = (fn) => { if (seq !== S.seq || tk !== S.ticker) return; S.cotCarregando = false; fn(); renderCot(); };
    let p;
    try { p = Promise.resolve(INV.cotacao(tk, { forcar: !!forcar })); } catch (e) { p = Promise.reject(e); }
    p.then((c) => fim(() => {
      S.cot = c || null;
      if (c && c.precoCent != null && !S.precoManual) { F.preco.input.value = inCents(c.precoCent); F.preco.setErro(''); }
      sincronizar();
    }), (e) => fim(() => { S.cot = null; S.cotErro = msgErro(e); }));
  }
  function selecionar(t) {
    if (t === S.ticker) return;
    S.ticker = t; S.cot = null; S.cotErro = ''; S.seq++; S.cotCarregando = false;
    S.precoManual = false; S.precoEditado = false; S.execPrecoTocado = false; S.qtdTocada = false; S.taxasTocadas = false;
    F.preco.input.value = ''; F.preco.setErro('');
    F.precoExec.input.value = ''; F.qtdExec.input.value = ''; F.taxasExec.input.value = '';
    renovarData();
    renderInfo(); renderCot(); sincronizar();
    if (t) buscarCot(false);
  }
  function posQtd(d) {
    const p = d ? C.posicoes(efSem(d, S.editandoId))[S.ticker] : null;
    return p ? p.qtd : 0;
  }
  function sincronizar() {
    const d = D;
    const pc = money(F.preco.input.value), vc = money(F.valor.input.value), tx = cfg(), lote = loteAtual();
    let est = { qtd: 0, brutoCent: 0, taxasCent: 0, totalCent: 0, sobraCent: 0, aviso: null }, aviso = null;
    if (!S.ticker) aviso = 'Escolha um ativo.';
    else if (pc === null || pc <= 0) aviso = 'Informe um preço válido para estimar.';
    else if (vc === null || vc <= 0) aviso = 'Informe o valor para estimar a quantidade.';
    else if (S.tipo === 'compra') {
      const r = C.estimarQuantidade({ valorCent: vc, precoCent: pc, lote, taxaFixaCent: tx.taxaFixaCent, taxaPct: tx.taxaPct });
      est = Object.assign(est, r); aviso = r.aviso || null;
    } else {
      const disp = d ? posQtd(d) : 0;
      let q = Math.floor(vc / pc / lote) * lote;
      if (q > disp) q = disp;
      const bruto = q * pc, tc = C.taxas({ brutoCent: bruto, qtd: q, taxaFixaCent: tx.taxaFixaCent, taxaPct: tx.taxaPct });
      est = { qtd: q, brutoCent: bruto, taxasCent: tc, totalCent: bruto - tc, sobraCent: Math.max(0, vc - bruto), aviso: null };
      if (q <= 0) aviso = disp <= 0 ? 'Você não tem posição registrada neste ativo.' : 'O valor é menor que um lote.';
    }
    const ok = !aviso || est.qtd > 0;
    R.estimativa.replaceChildren(
      kv('Quantidade estimada', ok ? fmtN(est.qtd, 0) : '—'), kv('Valor bruto', ok ? brl(est.brutoCent) : '—'),
      kv('Taxas estimadas', ok ? brl(est.taxasCent) : '—'),
      kv(S.tipo === 'compra' ? 'Total estimado' : 'Total a receber (estim.)', ok ? brl(est.totalCent) : '—'),
      kv('Sobra do valor', ok ? brl(est.sobraCent) : '—'));
    R.estAviso.textContent = aviso || '';
    if (S.ticker && S.tipo === 'venda' && d) R.posHint.textContent = 'Posição registrada: ' + fmtN(posQtd(d), 0) + ' unidades.';
    else R.posHint.textContent = '';
    if (!S.execPrecoTocado) F.precoExec.input.value = F.preco.input.value;
    if (!S.qtdTocada) F.qtdExec.input.value = est.qtd > 0 ? String(est.qtd) : '';
    recalcExec();
  }
  function recalcExec() {
    const tx = cfg();
    const pe = money(F.precoExec.input.value), q = inteiro(F.qtdExec.input.value);
    if (!S.taxasTocadas) F.taxasExec.input.value = (pe > 0 && q > 0) ? inCents(C.taxas({ brutoCent: pe * q, qtd: q, taxaFixaCent: tx.taxaFixaCent, taxaPct: tx.taxaPct })) : '';
    const tTxt = F.taxasExec.input.value.trim();
    const taxas = tTxt === '' ? 0 : money(tTxt);
    R.caixaAviso.textContent = '';
    if (pe > 0 && q > 0 && taxas !== null && taxas >= 0) {
      const bruto = pe * q, total = S.tipo === 'compra' ? bruto + taxas : bruto - taxas;
      R.totalExec.textContent = (S.tipo === 'compra' ? 'Total a pagar (recalculado): ' : 'Total a receber (recalculado): ') + brl(total) + ' = ' + fmtN(q, 0) + ' × ' + brl(pe) + (S.tipo === 'compra' ? ' + ' : ' − ') + brl(taxas) + ' de taxas.';
      if (D) {
        const cx = C.caixa(efSem(D, S.editandoId));
        const depois = S.tipo === 'compra' ? cx - total : cx + total;
        if (depois < 0) R.caixaAviso.textContent = 'Atenção: o caixa registrado ficaria em ' + brl(depois) + '. Isso não bloqueia o registro, mas confira se falta registrar um depósito.';
        const l = loteAtual();
        if (l > 1 && q % l !== 0) R.caixaAviso.textContent += (R.caixaAviso.textContent ? ' ' : '') + 'A quantidade não é múltipla do lote (' + l + ').';
      }
    } else R.totalExec.textContent = 'Informe preço e quantidade executados para ver o total.';
  }
  function limparTrade(msg) {
    S.editandoId = null; S.fonteBase = null; S.ticker = null; S.cot = null; S.cotErro = ''; S.seq++; S.cotCarregando = false;
    S.precoManual = S.precoEditado = S.execPrecoTocado = S.qtdTocada = S.taxasTocadas = false;
    [F.ativo, F.preco, F.valor, F.precoExec, F.qtdExec, F.taxasExec, F.obs].forEach((f) => { f.input.value = ''; f.setErro(''); });
    S.dataTocada = false; F.data.input.value = agoraLocal(); R.confirma.checked = false;
    R.erros.hidden = true; R.erros.textContent = ''; R.banner.hidden = true;
    R.ok.textContent = msg || '';
    marcarTipo(); renderInfo(); renderCot(); sincronizar();
  }
  function fonteAtual() {
    if (S.precoEditado || S.execPrecoTocado) return 'manual';
    if (S.editandoId) return S.fonteBase || null;
    return (S.cot && S.cot.fonte) ? S.cot.fonte : null;
  }
  function registrar() {
    const erros = [];
    R.ok.textContent = '';
    if (!S.ticker) erros.push('Escolha um ativo da lista.');
    const pe = money(F.precoExec.input.value), q = inteiro(F.qtdExec.input.value);
    const tTxt = F.taxasExec.input.value.trim(), taxas = tTxt === '' ? 0 : money(tTxt);
    const data = F.data.input.value;
    if (pe === null || pe <= 0) erros.push('Informe o preço executado (maior que zero).');
    if (q === null || q <= 0) erros.push('Informe a quantidade executada (número inteiro maior que zero).');
    if (taxas === null || taxas < 0) erros.push('Taxas inválidas: informe um valor em reais (pode ser 0).');
    if (!dtValida(data)) erros.push('Informe uma data e hora válidas.');
    if (!R.confirma.checked) erros.push('Marque a confirmação de que a ordem foi executada na corretora.');
    if (!erros.length) {
      const bruto = pe * q;
      const tx = { tipo: S.tipo, ticker: S.ticker, data: String(data).slice(0, 16), qtd: q, precoCent: pe, taxasCent: taxas,
        valorCent: S.tipo === 'compra' ? bruto + taxas : bruto - taxas, moeda: 'BRL', status: 'executada',
        fontePreco: fonteAtual(), obs: F.obs.input.value.trim(), substitui: null };
      try {
        const corrigindo = !!S.editandoId;
        if (corrigindo) INV.corrigirTx(S.editandoId, tx); else INV.adicionarTx(tx);
        limparTrade((corrigindo ? 'Correção salva: ' : 'Registrado: ') + (tx.tipo === 'compra' ? 'compra' : 'venda') + ' de ' + fmtN(q, 0) + ' ' + tx.ticker + ' a ' + brl(pe) + '.');
        return;
      } catch (e) { erros.push(msgErro(e)); }
    }
    R.erros.replaceChildren(...erros.map((m) => h('div', null, m)));
    R.erros.hidden = false;
  }

  // A data/hora padrão acompanha o relógio: é renovada ao escolher o ativo e ao focar o formulário, a menos que o usuário a tenha editado.
  function renovarData() {
    if (!S.dataTocada && !S.editandoId) F.data.input.value = agoraLocal();
  }
  function renovarDataCaixa() {
    if (!S.cxDataTocada && !S.editandoCaixa) FC.data.input.value = agoraLocal();
  }
  F.data.input.addEventListener('input', () => { S.dataTocada = true; });
  FC.data.input.addEventListener('input', () => { S.cxDataTocada = true; });
  R.formReg.addEventListener('focusin', renovarData);
  R.cxForm.addEventListener('focusin', renovarDataCaixa);
  F.ativo.input.addEventListener('input', () => { selecionar(resolverTicker(F.ativo.input.value)); });
  F.ativo.input.addEventListener('change', () => {
    const t = resolverTicker(F.ativo.input.value);
    F.ativo.setErro(F.ativo.input.value.trim() && !t ? 'Ativo não encontrado. Escolha um da lista ou cadastre em "Meus ativos".' : '');
    selecionar(t);
  });
  F.preco.input.addEventListener('input', () => {
    const tem = F.preco.input.value.trim() !== '';
    S.precoManual = tem; S.precoEditado = tem;
    renderCot(); sincronizar();
  });
  F.valor.input.addEventListener('input', sincronizar);
  F.precoExec.input.addEventListener('input', () => { S.execPrecoTocado = F.precoExec.input.value.trim() !== ''; recalcExec(); });
  F.qtdExec.input.addEventListener('input', () => { S.qtdTocada = F.qtdExec.input.value.trim() !== ''; recalcExec(); });
  F.taxasExec.input.addEventListener('input', () => { S.taxasTocadas = F.taxasExec.input.value.trim() !== ''; recalcExec(); });
  R.btnCot.addEventListener('click', () => buscarCot(true));
  R.btnUsarCot.addEventListener('click', () => {
    S.precoManual = false; S.precoEditado = false; S.execPrecoTocado = false;
    if (S.cot && S.cot.precoCent != null) { F.preco.input.value = inCents(S.cot.precoCent); sincronizar(); renderCot(); }
    else { F.preco.input.value = ''; sincronizar(); buscarCot(true); }
  });
  R.btnRecalc.addEventListener('click', () => { S.execPrecoTocado = false; S.qtdTocada = false; S.taxasTocadas = false; sincronizar(); });
  R.btnLimpar.addEventListener('click', () => limparTrade(''));
  R.formReg.addEventListener('submit', (ev) => { ev.preventDefault(); registrar(); });

  function carregarCorrecao(tx) {
    limparTrade('');
    S.editandoId = tx.id; S.fonteBase = tx.fontePreco || null; S.tipo = tx.tipo;
    S.ticker = tx.ticker;
    const a = INV.ativo(tx.ticker);
    F.ativo.input.value = tx.ticker + (a ? ' — ' + a.nome : '');
    F.preco.input.value = inCents(tx.precoCent); F.precoExec.input.value = inCents(tx.precoCent);
    F.valor.input.value = inCents(tx.qtd * tx.precoCent);
    F.qtdExec.input.value = String(tx.qtd); F.taxasExec.input.value = inCents(tx.taxasCent);
    F.data.input.value = String(tx.data || '').slice(0, 16); F.obs.input.value = tx.obs || ''; S.dataTocada = true;
    S.precoManual = true; S.qtdTocada = true; S.taxasTocadas = true;
    R.banner.hidden = false;
    R.banner.textContent = 'Corrigindo a transação de ' + fmtDH(tx.data) + ' (' + (TIPOS[tx.tipo] || tx.tipo) + ' ' + tx.ticker + '). Ao salvar, ela é substituída por uma nova; o original fica no histórico.';
    marcarTipo(); renderInfo(); renderCot(); sincronizar(); buscarCot(false);
    F.precoExec.input.scrollIntoView({ block: 'center', behavior: 'smooth' });
    F.precoExec.input.focus();
  }

  /* ---------- caixa ---------- */
  function limparCaixa(msg) {
    S.editandoCaixa = null; S.cxDataTocada = false; FC.valor.input.value = ''; FC.obs.input.value = ''; FC.data.input.value = agoraLocal();
    FC.tipo.input.value = 'deposito'; FC.valor.setErro(''); FC.data.setErro('');
    R.cxBanner.hidden = true; R.cxCancel.hidden = true; R.cxBtn.textContent = 'Registrar'; R.cxErro.hidden = true;
    R.cxMsg.className = 'pb-note pos'; R.cxMsg.textContent = msg || ''; R.cxAviso.textContent = '';
  }
  function avisoCaixa() {
    R.cxAviso.textContent = '';
    const v = money(FC.valor.input.value);
    if (D && v > 0 && FC.tipo.input.value === 'retirada') {
      const cx = C.caixa(efSem(D, S.editandoCaixa));
      if (v > cx) R.cxAviso.textContent = 'Atenção: a retirada é maior que o caixa registrado (' + brl(cx) + '). Isso não bloqueia o registro.';
    }
  }
  FC.valor.input.addEventListener('input', avisoCaixa);
  FC.tipo.input.addEventListener('change', avisoCaixa);
  R.cxCancel.addEventListener('click', () => limparCaixa(''));
  R.cxForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const v = money(FC.valor.input.value), data = FC.data.input.value, erros = [];
    FC.valor.setErro(v === null || v <= 0 ? 'Informe um valor maior que zero.' : '');
    FC.data.setErro(dtValida(data) ? '' : 'Informe uma data e hora válidas.');
    if (v === null || v <= 0 || !dtValida(data)) return;
    const tx = { tipo: FC.tipo.input.value, ticker: null, data: String(data).slice(0, 16), qtd: 0, precoCent: 0, taxasCent: 0, valorCent: v,
      moeda: 'BRL', status: 'executada', fontePreco: null, obs: FC.obs.input.value.trim(), substitui: null };
    try {
      const corrigindo = !!S.editandoCaixa;
      if (corrigindo) INV.corrigirTx(S.editandoCaixa, tx); else INV.adicionarTx(tx);
      limparCaixa((corrigindo ? 'Correção salva: ' : 'Registrado: ') + (tx.tipo === 'deposito' ? 'depósito' : 'retirada') + ' de ' + brl(v) + '.');
    } catch (e) { erros.push(msgErro(e)); R.cxErro.replaceChildren(...erros.map((m) => h('div', null, m))); R.cxErro.hidden = false; }
  });
  function carregarCorrecaoCaixa(tx) {
    limparCaixa('');
    S.editandoCaixa = tx.id;
    FC.tipo.input.value = tx.tipo; FC.valor.input.value = inCents(tx.valorCent); FC.data.input.value = String(tx.data || '').slice(0, 16); FC.obs.input.value = tx.obs || ''; S.cxDataTocada = true;
    R.cxBanner.hidden = false; R.cxBanner.textContent = 'Corrigindo ' + (TIPOS[tx.tipo] || tx.tipo).toLowerCase() + ' de ' + fmtDH(tx.data) + '. Ao salvar, ela é substituída por uma nova.';
    R.cxCancel.hidden = false; R.cxBtn.textContent = 'Salvar correção';
    FC.valor.input.scrollIntoView({ block: 'center', behavior: 'smooth' }); FC.valor.input.focus();
  }
  function renderCaixa(d) {
    R.cxSaldo.textContent = 'Caixa disponível registrado: ' + brl(d.caixa) + '.';
    avisoCaixa();
  }

  /* ---------- transações ---------- */
  function descTx(t) { return (TIPOS[t.tipo] || t.tipo) + (t.ticker ? ' ' + t.ticker : '') + ' de ' + fmtData(t.data); }
  function renderTxs(d) {
    if (emEdicao(R.tabTx)) { R.tabTx.dataset.sujo = '1'; return; }
    delete R.tabTx.dataset.sujo;
    const efIds = new Set(d.ef.map((t) => t.id));
    const porId = {}; d.txs.forEach((t) => { porId[t.id] = t; });
    const fac = modoFacil();
    let lista = S.todas && !fac ? d.txs.slice() : d.ef.slice();
    const total = lista.length;
    const q = fac ? '' : R.txBusca.value.trim().toUpperCase(), tp = fac ? '' : R.txTipo.value;
    if (q) lista = lista.filter((t) => ((t.ticker || '') + ' ' + (t.obs || '')).toUpperCase().includes(q));
    if (tp) lista = lista.filter((t) => t.tipo === tp);
    lista.sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : ((a.criadoEm || '') < (b.criadoEm || '') ? 1 : -1)));
    R.txConta.textContent = total ? (lista.length === total ? total + ' transação(ões)' : lista.length + ' de ' + total + ' transação(ões)') : '';
    if (!total) {
      R.tabTx.replaceChildren(h('p', { class: 'pb-note' }, 'Nenhuma transação registrada ainda.'),
        h('div', { class: 'inv-actions' }, h('button', { type: 'button', class: 'pb-btn inv-pri', onclick: () => irRegistrar('', 'compra') }, 'Registrar uma compra'), h('button', { type: 'button', class: 'pb-btn', onclick: () => INV.ir(ID, 'caixa') }, 'Registrar depósito')));
      return;
    }
    if (!lista.length) {
      R.tabTx.replaceChildren(h('p', { class: 'pb-note' }, 'Nenhuma transação com esses filtros.'),
        h('div', { class: 'inv-actions' }, h('button', { type: 'button', class: 'pb-btn', onclick: () => { R.txBusca.value = ''; R.txTipo.value = ''; renderTxs(D || dados()); R.txBusca.focus(); } }, 'Limpar filtros')));
      return;
    }
    const th = (t, c) => h('th', { scope: 'col', class: c || '' }, t);
    const thead = h('thead', null, h('tr', null, th('Data', 'l'), th('Tipo', 'l'), th('Ticker', 'l'), th('Qtd'), th('Preço', fac ? '' : 'pb-hide-sm'), fac ? null : th('Taxas', 'pb-hide-sm'), th('Total'),
      fac ? null : th('Fonte', 'l pb-hide-sm'), fac ? null : th('Obs.', 'l pb-hide-sm'), th('Ações', 'l')));
    const tbody = h('tbody');
    lista.forEach((t) => {
      const efetiva = efIds.has(t.id), subst = !efetiva && t.tipo !== 'cancelamento';
      const orig = t.substitui ? porId[t.substitui] : null;
      let obs = t.obs || '';
      if (orig) obs = (obs ? obs + ' · ' : '') + 'substitui ' + descTx(orig);
      if (subst) obs = (obs ? obs + ' · ' : '') + '(substituída)';
      const acoes = h('td', { class: 'l' });
      if (efetiva && t.tipo !== 'cancelamento') {
        acoes.append(
          h('button', { type: 'button', class: 'pb-btn', 'aria-label': 'Corrigir ' + descTx(t), onclick: () => (t.tipo === 'compra' || t.tipo === 'venda') ? (modoFacil() ? carregarQ(t) : carregarCorrecao(t)) : carregarCorrecaoCaixa(t) }, 'Corrigir'), ' ',
          h('button', { type: 'button', class: 'pb-btn', 'data-cancelar': t.id, 'aria-label': (fac ? 'Excluir ' : 'Anular ') + descTx(t), title: 'Tira a transação das contas (o registro original é mantido)', onclick: () => { S.cancelandoId = t.id; S.motivo = ''; renderTxs(dados()); const i = document.getElementById('cor-motivo') || R.tabTx.querySelector('[data-confirmar]'); if (i) i.focus(); } }, fac ? 'Excluir' : 'Anular'));
      }
      tbody.appendChild(h('tr', { class: subst ? 'inv-cor-riscada' : '' },
        h('td', { class: 'l' }, fac ? fmtData(t.data) : fmtDH(t.data)), h('td', { class: 'l' }, TIPOS[t.tipo] || t.tipo), h('td', { class: 'l' }, t.ticker || '—'),
        h('td', null, t.qtd ? fmtN(t.qtd, 0) : '—'), h('td', { class: fac ? '' : 'pb-hide-sm' }, t.precoCent ? brl(t.precoCent) : '—'),
        fac ? null : h('td', { class: 'pb-hide-sm' }, t.tipo === 'compra' || t.tipo === 'venda' ? brl(t.taxasCent) : '—'),
        h('td', null, t.tipo === 'cancelamento' ? '—' : brl(t.valorCent)),
        fac ? null : h('td', { class: 'l pb-hide-sm' }, FONTES[t.fontePreco] || '—'), fac ? null : h('td', { class: 'l pb-hide-sm' }, obs), acoes));
      if (S.cancelandoId === t.id && efetiva) {
        const mot = h('input', { class: 'pb-in', id: 'cor-motivo', type: 'text', value: S.motivo, maxlength: 200 });
        mot.addEventListener('input', () => { S.motivo = mot.value; });
        const err = h('small', { class: 'inv-err', id: 'cor-motivo-er', hidden: true });
        // Fecha a linha de cancelamento: tira o foco do campo ANTES de redesenhar (renderTxs não redesenha enquanto há foco num campo)
        // e devolve o foco a um lugar previsível.
        const fechar = (msgOk) => {
          S.cancelandoId = null; S.motivo = '';
          if (document.activeElement && document.activeElement.blur && R.tabTx.contains(document.activeElement)) document.activeElement.blur();
          if (msgOk) { R.txMsg.className = 'pb-note pos'; R.txMsg.textContent = msgOk; }
          renderTxs(dados());
          if (msgOk) { R.txMsg.setAttribute('tabindex', '-1'); R.txMsg.focus(); }
          else { const b = R.tabTx.querySelector('button[data-cancelar="' + t.id + '"]'); if (b) b.focus(); }
        };
        const conf = () => {
          if (S.cancelandoId !== t.id) return;   // linha já fechada (Esc, Voltar ou outro cancelamento)
          if (!fac && !S.motivo.trim()) { err.textContent = 'Informe o motivo da anulação.'; err.hidden = false; mot.setAttribute('aria-invalid', 'true'); mot.setAttribute('aria-describedby', err.id); mot.focus(); return; }
          try { INV.cancelarTx(t.id, S.motivo.trim() || 'Excluída pelo usuário'); }
          catch (e) { err.textContent = msgErro(e); err.hidden = false; mot.setAttribute('aria-invalid', 'true'); mot.setAttribute('aria-describedby', err.id); return; }
          fechar(fac ? 'Excluída: ' + descTx(t) + '.' : 'Anulada: ' + descTx(t) + '. Ela continua visível em "Mostrar também as versões corrigidas e as anulações".');
        };
        mot.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); conf(); }
          else if (ev.key === 'Escape') { ev.preventDefault(); fechar(''); }
        });
        tbody.appendChild(h('tr', null, h('td', { class: 'l', colspan: 10 },
          h('div', { class: 'inv-cor-row' }, fac ? h('span', null, 'Excluir ' + descTx(t) + '?') : [h('label', { for: 'cor-motivo' }, 'Por que anular ' + descTx(t) + '?'), mot],
            h('button', { type: 'button', class: 'pb-btn inv-perigo', 'data-confirmar': '1', onclick: conf }, fac ? 'Sim, excluir' : 'Confirmar anulação'),
            h('button', { type: 'button', class: 'pb-btn', onclick: () => fechar('') }, 'Voltar')), err)));
      }
    });
    R.tabTx.replaceChildren(h('table', { class: 'pb-table', 'aria-label': 'Transações' }, thead, tbody));
  }
  R.chkTodas.addEventListener('change', () => { S.todas = R.chkTodas.checked; renderTxs(D || dados()); });
  R.txBusca.addEventListener('input', () => renderTxs(D || dados()));
  R.txTipo.addEventListener('change', () => renderTxs(D || dados()));

  /* ---------- meus ativos ---------- */
  function renderAtivos(d) {
    if (emEdicao(R.atLista)) { R.atLista.dataset.sujo = '1'; return; }
    delete R.atLista.dataset.sujo;
    const custom = d.st.ativosCustom || [];
    if (!custom.length) { R.atLista.replaceChildren(h('p', { class: 'pb-note' }, 'Você ainda não cadastrou ativos próprios.')); return; }
    const ul = h('ul', { class: 'inv-cor-list' });
    custom.forEach((a) => {
      const u = INV.ativo(a.ticker);
      const li = h('li', { class: 'inv-cor-item' });
      const erro = S.errosAtivo[a.ticker];
      if (S.editandoAtivo === a.ticker) {
        const n = campo('cor-ed-nome', 'Nome de ' + a.ticker, { valor: a.nome, maxlength: 60 });
        const c = campo('cor-ed-classe', 'Classe', { select: CLASSES.map((x) => [x, x]) }); c.input.value = a.classe;
        const l = campo('cor-ed-lote', 'Lote', { inputmode: 'numeric', valor: String(a.lote || 1) });
        const p = campo('cor-ed-preco', 'Preço manual (R$, opcional)', { inputmode: 'decimal', valor: inCents(a.precoManualCent) });
        const msg = h('div', { class: 'inv-err', role: 'alert', hidden: true });
        const salvar = () => {
          const nome = n.input.value.trim(), lote = inteiro(l.input.value), pt = p.input.value.trim(), pc = pt === '' ? null : money(pt);
          n.setErro(nome ? '' : 'Informe o nome.'); l.setErro(lote && lote > 0 ? '' : 'Lote deve ser um inteiro maior que zero.');
          p.setErro(pt !== '' && (pc === null || pc <= 0) ? 'Preço inválido.' : '');
          if (!nome || !(lote > 0) || (pt !== '' && (pc === null || pc <= 0))) return;
          try { INV.ativoCustom.editar(a.ticker, { nome, classe: c.input.value, lote, precoManualCent: pc }); S.editandoAtivo = null; delete S.errosAtivo[a.ticker]; renderAtivos(dados()); }
          catch (e) { msg.textContent = msgErro(e); msg.hidden = false; }
        };
        li.append(h('div', { class: 'inv-cor-grid' }, n.wrap, c.wrap, l.wrap, p.wrap), msg,
          h('div', { class: 'inv-cor-row' }, h('button', { type: 'button', class: 'pb-btn', onclick: salvar }, 'Salvar'),
            h('button', { type: 'button', class: 'pb-btn', onclick: () => { S.editandoAtivo = null; renderAtivos(dados()); } }, 'Cancelar')));
      } else {
        const bRem = S.removendo === a.ticker;
        li.append(
          h('div', { class: 'inv-cor-row' }, h('b', null, a.ticker), h('span', null, a.nome), h('span', { class: 'pb-note' }, a.classe + (modoFacil() ? '' : ' · lote ' + (a.lote || 1)) + ' · ' + (a.precoManualCent != null ? 'preço manual ' + brl(a.precoManualCent) : 'sem preço manual') + (modoFacil() ? '' : ' · ' + (u && u.temSerie ? 'com histórico na Simulação' : 'sem histórico (adicione em "extras")')))),
          h('div', { class: 'inv-cor-row' },
            h('button', { type: 'button', class: 'pb-btn', 'aria-label': 'Editar ' + a.ticker, onclick: () => { S.editandoAtivo = a.ticker; S.removendo = null; renderAtivos(dados()); } }, 'Editar'),
            bRem ? [h('span', { class: 'pb-note' }, 'Remover ' + a.ticker + '?'),
              h('button', { type: 'button', class: 'pb-btn', onclick: () => {
                try { INV.ativoCustom.remover(a.ticker); delete S.errosAtivo[a.ticker]; S.removendo = null; }
                catch (e) { S.errosAtivo[a.ticker] = msgErro(e); S.removendo = null; renderAtivos(dados()); }
              } }, 'Confirmar remoção'),
              h('button', { type: 'button', class: 'pb-btn', onclick: () => { S.removendo = null; renderAtivos(dados()); } }, 'Voltar')]
              : h('button', { type: 'button', class: 'pb-btn', 'aria-label': 'Remover ' + a.ticker, onclick: () => { S.removendo = a.ticker; delete S.errosAtivo[a.ticker]; renderAtivos(dados()); } }, 'Remover')),
          erro ? h('div', { class: 'inv-err', role: 'alert' }, erro) : null);
      }
      ul.appendChild(li);
    });
    R.atLista.replaceChildren(ul);
  }
  R.atForm.addEventListener('submit', (ev) => {
    ev.preventDefault();
    R.atMsg.textContent = ''; R.atErro.hidden = true;
    const vt = C.validarTicker ? C.validarTicker(FA.ticker.input.value) : { ok: false, erro: 'Validação indisponível.' };
    const nome = FA.nome.input.value.trim(), lote = inteiro(FA.lote.input.value), pt = FA.preco.input.value.trim(), pc = pt === '' ? null : money(pt);
    FA.ticker.setErro(vt.ok ? '' : (vt.erro || 'Ticker inválido.'));
    FA.nome.setErro(nome ? '' : 'Informe o nome do ativo.');
    FA.lote.setErro(lote && lote > 0 ? '' : 'Lote deve ser um inteiro maior que zero.');
    FA.preco.setErro(pt !== '' && (pc === null || pc <= 0) ? 'Preço inválido: informe um valor maior que zero ou deixe vazio.' : '');
    if (!vt.ok || !nome || !(lote > 0) || (pt !== '' && (pc === null || pc <= 0))) return;
    try {
      INV.ativoCustom.adicionar({ ticker: vt.ticker, nome, classe: FA.classe.input.value, lote, precoManualCent: pc });
      FA.ticker.input.value = ''; FA.nome.input.value = ''; FA.preco.input.value = ''; FA.lote.input.value = '1';
      R.atMsg.className = 'pb-note pos'; R.atMsg.textContent = 'Ativo ' + vt.ticker + ' adicionado.' + (vt.aviso ? ' ' + vt.aviso : '');
    } catch (e) { R.atErro.textContent = msgErro(e); R.atErro.hidden = false; }
  });

  /* ---------- ciclo de atualização ---------- */
  function atualizar() {
    if (PB.current !== ID) return;
    let d;
    try { d = dados(); } catch (e) { R.tiles.replaceChildren(avisoEl('Não foi possível ler os dados da carteira: ' + msgErro(e), 'bad')); return; }
    D = d;
    const passos = [() => renderArmazenamento(), () => atualizarLista(), () => desenharPassos(), () => renderResumo(d), () => renderPosicoes(d), () => renderGrafico(d), () => renderInfo(), () => sincronizar(), () => renderCaixa(d), () => renderTxs(d), () => renderAtivos(d)];
    passos.forEach((fn) => { try { fn(); } catch (e) { if (window.console) console.error('[corretora]', e); } });
  }
  let agendado = false;
  function agendar() {
    if (agendado) return;
    agendado = true;
    Promise.resolve().then(() => { agendado = false; atualizar(); });
  }
  [R.tabPos, R.tabTx, R.atLista].forEach((el) => {
    el.addEventListener('focusout', () => setTimeout(() => { if (el.dataset.sujo && !emEdicao(el)) agendar(); }, 0));
  });
  if (typeof INV.aoMostrar === 'function') INV.aoMostrar(ID, agendar);
  if (typeof INV.on === 'function') INV.on('mudou', agendar);
  let rz = null;
  window.addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (PB.current === ID && D) { try { renderGrafico(D); } catch (e) { /* ignora */ } } }, 150); });
  marcarTipo();
  renderCot();
  agendar();
})();
