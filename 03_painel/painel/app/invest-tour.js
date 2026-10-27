/* Tutorial guiado (T7) — percorre a barra do app, o cabeçalho e todas as abas.
   Carregado por último, só pelo app (shell). Não altera dados nem estado de ninguém: só mostra, destaca e explica.
   Material educacional; não é recomendação de investimento. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined' || !window.PB) return;
  var PB = window.PB;
  var barra = document.querySelector('.app-bar');
  if (!barra || document.getElementById('app-tour')) return;

  /* ------------------------------------------------------------------ utilidades */
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
    for (var i = 2; i < arguments.length; i++) anexar(e, arguments[i]);
    return e;
  }
  function anexar(e, k) {
    if (k === null || k === undefined || k === false) return;
    if (Array.isArray(k)) k.forEach(function (x) { anexar(e, x); });
    else e.appendChild(k.nodeType ? k : document.createTextNode(String(k)));
  }
  function norm(s) { return String(s || '').replace(/\s+/g, ' ').trim().toLowerCase(); }
  function par() {
    try { var d = window.dash && window.dash.data('parametros'); return d && d.status === 'ok' && d.data[0] ? d.data[0] : null; } catch (e) { return null; }
  }
  function fd(s) { return s ? String(s).split('-').reverse().join('/') : '—'; }
  function fd2(s) { return s ? fd(s).slice(0, 5) : '—'; }
  function pn(x, d) { return PB.num(x, d === undefined ? 1 : d); }
  function pagina(aba) { return aba ? document.querySelector('[data-page="' + aba + '"]') : document; }
  function celular() { try { return window.matchMedia('(max-width: 640px)').matches; } catch (e) { return false; } }

  /* ------------------------------------------------------------------ localizar elementos */
  function visivel(el) {
    if (!el || !el.getClientRects || !el.getClientRects().length) return false;
    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    return !(el.closest && el.closest('[hidden]'));
  }
  function cardPorTitulo(raiz, titulo) {
    if (!raiz) return null;
    var t = norm(titulo), cards = raiz.querySelectorAll('.pb-card');
    for (var i = 0; i < cards.length; i++) {
      var hd = null, f = cards[i].children;
      for (var j = 0; j < f.length; j++) if (/^H[23]$/.test(f[j].tagName)) { hd = f[j]; break; }
      if (hd && norm(hd.textContent).indexOf(t) === 0) return cards[i];
    }
    return null;
  }
  function porTexto(raiz, seletor, texto) {
    if (!raiz) return null;
    var t = norm(texto), els = raiz.querySelectorAll(seletor);
    for (var i = 0; i < els.length; i++) if (norm(els[i].textContent).indexOf(t) === 0) return els[i];
    return null;
  }
  function resolverUm(sel, aba) {
    if (typeof sel === 'function') { try { return sel(); } catch (e) { return null; } }
    var raiz = pagina(aba), m = /^(card|btn|leg|apos):(.*)$/.exec(sel);
    if (m) {
      if (m[1] === 'card') return cardPorTitulo(raiz, m[2]);
      if (m[1] === 'btn') return porTexto(raiz, 'button, a.pb-btn', m[2]);
      if (m[1] === 'leg') { var lg = porTexto(raiz, 'legend', m[2]); return lg ? lg.parentElement : null; }
      var hd = porTexto(raiz, 'h3', m[2]); return hd ? hd.nextElementSibling : null;
    }
    try { return document.querySelector(sel); } catch (e) { return null; }
  }
  function ajustarAlvo(el) {
    if (!el) return el;
    var tag = el.tagName;
    if (tag === 'INPUT' && (el.type === 'checkbox' || el.type === 'radio')) return el.closest('label') || el;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return el.closest('.inv-field') || el.closest('.pb-controls') || el;
    return el;
  }
  // devolve {el, i} do primeiro seletor que existe e está visível
  function achar(passo) {
    if (!passo.sel) return null;
    var lista = Array.isArray(passo.sel) ? passo.sel : [passo.sel];
    for (var i = 0; i < lista.length; i++) {
      var el = ajustarAlvo(resolverUm(lista[i], passo.aba));
      if (visivel(el)) return { el: el, i: i };
    }
    return null;
  }
  function pai(seletor, ancestral) {
    return function () { var e = document.querySelector(seletor); return e ? e.closest(ancestral) : null; };
  }

  /* ------------------------------------------------------------------ roteiro */
  // cada passo: {cap, aba, sel, titulo, texto (string ou função), ausente (nota quando o bloco não está na tela)}
  var C_INI = 'Início', C_BAR = 'Barra e cabeçalho', C_GER = 'Visão geral', C_RAN = 'Ranking', C_VAL = 'Valor × queda',
    C_PRE = 'Preços', C_ATI = 'Ativo', C_MAC = 'Macro', C_HIS = 'Histórico', C_MET = 'Método', C_SIM = 'Simulação',
    C_COR = 'Corretora', C_ASS = 'Corretora: Assistente de alocação', C_CX = 'Corretora: caixa, transações e ativos',
    C_CFG = 'Configurações', C_FIM = 'Encerramento';

  function roteiro() {
    var p = [];
    function s(cap, aba, sel, titulo, texto, ausente) { p.push({ cap: cap, aba: aba, sel: sel, titulo: titulo, texto: texto, ausente: ausente || null }); }
    function ke() { var x = par(); return x ? pn(x.ke, 1) + '%' : 'o custo de capital (Ke)'; }
    function g() { var x = par(); return x ? pn(x.g, 1) + '%' : 'o crescimento perpétuo (g)'; }
    function dEst() { var x = par(); return x ? fd2(x.data_pre_estresse) + ' → ' + fd2(x.data_estresse) : 'do pregão pré-estresse ao do estresse'; }
    var SEM_SIM = 'Este bloco aparece depois que você toca em “Simular”, com o formulário preenchido e o histórico longo disponível.';
    var SEM_FORM = 'O formulário só aparece quando o histórico longo (serie_longa.json) está carregado. Sem ele, a aba mostra um aviso e a simulação fica desligada: nada é inventado. O histórico chega pelo botão “Atualizar dados” (GitHub Actions); depois recarregue a página.';

    /* ---- início ---- */
    s(C_INI, 'geral', null, 'Tutorial do Painel B3',
      'Este tour percorre a barra do app, o cabeçalho e todas as abas, explicando cada bloco: o que é, de onde vem o dado, como ler e quais cuidados tomar. Avance com o botão ou a seta →, volte com ←, e feche com Esc ou ×. Tudo aqui é material educacional e não é recomendação de compra, venda ou manutenção de ativos.');

    /* ---- barra e cabeçalho ---- */
    s(C_BAR, 'geral', '.app-bar', 'Barra do app',
      'A barra fica fixa no topo enquanto você rola. Ela traz o status dos dados, o botão Tutorial (este tour) e o botão Atualizar dados.');
    s(C_BAR, 'geral', '#app-status', 'Versão e data dos preços',
      'Mostra “Versão vN · preços de DD/MM/AAAA”, lido de parametros.json: a versão da análise e o dia do último fechamento usado no score. Se os dados não puderem ser lidos e não houver cópia salva, aparece “Sem conexão e sem cópia salva dos dados”.');
    s(C_BAR, 'geral', '#app-update', 'Atualizar dados',
      'Abre, em outra aba do navegador, a página do fluxo “Atualizar painel” no GitHub Actions. Ao rodá-lo (é preciso ter permissão no repositório), ele gera uma nova versão: preços (Yahoo), histórico de 5 anos com dividendos, CDI e IPCA (BCB), fundamentos (Fundamentus), score e app. Dados de pesquisa manual, como bancos, crédito dos FIIs e macro, não são renovados por esse botão. Quando a execução terminar, recarregue a página.');
    s(C_BAR, 'geral', '#topo .pb-title', 'Título do painel',
      'O painel pontua 20 ativos fixos da B3, ações e fundos imobiliários (FIIs), de 0 a 1000. O score organiza oportunidades segundo regras explícitas; ele não prevê preços e não é recomendação.');
    s(C_BAR, 'geral', '#takeaway', 'Resumo em uma frase',
      'Informa o líder do score (ticker e pontos), o custo de capital (Ke) usado no valor justo e quantas ações estão abaixo do valor justo, com a lista. Os números vêm de ativos.json e parametros.json e mudam a cada versão. Margem positiva quer dizer preço abaixo do valor calculado pelo modelo, não garantia de alta.');
    s(C_BAR, 'geral', '#topo .pb-meta', 'Versão, data e evento de estresse',
      function () {
        var x = par();
        return 'Repete a versão e a data dos preços e informa o evento de estresse da análise' + (x && x.evento ? ' (nesta versão: ' + x.evento + ')' : '') +
          '. É a partir dele que o painel mede a queda: o “estresse” compara o fechamento do último pregão antes do evento com o do pregão do evento.';
      });
    s(C_BAR, 'geral', 'nav.pb-tabs', 'Abas',
      'As oito primeiras abas (Visão geral a Método) mostram a análise do score. Simulação, Corretora e Configurações são do app e usam dados que ficam só neste aparelho. A aba aberta vai para o endereço (#nome), então você pode guardar o link de uma aba.');

    /* ---- visão geral ---- */
    s(C_GER, 'geral', '#geral .pb-tiles', 'Indicadores de mercado',
      'Cinco cartões do snapshot de mercado (macro.json): Ibovespa no estresse, DI jan/31 (com o ajuste anterior), Selic meta (com a projeção Focus para o fim de 2026), dólar comercial e IPCA 2026 (Focus). Fonte e grau de confiança de cada um estão na aba Macro; no dólar, o cartão avisa que as fontes divergem.');
    s(C_GER, 'geral', '#sinais-card', 'Como os ativos se dividem',
      'Chips com a classificação qualitativa de cada ativo (sinal): Oportunidade, Oportunidade com risco, Qualidade sem margem, Neutro, Risco no rendimento e Armadilha. Cada chip mostra a contagem e os tickers. O sinal vem das notas da análise e é separado do score.');
    s(C_GER, 'geral', '#top3', 'Os três primeiros do score',
      'Cada cartão traz a posição, o segmento e a confiança, o ticker com o score, a margem de segurança (ações) ou o P/VP (FIIs), o DY de 12 meses e a variação no estresse. Abaixo vêm a tese e o risco principais. O botão “Abrir” leva ao detalhe do ativo.');
    s(C_GER, 'geral', '#ranking-chart-card', 'Score por pilar',
      'Barras empilhadas de 0 a 1000 pontos: desconto (P1, até 300), solidez (P2, até 250), qualidade (P3, até 250) e proventos (P4, até 200), nas cores da legenda. O número à direita é o score total. O ticker aparece em vermelho quando o sinal é Armadilha. Passe o mouse para ver os pontos por pilar e a confiança; clique numa barra para abrir o ativo.');

    /* ---- ranking ---- */
    s(C_RAN, 'ranking', '#ranking .pb-controls', 'Busca e filtros',
      'A busca filtra a tabela por ticker, nome ou segmento. Os botões Todos, Ações e FIIs filtram por classe.');
    s(C_RAN, 'ranking', '#tabela', 'Tabela completa',
      'Uma linha por ativo, na ordem do ranking. Clique no cabeçalho de uma coluna para ordenar (de novo para inverter) e numa linha para abrir o ativo. Em telas estreitas algumas colunas ficam escondidas.');
    s(C_RAN, 'ranking', ['#tabela th[data-field="score"]', '#tabela'], 'Score e posição',
      'O score vai de 0 a 1000 e a barra ao lado usa a cor do sinal. A posição (#) é a ordem pelo score. Scores próximos não são diferença real de qualidade: veja a robustez na aba Histórico.');
    s(C_RAN, 'ranking', ['#tabela th[data-field="p1"]', '#tabela'], 'Colunas P1 a P4',
      'Pontos de cada pilar: P1 desconto (máximo 300), P2 solidez (250), P3 qualidade (250) e P4 proventos (200). A soma dos quatro é o score. Dado ausente não vale zero: o peso dele é redistribuído dentro do pilar.');
    s(C_RAN, 'ranking', ['#tabela th[data-field="confianca"]', '#tabela'], 'Confiança',
      'Alta, Média ou Baixa é um julgamento da análise sobre a qualidade dos dados, não uma probabilidade. Alta pede cobertura de pelo menos 95%, fontes sem divergência material e balanço recente; Média indica divergência ou insumo crítico mais fraco; Baixa, lacuna no insumo mais importante ou anomalias.');
    s(C_RAN, 'ranking', ['#tabela th[data-field="preco_atual"]', '#tabela'], 'Preço e variações',
      function () {
        var x = par();
        return 'Preço R$ é o fechamento da data de referência' + (x ? ' (' + fd(x.data_ref) + ')' : '') + '. Estresse % é a variação do fechamento de ' + dEst() +
          '. 1 mês % vai do fechamento de 1 mês antes até o fechamento atual. Vermelho é queda, verde é alta.';
      });
    s(C_RAN, 'ranking', ['#tabela th[data-field="dy"]', '#tabela'], 'DY e P/VP',
      'DY % é o dividend yield dos últimos 12 meses: nas ações vem do Fundamentus (ajustado quando há provento extraordinário identificado) e nos FIIs é calculado dos rendimentos sobre o preço. P/VP é o preço dividido pelo valor patrimonial por ação ou cota. Yield alto pode refletir queda de preço ou distribuição que não se repete.');
    s(C_RAN, 'ranking', ['#tabela th[data-field="ms"]', '#tabela'], 'MS e valor justo',
      'MS % é a margem de segurança: P/VP justo ÷ P/VP atual − 1, só para ações. Positiva significa preço abaixo do valor justo do modelo. Justo R$ é esse valor por ação. Os dois dependem das premissas de Ke e g (aba Método).');
    s(C_RAN, 'ranking', ['#tabela th[data-field="vol_ratio"]', '#tabela'], 'Volume ÷ média',
      'Volume negociado no dia do estresse dividido pela média dos até 20 pregões anteriores. Valores bem acima de 1x indicam dia de negociação fora do comum; é um sinal de atenção, não de compra.');

    /* ---- valor x queda ---- */
    s(C_VAL, 'valor', '#scatter-acoes', 'Queda no estresse × margem de segurança',
      'Cada bolinha é uma ação: no eixo horizontal, a variação no estresse; no vertical, a margem de segurança (limitada a −100%). Acima da linha tracejada “valor justo” o preço está abaixo do valor calculado. A cor é o sinal da legenda. Passe o mouse para ver preço, valor justo e score; clique para abrir o ativo.');
    s(C_VAL, 'valor', '#ms-bars', 'Margem de segurança por ação',
      function () {
        return 'Barras ordenadas da maior para a menor margem. Verde indica margem positiva. −100% significa ROE normalizado menor ou igual a g: o modelo de valor justo não se aplica (aparece "n/a"). Valor justo = P/VP justo (ROE, Ke ' + ke() + ' e g ' + g() +
          ') × valor patrimonial por ação. À direita, a margem em %. O ROE normalizado aparece ao passar o mouse.';
      });
    s(C_VAL, 'valor', '#scatter-fiis', 'FIIs: P/VP × dividend yield',
      function () {
        var x = par();
        return 'Cada ponto é um FII: P/VP na horizontal e DY de 12 meses na vertical. A linha tracejada horizontal é o DI jan/28 líquido de IR (15%), usado pelo score como referência de renda fixa' + (x ? ' (' + pn(x.cdi_liq, 2) + '%)' : '') +
          '; a vertical pontilhada marca P/VP = 1 quando esse valor cabe no gráfico. Círculo vazado: o FFO cobre menos de 85% da distribuição, ou seja, o rendimento pago pode não se sustentar.';
      });

    /* ---- preços ---- */
    s(C_PRE, 'precos', '#multiples', 'Pequenos múltiplos em base 100',
      'Um quadro por ativo, na ordem do ranking, todos na mesma escala vertical. O preço é convertido para base 100 no fechamento de 1 mês antes da data de referência (a data aparece no texto da aba). A linha cinza é o Ibovespa; o tracejado vertical marca a data de referência. O título de cada quadro traz a posição, o ticker e a variação em 1 mês. Passe o mouse para ver data, fechamento e Ibovespa; clique para abrir o ativo.');

    /* ---- ativo ---- */
    s(C_ATI, 'ativo', '#ativo .pb-controls', 'Escolher o ativo',
      'A lista traz os ativos na ordem do ranking (“posição. ticker · nome”). Clicar num ativo em qualquer outra aba também abre esta tela já com ele selecionado.');
    s(C_ATI, 'ativo', '#ativo-resumo', 'Resumo do ativo',
      'Ticker e score, nome, segmento, posição no ranking, status do cálculo e cobertura (percentual do peso do score que tinha dado). O chip mostra o sinal e a confiança. Abaixo ficam a tese, o risco e uma nota da análise. Status “definitivo” pede cobertura de pelo menos 90%; “provisório”, entre 75% e 90%.');
    s(C_ATI, 'ativo', '#ativo-pilares', 'Pontos por pilar',
      'Quatro barras mostram quanto o ativo fez em cada pilar contra o máximo possível: P1 até 300, P2 até 250, P3 até 250 e P4 até 200. Serve para ver de onde vem o score: desconto, solidez, qualidade ou proventos.');
    s(C_ATI, 'ativo', '#ativo-preco', 'Fechamento diário',
      'Linha dos fechamentos do período coletado (cerca de 3 meses). Os quatro círculos marcam 1 mês antes, 1 semana antes, o pré-estresse e o estresse, com as datas dos parâmetros da versão. Passe o mouse para ler a data e o preço.');
    s(C_ATI, 'ativo', '#ativo-indicadores', 'Indicadores de ações',
      'Para ações: preços de referência e variações, queda do pico de 3 meses, volume ÷ média, DY, P/VP, patrimônio líquido, P/L, EV/EBITDA, ROE de 12 meses e normalizado, margem líquida, earnings yield (lucro ÷ preço), payout, alavancagem (DL/EBITDA, DL/PL nas incorporadoras, CET1 nos bancos), valor justo e margem de segurança. Em bancos entram inadimplência de 90 dias e cobertura de provisões. “N/D” significa dado não disponível.');
    s(C_ATI, 'ativo', '#ativo-indicadores', 'Indicadores de FIIs',
      'Para FIIs: os mesmos preços e variações, DY, P/VP e patrimônio, mais valor patrimonial por cota, FFO yield, FFO ÷ distribuição (em amarelo abaixo de 85%), passivo ÷ ativo, venda de ativos ÷ distribuição e vacância, quando existe. A última linha informa a data do balanço ou relatório usado.');

    /* ---- macro ---- */
    s(C_MAC, 'macro', '#busca-macro', 'Filtrar indicadores',
      'O filtro procura o texto em qualquer coluna da tabela de indicadores.');
    s(C_MAC, 'macro', '#tabela-macro', 'Snapshot de mercado',
      'Indicadores coletados na data da versão (macro.json): categoria, indicador, valor, unidade, data, fonte, confiança (da fonte, em alta, média ou baixa) e observação. O valor é mostrado como texto, no formato em que foi coletado. Confira a data antes de usar um número: mercado muda todo dia.');

    /* ---- histórico ---- */
    s(C_HIS, 'historico', '#tabela-hist', 'Score por versão',
      'Uma linha por ativo e uma coluna de score para cada versão guardada; a última coluna, Variação, compara as duas últimas versões. Cada atualização cria uma versão nova e as anteriores ficam em 03_painel/historico/. Clique numa linha para abrir o ativo.');
    s(C_HIS, 'historico', '#heatmap', 'Robustez do ranking',
      'Mapa de calor com a posição de cada ativo em seis cenários: o caso-base, três combinações de pesos dos pilares e custo de capital de 16% e de 20%. Quanto mais escuro, melhor a posição, e o número dentro da célula é essa posição. Ativos que mantêm a posição em todos os cenários têm ranking mais robusto.');

    /* ---- método ---- */
    s(C_MET, 'metodo', 'card:Parâmetros', 'Parâmetros do modelo',
      function () {
        var x = par();
        return 'Custo de capital (Ke)' + (x ? ' de ' + pn(x.ke, 1) + '%' : '') + ' e crescimento perpétuo (g)' + (x ? ' de ' + pn(x.g, 1) + '%' : '') +
          ' entram no valor justo das ações. O DI jan/28 líquido de IR (15%)' + (x ? ' (' + pn(x.cdi_liq, 2) + '%)' : '') + ' é a referência de renda fixa para os FIIs, que são isentos de IR. A data da versão diz quando o score foi calculado.';
      });
    s(C_MET, 'metodo', 'card:Como ler o score', 'Como ler o score',
      'P1 mede desconto contra o valor justo e queda ajustada pela qualidade. P2 mede alavancagem, liquidez e lucro sobre preço. P3 mede ROE, eficiência, crescimento e consistência. P4 mede dividend yield e se ele é coberto pelo lucro. Dado ausente não vale zero: o peso é redistribuído no pilar.');
    s(C_MET, 'metodo', 'card:Como ler o score', 'Cobertura e status',
      'Cobertura é a soma dos pesos que tinham dado dividida por 1000. A partir de 90% o score é “definitivo”; entre 75% e 90%, “provisório”; abaixo de 75%, “não calculável”. A confiança (Alta, Média, Baixa) é outro critério, qualitativo, e aparece no ranking e no resumo do ativo.');
    s(C_MET, 'metodo', 'card:Como ler o score', 'Pilares nas ações: P1 e P2',
      'P1 (até 300) combina a margem de segurança (até 150), a queda no estresse em relação ao Ibovespa ponderada pela qualidade (até 60) e a tendência do lucro recente (até 90). P2 (até 250) soma alavancagem (até 100; nos bancos, CET1), liquidez corrente (até 50; nos bancos, cobertura de provisões) e lucro sobre preço contra o Ke (até 100).');
    s(C_MET, 'metodo', 'card:Como ler o score', 'Pilares nas ações: P3 e P4',
      'P3 (até 250) soma ROE normalizado (até 100), ROIC (até 75; nos bancos, inadimplência de 90 dias), crescimento (até 50) e consistência do lucro (até 25); estatais perdem 15 pontos pelo risco de governança. P4 (até 200) soma dividend yield (até 80), cobertura do dividendo pelo lucro, via payout (até 80), e consistência (até 40).');
    s(C_MET, 'metodo', 'card:Como ler o score', 'Pilares nos FIIs',
      'Nos FIIs, P1 usa o P/VP (com ajuste pela cobertura do FFO), a queda relativa à mediana dos FIIs e a tendência do FFO. P2 usa passivo ÷ ativo, volume negociado e FFO yield contra o DI jan/28 líquido de IR. P3 olha vacância e número de imóveis (tijolo) ou qualidade e perfil do crédito (papel), além do porte. P4 usa DY, cobertura da distribuição pelo FFO e dependência de venda de ativos.');
    s(C_MET, 'metodo', 'card:Valor justo', 'Valor justo e margem de segurança',
      function () {
        return 'P/VP justo = (ROE − g) ÷ (Ke − g), com Ke ' + ke() + ' e g ' + g() + '. O ROE usado é o normalizado (média do ROE de 12 meses e do último trimestre anualizado); em petróleo e mineração vale só o de 12 meses. ' +
          'Margem de segurança = P/VP justo ÷ P/VP atual − 1, e o valor justo em reais é o P/VP justo vezes o valor patrimonial por ação. É um modelo simples: mude as premissas e o resultado muda.';
      });
    s(C_MET, 'metodo', '#metodo .pb-disc', 'Aviso legal',
      'O painel é exclusivamente educacional e informativo. Não é recomendação individualizada de compra, venda ou manutenção, nem substitui análise adequada ao seu perfil e tolerância ao risco. Dados e indicadores mudam, e resultados passados não garantem resultados futuros.');

    /* ---- simulação ---- */
    s(C_SIM, 'simulacao', '#simulacao form', 'Simulação histórica de carteira',
      'Mostra o que teria acontecido com aportes numa carteira escolhida, usando preços e dividendos reais do passado (histórico de 5 anos baixado pelo GitHub Actions). É uma análise do passado: resultado histórico simulado não garante resultado futuro.', SEM_FORM);
    s(C_SIM, 'simulacao', '#sim-busca', 'Ativos da carteira',
      'Busque e marque os ativos que entram na simulação. Só aparecem ativos com histórico longo, e cada um mostra o intervalo de datas disponível. Ativos personalizados só têm histórico depois de entrar na lista “extras” do config.json (veja Configurações).', SEM_FORM);
    s(C_SIM, 'simulacao', 'leg:Pesos da carteira', 'Pesos da carteira',
      'Defina o percentual de cada ativo marcado; a soma precisa ser 100%. O botão “Pesos iguais” divide por igual e o texto ao lado mostra a soma atual.', SEM_FORM);
    s(C_SIM, 'simulacao', pai('#sim-ini', '.inv-sim-grid'), 'Aportes e dia do aporte',
      'Aporte inicial é o valor investido no começo do período. Aporte mensal é repetido todo mês, no 1º pregão em ou depois do dia escolhido (de 1 a 28). Valores em reais; erros aparecem junto de cada campo.', SEM_FORM);
    s(C_SIM, 'simulacao', 'leg:Período', 'Período',
      'Escolha 12 meses, 3 anos, 5 anos ou datas personalizadas. Opções sem dados suficientes ficam desabilitadas e a tela diz desde quando há histórico para os ativos marcados.', SEM_FORM);
    s(C_SIM, 'simulacao', '#sim-estrategia', 'Estratégia',
      '“Análise histórica: pesos fixos” divide cada aporte pelos pesos escolhidos; como os pesos são definidos hoje, conhecendo o passado, há viés de retrospectiva e o resultado tende a parecer melhor do que seria na época. “Aporte no que está abaixo do peso” direciona cada aporte aos ativos mais abaixo do peso-alvo, usando só valores do próprio dia e sem vender.', SEM_FORM);
    s(C_SIM, 'simulacao', '#sim-dividendos', 'Dividendos',
      'Reinvestir compra mais do mesmo ativo; acumular em caixa guarda o dinheiro sem rendimento; ignorar considera só o retorno de preço. A escolha muda muito o resultado de ativos que pagam proventos altos.', SEM_FORM);
    s(C_SIM, 'simulacao', '#sim-custo', 'Custo por compra',
      'Percentual descontado do valor de cada compra, para representar corretagem e taxas. Zero ignora custos.', SEM_FORM);
    s(C_SIM, 'simulacao', '#sim-inteiros', 'Unidades inteiras',
      'Marcado, só compra quantidades inteiras de cada ativo e o troco fica em caixa até o próximo aporte. Desmarcado, admite frações, o que não existe na B3 para ações.', SEM_FORM);
    s(C_SIM, 'simulacao', 'leg:Comparar com', 'Benchmarks',
      'Compara a carteira com o Ibovespa (retorno total) e com o CDI, recebendo os mesmos aportes nas mesmas datas. Assim a comparação é de estratégia, não de quanto dinheiro entrou.', SEM_FORM);
    s(C_SIM, 'simulacao', '#sim-rodar', 'Simular',
      'O botão só roda com tudo válido; senão aponta os campos com erro. O que você preenche fica salvo como rascunho neste aparelho para a próxima visita.', SEM_FORM);
    s(C_SIM, 'simulacao', 'card:Resultado', 'Resultado: valores',
      'Os cartões mostram aporte inicial, aportes adicionais, total investido, valor final e lucro (ou prejuízo). O retorno acumulado é o lucro dividido pelo total investido. Dividendos recebidos e custos aparecem no texto acima dos cartões.', SEM_SIM);
    s(C_SIM, 'simulacao', 'card:Resultado', 'Resultado: TWR, XIRR e IPCA',
      'TWR é o retorno da carteira sem o efeito dos aportes (encadeia o retorno entre datas); só é anualizado em períodos de 1 ano ou mais. XIRR é o retorno anual dos seus aportes, considerando quando cada um entrou. O IPCA do período e o retorno real (TWR descontado do IPCA) dependem da série de IPCA estar disponível.', SEM_SIM);
    s(C_SIM, 'simulacao', 'card:Evolução do patrimônio', 'Evolução do patrimônio',
      'Linhas do valor da carteira, do total investido (em degraus, tracejado), do Ibovespa e do CDI com os mesmos aportes. O que estiver acima do total investido é ganho. Passe o mouse para ler os valores de cada linha na data.', SEM_SIM);
    s(C_SIM, 'simulacao', 'card:Por ativo', 'Resultado por ativo',
      'Para cada ativo: quanto foi investido, valor final, lucro, dividendos, contribuição para o lucro da carteira e retorno de preço. Retorno de preço é a variação do fechamento entre o início e o fim do período, sem dividendos.', SEM_SIM);
    s(C_SIM, 'simulacao', 'card:Comparação com benchmarks', 'Comparação com benchmarks',
      'Valor final, lucro, retorno sobre o investido, TWR e XIRR da carteira simulada ao lado do Ibovespa e do CDI. Se um benchmark não tiver dados, a tela avisa em vez de inventar.', SEM_SIM);
    s(C_SIM, 'simulacao', 'card:Premissas e avisos', 'Premissas e avisos',
      'Lista as regras usadas e os avisos do cálculo. Com pesos fixos, inclui o alerta de viés de retrospectiva. O texto fixo lembra: resultado histórico simulado não garante resultado futuro, e isto é material educacional.', SEM_SIM);

    /* ---- corretora ---- */
    s(C_COR, 'corretora', 'card:Resumo da carteira real', 'Resumo da carteira real',
      'Cartões com caixa disponível (depósitos − retiradas − compras + vendas), valor de mercado das posições, total, custo das posições (inclui taxas) e resultado não realizado. Os preços usados são os de referência, com a data indicada; ativo sem preço fica de fora e gera aviso. Tudo vem do que você registrou, nada é lido da corretora.');
    s(C_COR, 'corretora', 'card:Posições', 'Posições',
      'Posições reais registradas por você, sem simulações nem propostas. Colunas: ticker, classe, quantidade, preço médio, custo, preço de referência com o chip do estado do preço, valor, resultado (R$ e %), % atual (sobre as posições com preço, sem o caixa) e alvo %. O alvo é editável na própria linha, fica neste aparelho e a soma dos alvos avisa quando passa de 100%. Antes do primeiro registro, o card mostra só uma mensagem de estado vazio.');
    s(C_COR, 'corretora', '#corretora .pb-chart', 'Atual × alvo',
      'Barras horizontais comparam o percentual atual de cada ativo com o alvo que você definiu. Serve para ver quem está acima ou abaixo da meta antes de planejar um aporte. Aparece quando há posições ou alvos.', 'O gráfico aparece quando houver posições ou alvos definidos.');
    s(C_COR, 'corretora', 'card:Comprar ou vender', 'Comprar ou vender um ativo',
      'Aqui você estima quantas unidades cabem num valor e depois registra o que foi de fato executado na sua corretora. A estimativa não é ordem: este painel não envia ordens e nenhuma cotação vira transação sozinha. Os botões Comprar e Vender alternam o tipo de operação.');
    s(C_COR, 'corretora', '#cor-ativo', 'Escolher o ativo',
      'Digite o ticker ou o nome e escolha na lista (os 20 do painel e os seus ativos próprios). Ao escolher, aparecem ticker, nome, classe, mercado B3, moeda BRL e lote, e o app busca a cotação.');
    s(C_COR, 'corretora', 'btn:Atualizar cotação', 'Estado do preço',
      'O chip diz de onde vem o preço. “Ao vivo” é a cotação da brapi, com o seu token e o atraso do seu plano. “Atrasado” é o último fechamento salvo pelo GitHub Actions, com a data; passando de 5 dias, é marcado como desatualizado. “Manual” foi digitado por você; “indisponível” significa que não há preço. O botão busca de novo.');
    s(C_COR, 'corretora', '#cor-preco', 'Preço',
      'Vem preenchido pela cotação, mas você pode digitar. Ao digitar, o preço vira “manual”, nenhuma atualização o sobrescreve e aparece o botão “Usar cotação” para voltar ao automático.');
    s(C_COR, 'corretora', '#cor-valor', 'Valor a investir (ou a vender)',
      'Quanto você quer aplicar. A partir dele o app calcula a quantidade estimada respeitando o lote do ativo (1 = fracionário, 100 = lote padrão) e as taxas da aba Configurações. Na venda, a quantidade não passa do que você tem registrado.');
    s(C_COR, 'corretora', 'apos:Estimativa', 'Estimativa',
      'Quantidade, valor bruto, taxas, total e sobra do valor. É uma estimativa com o preço da tela, não um valor que será cobrado: o preço real de execução pode ser outro.');
    s(C_COR, 'corretora', 'form[aria-labelledby="cor-reg-t"]', 'Registrar operação executada',
      'Preencha o que realmente aconteceu na corretora: data e hora, preço executado, quantidade executada, taxas (pré-calculadas, edite se a nota de corretagem for diferente) e observação opcional. O total é recalculado na hora. Se o caixa ficar negativo, há um aviso, mas o registro não é bloqueado. A origem do preço é gravada como “manual” se você o editou.');
    s(C_COR, 'corretora', '#cor-confirma', 'Confirmação obrigatória',
      'Só depois de marcar “Confirmo que esta ordem foi executada na corretora” o botão Registrar grava a transação. Proposta ou estimativa não é ordem executada: se você não executou, não registre.');
    s(C_ASS, 'corretora', 'card:Assistente de alocação', 'Assistente de alocação',
      'Propõe como dividir um aporte entre os ativos que você escolher, em cinco passos. A proposta não é uma ordem e nada é comprado até você registrar o que executou. O estado do assistente fica salvo como rascunho neste aparelho; o botão Recomeçar limpa.');
    s(C_ASS, 'corretora', '#inv-assistente .inv-steps', 'Os cinco passos',
      'Ativos, Orçamento e regras, Cálculo, Proposta, Revisar e registrar. O passo atual fica destacado, e Voltar e Avançar navegam entre eles. A descrição dos passos a seguir vale para qualquer momento: o assistente mostra um passo por vez.');
    s(C_ASS, 'corretora', ['#inv-assistente .inv-asst', 'card:Assistente de alocação'], 'Passo 1: Ativos',
      'Busque e marque os ativos que podem receber o aporte. A tabela mostra classe, preço de referência com o estado do preço, alvo atual, exposição atual (percentual do valor de mercado da carteira real registrada, sem caixa nem simulações) e o score do painel. Sem ao menos um ativo marcado não dá para avançar.');
    s(C_ASS, 'corretora', ['#inv-assistente .inv-asst', 'card:Assistente de alocação'], 'Passo 2: Orçamento e regras',
      'Informe o caixa desta rodada (vem do caixa registrado, mas é editável), uma reserva que não será usada, corretagem fixa e emolumentos, e para cada ativo o alvo % e um teto % opcional. A intensidade do score vai de 0 a 100%. “Buscar cotações” atualiza os preços; editar um preço o torna manual. Salvar os alvos na carteira é opcional.');
    s(C_ASS, 'corretora', ['#inv-assistente .inv-asst', 'card:Assistente de alocação'], 'O papel do score',
      'O score do painel (0–1000) só reordena a prioridade entre ativos abaixo da meta. Ele já inclui queda, solidez, qualidade e proventos, por isso o assistente não soma outros indicadores, para não contar duas vezes. Ativo sem score é tratado como neutro, e o score não prevê retorno.');
    s(C_ASS, 'corretora', ['#inv-assistente .inv-asst', 'card:Assistente de alocação'], 'Passo 3: Cálculo',
      'O cálculo segue três prioridades: primeiro as metas de alocação (quanto falta a cada ativo para o alvo, considerando o total da carteira depois do aporte e respeitando tetos); depois o score, que pesa a necessidade de cada ativo conforme a intensidade; por fim as quantidades inteiras no lote, com custos. Ativo sem preço recebe zero nesta rodada. Erros de validação aparecem aqui.');
    s(C_ASS, 'corretora', ['#inv-assistente .inv-asst', 'card:Assistente de alocação'], 'Passo 4: Proposta',
      'A tabela mostra ativo, classe, preço, % atual, % alvo, gap, score (e fator), valor proposto, quantidade, custos, total, % depois e o motivo. Os totais (orçamento, reserva, investido, custos e sobra) mudam na hora se você editar quantidades, que precisam ser múltiplos do lote. Ultrapassar o disponível bloqueia o avanço. Está rotulada “Proposta — nada foi comprado.”');
    s(C_ASS, 'corretora', ['#inv-assistente .inv-asst', 'card:Assistente de alocação'], 'Passo 5: Revisar e registrar',
      'Para cada linha, marque “executada” e confirme preço e quantidade realmente executados. Marque também a confirmação geral de que as ordens foram executadas na corretora. O botão “Registrar N compras” só habilita com confirmação e pelo menos uma linha marcada; todas são validadas antes de gravar, e se alguma estiver inválida nada é registrado. Depois aparece o resumo e o rascunho é limpo.');
    s(C_CX, 'corretora', 'card:Caixa', 'Caixa',
      'Registre depósitos e retiradas da conta na corretora, com valor, data e hora e observação. Compras reduzem e vendas aumentam o caixa automaticamente. O saldo mostrado é o que você registrou, não o saldo real da conta.');
    s(C_CX, 'corretora', 'card:Transações', 'Transações',
      'Lista as transações efetivas: data, tipo, ticker, quantidade, preço, taxas, total, fonte do preço, observação e ações. “Corrigir” cria uma transação nova que substitui a anterior; “Cancelar” pede um motivo e cria um cancelamento. O original nunca é apagado, e a opção “Mostrar correções e cancelamentos” exibe o histórico completo. Antes da primeira transação, o card mostra “Nenhuma transação registrada”.');
    s(C_CX, 'corretora', 'card:Meus ativos', 'Meus ativos',
      'Cadastre ativos que não estão nos 20 do painel: ticker no formato B3 (4 letras e 1 ou 2 dígitos), nome, classe, lote e preço manual opcional. Só vale para reais e B3. Eles entram na Corretora e no Assistente; para entrar na Simulação, o ticker precisa estar na lista “extras” do config.json. Não é possível remover um ativo que tenha posição ou transação.');

    /* ---- configurações ---- */
    s(C_CFG, 'config', 'card:Configurações', 'Configurações',
      'Reúne cotações, custos, ativos extras, backup e fontes de dados. Se o navegador não permitir gravar dados locais, um aviso diz que tudo se perde ao fechar a página. Material educacional; seus dados ficam apenas neste aparelho.');
    s(C_CFG, 'config', 'card:Cotações', 'Cotações (brapi.dev)',
      'Sem token, o app usa o último fechamento salvo pelo GitHub Actions, marcado como “atrasado”. Para ver o preço do dia, crie uma conta gratuita em brapi.dev, copie o seu token na área de tokens/API e cole abaixo. O atraso e os limites das cotações dependem do seu plano na brapi; consulte o site deles.');
    s(C_CFG, 'config', '#inv-cfg-token', 'Token da brapi',
      'Campo de senha com botão para mostrar ou ocultar. “Salvar e testar” grava e consulta PETR4 para checar se o token funciona; “Apagar token” remove. O token fica só neste navegador (localStorage): não vai para o GitHub nem para o backup.');
    s(C_CFG, 'config', 'card:Custos padrão', 'Custos padrão',
      'Corretagem fixa por ordem (R$), emolumentos e taxas (%), lote padrão dos 20 ativos (1 = fracionário, 100 = lote padrão) e intensidade padrão do score. São pontos de partida para a Corretora e o Assistente, e você pode ajustar em cada operação. Valores inválidos são recusados com mensagem.');
    s(C_CFG, 'config', 'card:Ativos extras', 'Ativos extras no histórico',
      'Lista seus ativos personalizados e se já têm série longa. Para a Simulação enxergá-los, o ticker precisa entrar no config.json; o app mostra o trecho “extras” pronto para copiar e o link de edição no GitHub. O histórico chega na próxima execução de “Atualizar dados”.');
    s(C_CFG, 'config', 'card:Backup', 'Backup',
      'Exportar baixa um arquivo .json com carteira, transações, alvos e ativos próprios, sem o token. Importar substitui todos os dados do aparelho e antes pede confirmação com o botão “Substituir dados”. Apagar tudo exige digitar APAGAR. Limpar os dados do navegador, trocar de aparelho ou desinstalar o app apaga a carteira: exporte com frequência.');
    s(C_CFG, 'config', 'card:Fontes de dados', 'Fontes de dados',
      'Mostra se serie_longa.json e indices.json foram carregados, quando foram gerados, o período coberto, a fonte e eventuais falhas. Se aparecer “indisponível”, o resto do app continua funcionando; o histórico longo vem do botão “Atualizar dados”.');

    /* ---- encerramento ---- */
    s(C_FIM, null, null, 'Antes de concluir',
      'Este painel é material educacional e não é recomendação de compra, venda ou manutenção de ativos. Preço “atrasado” é o último fechamento; “ao vivo” depende do seu token e plano; “manual” foi digitado por você. Proposta não é ordem executada: registre só o que ocorreu na corretora. A simulação não garante futuro, e os dados da carteira ficam só neste aparelho (faça backup).');
    return p;
  }

  /* ------------------------------------------------------------------ interface */
  var botao = h('button', { type: 'button', class: 'app-btn', id: 'app-tour', 'aria-haspopup': 'dialog' }, 'Tutorial');
  var atualizar = document.getElementById('app-update');
  if (atualizar && atualizar.parentNode === barra) barra.insertBefore(botao, atualizar); else barra.appendChild(botao);

  var raiz, spot, card, elCap, elNum, elTitulo, elTexto, elNota, elStatus, selCap, bVoltar, bAvancar, bFechar;
  var passos = [], idx = 0, aberto = false, origem = null, scrollOrigem = 0, seq = 0, pendente = 0;

  function css() {
    if (document.getElementById('inv-tour-css')) return;
    var st = document.createElement('style');
    st.id = 'inv-tour-css';
    st.textContent = [
      '#app-tour{cursor:pointer;margin-left:auto}',
      '#app-tour:hover{background:var(--color-bg)}',
      '.inv-tour{position:fixed;inset:0;z-index:1000;pointer-events:none}',
      '.inv-tour[hidden]{display:none}',
      '.inv-tour-spot{position:fixed;left:0;top:0;width:0;height:0;border-radius:var(--cds-radius);pointer-events:none;',
      'box-shadow:0 0 0 2px var(--color-panel),0 0 0 5px var(--c0),0 0 0 9999px rgb(0 0 0 / .42)}',
      '.inv-tour-spot.sem-alvo{box-shadow:0 0 0 9999px rgb(0 0 0 / .42)}',
      '@media (prefers-reduced-motion:no-preference){.inv-tour-spot{transition:left var(--cds-dur-slow) var(--cds-ease-out),top var(--cds-dur-slow) var(--cds-ease-out),width var(--cds-dur-slow) var(--cds-ease-out),height var(--cds-dur-slow) var(--cds-ease-out)}}',
      '.inv-tour-card{position:fixed;left:12px;top:12px;box-sizing:border-box;width:min(26rem,calc(100vw - 24px));max-height:calc(100vh - 24px);overflow:auto;pointer-events:auto;',
      'background:var(--color-panel);color:var(--color-fg);border:1px solid var(--color-border-line);border-radius:var(--cds-radius);box-shadow:var(--cds-shadow-popover);',
      'padding:var(--cds-pad-lg);display:grid;gap:var(--cds-gap-sm);font-family:var(--font-anthropic-sans);font-size:var(--cds-font-size-body);line-height:1.5}',
      '.inv-tour-card:focus{outline:none}',
      '.inv-tour-card:focus-visible{outline:2px solid var(--color-fg);outline-offset:2px}',
      '.inv-tour-top{display:flex;gap:var(--cds-gap-sm);align-items:flex-start;justify-content:space-between}',
      '.inv-tour-meta{display:grid;gap:2px;min-width:0;color:var(--color-fg-muted);font-size:var(--cds-font-size-caption)}',
      '.inv-tour-card h2{margin:0;font-size:var(--cds-font-size-heading);font-weight:var(--cds-font-weight-medium);text-wrap:balance}',
      '.inv-tour-texto{display:grid;gap:var(--cds-gap-xs)}',
      '.inv-tour-texto p,.inv-tour-nota{margin:0}',
      '.inv-tour-nota{color:var(--color-fg-muted);font-size:var(--cds-font-size-caption);border-left:3px solid var(--color-warn);padding-left:var(--cds-pad-sm)}',
      '.inv-tour-nota[hidden]{display:none}',
      '.inv-tour-nav{display:flex;flex-wrap:wrap;gap:var(--cds-gap-sm);align-items:center;justify-content:space-between}',
      '.inv-tour-nav .inv-tour-bts{display:flex;gap:var(--cds-gap-sm)}',
      '.inv-tour-card .pb-btn,.inv-tour-card .pb-in{font:inherit;font-size:var(--cds-font-size-caption);border:1px solid var(--color-border-line);border-radius:var(--cds-radius);padding:var(--cds-pad-xs) var(--cds-pad-sm);background:var(--color-bg);color:var(--color-fg);cursor:pointer}',
      '.inv-tour-card .pb-btn:disabled{opacity:.5;cursor:default}',
      '.inv-tour-card .inv-tour-prox{background:var(--c0);color:var(--color-panel);border-color:var(--c0)}',
      '.inv-tour-card .pb-btn:focus-visible,.inv-tour-card .pb-in:focus-visible{outline:2px solid var(--color-fg);outline-offset:2px}',
      '.inv-tour-card .inv-tour-x{padding:var(--cds-pad-xs) .6rem;line-height:1}',
      '.inv-tour-cap{display:grid;gap:2px;min-width:0;flex:1 1 10rem}',
      '.inv-tour-cap label{color:var(--color-fg-muted);font-size:var(--cds-font-size-caption)}',
      '.inv-tour-cap select{max-width:100%;width:100%}',
      '.inv-tour-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}',
      '@media (max-width:640px){.inv-tour-card{left:0 !important;right:0 !important;top:auto !important;bottom:0 !important;width:auto;max-height:46vh;',
      'border-radius:var(--cds-radius) var(--cds-radius) 0 0;padding-bottom:calc(var(--cds-pad-lg) + env(safe-area-inset-bottom,0px))}}'
    ].join('');
    document.head.appendChild(st);
  }

  function montar() {
    if (raiz) return;
    css();
    spot = h('div', { class: 'inv-tour-spot sem-alvo', 'aria-hidden': 'true' });
    elCap = h('span', null);
    elNum = h('span', null);
    elTitulo = h('h2', { id: 'inv-tour-titulo' });
    elTexto = h('div', { class: 'inv-tour-texto', id: 'inv-tour-texto' });
    elNota = h('p', { class: 'inv-tour-nota', hidden: true });
    elStatus = h('div', { class: 'inv-tour-sr', role: 'status', 'aria-live': 'polite' });
    bFechar = h('button', { type: 'button', class: 'pb-btn inv-tour-x', 'aria-label': 'Fechar tutorial', onclick: function () { fechar(true); } }, '×');
    selCap = h('select', { class: 'pb-in', id: 'inv-tour-cap', onchange: function () { var v = parseInt(selCap.value, 10); if (!isNaN(v)) ir(v, 1); } });
    bVoltar = h('button', { type: 'button', class: 'pb-btn', onclick: function () { ir(idx - 1, -1); } }, 'Voltar');
    bAvancar = h('button', { type: 'button', class: 'pb-btn inv-tour-prox', onclick: function () { if (idx >= passos.length - 1) fechar(true); else ir(idx + 1, 1); } }, 'Avançar');
    card = h('div', { class: 'inv-tour-card', role: 'dialog', 'aria-labelledby': 'inv-tour-titulo', 'aria-describedby': 'inv-tour-texto', tabindex: '-1' },
      h('div', { class: 'inv-tour-top' },
        h('div', { class: 'inv-tour-meta' }, elCap, elNum),
        bFechar),
      elTitulo, elTexto, elNota,
      h('div', { class: 'inv-tour-nav' },
        h('div', { class: 'inv-tour-cap' }, h('label', { for: 'inv-tour-cap' }, 'Ir para o capítulo'), selCap),
        h('div', { class: 'inv-tour-bts' }, bVoltar, bAvancar)),
      elStatus);
    raiz = h('div', { class: 'inv-tour', id: 'inv-tour', hidden: true }, spot, card);
    document.body.appendChild(raiz);
  }

  /* ------------------------------------------------------------------ geometria */
  function alturaBarra() {
    var b = document.querySelector('.app-bar');
    return b ? b.getBoundingClientRect().bottom : 0;
  }
  function vp() {
    var de = document.documentElement;
    return { w: de.clientWidth || window.innerWidth, h: window.innerHeight || de.clientHeight };
  }
  function rolar(el) {
    try { el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'auto' }); } catch (e) { el.scrollIntoView(); }
    var v = vp(), r = el.getBoundingClientRect(), topo = Math.max(0, alturaBarra()) + 8;
    var base = celular() ? v.h - card.offsetHeight - 8 : v.h - 8;
    var livre = base - topo, dy = 0;
    if (r.height > livre) dy = r.top - topo;                       // bloco maior que a área livre: alinha pelo topo
    else if (celular()) dy = (r.top + r.bottom) / 2 - (topo + base) / 2;  // celular: centraliza acima da folha
    if (Math.abs(dy) > 1) window.scrollBy(0, dy);
  }
  function posicionar() {
    pendente = 0;
    if (!aberto) return;
    var p = passos[idx], f = p ? achar(p) : null, el = f ? f.el : null, v = vp(), m = 12;
    var cw = card.offsetWidth, ch = card.offsetHeight, left, top;
    if (!el) {
      spot.className = 'inv-tour-spot sem-alvo';
      spot.style.left = (v.w / 2) + 'px'; spot.style.top = (v.h / 2) + 'px';
      spot.style.width = '0px'; spot.style.height = '0px';
      left = (v.w - cw) / 2; top = (v.h - ch) / 2;
    } else {
      var r = el.getBoundingClientRect(), pad = 6;
      var L = Math.max(4, r.left - pad), T = Math.max(4, r.top - pad), R = Math.min(v.w - 4, r.right + pad), B = Math.min(v.h - 4, r.bottom + pad);
      if (R <= L || B <= T) { L = v.w / 2; T = v.h / 2; R = L; B = T; }
      spot.className = 'inv-tour-spot';
      spot.style.left = L + 'px'; spot.style.top = T + 'px';
      spot.style.width = (R - L) + 'px'; spot.style.height = (B - T) + 'px';
      var abaixo = v.h - B - m, acima = T - Math.max(alturaBarra(), 0) - m;
      left = L + (R - L) / 2 - cw / 2;
      if (abaixo >= ch + m) top = B + m;
      else if (acima >= ch + m) top = T - ch - m;
      else if (v.w - R >= cw + 2 * m) { left = R + m; top = T; }
      else if (L >= cw + 2 * m) { left = L - cw - m; top = T; }
      else top = v.h - ch - m;                                      // sem espaço: fica no rodapé, sobre o bloco
    }
    if (!celular()) {
      left = Math.min(Math.max(m, left), Math.max(m, v.w - cw - m));
      top = Math.min(Math.max(m, top), Math.max(m, v.h - ch - m));
      card.style.left = left + 'px'; card.style.top = top + 'px';
    } else {
      card.style.left = ''; card.style.top = '';
    }
  }
  function agendar() {
    if (!aberto || pendente) return;
    pendente = window.requestAnimationFrame(posicionar);
  }

  /* ------------------------------------------------------------------ navegação */
  function nomeCap(i) { return passos[i] ? passos[i].cap : ''; }
  function textoDe(p) { var t = typeof p.texto === 'function' ? p.texto() : p.texto; return String(t || ''); }
  function trocar(aba) {
    try { if (PB.current !== aba) PB.show(aba); } catch (e) { if (window.console) console.error(e); }
  }
  function montarCapitulos() {
    var vistos = {}, ops = [];
    passos.forEach(function (p, i) { if (!vistos[p.cap]) { vistos[p.cap] = 1; ops.push(h('option', { value: String(i) }, p.cap)); } });
    selCap.replaceChildren.apply(selCap, ops);
  }
  function ir(i, dir) {
    if (!aberto) return;
    if (i < 0) i = 0;
    if (i >= passos.length) { fechar(true); return; }
    var minha = ++seq;
    idx = i;
    var p = passos[i];
    if (p.aba) trocar(p.aba);
    var txt = textoDe(p);
    elCap.textContent = p.cap;
    elNum.textContent = 'Passo ' + (i + 1) + ' de ' + passos.length;
    elTitulo.textContent = p.titulo;
    elTexto.replaceChildren.apply(elTexto, txt.split('\n\n').map(function (t) { return h('p', null, t); }));
    elNota.hidden = true; elNota.textContent = '';
    bVoltar.disabled = i === 0;
    bAvancar.textContent = i === passos.length - 1 ? 'Concluir' : 'Avançar';
    for (var k = 0; k < selCap.options.length; k++) { if (parseInt(selCap.options[k].value, 10) <= i) selCap.selectedIndex = k; }
    elStatus.textContent = 'Passo ' + (i + 1) + ' de ' + passos.length + ': ' + p.titulo + '. ' + txt;
    // espera o redesenho da aba (gráficos d3 medem a largura) antes de achar e medir o bloco
    window.requestAnimationFrame(function () {
      window.requestAnimationFrame(function () {
        if (minha !== seq || !aberto) return;
        var f = achar(p);
        if (!f && p.sel && p.pular && dir && i + dir >= 0 && i + dir < passos.length) { ir(i + dir, dir); return; }
        if (f) {
          if (f.i > 0 && p.ausente) { elNota.textContent = p.ausente; elNota.hidden = false; }
          rolar(f.el);
        } else if (p.sel) {
          elNota.textContent = (p.ausente ? p.ausente + ' ' : '') + 'Por isso o destaque não aparece e o texto fica no centro da tela.';
          elNota.hidden = false;
        }
        posicionar();
        // mais duas conferências: gráficos e tabelas podem terminar de desenhar logo depois
        setTimeout(function () { if (minha === seq) agendar(); }, 150);
        setTimeout(function () { if (minha === seq) agendar(); }, 500);
      });
    });
  }

  /* ------------------------------------------------------------------ abrir e fechar */
  function focaveis() {
    return Array.prototype.filter.call(card.querySelectorAll('button, select, [href], input, [tabindex]:not([tabindex="-1"])'), function (e) { return !e.disabled && e.offsetParent !== null; });
  }
  function teclado(ev) {
    if (!aberto) return;
    var alvo = ev.target, tag = alvo && alvo.tagName;
    if (ev.key === 'Escape' || ev.key === 'Esc') { ev.preventDefault(); ev.stopPropagation(); fechar(true); return; }
    if (ev.key === 'Tab') {
      var f = focaveis();
      if (!f.length) { ev.preventDefault(); card.focus(); return; }
      var primeiro = f[0], ultimo = f[f.length - 1], dentro = card.contains(document.activeElement);
      if (!dentro) { ev.preventDefault(); (ev.shiftKey ? ultimo : primeiro).focus(); }
      else if (ev.shiftKey && (document.activeElement === primeiro || document.activeElement === card)) { ev.preventDefault(); ultimo.focus(); }
      else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primeiro.focus(); }
      return;
    }
    if (ev.key !== 'ArrowRight' && ev.key !== 'ArrowLeft') return;
    if (tag === 'SELECT' || tag === 'INPUT' || tag === 'TEXTAREA' || (alvo && alvo.isContentEditable)) return;
    if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
    ev.preventDefault();
    if (ev.key === 'ArrowRight') { if (idx >= passos.length - 1) fechar(true); else ir(idx + 1, 1); }
    else if (idx > 0) ir(idx - 1, -1);
  }

  function abrir() {
    if (aberto) return;
    montar();
    passos = roteiro().filter(function (p) { return !p.aba || pagina(p.aba); });
    if (!passos.length) return;
    origem = PB.current; scrollOrigem = window.pageYOffset || 0;
    montarCapitulos();
    aberto = true;
    raiz.hidden = false;
    botao.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', teclado, true);
    window.addEventListener('resize', agendar);
    window.addEventListener('scroll', agendar, true);
    ir(0, 1);
    try { card.focus({ preventScroll: true }); } catch (e) { card.focus(); }
  }
  function fechar(devolver) {
    if (!aberto) return;
    aberto = false; seq++;
    raiz.hidden = true;
    botao.removeAttribute('aria-expanded');
    document.removeEventListener('keydown', teclado, true);
    window.removeEventListener('resize', agendar);
    window.removeEventListener('scroll', agendar, true);
    if (pendente) { window.cancelAnimationFrame(pendente); pendente = 0; }
    if (origem) trocar(origem);
    window.requestAnimationFrame(function () { window.scrollTo(0, scrollOrigem); });
    if (devolver) { try { botao.focus({ preventScroll: true }); } catch (e) { botao.focus(); } }
  }

  botao.addEventListener('click', function () { if (aberto) fechar(true); else abrir(); });
  window.INVTour = { abrir: abrir, fechar: function () { fechar(true); }, passos: function () { return roteiro().length; } };
})();
