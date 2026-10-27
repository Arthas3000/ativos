/* Ajuda contextual do app: Glossário (seção de Mercado) e botões "?" ao lado dos termos técnicos.
   Também limpa repetição de etiquetas de preço iguais em tabelas. Só roda no app do GitHub Pages. */
(function () {
  'use strict';
  var W = window, INV = W.INV, PB = W.PB;
  var raiz = document.querySelector('div.pb');
  if (!INV || !PB || !raiz) return;

  /* ---------- termos ---------- */
  // cat: categoria no glossário; re: como o termo aparece nos rótulos da tela (início do texto, sem acento/caixa)
  var T = [
    // Score e método
    ['score', 'Score (0 a 1000)', 'Score e método', 'Nota de 0 a 1000 que organiza os 20 ativos por regras explícitas. É a soma de quatro pilares: desconto (P1, até 300), solidez (P2, até 250), qualidade (P3, até 250) e proventos (P4, até 200). Dado ausente não vale zero: o peso dele é redistribuído dentro do pilar. O score não prevê preço.', /^score$/],
    ['p1', 'P1 — desconto', 'Score e método', 'Até 300 pontos. Mede o desconto contra o valor justo e a queda ajustada pela qualidade; 90 desses pontos vêm da tendência do lucro (ROE do último trimestre anualizado ÷ ROE de 12 meses). Nos FIIs usa P/VP, queda relativa e tendência do FFO.', /^p1\b/],
    ['p2', 'P2 — solidez', 'Score e método', 'Até 250 pontos. Mede alavancagem, liquidez e lucro sobre preço. Nos FIIs: passivo ÷ ativo, volume negociado e FFO yield contra o DI jan/28 líquido.', /^p2\b/],
    ['p3', 'P3 — qualidade', 'Score e método', 'Até 250 pontos. Mede ROE, eficiência, crescimento e consistência do lucro; estatais perdem 15 pontos pelo risco de governança. Nos FIIs: vacância e imóveis (tijolo) ou crédito (papel).', /^p3\b/],
    ['p4', 'P4 — proventos', 'Score e método', 'Até 200 pontos. Mede o dividend yield e se ele é coberto pelo lucro (payout) ou, nos FIIs, pelo FFO, além da dependência de venda de ativos.', /^p4\b/],
    ['ms', 'Margem de segurança (MS)', 'Score e método', 'Quanto o valor justo do modelo está acima (+) ou abaixo (−) do preço: P/VP justo ÷ P/VP atual − 1. Só para ações. Positiva = preço abaixo do valor calculado, não garantia de alta. −100% quer dizer ROE normalizado menor ou igual a g: o modelo não se aplica.', /^(ms\b|margem de seguranca)/],
    ['valor-justo', 'Valor justo', 'Score e método', 'Preço por ação estimado pelo modelo: P/VP justo × valor patrimonial por ação, com P/VP justo = (ROE − g) ÷ (Ke − g). Depende das premissas de Ke e g; "n/a" quando o ROE normalizado não supera g.', /^(valor justo|justo r\$)/],
    ['roe', 'ROE', 'Score e método', 'Retorno sobre o patrimônio: lucro ÷ patrimônio líquido. "ROE 12m" usa o lucro dos últimos 12 meses.', /^roe 12m/],
    ['roe-n', 'ROE normalizado', 'Score e método', 'ROE usado no valor justo: média do ROE de 12 meses e do último trimestre anualizado. Em petróleo e mineração, só o ROE de 12 meses, para não anualizar um trimestre de pico.', /^roe normalizado/],
    ['ke-g', 'Ke e g', 'Score e método', 'Ke é o custo de capital (o retorno mínimo exigido); g é o crescimento perpétuo esperado. Os dois entram no valor justo e estão na seção "Como o score funciona".', /^(custo de capital|crescimento perpetuo)/],
    ['confianca', 'Confiança', 'Score e método', 'Quanto a análise confia nos dados e na tese do ativo (alta, média ou baixa). Confiança baixa pede checar as fontes antes de usar o número.', /^confianca\b/],
    ['sinal', 'Classificação (sinal)', 'Score e método', 'Leitura qualitativa separada do score: oportunidade, oportunidade com risco, qualidade sem margem, neutro, risco no rendimento ou armadilha.', /^como os \d+ ativos/],
    ['robustez', 'Robustez do ranking', 'Score e método', 'Posição de cada ativo em seis cenários com outros pesos dos pilares e outro custo de capital. Posição estável nos cenários = ranking menos dependente das premissas.', /^robustez/],
    // Indicadores
    ['pvp', 'P/VP', 'Indicadores', 'Preço ÷ valor patrimonial por ação (ou por cota, nos FIIs). Abaixo de 1, o mercado paga menos que o patrimônio contábil.', /^p\/vp\b/],
    ['pl', 'P/L', 'Indicadores', 'Preço ÷ lucro por ação dos últimos 12 meses: quantos anos de lucro o preço representa. "Lucro recorrente" exclui efeitos não repetitivos.', /^p\/l\b/],
    ['dy', 'Dividend yield (DY)', 'Indicadores', 'Proventos pagos nos últimos 12 meses ÷ preço. "Recorrente" exclui pagamentos extraordinários.', /^(dy\b|dividend yield)/],
    ['ey', 'Earnings yield', 'Indicadores', 'Lucro ÷ valor de mercado (o inverso do P/L), em %. Ajuda a comparar com juros.', /^earnings yield/],
    ['payout', 'Payout', 'Indicadores', 'Parte do lucro paga como proventos. Acima de 100%, a empresa paga mais do que lucra.', /^payout/],
    ['ev-ebitda', 'EV/EBITDA', 'Indicadores', 'Valor da firma (mercado + dívida líquida) ÷ geração operacional de caixa (EBITDA).', /^ev\/ebitda/],
    ['alav', 'Alavancagem (DL/EBITDA, DL/PL)', 'Indicadores', 'Dívida líquida comparada à geração de caixa (DL/EBITDA) ou ao patrimônio (DL/PL, usada em incorporadoras). Quanto maior, mais endividada.', /^(dl\/ebitda|dl\/pl)/],
    ['cet1', 'CET1', 'Indicadores', 'Capital principal do banco em % dos ativos ponderados pelo risco. Quanto maior, mais folga para perdas.', /^cet1/],
    ['npl', 'Inadimplência 90 dias', 'Indicadores', 'Parte da carteira de crédito do banco com atraso acima de 90 dias.', /^inadimplencia/],
    ['pdd', 'Cobertura de provisões', 'Indicadores', 'Provisões para perdas ÷ créditos com atraso acima de 90 dias. Acima de 100%, o banco já reservou mais do que o atraso.', /^cobertura de provisoes/],
    ['ffo', 'FFO (FIIs)', 'Indicadores', 'Resultado de caixa do fundo imobiliário no período. "FFO yield" é o FFO por cota de 12 meses ÷ preço.', /^ffo yield/],
    ['ffo-cob', 'FFO ÷ distribuição', 'Indicadores', 'Quanto do rendimento distribuído é coberto pelo FFO. Abaixo de 100%, o fundo paga mais do que gera; abaixo de 85%, o rendimento pode não se sustentar.', /^ffo .*distribuicao/],
    ['vacancia', 'Vacância', 'Indicadores', 'Parte da área de um FII de tijolo que está vaga (sem inquilino).', /^vacancia/],
    ['passivo', 'Passivo ÷ ativo', 'Indicadores', 'Alavancagem do FII: dívidas e obrigações em relação ao total de ativos.', /^passivo/],
    ['estresse', 'Variação no estresse', 'Indicadores', 'Variação entre o fechamento do pregão anterior ao evento de estresse e o do pregão do evento.', /^(variacao no estresse|estresse\b|ibovespa no estresse)/],
    ['pico', 'Queda do pico', 'Indicadores', 'Variação entre o maior fechamento dos últimos 3 meses e o fechamento da data de referência.', /^queda do pico/],
    ['volume', 'Volume ÷ média de 20 pregões', 'Indicadores', 'Volume negociado no dia do estresse ÷ média dos 20 pregões anteriores. 3x = três vezes o normal.', /^(volume no estresse|volume ÷ media)/],
    // Mercado e macro
    ['selic', 'Selic', 'Juros e inflação', 'Taxa básica de juros definida pelo Copom. Referência para quase todas as taxas do país.', /^selic/],
    ['cdi', 'CDI', 'Juros e inflação', 'Taxa dos empréstimos entre bancos, muito próxima da Selic. Referência de rendimento da renda fixa pós-fixada.', /^cdi\b/],
    ['di28', 'DI jan/28 líquido de IR', 'Juros e inflação', 'Taxa do DI futuro para janeiro de 2028 × 0,85 (desconta 15% de IR). É a renda fixa de comparação dos FIIs, que são isentos de IR.', /^di jan\/28 liquido/],
    ['di', 'DI futuro', 'Juros e inflação', 'Taxa negociada hoje para o CDI acumulado até uma data futura (ex.: DI jan/31). Mostra o que o mercado espera dos juros.', /^di jan/],
    ['ipca', 'IPCA', 'Juros e inflação', 'Índice oficial de inflação do Brasil (IBGE). "Focus" é a projeção mediana dos economistas ouvidos pelo Banco Central.', /^(ipca|focus ipca)/],
    ['ibov', 'Ibovespa', 'Juros e inflação', 'Principal índice da B3. É de retorno total: considera os proventos reinvestidos.', /^ibovespa \(/],
    // Carteira
    ['preco-ref', 'Preço de referência', 'Minha carteira', 'Preço usado para avaliar posições: o último fechamento baixado pelo GitHub Actions ou, para ativos seus, o preço manual. Não é cotação em tempo real.', /^preco de referencia/],
    ['estados', 'Estados do preço', 'Minha carteira', 'Ao vivo: cotação da brapi (com o atraso do seu plano). Atrasado: último fechamento salvo. Manual: digitado por você, nunca sobrescrito. Indisponível: sem preço; o ativo fica fora dos totais.', /^precos? de referencia:/],
    ['caixa', 'Caixa disponível', 'Minha carteira', 'Depósitos − retiradas − compras + vendas registrados por você. Deve bater com o saldo livre da conta na corretora.', /^caixa disponivel/],
    ['preco-medio', 'Preço médio', 'Minha carteira', 'Custo total das compras (com taxas) ÷ quantidade. Uma venda reduz o custo na proporção do preço médio.', /^preco medio/],
    ['custo', 'Custo das posições', 'Minha carteira', 'Quanto você pagou pelo que ainda tem, incluindo as taxas das compras.', /^custo das posicoes/],
    ['resultado', 'Resultado não realizado', 'Minha carteira', 'Valor de mercado − custo das posições com preço. É ganho ou perda "no papel": só se realiza quando você vende.', /^resultado nao realizado/],
    ['alvo', 'Alvo (%)', 'Minha carteira', 'Quanto você quer que cada ativo represente da carteira. Os alvos guiam o planejamento de aporte; não precisam somar 100%.', /^(alvo %|alvo atual|alvo \(%\))/],
    ['atual', '% atual / exposição', 'Minha carteira', 'Quanto cada ativo representa hoje do valor de mercado das posições com preço (sem o caixa).', /^(% atual|exposicao atual|atual %)/],
    ['lote', 'Lote e mercado fracionário', 'Minha carteira', 'Lote é a quantidade mínima por ordem. Lote 1 = mercado fracionário (1 a 99 ações, ticker com F na corretora); lote 100 = lote padrão. FIIs negociam de 1 em 1. A B3 não negocia fração de ação.', /^(lote\b|lote padrao)/],
    ['corretagem', 'Corretagem', 'Minha carteira', 'Taxa fixa cobrada pela corretora por ordem executada (muitas cobram zero).', /^corretagem/],
    ['emolumentos', 'Emolumentos e taxas', 'Minha carteira', 'Taxas da B3 cobradas como percentual do valor da ordem. Confira o valor exato na sua nota de corretagem.', /^emolumentos/],
    ['taxas', 'Taxas da operação', 'Minha carteira', 'Corretagem + emolumentos de uma ordem. Entram no custo da compra e saem do valor recebido na venda.', /^(taxas \(r\$\)|taxas estimadas)/],
    ['estimativa', 'Quantidade estimada', 'Minha carteira', 'Maior quantidade, em múltiplos do lote, que cabe no valor informado com as taxas. É só uma estimativa: grave depois o que foi executado.', /^quantidade estimada/],
    ['sobra', 'Sobra', 'Minha carteira', 'Dinheiro que não coube em lotes inteiros (e, no planejamento, a reserva). Fica no caixa.', /^sobra/],
    ['correcao', 'Corrigir e anular', 'Minha carteira', 'Corrigir grava uma versão nova que substitui a anterior. Anular tira a transação das contas. Nada é apagado: o histórico completo continua disponível.', /^acoes$/],
    // Planejar aporte
    ['gap', 'Gap (p.p.)', 'Planejar aporte', 'Diferença entre o alvo e o % atual, em pontos percentuais. Positivo = ativo abaixo do alvo, com prioridade no aporte.', /^gap/],
    ['intensidade', 'Intensidade do score', 'Planejar aporte', 'Quanto o score do painel reordena a prioridade entre os ativos abaixo do alvo. 0% ignora o score; 100% dá o efeito máximo (fator de 0 a 2). Nunca dá dinheiro a quem já está acima do alvo.', /^intensidade/],
    ['fator', 'Fator do score', 'Planejar aporte', 'Multiplicador da prioridade calculado do score do ativo em relação à média dos escolhidos. Ativo sem score fica neutro (fator 1).', /^score \(fator\)/],
    ['reserva', 'Reserva', 'Planejar aporte', 'Parte do orçamento que você quer manter em caixa. Não é usada na proposta.', /^reserva/],
    ['teto', 'Teto (%)', 'Planejar aporte', 'Participação máxima que o ativo pode atingir depois do aporte. Opcional; quando atingido, o motivo diz "teto atingido".', /^teto/],
    ['depois', 'Depois %', 'Planejar aporte', 'Participação prevista de cada ativo depois das compras propostas, sobre o total (posições + aporte desta rodada).', /^depois %/],
    // Simulador
    ['aporte', 'Aporte inicial e mensal', 'Simulador', 'Dinheiro colocado na carteira simulada: uma vez no início e todo mês, no primeiro pregão a partir do dia escolhido.', /^(aporte inicial|aporte mensal|aportes adicionais)/],
    ['acumulado', 'Retorno acumulado', 'Simulador', 'Lucro ÷ total investido. Simples de ler, mas mistura o efeito do tempo de cada aporte.', /^retorno acumulado/],
    ['twr', 'TWR (retorno da carteira)', 'Simulador', 'Rentabilidade da estratégia sem a influência de quando e quanto você aportou: encadeia o retorno de cada dia. É o número para comparar estratégias.', /^twr/],
    ['xirr', 'XIRR (retorno dos seus aportes)', 'Simulador', 'Taxa anual equivalente considerando a data e o valor de cada aporte, como a rentabilidade "sentida" pelo investidor. Pode ficar indisponível quando não há solução matemática.', /^xirr/],
    ['real', 'Retorno real', 'Simulador', 'Retorno descontada a inflação (IPCA) do período: (1 + TWR) ÷ (1 + IPCA) − 1. Mostra o ganho de poder de compra.', /^retorno real/],
    ['estrategia', 'Estratégia da simulação', 'Simulador', 'Pesos fixos: cada aporte segue os pesos escolhidos (análise histórica de uma carteira definida hoje). Aporte no que está abaixo do peso: uma regra que poderia ser seguida na época, usando só dados de cada dia.', /^estrategia/],
    ['retro', 'Viés de retrospectiva', 'Simulador', 'Escolher ativos e pesos hoje, já sabendo o que aconteceu, deixa o passado melhor do que seria numa decisão tomada na época.', /^premissas e avisos/],
    ['div-sim', 'Dividendos na simulação', 'Simulador', 'Creditados na data ex sobre as cotas do pregão anterior, brutos (sem IR, JCP incluído). Reinvestir compra o mesmo ativo; caixa guarda sem rendimento; ignorar mostra só o retorno de preço.', /^dividendos$/],
    ['benchmark', 'Comparação (benchmark)', 'Simulador', 'Ibovespa e CDI recebendo os mesmos aportes nas mesmas datas, sem custos, para comparar com a carteira simulada.', /^(comparar com|comparacao com benchmarks)/]
  ];
  var POR_ID = {};
  T.forEach(function (t) { POR_ID[t[0]] = t; });
  var norm = function (s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim().toLowerCase(); };

  function h(tag, attrs) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      var v = attrs[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v; else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) { var c = arguments[i]; if (c !== null && c !== undefined) n.append(c); }
    return n;
  }

  /* ---------- estilo ---------- */
  var css = [
    '.pb button.inv-termo,.inv-bolha button.inv-termo,button.inv-termo{all:unset;box-sizing:border-box;display:inline-grid;place-items:center;width:1.15rem;height:1.15rem;margin-left:.3rem;border-radius:50%;border:1px solid currentColor;color:var(--color-fg-muted);font-size:.7rem;font-weight:600;line-height:1;cursor:help;vertical-align:.05em}',
    '.pb button.inv-termo:hover,.pb button.inv-termo[aria-expanded="true"]{color:var(--color-fg)}',
    '.pb button.inv-termo:focus-visible{outline:2px solid var(--color-fg);outline-offset:2px}',
    '@media (max-width:640px){.pb button.inv-termo{width:1.5rem;height:1.5rem;font-size:.8rem}}',
    '.inv-bolha{position:fixed;z-index:60;max-width:min(22rem,calc(100vw - 2rem));background:var(--cds-surface-popover);color:var(--color-fg);border:1px solid var(--cds-border);border-radius:.6rem;box-shadow:var(--cds-shadow-popover);padding:var(--cds-pad-md);font-size:var(--cds-font-size-caption);line-height:1.5;display:grid;gap:var(--cds-gap-xs)}',
    '.inv-bolha[hidden]{display:none}',
    '.inv-bolha b{font-size:var(--cds-font-size-body);font-weight:500}',
    '.inv-bolha a{color:inherit}',
    '.inv-glo-ctl{display:flex;flex-wrap:wrap;gap:var(--cds-gap-sm);align-items:center}',
    '.inv-glo-ctl .pb-in{flex:1 1 16rem;min-height:2.5rem}',
    '.inv-glo dl{margin:0;display:grid;gap:0}',
    '.inv-glo dt{font-weight:500;padding-top:var(--cds-pad-md);border-top:1px solid var(--color-border-line);scroll-margin-top:6rem}',
    '.inv-glo dt:first-child{border-top:0;padding-top:0}',
    '.inv-glo dd{margin:.15rem 0 var(--cds-pad-sm);color:var(--color-fg-muted);max-width:75ch}',
    '.inv-glo dt.inv-alvo{color:var(--c0)}',
    '.inv-glo h2{margin:0}',
    '.inv-chip-dup{display:none !important}',
    '.inv-chip-nota{margin:0;color:var(--color-fg-muted);font-size:var(--cds-font-size-caption);display:flex;flex-wrap:wrap;gap:.4rem;align-items:center}'
  ].join('\n');
  var st = document.createElement('style'); st.id = 'inv-ajuda-css'; st.textContent = css; document.head.appendChild(st);

  /* ---------- glossário (seção de Mercado) ---------- */
  var sec = INV.aba({ id: 'glossario', rotulo: 'Glossário' });
  var busca, cats, dl, vazio, contagem, catSel = '';
  if (sec) {
    busca = h('input', { type: 'search', class: 'pb-in', id: 'inv-glo-busca', placeholder: 'Buscar termo (ex.: TWR, P/VP, lote)', autocomplete: 'off' });
    var CATS = [];
    T.forEach(function (t) { if (CATS.indexOf(t[2]) < 0) CATS.push(t[2]); });
    cats = h('select', { class: 'pb-in', id: 'inv-glo-cat' }, h('option', { value: '' }, 'Todas as categorias'));
    CATS.forEach(function (c) { cats.append(h('option', { value: c }, c)); });
    contagem = h('span', { class: 'pb-note', 'aria-live': 'polite' });
    dl = h('dl');
    vazio = h('p', { class: 'pb-note', hidden: true }, 'Nenhum termo encontrado. Tente outra palavra ou escolha "Todas as categorias".');
    sec.append(h('div', { class: 'pb-card inv-glo' },
      h('h2', null, 'Glossário'),
      h('p', { class: 'pb-note' }, 'Os termos técnicos usados no app, em linguagem direta. Nas telas, o botão “?” ao lado de um termo mostra a mesma explicação.'),
      h('div', { class: 'inv-glo-ctl' },
        h('label', { class: 'inv-sr', for: 'inv-glo-busca' }, 'Buscar termo'), busca,
        h('label', { class: 'inv-sr', for: 'inv-glo-cat' }, 'Categoria'), cats, contagem),
      dl, vazio));
    T.forEach(function (t) {
      dl.append(h('dt', { id: 'glo-' + t[0], 'data-cat': t[2] }, t[1]), h('dd', { 'data-cat': t[2] }, t[3]));
    });
    var filtrar = function () {
      var q = norm(busca.value), n = 0;
      [].forEach.call(dl.querySelectorAll('dt'), function (dt) {
        var dd = dt.nextElementSibling;
        var ok = (!catSel || dt.dataset.cat === catSel) && (!q || norm(dt.textContent + ' ' + dd.textContent).indexOf(q) >= 0);
        dt.hidden = dd.hidden = !ok; if (ok) n++;
      });
      vazio.hidden = n > 0;
      contagem.textContent = n === T.length ? T.length + ' termos' : n + ' de ' + T.length + ' termos';
    };
    busca.addEventListener('input', filtrar);
    cats.addEventListener('change', function () { catSel = cats.value; filtrar(); });
    filtrar();
  }
  function abrirTermo(id) {
    if (!sec) return;
    busca.value = ''; cats.value = ''; catSel = '';
    busca.dispatchEvent(new Event('input'));
    INV.ir('glossario');
    var dt = document.getElementById('glo-' + id);
    if (!dt) return;
    [].forEach.call(dl.querySelectorAll('.inv-alvo'), function (x) { x.classList.remove('inv-alvo'); });
    dt.classList.add('inv-alvo');
    setTimeout(function () { dt.scrollIntoView({ block: 'start' }); dt.setAttribute('tabindex', '-1'); dt.focus({ preventScroll: true }); }, 30);
  }

  /* ---------- bolha de explicação ("?") ---------- */
  var bolha = h('div', { class: 'inv-bolha', id: 'inv-bolha', role: 'status', hidden: true });
  document.body.appendChild(bolha);
  var aberto = null;
  function fechar(devolverFoco) {
    if (!aberto) return;
    aberto.setAttribute('aria-expanded', 'false');
    if (devolverFoco) aberto.focus();
    aberto = null; bolha.hidden = true; bolha.replaceChildren();
  }
  function posicionar(btn) {
    var r = btn.getBoundingClientRect(), bw = bolha.offsetWidth, bh = bolha.offsetHeight;
    var x = Math.min(Math.max(8, r.left + r.width / 2 - bw / 2), innerWidth - bw - 8);
    var y = r.bottom + 8;
    if (y + bh > innerHeight - 8) y = Math.max(8, r.top - bh - 8);
    bolha.style.left = x + 'px'; bolha.style.top = y + 'px';
  }
  function abrir(btn) {
    var t = POR_ID[btn.dataset.termo];
    if (!t) return;
    if (aberto === btn) { fechar(false); return; }
    fechar(false);
    aberto = btn; btn.setAttribute('aria-expanded', 'true');
    var link = sec ? h('a', { href: '#glossario', onclick: function (ev) { ev.preventDefault(); fechar(false); abrirTermo(t[0]); } }, 'Ver no glossário') : null;
    bolha.replaceChildren(h('b', null, t[1]), h('span', null, t[3]), link);
    bolha.hidden = false;
    posicionar(btn);
  }
  document.addEventListener('click', function (ev) {
    var b = ev.target.closest && ev.target.closest('.inv-termo');
    if (b) { ev.preventDefault(); ev.stopPropagation(); abrir(b); return; }
    if (aberto && !bolha.contains(ev.target)) fechar(false);
  }, true);
  document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape' && aberto) { ev.stopPropagation(); fechar(true); } }, true);
  addEventListener('scroll', function () { if (aberto) posicionar(aberto); }, { passive: true });
  addEventListener('resize', function () { if (aberto) posicionar(aberto); });

  function termoDe(texto) {
    var n = norm(texto);
    for (var i = 0; i < T.length; i++) if (T[i][4] && T[i][4].test(n)) return T[i];
    return null;
  }
  function botao(t) {
    return h('button', { type: 'button', class: 'inv-termo', 'data-termo': t[0], 'aria-expanded': 'false', 'aria-controls': 'inv-bolha',
      'aria-label': 'O que é ' + t[1] + '?', title: 'O que é ' + t[1] + '?' }, '?');
  }

  /* ---------- decoração: "?" nos rótulos e etiqueta única de preço em tabelas ---------- */
  // Onde procurar termos: telas do app e indicadores da Ficha do ativo / Visão geral (não nos cabeçalhos ordenáveis do Ranking)
  var ALVOS = '.inv-page .pb-label, .inv-page th, .inv-page label, .inv-page legend, .inv-page h2, .inv-page h3, ' +
    '#ativo-indicadores .pb-label, #geral .pb-tiles .pb-label, #top3 .pb-label, #sinais-card h2, #historico h2, #metodo .pb-label';
  function decorar() {
    [].forEach.call(raiz.querySelectorAll(ALVOS), function (el) {
      if (el.dataset.termoOk) return;
      el.dataset.termoOk = '1';
      if (el.querySelector('.inv-termo') || el.closest('.inv-glo') || el.closest('#inv-tour') || el.closest('.inv-sr')) return;
      // rótulo de checkbox/radio: o "?" iria parar dentro da opção; ignora
      if (el.tagName === 'LABEL' && el.querySelector('input[type="checkbox"],input[type="radio"]')) return;
      var t = termoDe(el.textContent);
      if (!t) return;
      if (el.tagName === 'TH' && el.querySelector('button')) return;
      el.append(botao(t));
    });
    // etiquetas de preço iguais em todas as linhas: mostra uma vez acima da tabela
    [].forEach.call(raiz.querySelectorAll('.inv-page table'), function (tb) {
      var chips = tb.querySelectorAll('.inv-chip');
      var wrap = tb.closest('.pb-tablewrap') || tb;
      var nota = wrap.previousElementSibling && wrap.previousElementSibling.classList.contains('inv-chip-nota') ? wrap.previousElementSibling : null;
      if (chips.length < 2) { if (nota) nota.remove(); return; }
      var txt = chips[0].textContent, iguais = [].every.call(chips, function (c) { return c.textContent === txt && c.className === chips[0].className; });
      if (!iguais) { [].forEach.call(chips, function (c) { c.classList.remove('inv-chip-dup'); }); if (nota) nota.remove(); return; }
      [].forEach.call(chips, function (c) { c.classList.add('inv-chip-dup'); });
      if (!nota || nota.dataset.txt !== txt) {
        if (nota) nota.remove();
        var copia = chips[0].cloneNode(true); copia.classList.remove('inv-chip-dup');
        nota = h('p', { class: 'inv-chip-nota', 'data-txt': txt }, 'Preços de referência de todas as linhas:', copia, botao(POR_ID.estados));
        wrap.parentNode.insertBefore(nota, wrap);
      }
    });
  }
  var agendado = false;
  new MutationObserver(function () {
    if (agendado) return;
    agendado = true;
    requestAnimationFrame(function () { agendado = false; decorar(); });
  }).observe(raiz, { subtree: true, childList: true });
  decorar();

  INV.ajuda = { abrirTermo: abrirTermo, termos: T.map(function (t) { return { id: t[0], termo: t[1], categoria: t[2], definicao: t[3] }; }) };
})();
