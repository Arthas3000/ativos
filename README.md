# Base de Pesquisa — Ações e FIIs da B3

Repositório de consulta (humano ou IA) para alocação de ativos no mercado brasileiro.
**Data-base do diagnóstico:** 26–27/10/2026 (primeiro pregão após o 2º turno presidencial).

> Material educacional e de análise de contexto. **Não é recomendação de investimento.**
> Números marcados com confiança "média" ou "baixa" vieram de uma única fonte ou de fontes divergentes: confirme na B3, BCB, IBGE ou RI das empresas antes de usar.

## Estrutura

| Caminho | Conteúdo |
|---|---|
| `01_diagnostico/00_resumo_executivo.md` | Leitura de 1 página do cenário. Comece aqui. |
| `01_diagnostico/01_macro_juros_cambio.md` | Selic, curva DI, inflação, dólar, petróleo. Pilar 1. |
| `01_diagnostico/02_politico_fiscal.md` | Eleição, sucessão na Fazenda, dívida, ingerência vs. risco-país. Pilar 2. |
| `01_diagnostico/03_setor_varejo.md` | Endividamento, alavancagem, consumo. Pilar 3. |
| `01_diagnostico/04_setor_fiis.md` | Tijolo vs. Papel (CRI) sob estresse. Pilar 3. |
| `01_diagnostico/05_setor_bancos.md` | Inadimplência, provisões, cobertura. Pilar 3. |
| `01_diagnostico/06_criterios_value.md` | Regras: desconto irracional vs. armadilha de valor. Pilar 4. |
| `dados/snapshot_mercado_2026-10-26.csv` | Números do dia, com fonte e grau de confiança. |
| `dados/criterios_value.csv` | Limites quantitativos por setor (abre no Excel). |
| `fontes.md` | Links de todas as fontes usadas. |
| `02_etapa2_score/relatorio_etapa2.md` | **Etapa 2:** tabela dos 20 ativos, score de 0 a 1000, ranking, TOP 3 e armadilhas de valor. |
| `02_etapa2_score/score.py` | Modelo de score reproduzível (`python score.py`), com teste de sensibilidade. |
| `02_etapa2_score/dados_entrada.csv` | Insumos do score, com a fonte de cada um. Edite e rode o script de novo para atualizar. |
| `02_etapa2_score/resultado_score.csv` | Pontos por pilar e métricas intermediárias. |
| `02_etapa2_score/precos_yahoo_3m.json` | Série diária de 3 meses (fechamento, máxima, mínima, volume). |
| `02_etapa2_score/fundamentus_<data>.json` | Dados brutos do Fundamentus de cada coleta. |
| `03_painel/` | **Painel de Oportunidades B3**: [link](https://claude.ai/artifact/CDQrUB1RafE6HBQBGwfMaj). |
| `03_painel/atualizar.py` | Atualização: `nova-versao`, `precos`, `fundamentus`, `historico`, `build`, `site`, `snapshot`, `teste`. |
| `03_painel/config.json` | Versão atual, datas de referência, evento de estresse, snapshot macro em uso e link do painel. |
| `03_painel/catalogo_bruto.csv` | Catálogo de triagem: 279 ativos além dos 20 do ranking (cadastro e leituras preliminares, **sem score e não validados**). `atualizar.py catalogo` limpa o CSV (descarta o texto padrão de triagem nas células mescladas `a \| b`) e gera `dados/catalogo.json`; o `build` também chama. Aparece no app em Mercado › Catálogo (modo Avançado). |
| `03_painel/dados/extras.json` | **Ativos adicionados só pelo código** (Mercado › Adicionar ativo). O usuário digita o ticker; o app abre uma issue pré-preenchida e o workflow `adicionar-ativo.yml` (só roda para o dono do repositório) inclui o código em `config.json › extras` e roda `historico` (Yahoo, 5 anos + dividendos) e `extras` (Fundamentus + o **mesmo modelo de score do ranking**, `score.stock`/`score.fii`). Resultado: nota parcial, preço, variações, oscilação, queda máxima, DY e gráfico. Dado que falta fica vazio (o peso é redistribuído no pilar); abaixo de 75% de cobertura não há nota. Tipo assumido: empresa comum (banco/commodity/incorporadora e estatal exigem ajuste manual). Limite de 30 ativos. |
| `03_painel/notas_ativos.csv` | Camada qualitativa (tese, risco, sinal, confiança) e campos `travar` (dado oficial que o Fundamentus não sobrescreve). |
| `03_painel/painel/index.html` | Código da página do painel. |
| `03_painel/dados/` | JSONs que o painel lê (gerados pelo `build`). |
| `03_painel/historico/` | Uma pasta por versão (`<data>_<versao>/`) com o estado completo, mais `scores_historico.csv`. Nunca é sobrescrito. |
| `.claude/skills/atualizar-painel-b3/` | Skill que roda a atualização completa e gera uma nova versão. |
| `03_painel/painel/app/` | Casca do app de celular (PWA): tokens de tema, camada `dash`, manifest, service worker, ícones. |
| `docs/` | App gerado por `atualizar.py site`, publicado pelo GitHub Pages. Não editar à mão. |
| `.github/workflows/atualizar.yml` | Atualização manual pelo botão "Atualizar dados" do app: preços, fundamentos, histórico longo, score, app e snapshot. |
| `.github/workflows/testes.yml` | Testes a cada push e pull request: `node --test` (cálculos) e `atualizar.py teste` (pipeline). |
| `03_painel/dados_longos/` | `serie_longa.json` (5 anos diários, com dividendos) e `indices.json` (CDI e IPCA), gerados por `atualizar.py historico`. Não entram no snapshot. |
| `03_painel/painel/app/invest*.js` | Módulo de investimentos do app: `invest.js` (cálculos), `invest-store.js` (dados, seções e Ajustes), `invest-sim.js` (Simulador), `invest-corretora.js` (Minha carteira), `invest-nav.js` (áreas do app e estilo), `invest-ajuda.js` (glossário e botões “?”), `invest-assistente.js` (Assistente de alocação), `invest-tour.js` (tour "Como usar"). |
| `03_painel/painel/app/tests/` | Testes dos cálculos (`node --test 03_painel/painel/app/tests/`). |

## Módulo de investimentos

O app do GitHub Pages (não o painel do Claude) organiza tudo em quatro áreas: Mercado (as oito abas do painel) e mais três:

- **Simulador** (etapas Montar carteira › Resultado): carteira histórica com aportes mensais, dividendos e custos, comparada ao Ibovespa, ao CDI e ao IPCA (retorno nominal e real). É análise do passado: não garante resultado futuro.
- **Minha carteira** (seções Resumo, Posições, Comprar ou vender, Planejar aporte, Caixa, Transações, Meus ativos): o que você registrou, com primeiros passos guiados e o Assistente de alocação de aportes. Uma proposta nunca vira transação sem a sua confirmação, e o app não envia ordens.
- **Ajustes** (seções Cotações, Custos e lotes, Ativos extras, Backup, Fontes de dados).
- **Navegação:** o app tem quatro áreas (Mercado, Minha carteira, Simulador, Ajustes), que viram uma barra no rodapé no celular. Cada área se divide em seções, e cada seção tem endereço próprio (ex.: `#corretora/caixa`). O botão **Como usar** abre o tour guiado; o **Glossário** (em Mercado) e os botões **?** ao lado dos termos explicam o vocabulário técnico. A revisão de UX está em `UX_REVISAO.md`.

### Modo Fácil e modo Avançado

Um botão de tema (claro/escuro, lembrado no aparelho; sem escolha, segue o sistema) fica ao lado do alternador. O alternador na barra superior troca a **apresentação**, nunca os dados nem os cálculos (`invest-modo.js`; escolha guardada só no aparelho). Quem já tem transações começa no Avançado; os demais, no Fácil.

| Elemento | Fácil (2–5 min) | Avançado (15–20 min) |
|---|---|---|
| Mercado | aba **Hoje**: cenário em 4 números e tabela única *Nota (0–10) · Indicação · Preço*, com o risco de cada ativo (filtros Todos/Ações/FIIs/só candidatas), mais Ficha e Glossário | todas as abas; Ranking com filtro por classificação, colunas essenciais/todas, busca e coluna Indicação; Cenário macro com filtro por tema |
| Indicação | leitura da classificação (`sinal`): Candidata a compra, Compra com cautela, Boa mas sem desconto, Neutro, Atenção ao rendimento, Evitar; **não é recomendação** | a mesma indicação aparece no Ranking |
| Risco do Simulador | nível, queda máxima e oscilação em frases, mais os avisos | tabela carteira × Ibovespa × CDI, fórmulas e limites |
| Concentração | nível e frase | HHI, nº efetivo de ativos, maior posição, faixas |
| Simulador | campos essenciais; “premissas em uso” em uma linha | todos os parâmetros, retorno por ativo, XIRR, lista de premissas |
| Ajustes / carteira | só o essencial (Cotações, Backup…) | também Custos, Ativos extras, Fontes, Meus ativos |

Trocar de modo mantém aba, ativo escolhido, carteira, parâmetros e resultados; parâmetros escondidos no Fácil continuam valendo e aparecem como “premissas em uso”. Avisos e limitações nunca somem. Um link para tela só do Avançado abre nele.

**Risco e concentração** (`INVCalc.concentracao`, `riscoSerie`, `drawdown`, `volatilidadeAnual`): HHI = Σ(peso %)², volatilidade = desvio padrão amostral dos retornos diários × √252, queda máxima pico-a-vale; retornos seguem a convenção do TWR (aportes não contam). Fórmulas adaptadas de `tradermonty/claude-trading-skills` (MIT, skill `portfolio-manager`); as faixas de classificação são orientativas. Validação: testes com valores calculados à parte em Python e conferência com a série real do PETR4 (volatilidade 33,7246% e queda −43,08% idênticas em Python e JS).

Pontos importantes:

- **Dados só no aparelho.** Carteira, transações e ativos personalizados ficam no `localStorage` do navegador, sem servidor. Use Exportar/Importar em Ajustes › Backup para fazer backup; limpar os dados do navegador apaga tudo.
- **Token da brapi.** A cotação ao vivo usa o seu token de brapi.dev, colado em Ajustes › Cotações. Ele fica só neste navegador: não vai para o GitHub nem para o backup. Sem token, vale o último fechamento (marcado "atrasado") ou o preço digitado por você.
- **Ativos extras no histórico.** Ativo personalizado só aparece no Simulador depois de entrar em `"extras": ["TICK1"]` no `03_painel/config.json`; o histórico dele chega na próxima execução de "Atualizar dados".
- **Limitações.** Só ações e FIIs em reais na B3. Dividendos do Yahoo vêm brutos (sem IR, JCP incluído). Simulação usa preço de fechamento, sem imposto nem come-cotas. Material educacional, não é recomendação.

## Próximas etapas (planejadas)

- **Etapa 2:** concluída em 27/10/2026 (`02_etapa2_score/`).
- Atualizar `dados/` a cada evento relevante: Copom 04/11/2026, anúncio do ministro da Fazenda, balanços 3T26 (Santander 28/10, BB 11/11).

## Convenções

- Datas em `AAAA-MM-DD` nos nomes de arquivo.
- Cada novo snapshot de mercado = novo CSV em `dados/`, nunca sobrescrever o anterior.
- Toda afirmação numérica deve ter fonte em `fontes.md`.
