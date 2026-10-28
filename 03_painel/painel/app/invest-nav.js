/* Navegação do app em áreas (Mercado, Minha carteira, Simulador, Ajustes) e estilo visual unificado.
   Só roda no app do GitHub Pages: a página do painel continua igual no artifact do Claude. */
(function () {
  'use strict';
  var W = window, PB = W.PB, INV = W.INV;
  var nav = document.querySelector('nav.pb-tabs'), raiz = document.querySelector('div.pb'), barra = document.querySelector('.app-bar');
  if (!PB || !nav || !raiz) return;

  var GRUPOS = [
    { id: 'mercado', rotulo: 'Mercado', titulo: 'Mercado',
      desc: 'Análise dos 20 ativos da B3: score, preços, valor justo e cenário econômico.',
      abas: ['geral', 'ranking', 'valor', 'precos', 'ativo', 'macro', 'historico', 'metodo', 'glossario'],
      icone: 'M3 17l5-6 4 4 7-9M14 6h5v5' },
    { id: 'carteira', rotulo: 'Minha carteira', titulo: 'Minha carteira',
      desc: 'O que você tem de verdade: caixa, posições, compras e o planejamento do próximo aporte.',
      abas: ['corretora'],
      icone: 'M3 7h18v12H3zM3 7l2-3h14l2 3M16 13h2' },
    { id: 'simulador', rotulo: 'Simulador', titulo: 'Simulador',
      desc: 'Veja como uma carteira teria se saído no passado, com aportes mensais. É uma análise histórica, não uma previsão.',
      abas: ['simulacao'],
      icone: 'M4 20V10M10 20V4M16 20v-7M22 20H2' },
    { id: 'ajustes', rotulo: 'Ajustes', titulo: 'Ajustes',
      desc: 'Cotações, custos, backup e fontes de dados. Tudo fica guardado só neste aparelho.',
      abas: ['config'],
      icone: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12h2M3 12h2M12 3v2M12 19v2M17 7l1.5-1.5M5.5 18.5L7 17M17 17l1.5 1.5M5.5 5.5L7 7' }
  ];
  // nomes mais claros para as abas de Mercado (o id não muda: links antigos continuam valendo)
  var ROTULO = { geral: 'Visão geral', ranking: 'Ranking', valor: 'Valor × queda', precos: 'Preços', ativo: 'Ficha do ativo',
    macro: 'Cenário macro', historico: 'Histórico do score', metodo: 'Como o score funciona', glossario: 'Glossário' };
  var DESC = {
    geral: 'O resumo do dia: números do mercado, os três primeiros do score e o score de todos, separado por pilar.',
    ranking: 'Todos os ativos numa tabela. Toque no cabeçalho para ordenar e numa linha para abrir a ficha do ativo.',
    valor: 'Quanto cada ação caiu no dia do estresse e quanto o preço está abaixo (ou acima) do valor justo calculado.',
    precos: 'Um gráfico pequeno por ativo, todos na mesma escala e comparados com o Ibovespa.',
    ativo: 'Tudo sobre um ativo: tese, riscos, pontos do score, gráfico de preço e indicadores.',
    macro: 'Juros, câmbio, inflação e bolsa na data da coleta, com a fonte e o grau de confiança de cada número.',
    historico: 'Como o score de cada ativo mudou entre as versões e quão estável é o ranking em outros cenários.',
    metodo: 'Os parâmetros e as fórmulas por trás do score, em linguagem direta.',
    glossario: 'Todos os termos técnicos do app explicados. Nas telas, toque no “?” ao lado de um termo para ver a explicação ali mesmo.'
  };
  var grupoDe = function (tab) { for (var i = 0; i < GRUPOS.length; i++) if (GRUPOS[i].abas.indexOf(tab) >= 0) return GRUPOS[i]; return GRUPOS[0]; };
  var ultimaAba = {};
  try { var u = INV && INV.preferencias ? INV.preferencias.ler() : {}; ultimaAba = u.ultimaAba || {}; } catch (e) { /* ok */ }

  function h(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v; else if (k === 'text') n.textContent = v; else n.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c !== null && c !== undefined) n.append(c); }
    return n;
  }
  function icone(d) {
    var NS = 'http://www.w3.org/2000/svg', s = document.createElementNS(NS, 'svg'), p = document.createElementNS(NS, 'path');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
    p.setAttribute('d', d); p.setAttribute('fill', 'none'); p.setAttribute('stroke', 'currentColor');
    p.setAttribute('stroke-width', '1.8'); p.setAttribute('stroke-linecap', 'round'); p.setAttribute('stroke-linejoin', 'round');
    s.appendChild(p); return s;
  }

  /* ---------- estilo ---------- */
  var css = [
    // barra superior
    '.inv-page > div:empty{display:none}',
    // áreas
    // cabeçalho de cada área
    // subabas (abas de Mercado e seções das outras áreas): mesmo desenho, rolagem lateral no celular
    '.pb nav.pb-tabs,.inv-sub{display:flex;flex-wrap:nowrap;gap:.25rem;overflow-x:auto;scrollbar-width:none;padding:.15rem .1rem .35rem;margin:0 -.1rem;scroll-padding-inline:1rem}',
    '.pb nav.pb-tabs::-webkit-scrollbar,.inv-sub::-webkit-scrollbar{display:none}',
    '.pb .pb-tab,.inv-sub-tab{font-family:inherit;white-space:nowrap;cursor:pointer;display:inline-flex;align-items:center;gap:.4rem;min-height:2.25rem}',
    '.inv-sub-tab:focus-visible,.pb .pb-tab:focus-visible{outline:2px solid var(--accent-ink);outline-offset:2px}',
    '.inv-sub-n{display:inline-grid;place-items:center;width:1.25rem;height:1.25rem;border-radius:50%;font-size:.75rem;border:1px solid currentColor}',
    '.inv-lead,.inv-sec-intro{margin:0;color:var(--color-fg-muted);max-width:75ch}',
    '.inv-secao{display:grid;gap:var(--cds-gap-md)}',
    '.inv-secao[hidden]{display:none}',
    // cartões e botões
    // primeiros passos e atalhos
    '.inv-passos{display:grid;gap:var(--cds-gap-sm);list-style:none;margin:0;padding:0}',
    '.inv-passos li{display:grid;grid-template-columns:auto 1fr auto;gap:var(--cds-gap-sm) var(--cds-gap-md);align-items:center;padding:var(--cds-pad-sm) 0;border-top:1px solid var(--color-border-line)}',
    '.inv-passos li:first-child{border-top:0}',
    '.inv-passos .ck{display:inline-grid;place-items:center;width:1.6rem;height:1.6rem;border-radius:50%;border:1.5px solid var(--color-border-line);font-size:.8rem;color:var(--color-fg-muted)}',
    '.inv-passos li.ok .ck{background:var(--color-ok);border-color:var(--color-ok);color:var(--color-bg)}',
    '.inv-passos li.ok .t{color:var(--color-fg-muted);text-decoration:line-through}',
    '.inv-passos .t b{display:block;font-weight:500}',
    '.inv-passos .t span{color:var(--color-fg-muted);font-size:var(--cds-font-size-caption)}',
    '.inv-atalhos{display:flex;flex-wrap:wrap;gap:var(--cds-gap-sm)}',
    // campos: fundo do cartão e borda visível (antes pareciam desabilitados); desabilitado fica tracejado
    '.inv-range-val{font-size:var(--cds-font-size-caption);font-weight:500}',
    // alternância Comprar/Vender e outros botões de escolha (aria-pressed): o escolhido fica preenchido
    // blocos de números: dois por linha no celular (menos rolagem)
    '.inv-cor-filtros .pb-in{min-height:2.25rem}',
    '.inv-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
    // ---- barra superior e áreas: no desktop as áreas ficam em linha sob o título; no celular viram a barra inferior fixa (como na referência) ----
    '.app-brand{display:grid;line-height:1.25;min-width:0}',
    '.app-actions{display:flex;gap:.25rem;align-items:center}',
    '.app-btn{display:inline-flex;align-items:center;gap:.35rem;min-height:2.25rem;box-sizing:border-box;cursor:pointer;white-space:nowrap}',
    '.app-btn svg{width:1.125rem;height:1.125rem;flex:none}',
    '.app-row2{flex-basis:100%;display:flex;align-items:center;justify-content:space-between;gap:.75rem;flex-wrap:wrap}',
    '.inv-grupos{display:flex;gap:.25rem}',
    '.inv-grupo{display:inline-flex;align-items:center;gap:.5rem;font:inherit;font-size:.875rem;font-weight:700;color:var(--color-fg-muted);background:none;border:0;border-radius:.75rem;padding:.5rem .875rem;min-height:2.5rem;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s}',
    '.inv-grupo svg{width:1.125rem;height:1.125rem;flex:none}',
    '.inv-grupo:hover{background:var(--soft);color:var(--color-fg)}',
    '.inv-grupo[aria-current="page"]{background:var(--accent-soft);color:var(--accent-ink)}',
    '.inv-grupo:focus-visible{outline:2px solid var(--accent-ink);outline-offset:2px}',
    '.inv-head{display:grid;gap:var(--cds-gap-xs)}',
    '.inv-head h1{margin:0}',
    '.inv-head p{margin:0;max-width:70ch}',
    '.inv-range-val{font-size:var(--cds-font-size-caption);font-weight:600}',
    '.pb input[type="range"].pb-in{border:0;background:none;padding:0;accent-color:var(--accent);min-height:2rem}',
    '.pb-btn[disabled]{opacity:.5;cursor:not-allowed}',
    '.pb .pb-tiles{grid-template-columns:repeat(auto-fit,minmax(min(100%,10rem),1fr))}',
    '@media (max-width:767px){',
    ' .inv-grupos{position:fixed;left:0;right:0;bottom:0;z-index:40;background:var(--color-panel);border-top:1px solid var(--color-border-line);box-shadow:var(--shadow-bar);padding:.25rem .25rem calc(.25rem + env(safe-area-inset-bottom,0px));justify-content:space-around;gap:.125rem}',
    ' .inv-grupo{flex:1 1 0;flex-direction:column;gap:.125rem;font-size:.625rem;padding:.5rem .25rem;min-height:3.25rem;justify-content:center}',
    ' .inv-grupo svg{width:1.25rem;height:1.25rem}',
    ' #dash-root{padding-bottom:calc(5.5rem + env(safe-area-inset-bottom,0px))}',
    ' .app-row2{justify-content:flex-start}',
    ' .app-btn .lg{display:none}',
    ' .pb .pb-tab,.inv-sub-tab{min-height:2.5rem}',
    ' .inv-page .pb-btn,.inv-page .pb-in{min-height:2.75rem}',
    ' .inv-page input.pb-in,.inv-page select.pb-in{font-size:16px}',
    ' .inv-page .pb-tiles .pb-big{font-size:clamp(1rem,4.6vw,1.25rem)}',
    '}'
  ].join('\n');
  var st = document.createElement('style'); st.id = 'inv-nav-css'; st.textContent = css; document.head.appendChild(st);

  /* ---------- barra superior: marca à esquerda, áreas, ações à direita ---------- */
  var acoes = barra && barra.querySelector('.app-actions');
  var grupos = h('nav', { class: 'inv-grupos', 'aria-label': 'Áreas do app' });
  var btG = {};
  GRUPOS.forEach(function (g) {
    var b = h('button', { type: 'button', class: 'inv-grupo', 'data-grupo': g.id }, icone(g.icone), h('span', null, g.rotulo));
    b.addEventListener('click', function () { abrirGrupo(g.id); });
    btG[g.id] = b; grupos.appendChild(b);
  });
  // segunda linha da barra: áreas à esquerda; o alternador de modo entra à direita (invest-modo.js)
  var linha2 = h('div', { class: 'app-row2' });
  linha2.appendChild(grupos);
  if (barra) barra.appendChild(linha2); else raiz.insertBefore(grupos, raiz.firstChild);
  var upd = document.getElementById('app-update');
  if (upd && !upd.querySelector('.lg')) {
    upd.textContent = '';
    upd.append(icone('M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4'), h('span', null, 'Atualizar'), h('span', { class: 'lg' }, ' dados'));
    upd.title = 'Abre o GitHub para rodar a atualização automática de preços, fundamentos, score e histórico';
  }

  /* ---------- cabeçalho por área e descrição da aba de Mercado ---------- */
  var topo = document.getElementById('topo');
  var head = h('header', { class: 'inv-head', hidden: true }, h('h1', null), h('p', null));
  raiz.insertBefore(head, nav);
  var lead = h('p', { class: 'inv-lead', 'aria-live': 'polite' });
  nav.after(lead);
  nav.setAttribute('aria-label', 'Seções do mercado');

  // nomes novos nas abas de Mercado; abas das outras áreas saem da barra (cada área tem a sua navegação)
  [].forEach.call(nav.querySelectorAll('.pb-tab'), function (b) {
    var t = b.dataset.tab;
    if (ROTULO[t]) b.textContent = ROTULO[t];
    if (grupoDe(t).id !== 'mercado') b.hidden = true;
  });
  // setas do teclado entre as abas de Mercado
  nav.addEventListener('keydown', function (ev) {
    var tabs = [].filter.call(nav.querySelectorAll('.pb-tab'), function (b) { return !b.hidden; });
    var k = tabs.indexOf(document.activeElement);
    if (k < 0) return;
    var n = ev.key === 'ArrowRight' ? (k + 1) % tabs.length : ev.key === 'ArrowLeft' ? (k - 1 + tabs.length) % tabs.length
      : ev.key === 'Home' ? 0 : ev.key === 'End' ? tabs.length - 1 : -1;
    if (n < 0) return;
    ev.preventDefault(); tabs[n].focus(); PB.show(tabs[n].dataset.tab);
  });

  var grupoAtual = null;
  function abrirGrupo(id) {
    var g = GRUPOS.filter(function (x) { return x.id === id; })[0];
    var alvo = ultimaAba[id] && g.abas.indexOf(ultimaAba[id]) >= 0 ? ultimaAba[id] : g.abas[0];
    if (!document.querySelector('[data-page="' + alvo + '"]')) alvo = g.abas[0];
    PB.show(alvo);
    W.scrollTo({ top: 0 });
  }
  function sincronizar() {
    var tab = PB.current, g = grupoDe(tab);
    ultimaAba[g.id] = tab;
    try { if (INV && INV.preferencias) INV.preferencias.gravar(function (u) { u.ultimaAba = ultimaAba; }); } catch (e) { /* ok */ }
    GRUPOS.forEach(function (x) { if (x.id === g.id) btG[x.id].setAttribute('aria-current', 'page'); else btG[x.id].removeAttribute('aria-current'); });
    var mercado = g.id === 'mercado';
    if (topo) topo.hidden = !mercado;
    head.hidden = mercado;
    head.firstChild.textContent = g.titulo; head.lastChild.textContent = g.desc;
    nav.hidden = !mercado;
    lead.hidden = !mercado;
    lead.textContent = mercado ? (DESC[tab] || '') : '';
    var sel = nav.querySelector('.pb-tab[aria-selected="true"]');
    if (mercado && sel && sel.scrollIntoView && nav.scrollWidth > nav.clientWidth) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
    document.title = (mercado ? (ROTULO[tab] || 'Mercado') : g.titulo) + ' · Painel B3';
    grupoAtual = g.id;
  }
  // PB.show marca aria-selected na aba escolhida: é o sinal de troca de aba (inclusive "Abrir ativo" e links)
  new MutationObserver(function () { sincronizar(); }).observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-selected'] });
  sincronizar();
  W.INVNav = { grupos: GRUPOS, abrirGrupo: abrirGrupo, atual: function () { return grupoAtual; } };
})();
