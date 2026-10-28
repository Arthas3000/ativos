/* Painel B3 — modo Fácil e modo Avançado (INVModo).
 * Os dois modos leem os MESMOS dados e os MESMOS cálculos (INVCalc, dash). O modo só muda a apresentação:
 *  - elementos com data-so-avancado somem no Fácil; elementos com data-so-facil somem no Avançado;
 *  - o Fácil troca as abas densas do Mercado por uma tela de Resumo e esconde seções administrativas;
 *  - avisos, riscos e limitações nunca recebem data-so-avancado.
 * O modo fica em INV.preferencias (só neste aparelho). Trocar de modo não recarrega a página nem apaga estado.
 * Material educacional; não é recomendação de investimento. */
(function () {
  'use strict';
  var W = window, PB = W.PB, INV = W.INV, C = W.INVCalc, NAV = W.INVNav;
  if (!PB || !INV || !NAV) return;
  var raiz = document.querySelector('div.pb'), nav = document.querySelector('nav.pb-tabs'), barra = document.querySelector('.app-bar');
  if (!raiz || !nav) return;

  var ROTULO = { facil: 'Fácil', avancado: 'Avançado' };
  var DICA = { facil: 'Fácil: o essencial, em 2 a 5 minutos', avancado: 'Avançado: análise detalhada, em 15 a 20 minutos' };
  // abas do Mercado que só existem no Avançado (o Fácil as resume na tela Resumo) e a aba que só existe no Fácil
  var TABS_AV = ['geral', 'ranking', 'valor', 'precos', 'catalogo', 'macro', 'historico', 'metodo'];
  var TABS_FACIL = ['resumo'];
  // seções escondidas no Fácil: nada some dos dados, só da navegação
  var SECOES_AV = { corretora: ['ativos'], config: ['custos', 'extras', 'fontes'] };

  function h(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v;
      else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (Array.isArray(c)) c.forEach(function (x) { if (x !== null && x !== undefined && x !== false) n.append(x); });
      else if (c !== null && c !== undefined && c !== false) n.append(c);
    }
    return n;
  }
  function lerPref() { try { return INV.preferencias.ler() || {}; } catch (e) { return {}; } }
  function gravarPref(fn) { try { INV.preferencias.gravar(fn); } catch (e) { /* sem armazenamento: vale só nesta sessão */ } }
  var num = function (x, d) { return x === null || x === undefined || !isFinite(x) ? '—' : PB.num(x, d === undefined ? 1 : d); };
  var dt = function (s) { return s ? PB.dataBR(s) : '—'; };

  /* ---------- estado do modo ---------- */
  var ouvintes = [];
  var modo = 'avancado';
  (function inicial() {
    var u = lerPref(), tem = false;
    try { tem = ((INV.estado().transacoes || []).length > 0); } catch (e) { /* ok */ }
    // quem já usa o app (com registros) continua vendo tudo; quem chega agora começa no Fácil
    modo = u.modo === 'facil' || u.modo === 'avancado' ? u.modo : (tem ? 'avancado' : 'facil');
  })();

  /* ---------- estilo ---------- */
  var css = [
    'html[data-modo="facil"] [data-so-avancado]{display:none!important}',
    'html[data-modo="avancado"] [data-so-facil]{display:none!important}',
    '.inv-modo{display:inline-flex;gap:.125rem;padding:.25rem;background:var(--soft);border:1px solid var(--color-border-line);border-radius:.75rem}',
    '.inv-modo button{font:inherit;font-size:.8125rem;font-weight:700;color:var(--color-fg-muted);background:none;border:0;border-radius:.5rem;padding:.375rem .875rem;min-height:2rem;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}',
    '.inv-modo button:hover{color:var(--color-fg)}',
    '.inv-modo button[aria-checked="true"]{background:var(--color-panel);color:var(--accent-ink);box-shadow:var(--shadow-sm)}',
    '.inv-modo button:focus-visible{outline:2px solid var(--accent-ink);outline-offset:2px}',
    '.inv-tema{padding:.5rem!important;border-radius:999px!important}',
    '.inv-tema svg{width:1.25rem;height:1.25rem}',
    '.inv-chip{display:inline-flex;align-items:center;gap:.35rem;border:1px solid currentColor;border-radius:999px;padding:.1rem .65rem;font-size:var(--cds-font-size-caption);font-weight:500;white-space:nowrap}',
    '.inv-chip.baixo,.inv-chip.baixa{color:var(--color-ok)}',
    '.inv-chip.moderado,.inv-chip.moderada{color:var(--color-warn)}',
    '.inv-chip.alto,.inv-chip.alta,.inv-chip.muito-alta{color:var(--color-bad)}',
    '.inv-chip.nd{color:var(--color-fg-muted)}',
    '.inv-risco{display:grid;gap:var(--cds-gap-sm)}',
    '.inv-risco-linha{display:flex;flex-wrap:wrap;gap:var(--cds-gap-sm);align-items:center}',
    '.inv-risco ul{margin:0;padding-left:1.1rem;color:var(--color-fg-muted);font-size:var(--cds-font-size-caption)}',
    '.inv-risco [data-so-avancado]{border-top:1px solid var(--color-border-line);padding-top:var(--cds-pad-sm)}',
    '.inv-risco h3{margin:0;font-size:var(--cds-font-size-body);font-weight:500}',
    '.inv-faixa{display:flex;flex-wrap:wrap;gap:.4rem 1.5rem}',
    '.inv-ez .m{color:var(--color-fg-muted);font-size:var(--cds-font-size-caption)}',
    '.inv-ez td{vertical-align:top}',
    '.inv-ind-sm{display:none}',
    '@media (max-width:640px){.inv-ind-sm{display:block;margin:.25rem 0}}',
    '.inv-ez td.l{white-space:normal;min-width:12rem}',
    '.inv-link{font:inherit;font-weight:600;background:none;border:0;padding:0;color:var(--color-fg);text-decoration:underline;cursor:pointer;min-height:1.75rem}',
    '.inv-link:focus-visible{outline:2px solid var(--color-fg);outline-offset:2px}',
    '.inv-resumo-lista{display:grid;gap:0;list-style:none;margin:0;padding:0}',
    '.inv-resumo-lista li{display:grid;gap:.15rem;padding:var(--cds-pad-sm) 0;border-top:1px solid var(--color-border-line)}',
    '.inv-resumo-lista li:first-child{border-top:0}',
    '.inv-resumo-lista .l{display:flex;flex-wrap:wrap;gap:.5rem;align-items:center}',
    '.inv-resumo-lista .m{color:var(--color-fg-muted);font-size:var(--cds-font-size-caption)}',
    '.inv-modo-aviso{margin:0;color:var(--color-fg-muted);font-size:var(--cds-font-size-caption)}',
    '@media (max-width:640px){.inv-modo button{padding:.375rem .75rem}.app-brand{flex:1 1 0;overflow:hidden}.app-brand small{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}}'
  ].join('\n');
  var st = document.createElement('style'); st.id = 'inv-modo-css'; st.textContent = css; document.head.appendChild(st);

  /* ---------- botão alternador (barra superior) ---------- */
  var btn = {};
  var grupo = h('div', { class: 'inv-modo', role: 'radiogroup', 'aria-label': 'Modo de uso do app' });
  ['facil', 'avancado'].forEach(function (m) {
    var b = h('button', { type: 'button', role: 'radio', 'aria-checked': 'false', 'data-modo': m, title: DICA[m], tabindex: '-1' }, ROTULO[m]);
    b.addEventListener('click', function () { definir(m, true); });
    btn[m] = b; grupo.appendChild(b);
  });
  grupo.addEventListener('keydown', function (ev) {
    var alvo = ev.key === 'ArrowRight' || ev.key === 'ArrowDown' ? (modo === 'facil' ? 'avancado' : 'facil')
      : ev.key === 'ArrowLeft' || ev.key === 'ArrowUp' ? (modo === 'avancado' ? 'facil' : 'avancado') : null;
    if (!alvo) return;
    ev.preventDefault(); definir(alvo, true); btn[alvo].focus();
  });
  var acoes = barra && barra.querySelector('.app-actions'), linha2 = barra && barra.querySelector('.app-row2');
  if (linha2) linha2.appendChild(grupo); else if (acoes) acoes.insertBefore(grupo, acoes.firstChild); else raiz.insertBefore(grupo, raiz.firstChild);
  /* ---------- tema claro / escuro (sem escolha, segue o sistema) ---------- */
  var mq = W.matchMedia ? W.matchMedia('(prefers-color-scheme: dark)') : null;
  var escuroAgora = function () {
    var t = document.documentElement.getAttribute('data-tema');
    return t === 'escuro' || (t !== 'claro' && !!(mq && mq.matches));
  };
  function icone(d) {
    var NS = 'http://www.w3.org/2000/svg', v = document.createElementNS(NS, 'svg'), t = document.createElementNS(NS, 'path');
    v.setAttribute('viewBox', '0 0 24 24'); v.setAttribute('aria-hidden', 'true'); v.setAttribute('focusable', 'false');
    t.setAttribute('d', d); t.setAttribute('fill', 'none'); t.setAttribute('stroke', 'currentColor'); t.setAttribute('stroke-width', '2');
    t.setAttribute('stroke-linecap', 'round'); t.setAttribute('stroke-linejoin', 'round'); v.appendChild(t); return v;
  }
  var btnTema = h('button', { type: 'button', class: 'app-btn inv-tema', 'aria-pressed': 'false' });
  function rotTema() {
    var e = escuroAgora();
    btnTema.setAttribute('aria-pressed', String(e));
    btnTema.replaceChildren(icone(e
      ? 'M12 3v2M12 19v2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M3 12h2M19 12h2M5.6 18.4 7 17M17 7l1.4-1.4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z'
      : 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'));
    btnTema.setAttribute('aria-label', e ? 'Tema escuro ativo. Mudar para o claro' : 'Tema claro ativo. Mudar para o escuro');
    btnTema.title = e ? 'Mudar para o tema claro' : 'Mudar para o tema escuro';
    var meta = document.querySelector('meta[name="theme-color"]'); if (meta) meta.setAttribute('content', e ? '#111614' : '#1f3a34');
  }
  btnTema.addEventListener('click', function () {
    var novo = escuroAgora() ? 'claro' : 'escuro';
    document.documentElement.setAttribute('data-tema', novo);
    gravarPref(function (u) { u.tema = novo; });
    rotTema();
    try { PB.redraw(); } catch (e) { /* ok */ }
  });
  if (mq && mq.addEventListener) mq.addEventListener('change', rotTema);
  if (acoes) acoes.insertBefore(btnTema, acoes.firstChild); else if (barra) barra.appendChild(btnTema);
  rotTema();
  var anuncio = h('div', { class: 'inv-sr', role: 'status', 'aria-live': 'polite' });
  document.body.appendChild(anuncio);

  /* ---------- navegação por modo ---------- */
  var grupoDe = function (tab) { for (var i = 0; i < NAV.grupos.length; i++) if (NAV.grupos[i].abas.indexOf(tab) >= 0) return NAV.grupos[i]; return NAV.grupos[0]; };
  var abaOculta = function (tab, m) { return m === 'facil' ? TABS_AV.indexOf(tab) >= 0 : TABS_FACIL.indexOf(tab) >= 0; };
  function secaoOculta(pg, sc, m) { return m === 'facil' && (SECOES_AV[pg] || []).indexOf(sc) >= 0; }
  function atualizarNavegacao() {
    [].forEach.call(nav.querySelectorAll('.pb-tab'), function (b) {
      var t = b.dataset.tab;
      b.hidden = grupoDe(t).id !== 'mercado' || abaOculta(t, modo);
    });
    Object.keys(SECOES_AV).forEach(function (pg) {
      SECOES_AV[pg].forEach(function (sc) {
        var b = document.getElementById('inv-sub-' + pg + '-' + sc);
        if (b) b.hidden = modo === 'facil';
      });
    });
  }
  // seção atual de uma página com seções (lida do botão marcado)
  function secaoAtual(pg) {
    var b = document.querySelector('#' + pg + ' .inv-sub-tab[aria-selected="true"], [data-page="' + pg + '"] .inv-sub-tab[aria-selected="true"]');
    return b ? b.id.replace('inv-sub-' + pg + '-', '') : null;
  }
  // ao trocar de modo, mantém o contexto (ativo escolhido, carteira, filtros) e só sai de telas que o novo modo não tem
  function reposicionar(deLink) {
    var tab = PB.current;
    if (modo === 'facil' && TABS_AV.indexOf(tab) >= 0) { if (deLink) { modo = 'avancado'; return false; } PB.show('resumo'); }
    else if (modo === 'avancado' && TABS_FACIL.indexOf(tab) >= 0) PB.show('geral');
    var sc = secaoAtual(PB.current);
    if (sc && secaoOculta(PB.current, sc, modo)) {
      if (deLink) { modo = 'avancado'; return false; }
      INV.ir(PB.current, PB.current === 'config' ? 'cotacoes' : 'resumo');
    }
    return true;
  }
  function aplicar(persistir, deLink) {
    var ok = reposicionar(deLink);
    if (!ok) { /* um link levou a uma tela do Avançado: abre nele */ }
    document.documentElement.setAttribute('data-modo', modo);
    ['facil', 'avancado'].forEach(function (m) {
      btn[m].setAttribute('aria-checked', String(m === modo));
      btn[m].tabIndex = m === modo ? 0 : -1;
    });
    atualizarNavegacao();
    if (persistir) gravarPref(function (u) { u.modo = modo; });
    ouvintes.forEach(function (fn) { try { fn(modo); } catch (e) { console.error(e); } });
    try { PB.redraw(); } catch (e) { console.error(e); }
  }
  function definir(m, persistir) {
    if (m !== 'facil' && m !== 'avancado') return;
    var mudou = m !== modo;
    modo = m;
    aplicar(persistir !== false);
    if (mudou) anuncio.textContent = 'Modo ' + ROTULO[m] + ' ativado. ' + DICA[m] + '.';
  }
  // abre uma tela (e seção) no Avançado a partir do Fácil, sem perder o ativo escolhido nem os dados registrados
  function irAvancado(tab, secao) {
    definir('avancado', true);
    if (tab) INV.ir(tab, secao);
    try { W.scrollTo({ top: 0 }); } catch (e) { /* ok */ }
  }

  /* ---------- indicação: a mesma classificação (sinal) lida em linguagem de decisão, nos dois modos ---------- */
  var INDICACAO = {
    'oportunidade': ['Candidata a compra', 'Nota alta e preço abaixo do valor justo.'],
    'oportunidade-com-risco': ['Compra com cautela', 'Preço atrativo, mas com um risco relevante.'],
    'qualidade-sem-margem': ['Boa, mas sem desconto', 'Empresa sólida; o preço já reflete isso. Aguardar.'],
    'neutro': ['Neutro: acompanhar', 'Sem desconto nem alerta claros.'],
    'risco-rendimento': ['Atenção ao rendimento', 'O rendimento pode não se sustentar.'],
    'armadilha': ['Evitar (armadilha)', 'Parece barato, mas os fundamentos pioram.'],
    'adicionado': ['Sem classificação (nota automática)', 'Adicionado por você: nota do mesmo modelo, sem análise qualitativa.']
  };
  // cor da indicação: significado fixo (verde = candidata, âmbar = cautela, azul = boa sem desconto, laranja = rendimento, vermelho = evitar)
  var TOM = { 'oportunidade': 'var(--color-ok)', 'oportunidade-com-risco': 'var(--color-warn)', 'qualidade-sem-margem': 'var(--accent-ink)',
    'neutro': 'var(--color-fg-muted)', 'adicionado': 'var(--color-fg-muted)', 'risco-rendimento': 'var(--orange)', 'armadilha': 'var(--color-bad)' };
  var corInd = function (sinal) { return TOM[sinal] || PB.sinalColor(sinal); };
  var indicacao = function (sinal) { return (INDICACAO[sinal] || [PB.sinalName(sinal), ''])[0]; };
  var CANDIDATAS = ['oportunidade', 'oportunidade-com-risco'];
  var filtroFacil = { classe: '', soCompra: false };

  /* ---------- tela "Hoje" (só Fácil) ---------- */
  var pagina = h('section', { class: 'pb-page', id: 'resumo', 'data-page': 'resumo', hidden: true });
  var primeira = raiz.querySelector('[data-page="geral"]');
  raiz.insertBefore(pagina, primeira || null);
  var aba = h('button', { class: 'pb-tab', role: 'tab', 'data-tab': 'resumo', 'aria-selected': 'false' }, 'Hoje');
  aba.addEventListener('click', function () { PB.show('resumo'); });
  nav.insertBefore(aba, nav.firstChild);
  NAV.grupos[0].abas.unshift('resumo');

  function tileX(rotulo, valor, nota, cls) {
    return h('div', { class: 'pb-card' }, h('span', { class: 'pb-label' }, rotulo), h('span', { class: 'pb-big ' + (cls || '') }, valor), nota ? h('span', { class: 'pb-note' }, nota) : null);
  }
  function chipSinal(s) {
    var c = h('span', { class: 'inv-chip nd', style: 'color:' + PB.sinalColor(s) }, PB.sinalName(s));
    return c;
  }
  var ATENCAO = ['armadilha', 'risco-rendimento', 'oportunidade-com-risco'];

  function desenharResumo() {
    var ativos = dash.data('ativos'), macro = dash.data('macro'), par = dash.data('parametros');
    var ok = ativos.status === 'ok' && macro.status === 'ok' && par.status === 'ok';
    if (!ok) {
      var falhou = [ativos, macro, par].some(function (x) { return x.status === 'error'; });
      pagina.replaceChildren(h('div', { class: 'pb-card', 'aria-live': 'polite' }, h('p', { class: 'pb-note' }, falhou ? 'Não foi possível carregar os dados do mercado. Verifique a conexão e tente de novo.' : 'Carregando os dados…')));
      return;
    }
    var p = par.data[0], A = ativos.data;
    var m = function (ind) { var r = macro.data.filter(function (x) { return x.indicador === ind; })[0]; return r && typeof r.valor_num === 'number' ? r.valor_num : null; };
    var mg = dash.data('margem_positiva'), sn = dash.data('sinais');
    var nMs = mg.status === 'ok' ? mg.data[0].n : null, tkMs = mg.status === 'ok' ? mg.data[0].tickers : '';

    var faixa = h('div', { class: 'pb-card' },
      h('h2', null, 'Cenário em 4 números'),
      h('div', { class: 'inv-faixa' },
        h('span', null, 'Ibovespa no estresse ', h('b', { class: PB.cls(m('Ibovespa variação')) }, PB.sig(m('Ibovespa variação'), 2) + '%')),
        h('span', null, 'Selic ', h('b', null, num(m('Selic meta'), 2) + '%')),
        h('span', null, 'Dólar ', h('b', null, 'R$ ' + num(m('Dólar comercial fechamento'), 2))),
        h('span', null, 'DI jan/31 ', h('b', null, num(m('DI jan/31'), 2) + '%'))),
      h('p', { class: 'pb-note' }, (nMs === null ? 'Dados de valor justo indisponíveis. ' : 'Com custo de capital de ' + num(p.ke, 1) + '%, só ' + nMs + (nMs === 1 ? ' ação está' : ' ações estão') + ' abaixo do valor justo' + (tkMs ? ' (' + tkMs + ')' : '') + '. ') +
        'Versão ' + p.versao + ' · preços de ' + dt(p.data_ref) + ' · ' + p.evento + '.'));

    // tabela principal: nota, indicação e o risco de cada ativo, ordenados pela nota
    var filtrados = A.slice().sort(PB.byPos).filter(function (a) {
      return (!filtroFacil.classe || a.classe === filtroFacil.classe) && (!filtroFacil.soCompra || CANDIDATAS.indexOf(a.sinal) >= 0);
    });
    var chips = h('div', { class: 'pb-controls', role: 'group', 'aria-label': 'Filtrar a tabela' });
    [['', 'Todos'], ['Ação', 'Ações'], ['FII', 'FIIs']].forEach(function (c) {
      chips.append(h('button', { type: 'button', class: 'pb-btn', 'aria-pressed': String(filtroFacil.classe === c[0]), onclick: function () { filtroFacil.classe = c[0]; desenharResumo(); } }, c[1]));
    });
    chips.append(h('label', { class: 'inv-sim-opt', style: 'display:inline-flex;gap:.4rem;align-items:center' },
      h('input', { type: 'checkbox', checked: filtroFacil.soCompra, onchange: function (e) { filtroFacil.soCompra = e.target.checked; desenharResumo(); } }),
      h('span', null, 'Só candidatas à compra')));
    var linhasT = filtrados.map(function (a) {
      var cor = corInd(a.sinal), corTxt = cor;
      return h('tr', null,
        h('td', { class: 'l' },
          h('button', { type: 'button', class: 'inv-link', onclick: function () { PB.openAtivo(a.ticker); }, 'aria-label': 'Abrir ficha de ' + a.ticker }, a.ticker), ' ', h('span', { class: 'm' }, a.nome),
          h('div', { class: 'inv-ind-sm' }, h('span', { class: 'inv-chip nd', style: 'color:' + corTxt }, indicacao(a.sinal))),
          h('div', { class: 'm' }, 'Risco: ' + (a.risco || '—'))),
        h('td', null, h('b', null, num(a.score / 100, 1), a.posicao ? '' : '*'), h('span', { class: 'pb-bar', style: 'width:' + (a.score / 1000 * 3) + 'rem;background:' + cor, 'aria-hidden': 'true' })),
        h('td', { class: 'l pb-hide-sm' }, h('span', { class: 'inv-chip nd', style: 'color:' + corTxt, title: (INDICACAO[a.sinal] || [])[1] || '' }, indicacao(a.sinal))),
        h('td', { class: 'pb-hide-sm' }, 'R$ ' + num(a.preco_atual, 2)));
    });
    var cTab = h('div', { class: 'pb-card' },
      h('h2', null, 'Notas e indicação'),
      h('p', { class: 'pb-note' }, 'Nota de 0 a 10 (o score de 0 a 1000 dividido por 100). Os 20 do ranking vêm do mais bem avaliado para o menos; os ativos adicionados por você (*) vêm depois, com nota automática. Toque no código para ver a ficha.'),
      chips,
      h('p', { class: 'pb-note', role: 'status', 'aria-live': 'polite' }, filtrados.length + ' de ' + A.length + ' ativos'),
      filtrados.length ? h('div', { class: 'pb-tablewrap' }, h('table', { class: 'pb-table inv-ez' }, h('caption', { class: 'inv-sr' }, 'Notas e indicação dos ativos'),
        h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'l' }, 'Ativo e risco'), h('th', { scope: 'col' }, 'Nota'), h('th', { scope: 'col', class: 'l pb-hide-sm' }, 'Indicação'), h('th', { scope: 'col', class: 'pb-hide-sm' }, 'Preço'))),
        h('tbody', null, linhasT)))
        : h('p', { class: 'pb-note' }, 'Nenhum ativo com esse filtro. Escolha "Todos" ou desmarque "Só candidatas à compra".'),
      h('p', { class: 'pb-disc' }, 'A indicação é uma leitura automática da classificação do modelo (desconto, solidez, qualidade e proventos), com base nos dados de ' + dt(p.data_ref) + '. Não é recomendação de compra ou venda: confira o risco de cada ativo e a ficha antes de decidir.'));

    var cCart = h('div', { class: 'pb-card', id: 'resumo-carteira' });
    var cd = null;
    try { cd = typeof INV.carteiraDados === 'function' ? INV.carteiraDados() : null; } catch (e) { cd = null; }
    var vals = cd ? cd.aloc.linhas.filter(function (l) { return l.valorCent > 0; }).map(function (l) { return l.valorCent; }) : [];
    cCart.append(h('h2', null, 'Sua carteira'));
    if (vals.length) {
      var total = 0; cd.aloc.linhas.forEach(function (l) { total += l.valorCent || 0; });
      cCart.append(
        h('p', { class: 'pb-text' }, 'Posições a preço de mercado: ' + C.fmtBRL(total) + ' em ' + vals.length + (vals.length === 1 ? ' ativo.' : ' ativos.')),
        cartaoConcentracaoCorpo(C.concentracao(vals)),
        cd.aloc.semPreco && cd.aloc.semPreco.length ? h('p', { class: 'pb-note warn' }, 'Sem preço para: ' + cd.aloc.semPreco.join(', ') + '. Esses ativos ficaram fora da conta.') : document.createDocumentFragment(),
        h('div', { class: 'inv-actions' }, h('button', { type: 'button', class: 'pb-btn', onclick: function () { INV.ir('corretora', 'posicoes'); } }, 'Ver posições e alvos')));
    } else {
      cCart.append(h('p', { class: 'pb-note' }, 'Você ainda não registrou posições. Registre o que tem para ver a concentração e planejar aportes.'),
        h('div', { class: 'inv-actions' }, h('button', { type: 'button', class: 'pb-btn', onclick: function () { INV.ir('corretora', 'resumo'); } }, 'Ir para Minha carteira')));
    }

    var cMais = h('div', { class: 'pb-card' },
      h('h2', null, 'Quer ir mais fundo?'),
      h('p', { class: 'pb-note' }, 'O modo Avançado mostra os mesmos números com o cálculo, o histórico, o cenário macro completo e as premissas. Nada do que você registrou ou escolheu se perde ao trocar.'),
      h('div', { class: 'inv-actions' },
        h('button', { type: 'button', class: 'pb-btn inv-pri', onclick: function () { irAvancado('geral'); } }, 'Abrir a análise completa'),
        h('button', { type: 'button', class: 'pb-btn', onclick: function () { irAvancado('metodo'); } }, 'Como o score é calculado')),
      h('p', { class: 'pb-disc' }, 'Material educacional; não é recomendação de investimento. Resultados passados não garantem resultados futuros. Os dados dependem das fontes e da data da coleta.'));

    pagina.replaceChildren(faixa, cTab, cCart, cMais);
  }
  INV.aoMostrar('resumo', desenharResumo);
  if (W.dash && dash.onData) dash.onData(function () { if (PB.current === 'resumo') desenharResumo(); });

  /* ---------- cartões de risco: um cálculo, duas apresentações ---------- */
  var SINAL_NIVEL = { baixo: 'Baixo', moderado: 'Moderado', alto: 'Alto', baixa: 'Baixa', moderada: 'Moderada', alta: 'Alta', 'muito alta': 'Muito alta' };
  function chipNivel(n, prefixo) {
    var k = n ? String(n).replace(' ', '-') : 'nd';
    return h('span', { class: 'inv-chip ' + k }, (prefixo ? prefixo + ': ' : '') + (n ? SINAL_NIVEL[n] : 'sem dados'));
  }
  function frasesConcentracao(c) {
    if (!c) return 'Sem posições com preço para medir a concentração.';
    if (c.n === 1) return 'Todo o valor está em um único ativo: a carteira depende só dele.';
    return 'Os 3 maiores ativos somam ' + num(c.top3Pct, 0) + '% da carteira e o maior sozinho pesa ' + num(c.maiorPct, 0) + '%. É como se a carteira tivesse ' + num(c.nEfetivo, 1) + ' ativos de peso igual.';
  }
  // corpo da concentração (chip + frase fácil + detalhe avançado). Também usado no Resumo e na Minha carteira.
  function cartaoConcentracaoCorpo(c) {
    var box = h('div', { class: 'inv-risco' });
    box.append(h('div', { class: 'inv-risco-linha' }, chipNivel(c && c.nivel, 'Concentração'), h('span', { class: 'pb-text' }, frasesConcentracao(c))));
    if (c) {
      var L = C.LIMITES_RISCO.hhi;
      box.append(h('div', { 'data-so-avancado': '1', class: 'inv-risco' },
        h('h3', null, 'Como a concentração é calculada'),
        h('div', { class: 'pb-tablewrap' }, h('table', { class: 'pb-table' }, h('caption', { class: 'inv-sr' }, 'Indicadores de concentração'),
          h('tbody', null,
            linhaTab('Ativos com saldo', String(c.n)), linhaTab('Maior posição', num(c.maiorPct, 1) + '%'), linhaTab('3 maiores somados', num(c.top3Pct, 1) + '%'),
            linhaTab('HHI (índice de Herfindahl-Hirschman)', num(c.hhi, 0) + ' de 10.000'), linhaTab('Número efetivo de ativos (10.000 ÷ HHI)', num(c.nEfetivo, 2))))),
        h('p', { class: 'pb-note' }, 'HHI = soma dos quadrados dos pesos em % (cada peso = valor de mercado do ativo ÷ total das posições). Faixas: abaixo de ' + L[0] + ' baixa; até ' + L[1] + ' moderada; até ' + L[2] + ' alta; acima, muito alta. As faixas são orientativas e não consideram setor nem correlação entre os ativos.')));
    }
    return box;
  }
  function linhaTab(a, b) { return h('tr', null, h('th', { scope: 'row', style: 'text-align:left;font-weight:400' }, a), h('td', { style: 'text-align:right' }, b)); }
  function cartaoConcentracao(c, titulo) {
    return h('div', { class: 'pb-card' }, h('h2', null, titulo || 'Concentração da carteira'), cartaoConcentracaoCorpo(c));
  }

  // risco histórico de uma série. bench = { IBOV: riscoSerie, CDI: riscoSerie } (opcional).
  function cartaoRisco(r, opts) {
    opts = opts || {};
    var bench = opts.bench || {}, ib = bench.IBOV || null;
    var card = h('div', { class: 'pb-card inv-risco', id: opts.id || null });
    card.append(h('h2', null, opts.titulo || 'Risco no período'));
    if (!r || !r.drawdown) { card.append(h('p', { class: 'pb-note' }, 'Dados insuficientes para medir o risco.'), avisosRisco(r)); return card; }
    var dd = r.drawdown, vol = r.volAnualPct;
    card.append(h('div', { class: 'inv-risco-linha' }, chipNivel(r.nivel, 'Risco histórico'), opts.concentracao ? chipNivel(opts.concentracao.nivel, 'Concentração') : null));
    var f = [];
    f.push('No período, a carteira chegou a cair ' + num(-dd.maxPct, 1) + '% do ponto mais alto até o mais baixo (de ' + dt(dd.dataPico) + ' a ' + dt(dd.dataVale) + ').');
    f.push(dd.emQueda ? 'No fim do período, estava ' + num(-dd.atualPct, 1) + '% abaixo do último pico.' : 'No fim do período, estava no seu ponto mais alto.');
    f.push(vol === null ? 'Há poucos dados para medir a oscilação.' : 'O valor oscilou cerca de ' + num(vol, 1) + '% ao ano.');
    if (ib && ib.drawdown && ib.volAnualPct !== null && vol !== null) f.push('Para comparar, o Ibovespa caiu no máximo ' + num(-ib.drawdown.maxPct, 1) + '% e oscilou ' + num(ib.volAnualPct, 1) + '% ao ano no mesmo período.');
    card.append(h('p', { class: 'pb-text' }, f.join(' ')));
    if (opts.concentracao) card.append(h('p', { class: 'pb-text' }, frasesConcentracao(opts.concentracao)));
    card.append(avisosRisco(r));

    // detalhe do Avançado: os mesmos números, com o cálculo
    var cols = [['Carteira', r]]; if (bench.IBOV) cols.push(['Ibovespa', bench.IBOV]); if (bench.CDI) cols.push(['CDI', bench.CDI]);
    var linhas = [
      ['Volatilidade anualizada', function (x) { return x.volAnualPct === null ? '—' : num(x.volAnualPct, 2) + '%'; }],
      ['Queda máxima (drawdown)', function (x) { return x.drawdown ? num(x.drawdown.maxPct, 2) + '%' : '—'; }],
      ['Pico → vale', function (x) { return x.drawdown && x.drawdown.maxPct < 0 ? dt(x.drawdown.dataPico) + ' → ' + dt(x.drawdown.dataVale) + ' (' + x.drawdown.diasPicoAVale + ' dias)' : '—'; }],
      ['Queda atual desde o pico', function (x) { return x.drawdown ? num(x.drawdown.atualPct, 2) + '%' : '—'; }],
      ['Pior retorno em um dia', function (x) { return x.piorDiaPct === null ? '—' : num(x.piorDiaPct, 2) + '%'; }],
      ['Observações (dias com retorno)', function (x) { return String(x.observacoes); }]
    ];
    var thead = h('thead', null, h('tr', null, h('th', { scope: 'col', style: 'text-align:left' }, 'Medida'), cols.map(function (c) { return h('th', { scope: 'col', style: 'text-align:right' }, c[0]); })));
    var tbody = h('tbody', null, linhas.map(function (l) { return h('tr', null, h('th', { scope: 'row', style: 'text-align:left;font-weight:400' }, l[0]), cols.map(function (c) { return h('td', { style: 'text-align:right' }, l[1](c[1])); })); }));
    var Lm = C.LIMITES_RISCO;
    card.append(h('div', { 'data-so-avancado': '1', class: 'inv-risco' },
      h('h3', null, 'Números, fórmulas e limites'),
      h('div', { class: 'pb-tablewrap', tabindex: '0', role: 'region', 'aria-label': 'Medidas de risco' }, h('table', { class: 'pb-table' }, h('caption', { class: 'inv-sr' }, 'Medidas de risco da carteira e dos benchmarks'), thead, tbody)),
      h('ul', null,
        h('li', null, 'Retorno do dia = (valor − aporte do dia) ÷ valor do dia anterior − 1. É a mesma convenção do TWR: aportes não contam como ganho nem como perda.'),
        h('li', null, 'Volatilidade anualizada = desvio padrão amostral (n − 1) dos retornos diários × √252. Com menos de 20 observações não é calculada.'),
        h('li', null, 'Queda máxima = menor valor de (índice ÷ maior índice anterior − 1), com o índice formado pelos retornos acima.'),
        h('li', null, 'Nível de risco: o pior entre a volatilidade (baixo abaixo de ' + Lm.vol[0] + '% a.a.; moderado até ' + Lm.vol[1] + '%; alto acima) e a queda máxima (baixo até ' + Lm.dd[0] + '%; moderado até ' + Lm.dd[1] + '%; alto acima).'),
        h('li', null, 'Os limites são orientativos, adaptados das faixas de risco do repositório tradermonty/claude-trading-skills (licença MIT, pensadas para o mercado dos EUA). Não são regra do mercado nem recomendação.'),
        h('li', null, 'O CDI quase não oscila, por isso serve de referência de risco mínimo e não de comparação de volatilidade.'))));
    return card;
  }
  function avisosRisco(r) {
    // avisos e limitações aparecem nos dois modos, sem exceção
    var a = r && r.avisos ? r.avisos : ['Risco medido no passado; não prevê perdas futuras.'];
    return h('ul', { 'aria-label': 'Limitações da medida de risco' }, a.map(function (x) { return h('li', null, x); }));
  }

  /* ---------- Avançado: ranking e cenário mais fáceis de filtrar (os dados são os mesmos; só some o que não importa agora) ---------- */
  (function () {
    var tab = document.getElementById('tabela'), busca = document.getElementById('busca');
    if (!tab || !busca) return;
    var tb = tab.querySelector('tbody'), card = tab.closest('.pb-card');
    var colunas = lerPref().colunas === 'todas' ? 'todas' : 'essenciais';
    var fSinal = '';
    var estiloR = document.createElement('style');
    estiloR.textContent = '.pb[data-cols="essenciais"] #tabela :is(th,td):is(:nth-child(4),:nth-child(6),:nth-child(7),:nth-child(8),:nth-child(9),:nth-child(10),:nth-child(13),:nth-child(15),:nth-child(17),:nth-child(18)){display:none}' +
      '#tabela .inv-ind{white-space:nowrap}';
    document.head.appendChild(estiloR);
    raiz.setAttribute('data-cols', colunas);
    var th = document.createElement('th'); th.className = 'l'; th.textContent = 'Indicação'; tab.querySelector('thead tr').appendChild(th);
    var sel = h('select', { class: 'pb-in', id: 'filtro-sinal', 'aria-label': 'Filtrar por classificação' },
      h('option', { value: '' }, 'Todas as classificações'),
      Object.keys(PB.SINAL).map(function (k) { return h('option', { value: k }, PB.sinalName(k)); }));
    var cont = h('span', { class: 'pb-note', role: 'status', 'aria-live': 'polite' });
    var bCol = h('button', { type: 'button', class: 'pb-btn', 'aria-pressed': String(colunas === 'todas') });
    var bLimpar = h('button', { type: 'button', class: 'pb-btn' }, 'Limpar filtros');
    function rotCol() { bCol.textContent = colunas === 'todas' ? 'Mostrando todas as colunas' : 'Mostrando colunas essenciais'; bCol.setAttribute('aria-pressed', String(colunas === 'todas')); }
    rotCol();
    var ctr = card.querySelector('.pb-controls');
    ctr.append(sel, bCol, bLimpar, cont);
    var ocupado = false;
    function aplicar() {
      if (ocupado) return; ocupado = true;
      var d = dash.data('ativos'); var por = {};
      if (d.status === 'ok') d.data.forEach(function (a) { por[a.ticker] = a; });
      var n = 0, tot = 0;
      [].forEach.call(tb.querySelectorAll('tr'), function (tr) {
        var tk = tr.children[1] && tr.children[1].textContent.trim(), a = por[tk];
        if (a && !tr.querySelector('.inv-ind')) {
          var td = document.createElement('td'); td.className = 'l inv-ind'; td.textContent = indicacao(a.sinal); td.style.color = corInd(a.sinal); tr.appendChild(td);
        }
        tot++;
        var ver = !fSinal || (a && a.sinal === fSinal);
        tr.hidden = !ver; if (ver) n++;
      });
      cont.textContent = n + ' de ' + tot + ' ativos' + (n === 0 && tot ? ' — nenhum com esse filtro' : '');
      ocupado = false;
    }
    new MutationObserver(aplicar).observe(tb, { childList: true });
    sel.addEventListener('change', function () { fSinal = sel.value; aplicar(); });
    bCol.addEventListener('click', function () {
      colunas = colunas === 'todas' ? 'essenciais' : 'todas'; raiz.setAttribute('data-cols', colunas); rotCol();
      gravarPref(function (u) { u.colunas = colunas; });
    });
    bLimpar.addEventListener('click', function () {
      fSinal = ''; sel.value = ''; busca.value = '';
      busca.dispatchEvent(new Event('input'));
      var todos = card.querySelector('[data-classe=""]'); if (todos) todos.click();
      aplicar();
    });
    PB.draws.push(aplicar);
  })();

  // cenário: filtro por tema na tabela do snapshot de mercado
  (function () {
    var tab = document.getElementById('tabela-macro'), busca = document.getElementById('busca-macro');
    if (!tab || !busca) return;
    var tb = tab.querySelector('tbody'), ctr = busca.parentElement;
    var ROT = { juros: 'Juros', fiscal: 'Fiscal', eleicao: 'Política e eleição', inflacao: 'Inflação', cambio: 'Câmbio', bolsa: 'Bolsa', credito: 'Crédito', banco: 'Bancos', commodity: 'Commodities', acao: 'Ações' };
    var ORDEM = ['eleicao', 'fiscal', 'juros', 'inflacao', 'cambio', 'bolsa', 'credito', 'banco', 'commodity', 'acao'];
    var atual = '', botoes = {}, montado = false;
    var cont = h('span', { class: 'pb-note', role: 'status', 'aria-live': 'polite' });
    function montar() {
      var d = dash.data('macro'); if (montado || d.status !== 'ok') return; montado = true;
      var cats = ORDEM.filter(function (c) { return d.data.some(function (r) { return r.categoria === c; }); });
      var grupo = h('div', { class: 'pb-controls', role: 'group', 'aria-label': 'Filtrar por tema' });
      [['', 'Todos']].concat(cats.map(function (c) { return [c, ROT[c] || c]; })).forEach(function (c) {
        var b = h('button', { type: 'button', class: 'pb-btn', 'aria-pressed': String(c[0] === '') }, c[1]);
        b.addEventListener('click', function () { atual = c[0]; Object.keys(botoes).forEach(function (k) { botoes[k].setAttribute('aria-pressed', String(k === c[0])); }); aplicar(); });
        botoes[c[0]] = b; grupo.appendChild(b);
      });
      ctr.after(grupo, cont);
    }
    var ocupado = false;
    function aplicar() {
      montar(); if (ocupado) return; ocupado = true;
      var n = 0, tot = 0;
      [].forEach.call(tb.querySelectorAll('tr'), function (tr) {
        var ver = !atual || (tr.children[0] && tr.children[0].textContent.trim() === atual);
        tr.hidden = !ver; tot++; if (ver) n++;
      });
      cont.textContent = n + ' de ' + tot + ' indicadores';
      ocupado = false;
    }
    new MutationObserver(aplicar).observe(tb, { childList: true });
    PB.draws.push(aplicar);
  })();

  /* ---------- Catálogo de triagem (Avançado): ativos fora do ranking, sem score; dados de dados/catalogo.json ---------- */
  (function () {
    var pg = h('section', { class: 'pb-page', id: 'catalogo', 'data-page': 'catalogo', hidden: true });
    var ref = raiz.querySelector('[data-page="macro"]');
    raiz.insertBefore(pg, ref || null);
    var bt = h('button', { class: 'pb-tab', role: 'tab', 'data-tab': 'catalogo', 'aria-selected': 'false' }, 'Catálogo');
    bt.addEventListener('click', function () { PB.show('catalogo'); });
    var tabMacro = nav.querySelector('[data-tab="macro"]');
    nav.insertBefore(bt, tabMacro || null);
    var ab = NAV.grupos[0].abas; ab.splice(ab.indexOf('macro') < 0 ? ab.length : ab.indexOf('macro'), 0, 'catalogo');

    var cat = null, erro = null, carregando = false;
    var F = { q: '', classe: '', status: '', seg: '' }, abertos = {};
    function carregar() {
      if (cat || carregando) return; carregando = true;
      fetch((W.PB_BASE || '') + 'dados/catalogo.json', { cache: 'no-cache' })
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) { cat = d; }).catch(function (e) { erro = String(e); })
        .then(function () { carregando = false; desenhar(); });
    }
    var norm = function (t) { return String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''); };
    function desenhar() {
      if (PB.current !== 'catalogo') return;
      if (erro) { pg.replaceChildren(h('div', { class: 'pb-card' }, h('p', { class: 'pb-note' }, 'Não foi possível carregar o catálogo (' + erro + '). Ele é gerado junto com os dados do app; tente de novo depois de "Atualizar dados".'))); return; }
      if (!cat) { pg.replaceChildren(h('div', { class: 'pb-card', 'aria-live': 'polite' }, h('p', { class: 'pb-note' }, 'Carregando o catálogo…'))); carregar(); return; }
      var segs = Array.from(new Set(cat.map(function (x) { return x.segmento; }).filter(Boolean))).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
      var q = norm(F.q);
      var lista = cat.filter(function (x) {
        return (!F.classe || x.classe === F.classe) && (!F.status || x.status === F.status) && (!F.seg || x.segmento === F.seg) &&
          (!q || norm(x.ticker + ' ' + x.nome + ' ' + x.segmento).indexOf(q) >= 0);
      });
      var nPre = cat.filter(function (x) { return x.status === 'preliminar'; }).length;
      var aviso = h('div', { class: 'pb-card' },
        h('h2', null, 'Catálogo de triagem'),
        h('p', { class: 'pb-text' }, cat.length + ' ativos da B3 além dos 20 do ranking. ' + nPre + ' têm uma leitura preliminar; os outros ' + (cat.length - nPre) + ' são só cadastro.'),
        h('p', { class: 'pb-note warn' }, 'Atenção: estes ativos não têm score, valor justo nem dados verificados neste app. A leitura preliminar não foi validada com balanço, cotação e liquidez e não é recomendação. Use apenas para saber quais ativos existem e por onde começar a pesquisar.'));
      var busca = h('input', { type: 'search', class: 'pb-in', id: 'cat-busca', placeholder: 'Buscar código, nome ou segmento', 'aria-label': 'Buscar no catálogo', value: F.q });
      busca.addEventListener('input', function () { F.q = busca.value; pos = busca.selectionStart; redesenharLista(); });
      var pos = 0;
      var chips = h('div', { class: 'pb-controls', role: 'group', 'aria-label': 'Filtrar por tipo' });
      [['', 'Todos'], ['Ação', 'Ações'], ['FII', 'FIIs']].forEach(function (c) {
        chips.append(h('button', { type: 'button', class: 'pb-btn', 'aria-pressed': String(F.classe === c[0]), onclick: function () { F.classe = c[0]; desenhar(); } }, c[1]));
      });
      var selSt = h('select', { class: 'pb-in', 'aria-label': 'Filtrar por situação', onchange: function (e) { F.status = e.target.value; desenhar(); } },
        h('option', { value: '' }, 'Todas as situações'), h('option', { value: 'preliminar' }, 'Com leitura preliminar'), h('option', { value: 'sem-analise' }, 'Só cadastro'));
      selSt.value = F.status;
      var selSeg = h('select', { class: 'pb-in', 'aria-label': 'Filtrar por segmento', onchange: function (e) { F.seg = e.target.value; desenhar(); } },
        h('option', { value: '' }, 'Todos os segmentos'), segs.map(function (g) { return h('option', { value: g }, g); }));
      selSeg.value = F.seg;
      var limpar = h('button', { type: 'button', class: 'pb-btn', onclick: function () { F = { q: '', classe: '', status: '', seg: '' }; desenhar(); } }, 'Limpar filtros');
      var cont = h('span', { class: 'pb-note', id: 'cat-cont', role: 'status', 'aria-live': 'polite' });
      var corpo = h('tbody');
      var tabela = h('div', { class: 'pb-tablewrap', style: 'max-height:none' }, h('table', { class: 'pb-table' }, h('caption', { class: 'inv-sr' }, 'Catálogo de ativos em triagem'),
        h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'l' }, 'Ativo'), h('th', { scope: 'col', class: 'l pb-hide-sm' }, 'Segmento'), h('th', { scope: 'col', class: 'l' }, 'Situação'), h('th', { scope: 'col', class: 'l pb-hide-sm' }, 'Leitura preliminar'))), corpo));
      var adicionadosAgora = {};
      try { dash.data('ativos').data.forEach(function (a) { if (a.sinal === 'adicionado') adicionadosAgora[a.ticker] = 1; }); } catch (e) { /* ok */ }
      function redesenharLista() {
        var q2 = norm(F.q);
        var l = cat.filter(function (x) {
          return (!F.classe || x.classe === F.classe) && (!F.status || x.status === F.status) && (!F.seg || x.segmento === F.seg) &&
            (!q2 || norm(x.ticker + ' ' + x.nome + ' ' + x.segmento).indexOf(q2) >= 0);
        });
        cont.textContent = l.length + ' de ' + cat.length + ' ativos' + (l.length === 0 ? ' — nenhum com esse filtro' : '');
        corpo.replaceChildren.apply(corpo, [].concat.apply([], l.map(function (x) {
          var aberto = !!abertos[x.ticker];
          var b = h('button', { type: 'button', class: 'inv-link', 'aria-expanded': String(aberto), 'aria-controls': 'cat-d-' + x.ticker }, x.ticker);
          var det = h('tr', { id: 'cat-d-' + x.ticker, hidden: !aberto },
            h('td', { class: 'l', colspan: '4', style: 'white-space:normal' },
              x.status === 'preliminar'
                ? h('div', { class: 'inv-risco' },
                    h('p', { class: 'pb-text' }, h('b', null, 'Tese preliminar: '), x.tese || '—'),
                    h('p', { class: 'pb-text' }, h('b', null, 'Risco apontado: '), x.risco || '—'),
                    x.nota ? h('p', { class: 'pb-note' }, x.nota) : null,
                    h('p', { class: 'pb-note warn' }, 'Leitura preliminar, não validada (confiança ' + String(x.confianca || 'baixa').toLowerCase() + '). Sem score e sem valor justo neste app.'))
                : h('p', { class: 'pb-note' }, 'Só cadastro: sem tese nem dados verificados. Pesquise cotação, liquidez, dívida, resultados e governança em fontes atuais antes de qualquer decisão.')));
          b.addEventListener('click', function () { abertos[x.ticker] = !abertos[x.ticker]; det.hidden = !abertos[x.ticker]; b.setAttribute('aria-expanded', String(!!abertos[x.ticker])); });
          var tr = h('tr', null,
            h('td', { class: 'l' }, b, ' ', h('span', { class: 'pb-note' }, x.nome), h('div', { class: 'pb-note' }, x.classe)),
            h('td', { class: 'l pb-hide-sm' }, x.segmento || '—'),
            h('td', { class: 'l' }, adicionadosAgora[x.ticker] ? h('span', { class: 'inv-chip nd', style: 'color:var(--accent-ink)' }, 'Adicionado: veja no ranking') : h('span', { class: 'inv-chip nd', style: 'color:' + (x.status === 'preliminar' ? 'var(--color-warn)' : 'var(--color-fg-muted)') }, x.status === 'preliminar' ? 'Leitura preliminar' : 'Só cadastro')),
            h('td', { class: 'l pb-hide-sm' }, x.status === 'preliminar' ? PB.sinalName(x.sinal) : '—'));
          return [tr, det];
        })));
      }
      pg.replaceChildren(aviso, h('div', { class: 'pb-card' }, h('div', { class: 'pb-controls' }, busca, chips, selSt, selSeg, limpar, cont), tabela));
      redesenharLista();
    }
    INV.aoMostrar('catalogo', desenhar);
  })();

  /* ---------- Adicionar ativo: o usuário digita só o código; o GitHub Actions busca os dados e calcula (dados/extras.json) ---------- */
  (function () {
    var pg = h('section', { class: 'pb-page', id: 'adicionar', 'data-page': 'adicionar', hidden: true });
    var ref = raiz.querySelector('[data-page="catalogo"]') || raiz.querySelector('[data-page="macro"]');
    raiz.insertBefore(pg, ref || null);
    var bt = h('button', { class: 'pb-tab', role: 'tab', 'data-tab': 'adicionar', 'aria-selected': 'false' }, 'Adicionar ativo');
    bt.addEventListener('click', function () { PB.show('adicionar'); });
    var tabCat = nav.querySelector('[data-tab="catalogo"]') || nav.querySelector('[data-tab="macro"]');
    nav.insertBefore(bt, tabCat || null);
    var ab = NAV.grupos[0].abas; ab.splice(ab.indexOf('catalogo') < 0 ? ab.length : ab.indexOf('catalogo'), 0, 'adicionar');

    var dados = null, erro = null, carregando = false, msg = null, abertos = {};
    var upd = document.getElementById('app-update');
    var repo = ((upd && upd.href || '').match(/github\.com\/([^/]+\/[^/]+)\/actions/) || [])[1] || '';
    function carregar(forcar) {
      if ((dados && !forcar) || carregando) return; carregando = true;
      fetch((W.PB_BASE || '') + 'dados/extras.json', { cache: 'no-cache' })
        .then(function (r) { if (r.status === 404) return { fichas: [], falhas: {} }; if (!r.ok) throw new Error(r.status); return r.json(); })
        .then(function (d) { dados = d; erro = null; }).catch(function (e) { erro = String(e); })
        .then(function () { carregando = false; desenhar(); });
    }
    var pend = function () { var u = lerPref(); return u.pendentes && typeof u.pendentes === 'object' ? u.pendentes : {}; };
    function validar(texto) {
      var partes = String(texto || '').split(/[\s,;]+/).filter(Boolean), ok = [], erros = [];
      var ranking = {}; try { dash.data('ativos').data.forEach(function (a) { if (a.sinal !== 'adicionado') ranking[a.ticker] = 1; }); } catch (e) { /* ok */ }
      var jaTem = {}; ((dados && dados.fichas) || []).forEach(function (f) { jaTem[f.ticker] = 1; });
      partes.forEach(function (p) {
        var v = C.validarTicker(p);
        if (!v.ok) { erros.push(p + ': ' + v.erro); return; }
        if (ranking[v.ticker]) { erros.push(v.ticker + ' já está no ranking.'); return; }
        if (jaTem[v.ticker]) { erros.push(v.ticker + ' já foi adicionado.'); return; }
        if (ok.indexOf(v.ticker) < 0) ok.push(v.ticker);
      });
      if (!partes.length) erros.push('Digite o código do ativo (ex.: PRIO3).');
      if (ok.length + Object.keys(jaTem).length > 100) erros.push('O limite é de 100 ativos adicionados.');
      return { ok: ok, erros: erros };
    }
    function pedir(lista) {
      var url = 'https://github.com/' + repo + '/issues/new?title=' + encodeURIComponent('Adicionar ativo: ' + lista.join(', ')) +
        '&body=' + encodeURIComponent('Pedido feito pelo app. Basta clicar em "Submit new issue": o GitHub Actions busca preços e fundamentos, calcula a nota e atualiza o app em alguns minutos.');
      gravarPref(function (u) { var p = (u.pendentes && typeof u.pendentes === 'object') ? u.pendentes : {}; lista.forEach(function (t) { p[t] = new Date().toISOString().slice(0, 10); }); u.pendentes = p; });
      W.open(url, '_blank', 'noopener');
    }

    function grafico(serie, nome) {
      if (!serie || serie.length < 2) return h('p', { class: 'pb-note' }, 'Sem série de preços para o gráfico.');
      var NS = 'http://www.w3.org/2000/svg', W0 = 600, H0 = 170, mL = 8, mR = 8, mT = 8, mB = 20;
      var ps = serie.map(function (x) { return x[1]; }), lo = Math.min.apply(null, ps), hi = Math.max.apply(null, ps), sp = hi - lo || 1;
      var X = function (i) { return mL + i / (serie.length - 1) * (W0 - mL - mR); }, Y = function (v) { return mT + (1 - (v - lo) / sp) * (H0 - mT - mB); };
      var svg = document.createElementNS(NS, 'svg');
      svg.setAttribute('viewBox', '0 0 ' + W0 + ' ' + H0); svg.setAttribute('role', 'img'); svg.setAttribute('width', '100%');
      svg.setAttribute('aria-label', 'Preço semanal de ' + nome + ' de ' + dt(serie[0][0]) + ' a ' + dt(serie[serie.length - 1][0]) + ': de R$ ' + num(ps[0], 2) + ' a R$ ' + num(ps[ps.length - 1], 2) + '; mínimo R$ ' + num(lo, 2) + ' e máximo R$ ' + num(hi, 2) + '.');
      var mk = function (tag, a, txt) { var e = document.createElementNS(NS, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (txt) e.textContent = txt; svg.appendChild(e); };
      mk('line', { x1: mL, x2: W0 - mR, y1: H0 - mB, y2: H0 - mB, stroke: 'var(--cds-chart-axis)' });
      mk('path', { d: serie.map(function (x, i) { return (i ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(x[1]).toFixed(1); }).join(''), fill: 'none', stroke: 'var(--c0)', 'stroke-width': 2, 'stroke-linejoin': 'round' });
      mk('text', { x: mL, y: H0 - 5, fill: 'var(--color-fg-muted)', 'font-size': 11 }, dt(serie[0][0]));
      mk('text', { x: W0 - mR, y: H0 - 5, fill: 'var(--color-fg-muted)', 'font-size': 11, 'text-anchor': 'end' }, dt(serie[serie.length - 1][0]));
      mk('text', { x: mL + 2, y: mT + 10, fill: 'var(--color-fg-muted)', 'font-size': 11 }, 'máx. R$ ' + num(hi, 2));
      mk('text', { x: W0 - mR, y: mT + 10, fill: 'var(--color-fg-muted)', 'font-size': 11, 'text-anchor': 'end' }, 'mín. R$ ' + num(lo, 2));
      return h('div', { class: 'pb-chart' }, svg);
    }
    var pc = function (x) { return x === null || x === undefined ? '—' : PB.sig(x, 1) + '%'; };
    function detalhe(f, falhas) {
      var m = f.metricas || {}, fu = f.fundamentos || {}, sc = f.score;
      var avisos = ['Nota automática: mesmo modelo do ranking, só com dados públicos automáticos (Yahoo Finance e Fundamentus), sem os ajustes manuais do ranking. Não é recomendação.'];
      if (sc && sc.tipo_assumido === 'geral') avisos.push('Tipo assumido: empresa comum (não banco, commodity nem incorporadora) e não estatal. Se for diferente, a nota pode mudar.');
      if (sc && sc.status === 'provisorio') avisos.push('Dados incompletos (cobertura ' + num(sc.cobertura * 100, 0) + '%): o peso do que faltou foi redistribuído dentro de cada pilar.');
      if (!sc && f.motivo) avisos.push('Sem nota: ' + f.motivo + '.');
      if (f.aviso_preco) avisos.push('Atenção: ' + f.aviso_preco + '.');
      if (falhas && falhas[f.ticker]) avisos.push('Falha na coleta: ' + falhas[f.ticker] + '.');
      var tiles = h('div', { class: 'pb-tiles' },
        tileX('Preço', 'R$ ' + num(m.preco, 2), m.data_preco ? 'fechamento de ' + dt(m.data_preco) : ''),
        tileX('12 meses', pc(m.var_12m), '1 mês ' + pc(m.var_1m) + ' · 3 meses ' + pc(m.var_3m)),
        tileX('Queda máxima', m.queda_max === undefined ? '—' : num(m.queda_max, 1) + '%', 'pior queda pico a vale em 5 anos (só preço)'));
      var mais = h('div', { 'data-so-avancado': '1', class: 'inv-risco' },
        h('h3', null, 'Indicadores'),
        h('div', { class: 'pb-tablewrap' }, h('table', { class: 'pb-table' }, h('caption', { class: 'inv-sr' }, 'Indicadores de ' + f.ticker), h('tbody', null,
          linhaTab('Oscilação anual (último ano)', m.vol_anual === null || m.vol_anual === undefined ? '—' : num(m.vol_anual, 1) + '%'),
          linhaTab('Dividendos em 12 meses sobre o preço (Yahoo)', m.dy12_calc === null || m.dy12_calc === undefined ? '—' : num(m.dy12_calc, 2) + '%'),
          linhaTab('Div. yield (Fundamentus)', fu.dy === null || fu.dy === undefined ? '—' : num(fu.dy, 2) + '%'),
          linhaTab('P/L', num(fu.pl, 2)), linhaTab('P/VP', num(fu.pvp, 2)), linhaTab('ROIC', fu.roic === null || fu.roic === undefined ? '—' : num(fu.roic, 1) + '%'),
          linhaTab('Margem líquida', fu.margem_liq === null || fu.margem_liq === undefined ? '—' : num(fu.margem_liq, 1) + '%'),
          linhaTab('Variação no estresse (' + dt(dash.data('parametros').data[0].data_pre_estresse) + ' a ' + dt(dash.data('parametros').data[0].data_estresse) + ')', pc(m.var_estresse)),
          sc ? linhaTab('Margem de segurança vs valor justo (só ações)', sc.ms === null || sc.ms === undefined ? '—' : PB.sig(sc.ms, 1) + '%') : null))),
        sc ? h('p', { class: 'pb-note' }, 'Pilares (máx.): desconto ' + num(sc.p1, 0) + ' (300), solidez ' + num(sc.p2, 0) + ' (250), qualidade ' + num(sc.p3, 0) + ' (250), proventos ' + num(sc.p4, 0) + ' (200). Balanço de ' + (fu.balanco || '—') + '.') : null);
      return h('div', { class: 'inv-risco' }, tiles, grafico(f.serie, f.ticker), mais, h('ul', { 'aria-label': 'Limitações desta nota' }, avisos.map(function (a) { return h('li', null, a); })));
    }

    function desenhar() {
      if (PB.current !== 'adicionar') return;
      if (!dados && !erro) { pg.replaceChildren(h('div', { class: 'pb-card', 'aria-live': 'polite' }, h('p', { class: 'pb-note' }, 'Carregando…'))); carregar(); return; }
      var fichas = (dados && dados.fichas) || [], falhas = (dados && dados.falhas) || {};
      var tem = {}; fichas.forEach(function (f) { tem[f.ticker] = 1; });
      var input = h('input', { type: 'text', class: 'pb-in', id: 'add-ticker', placeholder: 'Ex.: PRIO3 ou PRIO3, TAEE11', autocomplete: 'off', autocapitalize: 'characters', 'aria-describedby': 'add-ajuda add-msg' });
      var elMsg = h('div', { id: 'add-msg', role: 'status', 'aria-live': 'polite' });
      var form = h('form', { class: 'pb-controls', novalidate: true },
        h('label', { class: 'inv-sr', for: 'add-ticker' }, 'Código do ativo'), input, h('button', { type: 'submit', class: 'pb-btn inv-pri' }, 'Adicionar'));
      form.addEventListener('submit', function (ev) {
        ev.preventDefault();
        var v = validar(input.value);
        if (v.erros.length) { elMsg.replaceChildren.apply(elMsg, v.erros.map(function (e) { return h('p', { class: 'pb-note warn' }, e); })); input.setAttribute('aria-invalid', 'true'); return; }
        input.removeAttribute('aria-invalid');
        if (!repo) { elMsg.replaceChildren(h('p', { class: 'pb-note warn' }, 'Não encontrei o endereço do repositório neste app; use o GitHub › Actions › Adicionar ativo.')); return; }
        pedir(v.ok); input.value = '';
        desenhar();
      });
      var pendentes = Object.keys(pend()).filter(function (t) { return !tem[t]; });
      // pedidos que já viraram ficha saem da lista de pendentes
      var limpos = Object.keys(pend()).filter(function (t) { return tem[t]; });
      if (limpos.length) gravarPref(function (u) { limpos.forEach(function (t) { delete (u.pendentes || {})[t]; }); });
      var cForm = h('div', { class: 'pb-card' },
        h('h2', null, 'Adicionar ativo pelo código'),
        h('p', { class: 'pb-text', id: 'add-ajuda' }, 'Digite só o código (ações, units ou FIIs da B3). O app abre um pedido no GitHub já preenchido: clique em "Submit new issue". Em poucos minutos o GitHub busca preços, histórico e fundamentos, calcula a nota e publica aqui. Você não edita arquivo nenhum.'),
        form, elMsg,
        pendentes.length ? h('div', null, h('p', { class: 'pb-note' }, 'Aguardando a atualização (pode levar alguns minutos; depois recarregue): '),
          h('div', { class: 'pb-chips' }, pendentes.map(function (t) { return h('span', { class: 'pb-chip' }, t + ' · pedido em ' + dt(pend()[t])); })),
          h('button', { type: 'button', class: 'pb-btn', onclick: function () { carregar(true); } }, 'Verificar agora')) : null,
        h('p', { class: 'pb-note' }, 'Para remover ou adicionar vários de uma vez: GitHub › Actions › "Adicionar ativo" › Run workflow. Limite de 100 ativos adicionados.'));
      var cLista;
      if (erro) cLista = h('div', { class: 'pb-card' }, h('p', { class: 'pb-note warn' }, 'Não foi possível carregar os ativos adicionados (' + erro + ').'));
      else if (!fichas.length) cLista = h('div', { class: 'pb-card' }, h('h2', null, 'Ativos adicionados'), h('p', { class: 'pb-note' }, 'Nenhum ativo adicionado ainda.'));
      else {
        var corpo = h('tbody');
        fichas.forEach(function (f) {
          var m = f.metricas || {}, sc = f.score, aberto = !!abertos[f.ticker];
          var b = h('button', { type: 'button', class: 'inv-link', 'aria-expanded': String(aberto), 'aria-controls': 'add-d-' + f.ticker }, f.ticker);
          var det = h('tr', { id: 'add-d-' + f.ticker, hidden: !aberto }, h('td', { class: 'l', colspan: '5', style: 'white-space:normal' }, detalhe(f, falhas)));
          b.addEventListener('click', function () { abertos[f.ticker] = !abertos[f.ticker]; det.hidden = !abertos[f.ticker]; b.setAttribute('aria-expanded', String(!!abertos[f.ticker])); });
          corpo.append(h('tr', null,
            h('td', { class: 'l' }, b, ' ', h('span', { class: 'pb-note' }, f.nome), h('div', { class: 'pb-note' }, f.classe)),
            h('td', null, sc ? h('b', null, h('span', { 'data-so-facil': '1' }, num(sc.total / 100, 1)), h('span', { 'data-so-avancado': '1' }, num(sc.total, 1))) : '—'),
            h('td', { class: 'pb-hide-sm' }, m.preco === undefined ? '—' : 'R$ ' + num(m.preco, 2)),
            h('td', { class: 'pb-hide-sm' }, pc(m.var_12m)),
            h('td', { class: 'l' }, h('span', { class: 'inv-chip nd', style: 'color:' + (sc ? (sc.status === 'definitivo' ? 'var(--accent-ink)' : 'var(--color-warn)') : 'var(--color-fg-muted)') },
              sc ? (sc.status === 'definitivo' ? 'Nota automática' : 'Nota parcial') : 'Sem nota'))), det);
        });
        cLista = h('div', { class: 'pb-card' },
          h('h2', null, 'Ativos adicionados'),
          h('p', { class: 'pb-note' }, 'Dados de ' + dt(dados.data_ref) + '. ', h('span', { 'data-so-facil': '1' }, 'Nota de 0 a 10. '), h('span', { 'data-so-avancado': '1' }, 'Score de 0 a 1000, o mesmo modelo do ranking. '), 'Toque no código para ver preço, gráfico e limitações.'),
          h('div', { class: 'pb-tablewrap', style: 'max-height:none' }, h('table', { class: 'pb-table' }, h('caption', { class: 'inv-sr' }, 'Ativos adicionados'),
            h('thead', null, h('tr', null, h('th', { scope: 'col', class: 'l' }, 'Ativo'), h('th', { scope: 'col' }, 'Nota'), h('th', { scope: 'col', class: 'pb-hide-sm' }, 'Preço'), h('th', { scope: 'col', class: 'pb-hide-sm' }, '12 meses'), h('th', { scope: 'col', class: 'l' }, 'Situação'))), corpo)),
          h('p', { class: 'pb-disc' }, (dados && dados.aviso) || ''));
      }
      pg.replaceChildren(cForm, cLista);
      if (msg) msg = null;
    }
    INV.aoMostrar('adicionar', desenhar);
    W.INVModo_extras = { recarregar: function () { carregar(true); } };
  })();

  /* ---------- interface pública ---------- */
  W.INVModo = {
    atual: function () { return modo; },
    definir: definir,
    irAvancado: irAvancado,
    aoMudar: function (fn) { ouvintes.push(fn); },
    indicacao: indicacao,
    cartaoRisco: cartaoRisco,
    cartaoConcentracao: cartaoConcentracao,
    // atributos para marcar elementos de outros módulos
    soAvancado: function (n) { if (n && n.setAttribute) n.setAttribute('data-so-avancado', '1'); return n; },
    soFacil: function (n) { if (n && n.setAttribute) n.setAttribute('data-so-facil', '1'); return n; },
    _tabs: { avancado: TABS_AV, facil: TABS_FACIL, secoes: SECOES_AV }
  };

  /* ---------- sinais de navegação ---------- */
  // link ou ação que leva a uma tela só do Avançado enquanto estamos no Fácil: abre no Avançado (e avisa)
  function guardar() {
    var t = PB.current, sc = secaoAtual(t);
    if (modo === 'facil' && (TABS_AV.indexOf(t) >= 0 || (sc && secaoOculta(t, sc, 'facil')))) {
      modo = 'avancado';
      aplicar(false, false);
      anuncio.textContent = 'Esta tela é do modo Avançado; ele foi ativado. Use o botão Fácil para voltar.';
    }
  }
  new MutationObserver(function () { guardar(); }).observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
  if (typeof INV.on === 'function') INV.on('secao', guardar);

  // arranque: link direto para tela do Avançado abre no Avançado; sem destino, o Fácil abre no Resumo
  document.documentElement.setAttribute('data-modo', modo);
  var destino = (location.hash || '').replace('#', '').split('/')[0];
  var semDestino = destino === '' || destino === 'geral' || destino === 'resumo';
  if (modo === 'facil' && !semDestino && TABS_AV.indexOf(PB.current) >= 0) modo = 'avancado';
  if (semDestino) PB.show(modo === 'facil' ? 'resumo' : 'geral');
  aplicar(false, false);
  // módulos anteriores já desenharam sem o INVModo: redesenha uma vez para incluir os cartões de risco
  try { PB.redraw(); } catch (e) { /* ok */ }
})();
