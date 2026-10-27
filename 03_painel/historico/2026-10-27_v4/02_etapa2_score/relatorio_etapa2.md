# Etapa 2: Análise Quantitativa e Fundamentalista de Oportunidades na B3

**Data de referência dos preços:** fechamento de **segunda-feira, 26/10/2026**. É o último pregão completo. A sessão de 27/10 estava em andamento na data da pesquisa e não foi usada.
**Data de referência dos fundamentos:** último balanço processado por ativo. Em geral é o 2T26 (30/06/2026). A WEG já tem o 3T26 (30/09/2026). Nos FIIs, os relatórios mensais vão de ago/26 a set/26, e o balanço patrimonial é o informe trimestral de 30/06/2026.
**Universo:** 13 ações e 7 FIIs, total de 20 ativos.

Arquivos de apoio na mesma pasta:
- `dados_entrada.csv`: todos os insumos do score, com a observação de fonte.
- `score.py`: o modelo, reproduzível. Rode com `python score.py`.
- `resultado_score.csv`: pontos por pilar e métricas intermediárias.
- `precos_yahoo_3m.json`: série diária bruta de 3 meses.
- `tabela_precos.md`

> **Revisão v3 (27/10/2026, 10h47): ciclo de teste da skill `atualizar-painel-b3`, sem dados novos**
> - Foi rodada durante o pregão de 27/10, a pedido do usuário. O último pregão fechado continua 26/10, então `data_ref` não mudou.
> - Fundamentus: 0 mudanças. Nenhum balanço novo (12 ações no 2T26, WEGE3 no 3T26). Dados manuais e snapshot macro mantidos.
> - **Scores idênticos aos da v2** (diferença máxima de 0,0 ponto). O top 5 não mudou: CYRE3 779, LREN3 739, PETR4 729, KNCR11 726 e B3SA3 660.
> - Lacuna que continua N/D: cobertura de provisões do ITUB4.
> - A próxima versão com informação nova deve usar o fechamento de 27/10 ou os balanços do 3T26 (BBAS3 em 11/11).

> **Revisão v2 (27/10/2026): lacunas N/D fechadas por 4 workers sonnet/medium** (run `.model-router/run-20261027-0951`)
> - **BBAS3:** cobertura PDD/INAD90 de 148,45% no 2T26 (183,16% no 2T25), fonte secundária (Trademap/BeInCrypto). Score 457 → 448.
> - **ITUB4:** cobertura continua N/D, porque o RI do Itaú bloqueia o acesso automático (403).
> - **VALE3:**
>   - Lucro proforma de 3T25 a 2T26: US$ 7.667 mi, contra US$ 2.109 mi contábil. O contábil caiu por impairment de níquel (US$ 3,5 bi) e baixa de tributo diferido (US$ 2,8 bi) no 4T25, segundo os releases da Vale.
>   - Nova regra `ll12_rec`: quando a empresa divulga lucro recorrente de 4 trimestres, ele substitui o contábil. Em R$, foi estimado pela razão proforma/contábil: R$ 37,7 bi, ROE de 19,2%.
>   - Score 438 → 578.
> - **WEGE3:**
>   - O DY de 4,5% inclui R$ 1,2385/ação de dividendo da reserva de lucros (19/12/2025, parcelado até 2028).
>   - Nova regra `dy_rec`: DY sem proventos extraordinários identificados. Para a WEG, 1,95%, com payout recorrente coerente com os 59,8% oficiais de 2025.
>   - Score 554 → 613.
> - **KNSC11:**
>   - Relatório gerencial de set/26 (FNET): 84 CRIs, maior exposição de 5,9%.
>   - Casa & Vídeo e Le Biscuit tiveram ajuste contábil, o que dá nota 20 pela regra "ativo provisionado".
>   - Score 582 → 566. A confiança sobe de Baixa para Média.
> - **BCSC11:** não foi localizado em nenhuma fonte (B3, FNET, agregadores). Possível confusão com o BCFF11, incorporado ao BTHF11 em 2024. Mantido o HGBS11.
> - **O top 5 e a sensibilidade não mudaram.** Os valores abaixo de "Tabela B", "Ranking" e "Limitações" estão atualizados. O texto das demais seções reflete a v1, salvo indicação.

---

## Seção 1: Resumo executivo

1. **O estresse tem data e causa identificáveis.** Em 26/10/2026, primeiro pregão após o 2º turno da eleição presidencial de 25/10/2026, Lula (PT) foi reeleito contra Flávio Bolsonaro (PL), com 51,79% × 48,21%.
   - O Ibovespa caiu 13,88%, para 176.608 pontos, com circuit breaker.
   - O DI jan/31 subiu 254 bps, para 15,19%.
   - O mercado estava posicionado para a vitória da oposição. Ver `../01_diagnostico/`.
2. **Uma queda grande não é desconto grande.**
   - Várias ações domésticas tinham subido 30% a 90% entre o 1º turno (04/10) e 23/10. A queda de 26/10 devolveu parte dessa alta.
   - Em 1 mês (25/09 → 26/10), o Ibovespa caiu só 3,74%, enquanto o pior dia somou −13,88%.
   - Exemplo: MGLU3 caiu 58,23% no dia, mas 21,60% em 1 mês.
3. **Com Ke de 18%, quase nada está abaixo do valor justo pelo modelo de valor residual (Gordon).**
   - Só **CYRE3 (+17,5%)** e **PETR4 (+21,4%)** mostram margem de segurança positiva.
   - LREN3, ASAI3 e ITUB4 ficaram mais baratas, mas continuam no valor justo ou acima dele.
4. **Ranking (score de 0 a 1000):**
   - 1º **CYRE3**, com 779.
   - 2º **LREN3**, com 739.
   - 3º **PETR4**, com 729, em empate técnico com **KNCR11**, que tem 726.
   - O top 5 se mantém em todos os 5 cenários de sensibilidade, o que torna o ranking robusto no topo.
5. **Candidatos a armadilha de valor:** CSAN3 (106), HAPV3 (158) e MGLU3 (249). BBAS3 (457) tem fundamento em deterioração. Nos FIIs, **VISC11** e **MXRF11** têm risco de sustentabilidade do rendimento.
6. **Principais limitações:**
   - Os balanços das ações são anteriores ao choque, do 2T26.
   - A cobertura de provisões dos bancos ficou N/D.
   - Os dados de crédito do KNSC11 ficaram N/D.
   - A base da Hapvida no Fundamentus tem inconsistências.
   - Não há série histórica de 5 anos de múltiplos, por isso o valuation é contra o valor justo e não contra a média histórica.

---

## Seção 2: Cenário macroeconômico (síntese; detalhes em `../01_diagnostico/`)

| Fator | Situação (fonte, data) | Efeito no período |
|---|---|---|
| Selic | 13,75%, com corte de 0,25 pp em 16/09/2026 ([Agência Brasil](https://agenciabrasil.ebc.com.br/economia/noticia/2026-09/bc-reduz-juros-basicos-para-1375-ao-ano)). Próximo Copom em 04/11. | A curva passou a precificar manutenção e alta em dez e jan ([CNN](https://www.cnnbrasil.com.br/economia/money/mercado/juros-futuros-fecham-em-alta-apos-reeleicao-de-lula/)). |
| Curva DI | DI jan/28 foi de 12,86% para 14,80%. DI jan/31 foi de 12,64% para 15,19% (23 → 26/10). | Ke sobe. Duration e alavancagem são penalizadas. |
| Inflação | Focus (pré-eleição): IPCA de 5,19% em 2026. IPCA-15 de set/26 em 4,47% em 12 meses. | Expectativa acima da meta. Brent perto de US$ 115. |
| Câmbio | R$ 5,40 em 26/10 (B3). Variação: +8,25% pela B3, +5,97% pelo Yahoo (BRL=X) e +0,92% pelo Money Times. **Divergência não resolvida**: adotado o nível de R$ 5,40. | Exportadoras subiram: VALE3 +4,01%, WEGE3 +4,21%. |
| Fiscal | Prisma: déficit de R$ 53 bi em 2026. IFI estima déficit de R$ 86,1 bi no PLOA 2027. | Prêmio de risco nos vértices longos. |
| Político | Lula reeleito. Ministro da Fazenda indefinido (Alckmin, Fonteles e outros). | Risco-país e risco de ingerência em estatais. |
| Fluxo | O volume de 26/10 foi **2 a 6 vezes a média de 20 dias** em todos os ativos (Tabela A). | Indica venda forçada e desmonte de posição, não só reavaliação de fundamento. |

**Classificação causal da queda de 26/10:**

| Grupo | Ativos | Causa predominante |
|---|---|---|
| Macro/político, beta doméstico alto | CYRE3, RENT3, LREN3, ASAI3, B3SA3, ITUB4 | Reprecificação de juros e risco-país. Não há fato relevante próprio no dia. |
| Macro + fundamento já fraco | MGLU3, HAPV3, CSAN3 | Choque macro sobre empresas que já vinham em deterioração: prejuízo e endividamento (Seção 8). |
| Macro + risco de ingerência | BBAS3, PETR4 | Estatais após a reeleição. BBAS3 soma deterioração de crédito. |
| Beneficiadas pelo câmbio | VALE3, WEGE3 | Receita em USD. Subiram no dia. |
| FIIs | 7 fundos | Quedas de 1% a 8%. O tijolo de shopping sofreu mais (VISC11 −8,39%). O papel CDI sofreu menos (KNCR11 −1,18%). |

---

## Seção 3: Metodologia e fontes

**Coleta de preços:**
- Fonte: Yahoo Finance, API de gráfico diária, 3 meses, símbolos `.SA`.
- Validação cruzada com a B3 Bora Investir: MGLU3 −58,23%, HAPV3 −54,93%, CSAN3 −46,73% e Ibovespa 176.608 pontos conferem com a [B3](https://borainvestir.b3.com.br/noticias/mercado/apos-circuit-breaker-ibovespa-b3-recua-13-com-eleicao-no-foco-dolar-vai-a-r-540/).
- Os preços são de **fechamento não ajustado**. Na janela de 3 meses não há grupamento ou desdobramento: o grupamento 15:1 da Hapvida foi anterior a ela.
- A diferença entre close e adjclose reflete só proventos e não afeta as variações de curto prazo de forma relevante.

**Datas:**

| Referência | Data | Observação |
|---|---|---|
| "1 mês" | 25/09/2026 | Sexta-feira |
| "1 semana" | 19/10/2026 | |
| "Pré-estresse" | 23/10/2026 | Último pregão antes do 2º turno |
| "Estresse" | 26/10/2026 | Mínima intradiária = preço de estresse. Fechamento = preço atual e preço de referência. |

**Fundamentos:**
- Fonte principal: [Fundamentus](https://www.fundamentus.com.br/detalhes.php?papel=CYRE3), com página por ticker e data da última cotação em 26/10/2026. Os dados vêm de demonstrativos da CVM.
- Esses dados foram cruzados com releases e notícias de resultados do 2T26. Onde houve divergência, ela está registrada na coluna `obs` de `dados_entrada.csv`.
- **Regra de prioridade:** dado oficial da companhia vale mais que cálculo próprio a partir do Fundamentus, que vale mais que fonte secundária.
- Aplicações da regra:
  - Alavancagem oficial: ASAI3 (2,37x) e MGLU3 (1,02x).
  - Lucro do 2T26 da HAPV3: oficial, −R$ 217,1 mi.
  - Bancos: CET1, NPL90 e crescimento do lucro vêm dos releases do 2T26, via InfoMoney, XP e Seu Dinheiro.

**Cálculos próprios** (identificados como "calc."):
- ROE 12m = LL 12m / PL.
- ROE do trimestre anualizado = LL 3m × 4 / PL.
- EBITDA = EV / (EV/EBITDA).
- DL/EBITDA.
- DY dos FIIs = distribuição 12m por cota / preço. O Fundamentus diverge em KNSC11 (12,4% contra 10,91% calc.) e MXRF11 (14,0% contra 11,20% calc.). **Adotado o cálculo próprio**, porque ele é verificável com distribuição/cota e preço.
- FFO yield, cobertura FFO/distribuição e passivo/ativo dos FIIs.

**Benchmarks:**
- Ações: Ibovespa.
- FIIs: o IFIX não estava disponível na série (o Yahoo retornou 1 ponto). Foi usada a **mediana dos 7 FIIs** no estresse (−4,22%) como referência.

**BCSC11 × HGBS11:** escolhido o **HGBS11**.
- O BCSC11 não retornou dados no Yahoo (HTTP 404) nem no Fundamentus (página vazia).
- A busca de notícias não localizou informação de 2026 sobre o fundo.
- O HGBS11 tem série completa, relatório de 30/09/2026 e liquidez de R$ 7,98 mi/dia.
- **Situação do BCSC11: N/D, sem dado de negociação localizável.**

**HGLG11:** o fundo hoje se chama "PÁTRIA LOG". A gestão passou da CSHG para a Pátria, e houve alteração da administração fiduciária em 19/10/2026 ([Clube FII](https://www.clubefii.com.br/fiis/HGLG11)). É o mesmo ticker e o mesmo fundo.

---

## Seção 4: Tabela completa de ativos

### Tabela A: Preços, variações, proventos e valuation (R$)

Preços: fechamento (Yahoo Finance). "Estresse" = mínima intradiária de 26/10/2026. Var. estresse = fechamento de 23/10 → fechamento de 26/10. DY das ações = Fundamentus. DY dos FIIs = calc.

| Nº | Ticker | Categoria | 1 mês (25/09) | 1 sem. (19/10) | Pré (23/10) | Estresse (mín. 26/10) | Fech. 26/10 | Var. estresse % | Var. 1 mês % | Queda do pico 3m % (data do pico) | Vol. 26/10 ÷ média 20d | DY 12m % | Valuation |
|---|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | BBAS3 | Banco (estatal) | 21,59 | 23,95 | 24,72 | 16,48 | 17,47 | −29,33 | −19,08 | −33,65 (05/10) | 5,8x | 3,90 | P/L 6,91 · P/VP 0,55 |
| 2 | RENT3 | Locação | 38,35 | 50,70 | 52,42 | 26,21 | 31,67 | −39,58 | −17,42 | −41,90 (09/10) | 3,6x | 6,70 | P/L 10,40 · P/VP 1,31 · EV/EBITDA 4,76 |
| 3 | CYRE3 | Incorporação | 27,00 | 32,65 | 35,57 | 17,79 | 19,63 | −44,81 | −27,30 | −44,81 (23/10) | 5,6x | 11,80 | P/L 4,36 · P/VP 0,80 · EV/EBITDA 7,50 |
| 4 | MGLU3 | Varejo | 6,76 | 11,83 | 12,69 | 5,03 | 5,30 | −58,23 | −21,60 | −60,97 (20/10) | 2,1x | 1,50 | P/L 46,46 · P/VP 0,37 · EV/EBITDA 2,62 |
| 5 | VALE3 | Mineração | 70,77 | 66,36 | 61,90 | 64,16 | 64,38 | +4,01 | −9,03 | −20,32 (02/09) | 3,2x | 8,70 | P/L 27,56 · P/VP 1,45 · EV/EBITDA 3,92 |
| 6 | WEGE3 | Bens de capital | 51,07 | 47,67 | 42,73 | 41,15 | 44,53 | +4,21 | −12,81 | −15,42 (08/09) | 2,8x | 4,50 | P/L 29,82 · P/VP 9,37 · EV/EBITDA 19,39 |
| 7 | PETR4 | Petróleo (estatal) | 48,07 | 58,00 | 58,68 | 51,17 | 53,88 | −8,18 | +12,09 | −9,72 (16/10) | 3,0x | 6,80 | P/L 5,21 · P/VP 1,44 · EV/EBITDA 3,13 |
| 8 | ITUB4 | Banco | 42,13 | 47,90 | 48,30 | 39,68 | 41,70 | −13,66 | −1,02 | −17,38 (09/10) | 3,8x | 7,50 | P/L 9,86 · P/VP 2,21 |
| 9 | HAPV3 | Saúde | 6,26 | 8,88 | 8,83 | 3,98 | 3,98 | −54,93 | −36,42 | −66,58 (03/08) | 4,2x | 0,00 | P/L neg. · P/VP 0,04* · EV/EBITDA 3,53 |
| 10 | LREN3 | Varejo de moda | 11,12 | 14,14 | 14,58 | 8,76 | 9,68 | −33,61 | −12,95 | −35,72 (09/10) | 3,3x | 9,50 | P/L 6,52 · P/VP 0,94 · EV/EBITDA 1,73 |
| 11 | ASAI3 | Atacarejo | 10,49 | 13,39 | 13,80 | 6,91 | 7,87 | −42,97 | −24,98 | −43,71 (20/10) | 3,7x | 1,30 | P/L 11,05 · P/VP 1,68 · EV/EBITDA 2,65 |
| 12 | CSAN3 | Holding | 3,82 | 5,11 | 5,20 | 2,60 | 2,77 | −46,73 | −27,49 | −48,70 (09/10) | 4,6x | 0,00 | P/L neg. · P/VP 2,21 · EV/EBITDA 4,41 |
| 13 | B3SA3 | Infra. financeira | 17,96 | 22,50 | 23,65 | 11,83 | 15,07 | −36,28 | −16,09 | −36,44 (20/10) | 4,6x | 6,10 | P/L 14,27 · P/VP 4,07 · EV/EBITDA 9,93 |
| 14 | HGLG11 | FII logística | 147,86 | 156,12 | 159,66 | 146,75 | 151,70 | −4,99 | +2,60 | −4,99 (23/10) | 2,0x | 8,37 | P/VP 0,92 · VP/cota 165,48 |
| 15 | KNCR11 | FII papel CDI | 106,32 | 106,42 | 105,55 | 100,59 | 104,30 | −1,18 | −1,90 | −3,51 (31/08) | 2,8x | 12,79 | P/VP 1,02 · VP/cota 102,57 |
| 16 | XPML11 | FII shopping | 98,68 | 105,80 | 104,61 | 95,99 | 100,20 | −4,22 | +1,54 | −7,28 (09/10) | 3,0x | 10,69 | P/VP 0,93 · VP/cota 107,36 |
| 17 | HGBS11 | FII shopping | 18,49 | 19,29 | 19,60 | 17,25 | 18,59 | −5,15 | +0,54 | −5,15 (23/10) | 2,0x | 9,95 | P/VP 0,89 · VP/cota 20,96 |
| 18 | KNSC11 | FII papel HY | 9,01 | 9,13 | 9,18 | 8,65 | 8,98 | −2,18 | −0,33 | −2,60 (06/10) | 2,9x | 10,91 | P/VP 1,01 · VP/cota 8,85 |
| 19 | VISC11 | FII shopping | 102,81 | 113,90 | 114,20 | 98,38 | 104,62 | −8,39 | +1,76 | −8,39 (23/10) | 1,5x | 9,55 | P/VP 0,90 · VP/cota 115,79 |
| 20 | MXRF11 | FII híbrido/papel | 9,10 | 9,38 | 9,44 | 8,65 | 9,11 | −3,50 | +0,11 | −5,89 (28/07) | 3,8x | 11,20 | P/VP 0,97 · VP/cota 9,35 |

\* HAPV3: o PL contábil (R$ 48,06 bi) é composto majoritariamente de ágio e intangíveis de aquisições. O P/VP de 0,04 não tem significado econômico de "desconto".

### Tabela B: Patrimônio, risco, rentabilidade, score e confiança

| Ticker | Patrimônio líquido (R$ bi) | Endividamento / risco operacional | ROE 12m calc. / Margem líquida (Fundamentus) | Score | Cobertura · status | Confiança |
|---|---:|---|---|---:|---|---|
| CYRE3 | 11,17 | DL/PL 0,43 (calc.) · liquidez corrente 3,37 | ROE 18,26% · ML 17,0% | **779** | 100% · definitivo | Alta |
| LREN3 | 10,37 | Caixa líquido (DL/EBITDA −0,23x calc.) | ROE 14,41% · ML 9,4% | **739** | 100% · definitivo | Alta |
| PETR4 | 480,95 | DL/EBITDA 0,97x (calc., inclui arrendamentos) | ROE 27,73% · ML 24,4% | **729** | 100% · definitivo | Média (pico de ciclo + ingerência) |
| KNCR11 | 10,98 | Passivo/ativo 1,28% · 99% CDI, CDI+2,00% | FFO yield 10,86% · cobertura FFO 84,9% | **726** | 100% · definitivo | Média (crédito: só declaração da gestora) |
| B3SA3 | 18,71 | Caixa líquido (−0,21x calc.) | ROE 28,49% · ML 44,4% | **660** | 100% · definitivo | Alta |
| ITUB4 | 207,65** | CET1 12,3% · NPL90 1,9% (2T26) | ROE 22,45% calc. (recorrente oficial 24,3%) | **639** | 95% · definitivo | Alta |
| HGLG11 | 7,55 | Passivo/ativo 14,60% · vacância 2,4% | FFO yield 7,34% · cobertura 87,8% | **629** | 100% · definitivo | Alta |
| ASAI3 | 6,35 | DL+recebíveis/EBITDA 2,37x (oficial) | ROE 15,21% · ML 1,2% | **627** | 100% · definitivo | Média (lucro 3m divergente) |
| XPML11 | 6,90 | Passivo/ativo 12,99% · vacância 5,2% | FFO yield 9,19% · cobertura 85,9% | **597** | 100% · definitivo | Alta |
| KNSC11 | 2,09 | Passivo/ativo 1,02% · 57,9% IPCA+10,06% (HY) · maior exposição de 5,9% | FFO yield 12,30% · cobertura 112,6% | **566** | 100% · definitivo | Média (% de atraso N/D) |
| MXRF11 | 5,30 | Passivo/ativo 3,37% · ativos provisionados (Urbplan) | FFO yield 9,36% · cobertura 83,5% | **563** | 100% · definitivo | Média |
| RENT3 | 27,10 | DL/EBITDA 2,34x (calc.) | ROE 12,63% · ML 7,4% | **560** | 100% · definitivo | Alta |
| WEGE3 | 19,96 | Caixa líquido (−0,27x calc.) | ROE 31,41% · ML 16,4% | **613** | 100% · definitivo | Alta |
| HGBS11 | 3,03 | Passivo/ativo 18,75% · vacância 4,3% | FFO yield 8,53% · cobertura 85,6% | **526** | 100% · definitivo | Alta |
| VISC11 | 3,34 | **Passivo/ativo 24,74%** · vacância 5,8% | FFO yield 6,56% · **cobertura 68,7%** | **466** | 100% · definitivo | Alta |
| BBAS3 | 181,33 | CET1 11,27% · **NPL90 5,6%** · cobertura 148,45% (2T26) | ROE 7,99% calc. (oficial 8,3%) | **448** | 100% · definitivo | Média (cobertura de fonte secundária, 3T26 em 11/11) |
| VALE3 | 196,64 | DL/EBITDA 0,76x (calc.) | ROE proforma 19,2% (contábil 5,27%) · ML 4,0% | **578** | 100% · definitivo | Média (proforma em R$ estimado por razão) |
| MGLU3 | 11,17 | DL/EBITDA 1,02x (oficial) · desp. financeira de R$ 572 mi no 2T26 | ROE 0,79% · ML 0,2% | **249** | 100% · definitivo | Alta |
| HAPV3 | 48,06 | DL/EBITDA 2,52x (calc.) · prejuízo | ROE −0,36% · ML −0,5% | **158** | 100% · definitivo | **Baixa** (anomalias na base) |
| CSAN3 | 4,97 | DL/EBITDA 3,58x consolidado · cobertura do serviço da dívida da holding 0,2x (2T26, [Safra](https://oespecialista.safra.com.br/analise/cosan-reduz-divida-e-simplifica-estrutura/)) | ROE −178,97% · ML −22,1% | **106** | 100% · definitivo | Média (valor da Raízen incerto) |

\*\* ITUB4: o PL do Fundamentus é o da holding (individual). O ROE calculado (22,45%) é próximo do ROE recorrente consolidado oficial (24,3%).

### 4.3 Notas individuais (fato observado → interpretação)

- **BBAS3:**
  - Fatos: ROE de 8,3% no 2T26. NPL90 subiu 160 bps a/a, para 5,6%. A inadimplência do cartão foi de 7,1% para 14,58% em um trimestre. CET1 de 11,27%. O guidance de lucro deve ficar perto do piso.
  - Interpretação: o P/VP de 0,55 reflete um ROE abaixo do Ke, não pânico.
- **RENT3:**
  - Fatos: o lucro do 2T26 subiu 30,6% a/a. Alavancagem de ~2,3x. O spread de ROIC foi de 6,1 pp no 1S26.
  - Interpretação: a queda de −39,58% é beta de juros, já que a dívida é em CDI e a frota é financiada. O fundamento está preservado, mas o ROE de 12,6% fica abaixo do Ke de 18%: não há margem de segurança.
- **CYRE3:**
  - Fatos: ROE de 18%, caixa forte (liquidez de 3,37), P/L de 4,36. A prévia do 3T26 mostrou lançamentos −16% a/a.
  - Interpretação: a queda veio da taxa de desconto e do crédito imobiliário.
- **MGLU3:**
  - Fatos: prejuízo de R$ 72,5 mi no 2T26. Despesa financeira de R$ 572 mi no trimestre. A dívida líquida caiu 22% a/a.
  - Interpretação: com o DI a 15%, o resultado financeiro consome o EBIT.
- **VALE3:**
  - Fatos: subiu no estresse. O lucro de 12m foi deprimido por marcação de derivativos. O lucro proforma do 2T26 foi de US$ 1,57 bi.
  - Interpretação: o score subestima a empresa por usar lucro contábil (limitação 9.2).
- **WEGE3:**
  - Fatos: caixa líquido, ROE de 31%, P/L de 29,8.
  - Interpretação: é o melhor negócio do universo em qualidade, mas o valuation não oferece margem de segurança (MS de −77,5%).
- **PETR4:**
  - Fatos: ROE de 27,7%. O lucro do 2T26 (R$ 52,4 bi) foi inflado por um Brent perto de US$ 115. A subvenção do diesel é paga pelo governo.
  - Interpretação: o risco de ingerência aumentou após a reeleição.
- **ITUB4:**
  - Fatos: ROE de 24,3%, NPL90 estável em 1,9% por 6 trimestres, CET1 de 12,3%.
  - Interpretação: é o banco de melhor qualidade, mas o P/VP de 2,21 está acima do justo de 1,33 com Ke de 18%.
- **HAPV3:**
  - Fatos: prejuízo de R$ 217,1 mi no 2T26. O lucro ajustado caiu 95,8%. A judicialização subiu 60% a/a. A ação já tinha caído 87,7% em 12 meses antes do choque.
  - Interpretação: a deterioração é operacional e anterior à eleição.
- **LREN3:**
  - Fatos: caixa líquido, margem bruta recorde (57,5%), ROIC de 23,5%. O guidance de receita de 2026 foi cortado de 9–13% para 4–8%. O resultado da Realize caiu 54,9%.
- **ASAI3:**
  - Fatos: a alavancagem caiu de 3,17x para 2,37x em 12 meses. O lucro recorrente quase dobrou no 2T26.
  - Interpretação: a margem líquida de 1,2% deixa a empresa muito sensível a juros.
- **CSAN3:**
  - Fatos: a Raízen (44% da Cosan) está em recuperação extrajudicial de cerca de R$ 65 bi. A S&P colocou a perspectiva da Cosan em negativa. O prejuízo de 12m foi de R$ 8,9 bi. A cobertura do serviço da dívida da holding foi de 0,2x.
- **B3SA3:**
  - Fatos: caixa líquido, ROE de 28%. O ADTV caiu de R$ 36,7 bi no 1T26 para R$ 22,6 bi em agosto.
  - Interpretação: a queda de −36% é desproporcional a um negócio sem dívida. Mas o P/L de 14,3 dá um earnings yield de 7%, abaixo do Ke.
- **HGLG11:**
  - Fatos: vacância de 2,4–2,9%. Distribui mais do que o FFO (cobertura de 87,8%). Aquisição do Pátio GRU em 22/10/2026.
- **KNCR11:**
  - Fatos: 99% CDI a CDI+2,00%, prazo de 3,2 anos. Não houve eventos negativos de crédito segundo a gestora (out/26).
  - Interpretação: o fundo se beneficia de juro alto.
- **XPML11:** 17 shoppings, vacância de 5,2%. 11,3% da distribuição de 12m veio de venda de ativos.
- **HGBS11:** cap rate de 11,4%, vacância de 4,3%. Passivo de 18,7% dos ativos. Liquidez menor (R$ 8 mi/dia).
- **KNSC11:**
  - Fatos: 67% em IPCA+10,58% e 36% em CDI+3,19% (ago/26). Taxas de *high yield*. 6ª emissão a R$ 8,70.
  - Lacuna: inadimplência N/D.
- **VISC11:**
  - Fatos: o FFO de 12m cobre só 68,7% da distribuição, sem venda de ativos, o que indica uso de reserva ou resultado acumulado. O FFO do 3T26 anualizado já supera a distribuição. Passivo de 24,7% dos ativos.
- **MXRF11:**
  - Fatos: em ago/26, o resultado de R$ 0,094 ficou abaixo da distribuição de R$ 0,10. A reserva de correção caiu de R$ 0,048 para R$ 0,034/cota. Urbplan está 100% provisionado e AIZ/Pesa, em carência. A 12ª emissão aumentou as cotas em 23%.

---

## Seção 5: Metodologia matemática do score

### 5.1 Parâmetros globais

| Parâmetro | Valor | Justificativa |
|---|---|---|
| Ke (custo de capital próprio nominal) | **18%** | DI jan/31 de 15,19% (26/10) + prêmio de ações de ~3 pp |
| g (crescimento perpétuo nominal) | **5%** | ≈ IPCA esperado de 2026 (Focus 5,19%), crescimento real zero (conservador) |
| CDI líquido (referência dos FIIs) | **12,58%** | DI jan/28 de 14,80% × (1 − 15% de IR). Rendimento de FII é isento para PF. |
| clip(x) | limita x a [0, 1] | Toda nota é linear entre um piso e um teto e saturada nos extremos |

**ROE normalizado:**
- ROEₙ = média(ROE 12m, ROE do último trimestre × 4).
- **Exceção, commodities (VALE3, PETR4):** ROEₙ = ROE 12m. Regra prévia da Etapa 1: não extrapolar trimestre de pico de ciclo.

**Valor justo (modelo de valor residual / Gordon):**

  P/VP justo = max(0, (ROEₙ − g) / (Ke − g))  ·  Margem de segurança MS = P/VP justo ÷ P/VP atual − 1  ·  Valor justo por ação = P/VP justo × VPA

**Fator de qualidade:** Q = clip((ROEₙ − g)/(Ke − g)). Vale 0 se o ROE é menor ou igual ao crescimento, e 1 se o ROE é maior ou igual ao Ke.

### 5.2 Ações

| Pilar | Subindicador | Peso | Fórmula (pontos) | Ajuste setorial |
|---|---|---:|---|---|
| **P1 Desconto e assimetria (300)** | 1a. Margem de segurança | 150 | 150 × clip((MS + 30%) / 80%). MS ≤ −30% → 0; MS ≥ +50% → 150. | — |
| | 1b. Queda relativa ao Ibovespa × qualidade | 60 | 60 × clip(−(var_ativo − var_Ibov)/40 pp) × Q | Queda só pontua se o ROE se sustenta |
| | 1c. Tendência do fundamento | 90 | 90 × clip((ROE_3m×4 / ROE_12m − 0,5)/0,5). Se ROE_12m ≤ 0 → 0. | Detecta deterioração recente |
| **P2 Solidez e valuation (250)** | 2a. Alavancagem | 100 | 100 × clip((4 − DL/EBITDA)/4) | Incorporadora: 100 × clip(1 − DL/PL). Banco: 100 × clip((CET1 − 9,5%)/3,5 pp). |
| | 2b. Liquidez | 50 | 50 × clip((LC − 0,8)/1,2) | Banco: cobertura PDD/NPL90, 50 × clip((cob − 100%)/100 pp). **N/D nos 2 bancos → peso redistribuído.** |
| | 2c. Earnings yield vs Ke | 100 | 100 × clip((1/P/L) / Ke). Lucro ≤ 0 → 0. | — |
| **P3 Qualidade (250)** | 3a. ROEₙ | 100 | 100 × clip(ROEₙ / 25%) | — |
| | 3b. Eficiência | 75 | ROIC: 75 × clip(ROIC/20%) | Banco: NPL90, 75 × clip((6% − NPL)/3,5 pp) |
| | 3c. Crescimento | 50 | 50 × clip((CAGR receita 5a + 5%)/20 pp) | Banco: crescimento do lucro a/a do 2T26 |
| | 3d. Consistência | 25 | 12,5 × (LL 12m > 0) + 12,5 × (LL 3m > 0) | — |
| | Governança | −15 | Controle estatal (BBAS3, PETR4): −15 pontos, com piso 0 | Risco de ingerência (Etapa 1, Pilar 2) |
| **P4 Proventos (200)** | 4a. DY 12m | 80 | 80 × clip(DY/10%) | — |
| | 4b. Cobertura (payout = DY × P/L) | 80 | ≤ 60% → 80; 60–100% → linear de 80 a 20; > 100% ou lucro ≤ 0 ou DY = 0 → 0 | Rendimento insustentável vale menos que um menor e coberto |
| | 4c. Capacidade de manutenção | 40 | 20 × (LL 3m > 0) + 20 × (DL/EBITDA < 3 ou caixa líquido; banco: CET1 ≥ 11%; incorporadora: DL/PL < 0,6) | — |

### 5.3 FIIs

**Fator de qualidade do FII:** Qf = 0,5 + 0,5 × clip((cobertura FFO/distribuição − 0,7)/0,3). O desconto pontua por inteiro só quando a distribuição é coberta pelo resultado.

| Pilar | Subindicador | Peso | Fórmula |
|---|---|---:|---|
| **P1 (300)** | 1a. Desconto P/VP × Qf | 150 | 150 × clip((1,05 − P/VP)/0,25) × Qf |
| | 1b. Queda vs mediana dos FIIs × Qf | 60 | 60 × clip(−(var − mediana)/10 pp) × Qf |
| | 1c. Tendência do FFO | 90 | 90 × clip((FFO_3m×4 / FFO_12m − 0,7)/0,3) |
| **P2 (250)** | 2a. Passivo/ativo | 100 | 100 × clip((25% − L)/23 pp) |
| | 2b. Liquidez da cota | 50 | 50 × clip((volume médio de 2m − R$ 2 mi)/R$ 18 mi) |
| | 2c. FFO yield vs CDI líquido | 100 | 100 × clip((FFO yield − 6%)/(12,58% − 6%)) |
| **P3 (250), tijolo** | 3a. Vacância | 100 | 100 × clip((15% − vac)/12 pp) |
| | 3b. Diversificação | 75 | 75 × clip((nº imóveis − 3)/27) |
| | 3c. Porte (PL) | 50 | 50 × clip((PL − R$ 0,5 bi)/R$ 4,5 bi) |
| | 3d. Consistência | 25 | 12,5 × (FFO 12m > 0) + 12,5 × (FFO 3m > 0) |
| **P3 (250), papel** | 3a. Eventos de crédito | 100 | Sem eventos reportados → 100; carência ou renegociação → 50; ativo provisionado ou inadimplente → 20; N/D → redistribui |
| | 3b. Perfil de risco | 75 | HG (≥ 90% CDI e ≤ CDI+2,5%) → 75; Misto → 40; HY (IPCA+ ≥ 9,5% ou CDI+ ≥ 3% na maior parte) → 10 |
| | 3c. Porte (proxy de diversificação; nº de CRIs N/D) | 50 | igual ao tijolo |
| | 3d. Consistência | 25 | igual ao tijolo |
| **P4 (200)** | 4a. DY 12m | 80 | 80 × clip((DY − 6%)/7 pp) |
| | 4b. Cobertura FFO/distribuição | 80 | 80 × clip((cobertura − 0,7)/0,3) |
| | 4c. Dependência de venda de ativos | 40 | 40 × clip(1 − (venda de ativos 12m / distribuição 12m)/15%) |

### 5.4 Dados ausentes, cobertura e confiança

- **Dado ausente nunca vale zero nem a média.** O peso do subindicador ausente é redistribuído proporcionalmente dentro do mesmo pilar: pilar = (pontos obtidos ÷ peso disponível) × máximo do pilar.
- **Cobertura** = soma dos pesos com dado ÷ 1000.
  - ≥ 90%: **definitivo**.
  - 75–90%: **provisório**.
  - < 75%: **não calculável**.
- Resultado (v2): 19 ativos têm 100% de cobertura. ITUB4 tem 95% (cobertura de provisões N/D).
- **Confiança:**
  - Alta: cobertura ≥ 95%, sem divergência material entre fontes, balanço ≥ 30/06/2026.
  - Média: divergência material ou insumo crítico de qualidade inferior.
  - Baixa: lacuna no insumo mais importante do modelo de negócio, ou base com anomalias.

### 5.5 Justificativa dos pesos

- **P1 (30%)** é o objetivo da análise, desconto e assimetria. Mas metade dele (1a) depende de valor justo, não de queda. A queda bruta só entra multiplicada pela qualidade (1b).
- **P2 e P3 (25% cada)** protegem contra armadilhas: alavancagem e ROE abaixo do Ke derrubam o score mesmo com queda grande.
- **P4 (20%)** premia a cobertura do provento tanto quanto o DY (80 + 40 contra 80).
- **Universo de normalização:** as faixas são absolutas, com referência em Ke e CDI. Não são percentis do universo. Assim o score não depende de quais ativos foram incluídos.
- **Sem série de 5 anos de múltiplos:** a comparação com o histórico próprio foi substituída pela comparação com o valor justo (1a).
- **Comparabilidade:** bancos, incorporadoras, empresas gerais e FIIs usam métricas substitutas dentro de cada pilar. Os scores entre ações e FIIs medem atratividade relativa ao próprio referencial (Ke contra CDI líquido). **Não são retornos esperados comparáveis.**

---

## Seção 6: Ranking geral

| Posição | Ticker | Score | P1 / P2 / P3 / P4 | Confiança | Principal fundamento positivo | Principal risco |
|---:|---|---:|---|---|---|---|
| 1 | CYRE3 | 779 | 202 / 207 / 170 / 200 | Alta | ROE de 18% com P/L de 4,4 e MS de +17,5% | Ciclo imobiliário de alta renda com DI a 15%. Lançamentos −16% no 3T26. |
| 2 | LREN3 | 739 | 135 / 222 / 188 / 193 | Alta | Caixa líquido, ROIC de 23,5%, DY de 9,5% coberto | Guidance cortado. Realize −55%. MS de −18%. |
| 3 | PETR4 | 729 | 186 / 178 / 191 / 174 | Média | P/L de 5,2, ROE de 27,7%, DL/EBITDA < 1x | Lucro em pico de Brent. Ingerência pós-reeleição. |
| 4 | KNCR11 | 726 | 104 / 224 / 250 / 149 | Média | CDI+2% *high grade*, sem eventos de crédito, alavancagem de 1,3% | Corte de Selic reduz o rendimento. Distribuição acima do FFO contábil. |
| 5 | B3SA3 | 660 | 124 / 186 / 223 / 128 | Alta | Caixa líquido, ROE de 28%, receita recorrente +17% | ADTV em queda. Earnings yield de 7% < Ke. |
| 6 | ITUB4 | 639 | 88 / 170 / 221 / 159 | Alta | NPL estável em 1,9%, ROE de 24% | P/VP de 2,21 acima do justo (1,33) |
| 7 | HGLG11 | 629 | 156 / 116 / 250 / 108 | Alta | Vacância < 3%, 37 imóveis | Distribuição > FFO (87,8%). FFO yield de 7,3% < CDI líquido. |
| 8 | ASAI3 | 627 | 156 / 104 / 236 / 130 | Média | Desalavancagem (2,37x), lucro em alta | Margem líquida de 1,2%. Sensibilidade a juros. |
| 9 | WEGE3 | 613 | 90 / 150 / 238 / 136 | Alta | Melhor qualidade do universo, caixa líquido | P/L de 29,8: sem margem de segurança. DY recorrente de só 1,95%. |
| 10 | XPML11 | 597 | 145 / 151 / 196 / 106 | Alta | P/VP de 0,93, vacância de 5,2% | 11% da distribuição vem de venda de ativos |
| 11 | VALE3 | 578 | 51 / 171 / 176 / 181 | Média | ROE proforma de 19,2%, DL/EBITDA de 0,76x, proventos de R$ 5,61/ação | P/VP de 1,45 acima do justo (1,09). Lucro proforma estimado em R$. |
| 12 | KNSC11 | 566 | 114 / 206 / 73 / 174 | Média | FFO cobre 113% da distribuição, 84 CRIs, maior exposição de 5,9% | Carteira HY. Casa & Vídeo e Le Biscuit com ajuste contábil. % de atraso N/D. |
| 13 | MXRF11 | 563 | 125 / 195 / 135 / 108 | Média | Liquidez alta, alavancagem baixa | Ativos provisionados. Resultado < distribuição. Reserva caindo. |
| 14 | RENT3 | 560 | 116 / 109 / 176 / 159 | Alta | Lucro +30% a/a, líder do setor | ROE de 12,6% < Ke. Dívida em CDI. |
| 15 | HGBS11 | 526 | 165 / 82 / 176 / 104 | Alta | P/VP de 0,89, cap rate de 11,4% | Passivo de 18,7%, liquidez menor |
| 16 | VISC11 | 466 | 148 / 29 / 208 / 81 | Alta | P/VP de 0,90, 32 imóveis | Cobertura de 68,7%, passivo de 24,7% |
| 17 | BBAS3 | 448 | 73 / 155 / 69 / 151 | Média | P/VP de 0,55, CET1 de 11,3% | ROE de 8% < Ke. NPL de 5,6% com cobertura caindo de 183% para 148%. Estatal. |
| 18 | MGLU3 | 249 | 0 / 99 / 52 / 98 | Alta | Dívida em queda (1,02x) | Prejuízo. O financeiro consome o EBIT. |
| 19 | HAPV3 | 158 | 0 / 80 / 58 / 20 | Baixa | EV/EBITDA de 3,5 | Prejuízo, judicialização, margem em queda |
| 20 | CSAN3 | 106 | 0 / 47 / 59 / 0 | Média | Desinvestimentos em curso | Raízen em recuperação extrajudicial. Holding com cobertura de 0,2x. |

**Resultado do teste de sensibilidade** (`score.py`, 5 cenários):
- Cenários de peso: P1/P2/P3/P4 = 250/250/250/250; 200/300/300/200; e 360/220/220/200.
- Cenários de Ke: 16% e 20%.
- O top 5 é o mesmo conjunto em todos: CYRE3, LREN3, PETR4, KNCR11 e B3SA3.
- **CYRE3 fica em 1º em todos.**
- As posições 2 a 4 alternam entre LREN3, PETR4 e KNCR11, e nenhuma cai abaixo de 4º.
- **Conclusão:** a liderança da CYRE3 é robusta. A ordem entre o 2º e o 4º lugar **não é**: PETR4 (729) e KNCR11 (726) estão em empate técnico.

---

## Seção 7: Análise aprofundada das TOP 3

### 7.1 CYRE3 (Cyrela): score 779, confiança Alta

1. **Tese:**
   - Uma incorporadora rentável e capitalizada perdeu 44,81% em um pregão por reprecificação de juros. Ela não teve fato relevante próprio no dia. A queda de 26/10 devolveu toda a alta pós-1º turno e foi além.
   - O preço ficou abaixo do valor justo calculado mesmo com Ke de 18%.
2. **Evidências quantitativas** (calc. sobre o 2T26 do Fundamentus):
   - P/L de 4,36 e earnings yield de 22,9%, acima do Ke de 18%.
   - P/VP de 0,80, contra um P/VP justo de 0,94. O valor justo é de **R$ 23,15/ação**, para um preço de R$ 19,63, o que dá **MS de +17,5%**.
   - ROE de 12m de 18,3% e do trimestre anualizado de 16,2%.
   - DY de 11,8% com payout de 51%.
3. **Fundamentos operacionais:**
   - Liquidez corrente de 3,37 e DL/PL de 0,43.
   - Margem bruta de 33,1% e margem líquida de 17,0%.
   - Vendas do 2T26 +14% a/a ([Empiricus](https://www.empiricus.com.br/artigos/investimentos/previa-da-cyrela-cyre3-no-2t26-tem-avanco-em-lancamentos-e-vendas-consistentes-confira-analise-capf/)).
4. **Catalisadores potenciais (não garantidos):**
   - Nome técnico na Fazenda e devolução de parte dos +254 bps do DI longo.
   - Balanço do 3T26.
   - Manutenção dos dividendos.
5. **Riscos:**
   - Lançamentos −16% a/a no 3T26 ([Suno](https://www.suno.com.br/noticias/?p=667235), fonte com cabeçalho inconsistente).
   - VSO de 12m em queda (42,8%) e estoque de alto padrão de 20 meses.
   - Funding SBPE mais caro e queda de vendas em 2027.
   - A MS é estreita: um ROEₙ de ~15,4% (contra 17,2% hoje) zera a margem de segurança.
6. **Invalidação:**
   - ROE abaixo de 15% por dois trimestres.
   - DL/PL acima de 0,6.
   - Distratos em alta.
   - Corte do dividendo sem contrapartida em recompra.
7. **Horizonte:** médio prazo, de 12 a 24 meses. Depende do ciclo de juros.
8. **Confiança: Alta.** Os dados estão completos e consistentes entre o Fundamentus e as prévias. A ressalva é que o balanço é de 30/06, anterior ao choque.

### 7.2 LREN3 (Lojas Renner): score 739, confiança Alta

1. **Tese:**
   - Uma varejista com caixa líquido, ROIC de 23,5% e DY de 9,5% coberto caiu 33,61% junto com o varejo endividado.
   - O mercado não diferenciou balanço: a ação caiu menos que MGLU3, mas no mesmo bloco.
   - **Mas o modelo indica MS de −18%:** a ação ficou mais barata, sem chegar a uma margem de segurança. O score alto vem da solidez (P2) e dos proventos (P4), não do desconto.
2. **Evidências:**
   - P/L de 6,52, P/VP de 0,94 e EV/EBITDA de 1,73.
   - Valor justo calculado de R$ 7,93, para um preço de R$ 9,68.
   - Payout de 62%.
   - ROE de 12m de 14,4% e do trimestre anualizado de 15,6%, ou seja, estável ou melhorando.
3. **Operacional:**
   - Margem bruta recorde de 57,5% no 2T26.
   - Despesas +1,5%.
   - Lucro de R$ 404,6 mi, estável a/a ([Money Times](https://www.moneytimes.com.br/renner-lren3-lucra-r-405-milhoes-no-2t26-e-corta-guidance-de-receita-para-2026-vtra/)).
4. **Catalisadores:** queda do DI longo, Black Friday e Natal, recuperação da Realize.
5. **Riscos:**
   - Guidance de receita de 2026 cortado para +4% a 8%.
   - Resultado da Realize −54,9%.
   - Inadimplência recorde de pessoa física (7,8%) atinge o cartão próprio.
   - Escala 6×1 encarece o custo trabalhista.
6. **Invalidação:**
   - Perdas da Realize em alta por dois trimestres.
   - Margem bruta abaixo de 55%.
   - Passagem para dívida líquida.
7. **Horizonte:** médio prazo.
8. **Confiança: Alta.** As perdas de crédito da Realize no 2T26 não foram localizadas e são um ponto a acompanhar.

### 7.3 PETR4 (Petrobras): score 729, confiança Média

1. **Tese:**
   - Geração de caixa muito alta a preço baixo: P/L de 5,2, EV/EBITDA de 3,1 e DL/EBITDA abaixo de 1x.
   - Com ROE de 12m (sem extrapolar o trimestre recorde), o P/VP justo é de 1,75, contra 1,44 atual. A **MS é de +21,4%** e o valor justo, de **R$ 65,26**.
   - **Não é um ativo "penalizado pelo estresse":** caiu 8,18% em 26/10, menos que o Ibovespa, e acumula +12,09% em 1 mês. O score vem de valuation e qualidade.
2. **Evidências:**
   - ROE de 27,7%, ROIC de 19,7% e margem líquida de 24,4%.
   - DY de 6,8% com payout de 35%.
   - O lucro do 2T26 foi de R$ 52,4 bi. Anualizado, daria um ROE de 43,6%. O modelo **não usa** esse número.
3. **Operacional:** liquidez corrente de 0,85, típica do setor. Subvenção do diesel recebida do governo.
4. **Catalisadores:** dividendos do 3T26. O BTG projeta US$ 3,8–4,2 bi ([Investidor10](https://investidor10.com.br/noticias/btg-projeta-dividendos-gordos-na-petrobras-petr4-apos-subsidio-ao-diesel-119626/)), mas isso é projeção, não fato.
5. **Riscos:**
   - **Ingerência**, já precificada só parcialmente pelo desconto de −15 no modelo: política de preço, capex direcionado e retenção de dividendos.
   - Defasagem do diesel em R$ 3,53/l.
   - Atraso nos repasses de subvenção (US$ 2,5 bi a receber, segundo o BTG).
   - **Reversão do Brent**: o lucro está em pico de ciclo, com US$ 115 por tensão geopolítica.
   - O mecanismo de subvenção vale só até o fim de 2026.
6. **Invalidação:**
   - Troca de CEO ou conselho com mudança de política de preços ou de dividendos.
   - ROE de 12m abaixo de ~23,7%, que zera a MS no modelo (por exemplo, por reversão do Brent).
   - Capex fora do plano.
7. **Horizonte:** curto a médio prazo. É uma tese de caixa e dividendo, não de reprecificação.
8. **Confiança: Média.** Os dados são completos, mas a premissa central (ROE de 12m) depende de um preço de commodity anormal, e o risco político não é mensurável.

**Nota, empate técnico com o KNCR11 (726):**
- O KNCR11 é a alternativa de menor risco do topo: passivo de 1,3%, carteira 99% CDI a CDI+2%, sem eventos de crédito declarados e DY calc. de 12,79%, acima do CDI líquido de 12,58%.
- O score não é maior porque não há desconto: o P/VP é de 1,02.
- O FFO contábil cobre 84,9% da distribuição. Em fundo de CRI, o regime de caixa difere do FFO, e esse indicador tem limitação.
- Ele se beneficia de juros altos. É o oposto da CYRE3 em sensibilidade, o que tem valor de diversificação, mas isso não é medido pelo score.

---

## Seção 8: Ativos com maior risco de armadilha de valor

Critério: queda expressiva **e** pelo menos 3 sinais vermelhos da Etapa B (`../dados/criterios_value.csv`), verificados nos dados, não presumidos.

| Ativo | Queda (estresse / 1 mês) | Sinais vermelhos verificados | Leitura |
|---|---|---|---|
| **CSAN3** | −46,73% / −27,49% | Prejuízo de 12m de R$ 8,9 bi · DL/EBITDA de 3,58x · cobertura do serviço da dívida da holding de 0,2x · sem dividendos · investida (Raízen) em recuperação extrajudicial | **Armadilha provável.** O valor do equity depende do desfecho da Raízen e de vendas de ativos. O múltiplo não ajuda. |
| **HAPV3** | −54,93% / −36,42% (−87,7% em 12m) | Prejuízo no 2T26 (R$ 217 mi) · lucro ajustado −95,8% · judicialização +60% · sinistralidade de 75,2% · ROE negativo | **Armadilha provável.** A deterioração operacional antecede a eleição. O P/VP de 0,04 é ilusório porque o PL é ágio. |
| **MGLU3** | −58,23% / −21,60% | ROE de 0,8% · prejuízo no 2T26 · despesa financeira de R$ 572 mi/tri contra EBIT de R$ 404 mi/tri · margem líquida de 0,2% | **Armadilha provável enquanto o DI estiver perto de 15%.** O balanço melhorou (DL −22%), mas o lucro não existe a esse custo de capital. |
| **BBAS3** | −29,33% / −19,08% | ROE de 8% < Ke · NPL90 +160 bps a/a · cartão de 7,1% para 14,6% em um tri · guidance perto do piso · controle estatal | **Deterioração real.** O P/VP de 0,55 está acima do justo calculado (0,19). Não é desconto irracional. Reavaliar no 3T26 (11/11). |
| VISC11 (rendimento) | −8,39% | Cobertura FFO de 68,7% · passivo de 24,7% dos ativos | Não é armadilha de preço (P/VP de 0,90). É **risco de corte de distribuição** se o FFO do 3T26 não se mantiver. |
| MXRF11 (rendimento) | −3,50% | Resultado < distribuição (ago/26) · reserva caindo · ativos provisionados | **Risco de redução do rendimento.** O preço está estável e não reflete esse risco. |

**Não são armadilhas, mas têm score baixo por limitação do modelo:**
- **VALE3:** o lucro contábil é deprimido por derivativos. Ver 9.2.
- **WEGE3:** não há armadilha. A qualidade é excelente, e o score baixo vem da falta de margem de segurança: o preço é justo ou caro, não armadilha.

---

## Seção 9: Limitações e conclusão

### 9.1 Limitações dos dados
1. **Balanços anteriores ao choque.** Os fundamentos de 12 das 13 ações são do 2T26. O 3T26 (out–nov) vai incorporar juros e câmbio novos.
2. **Bancos:** a cobertura de provisões ficou N/D para ITUB4 e BBAS3, com peso redistribuído. O BB divulga o 3T26 em 11/11, com provisões estimadas pelo Goldman em R$ 20,3 bi (estimativa, não fato).
3. **HAPV3:** a receita trimestral do Fundamentus (R$ 1,22 bi) é incompatível com a de 12m (R$ 31,9 bi). Adotado o lucro oficial do 2T26. Confiança Baixa.
4. **KNSC11:** inadimplência e concentração N/D. O PDF da carta da Kinea não pôde ser lido.
5. **FIIs de papel:** FFO contábil × regime de caixa. A cobertura pode subestimar a capacidade real de distribuição.
6. **Câmbio:** três variações diferentes para o mesmo dia (+8,25%, +5,97% e +0,92%).
7. **Sem séries de 5 anos de múltiplos e sem IFIX:** as comparações são com o valor justo e com a mediana do grupo.
8. **Resolvido na v2:**
   - O DY da WEGE3 incluía um dividendo de reserva. Agora é usado o DY recorrente de 1,95%.
   - O DY da VALE3 (8,7%) é consistente com R$ 5,61/ação declarados em 12m. O lucro contábil estava deprimido, e agora é usado o proforma.
   - Os dados vêm majoritariamente de fontes secundárias. Os sites de RI bloquearam o acesso automático.

### 9.2 Limitações do modelo
- **O valor justo de Gordon é muito sensível ao Ke.** Com Ke de 16%, LREN3 vai para MS de cerca de −3%. O ranking do topo não muda (teste da Seção 6), mas os valores justos mudam bastante.
- **Lucro contábil:** penaliza empresas com itens não caixa (VALE3). Não há ajuste para lucro recorrente, por falta de série homogênea.
- **Risco político não modelado:** o −15 de governança é uma regra fixa, não uma estimativa de probabilidade.
- **Faixas lineares** são uma simplificação. Os limiares foram escolhidos antes do cálculo e são os mesmos para todos os ativos de cada classe.

### 9.3 O que mudaria o ranking
- **Nome da Fazenda e Copom de 04/11:** uma devolução do DI longo favorece CYRE3, RENT3 e LREN3 (P1 sobe por Ke menor). Uma alta da Selic favorece KNCR11 e prejudica as domésticas.
- **3T26:** uma queda de ROE na CYRE3 ou uma piora da Realize na LREN3 derrubam as duas primeiras posições.
- **Brent:** uma reversão que leve o ROE de 12m da PETR4 abaixo de ~23,7% elimina a margem de segurança.

### 9.4 Conclusão
- O modelo identifica **uma oportunidade com margem de segurança e confiança alta (CYRE3)**.
- Identifica também **uma com margem de segurança e confiança média (PETR4)**, que depende de commodity e governança.
- E **duas de qualidade sem margem de segurança relevante (LREN3, KNCR11)**.
- A maior parte das quedas de 26/10 tirou prêmio de preço, mas não levou os ativos para baixo do valor justo a um Ke de 18%.
- Os maiores tombos (MGLU3, HAPV3, CSAN3) coincidem com os piores fundamentos. Não há evidência de que sejam descontos irracionais.

---

### Fontes principais

**Preços e mercado:**
- Yahoo Finance (API de gráfico diária, coletada em 27/10/2026)
- [B3 Bora Investir, 26/10/2026](https://borainvestir.b3.com.br/noticias/mercado/apos-circuit-breaker-ibovespa-b3-recua-13-com-eleicao-no-foco-dolar-vai-a-r-540/)
- [CNN, juros futuros](https://www.cnnbrasil.com.br/economia/money/mercado/juros-futuros-fecham-em-alta-apos-reeleicao-de-lula/)

**Fundamentos:**
- Fundamentus, `https://www.fundamentus.com.br/detalhes.php?papel=<TICKER>` (dados de 26/10/2026)

**Resultados do 2T26:**
- [Itaú (InfoMoney)](https://www.infomoney.com.br/mercados/itau-itub4-resultados-segundo-trimestre-2026/)
- [BB (XP)](https://conteudos.xpi.com.br/acoes/relatorios/banco-do-brasil-bbas3-resultado-acima-do-esperado-mas-deterioracao-em-pessoas-fisicas-torna-o-guidance-desafiador/)
- [BB (InfoMoney)](https://www.infomoney.com.br/mercados/banco-do-brasil-bbas3-resultados-segundo-trimestre-2026/)
- [Bancos 3T26 (Seu Dinheiro)](https://www.seudinheiro.com/2026/empresas/nem-todo-bancao-vai-sair-ileso-o-que-esperar-dos-balancos-de-itau-bradesco-santander-e-banco-do-brasil-no-3t26-miql/)
- [Hapvida (Visno)](https://visnoinvest.com.br/news/14762/hapvida-hapv3-registra-prejuizo-de-r-217-mi-no-2t26)
- [Hapvida (O Petróleo)](https://opetroleo.com.br/hapv3-despenca-apos-lucro-da-hapvida-cair-958-no-2t26/)
- [Cosan (Safra)](https://oespecialista.safra.com.br/analise/cosan-reduz-divida-e-simplifica-estrutura/)
- [Cosan/S&P (Seu Dinheiro)](https://www.seudinheiro.com/2026/empresas/cosan-csan3-sp-acende-alerta-para-impacto-da-raizen-e-revisa-perspectiva-para-negativa-lvgb/)
- [Assaí (Renova)](https://renovainvest.com.br/blog/assai-asai3-quase-dobra-lucro-recorrente-no-2t26/)
- [Magalu (Money Times)](https://www.moneytimes.com.br/magazine-luiza-mglu3-tem-prejuizo-de-r-725-milhoes-no-2t26-estamos-fazendo-tudo-para-voltar-a-dar-lucro-sem-depender-dos-juros-diz-cfo-lmrs/)
- [Localiza (Acionista)](https://acionista.com.br/localiza-rent3-apresenta-resultados-financeiros-do-2t26-com-crescimento-expressivo/)
- [Renner (Money Times)](https://www.moneytimes.com.br/renner-lren3-lucra-r-405-milhoes-no-2t26-e-corta-guidance-de-receita-para-2026-vtra/)
- [Vale (Suno)](https://www.suno.com.br/noticias/?p=659990)
- [B3 (Genial)](https://analisa.genialinvestimentos.com.br/acoes/b3/b3-b3sa3-resultado-2t26-diversificacao-amortece-a-perda-de-forca-dos-volumes)
- [Petrobras (Investidor10)](https://investidor10.com.br/noticias/btg-projeta-dividendos-gordos-na-petrobras-petr4-apos-subsidio-ao-diesel-119626/)

**FIIs:**
- [KNCR11 (Funds Explorer)](https://www.fundsexplorer.com.br/noticias/kncr11-carteira-cdi-dividendos)
- [KNSC11 (Fii News Paper)](https://x.com/fiinewspaper/status/2099210066347896934)
- [MXRF11, relatório de ago/26](https://brfiis.com.br/fundos/MXRF11/documentos/2026-out-02/relatorio-gerencial-1339341)
- [HGLG11 (Clube FII)](https://www.clubefii.com.br/fiis/HGLG11)

---

> Este relatório tem finalidade exclusivamente educacional e informativa. Não constitui recomendação individualizada de compra, venda ou manutenção de ativos financeiros, nem substitui uma análise adequada ao perfil, aos objetivos e à tolerância ao risco de cada investidor. Os dados e indicadores estão sujeitos a alterações, e resultados passados não garantem resultados futuros. As pontuações apresentadas dependem das premissas, dos critérios e da qualidade das informações disponíveis na data da análise.
