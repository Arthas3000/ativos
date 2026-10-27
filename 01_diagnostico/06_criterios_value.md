# Pilar 4 — Regras de Precificação: Desconto Irracional × Armadilha de Valor

## Premissa do momento

Com DI ≈ 15% e Selic em 13,75%, o **custo de capital próprio (Ke) nominal** de referência fica em ~17–19% (DI longo + prêmio de ações de 3–4 pp).
Qualquer múltiplo precisa ser lido contra esse Ke, não contra médias históricas de um país com Selic de 2%.

**Earnings yield de equilíbrio:** `1 / P/L ≥ Ke` → P/L ≤ ~5,5x para empresa sem crescimento real. P/L acima disso só se justifica com crescimento ou ROE alto e sustentável.

## Teste em duas etapas

### Etapa A — O ativo está barato? (filtro de múltiplos)

| Critério | Limite "descontado" | Observação |
|---|---|---|
| P/L | < 70% da própria média de 5 anos **e** < média do setor | Usar lucro **recorrente**, nunca o contábil |
| P/VP | < 1,0x (não financeiras com ROE > Ke) · bancos: abaixo do P/VP justo pela fórmula de Gordon | P/VP baixo com ROE baixo é preço justo, não desconto |
| EV/EBITDA | < 70% da média de 5 anos | Melhor que P/L para alavancadas: captura a dívida |
| Dividend Yield | > NTN-B longa + 2 pp **e** payout ≤ 80% do FCF | DY alto só por queda de preço é sinal neutro |
| Queda vs. setor | Caiu mais que o índice setorial **sem** fato relevante próprio | Indica venda forçada / beta macro |

Passou na A → vai para a B. Falhou → não está barato, fim.

### Etapa B — Caiu por pânico ou porque piorou? (filtro de fundamento)

| Dimensão | ✅ Desconto **irracional** | ❌ Empresa **realmente piorou** |
|---|---|---|
| **ROE** | ≥ Ke e estável/subindo nos últimos 4–8 tri | Em queda por 3+ tri, ou < Ke de forma estrutural |
| **Alavancagem** (DL/EBITDA) | < 2,0x (ou caixa líquido) | > 3,0x e subindo |
| **Cobertura de juros** (EBIT / Desp. fin., recalculada a CDI 15%) | > 3,0x | < 1,5x: o acionista trabalha para o credor |
| **FCF** | Positivo e cobre os dividendos | Negativo, dividendo pago com dívida |
| **Revisões de lucro** (consenso) | Estáveis; queda do preço ≫ queda da projeção | Cortes de projeção ≥ queda do preço |
| **Margens** | Estáveis vs. pares | Comprimindo mais que os pares (perda de competitividade) |
| **Amortizações 18 meses** | Cobertas por caixa | Dependem de refinanciamento a DI 15% |
| **Causa da queda** | Macro/beta, mesma queda do setor no mesmo dia | Fato relevante, *guidance* cortado, troca de gestão, ingerência |
| **Governança** | Sem mudança | Interferência estatal, conflito com controlador |

**Classificação:**
- **≥ 7 de 9** na coluna verde → candidato a "descontado irracionalmente".
- **3 ou mais** na coluna vermelha → presumir armadilha, mesmo com múltiplo baixo.
- Entre esses dois → "em observação". Reavaliar após o balanço do 3T26.

## Ajustes por setor

| Setor | Métrica-chave | Ignorar / cuidado |
|---|---|---|
| Bancos | P/VP vs. ROE, cobertura, NPL | EV/EBITDA (não se aplica) |
| FIIs | P/VP, DY recorrente, vacância (tijolo), % CRIs em atraso (papel) | P/L |
| Commodities | EV/EBITDA no preço **médio** de ciclo | P/L no pico do ciclo (parece barato no topo) |
| Varejo | EV/EBITDA ex-IFRS16, FCF, cobertura de juros | P/L com crédito tributário |
| Estatais | Tudo acima + desconto estrutural de governança (20–40%) | Comparar com privadas sem ajuste |
| Utilities | Dívida/EBITDA, indexação da dívida (IPCA vs. CDI), TIR real implícita vs. NTN-B | DY isolado |

## Sinais quantitativos de pânico (técnico, não fundamento)

Indicam que o preço pode ter descolado. Não substituem a Etapa B.

- Queda > 3 desvios-padrão em 1 dia com volume > 3x a média
- Queda igual à de pares com balanços muito diferentes (o mercado não diferenciou)
- Circuit breaker / leilões sucessivos
- Aluguel de ações (*short interest*) baixo antes da queda: foi venda de comprados, não aposta vendida informada

## Exemplo de leitura (ilustrativo, não recomendação)

Uma varejista cai 55% em um dia. Teste A: P/L recorrente foi de 15x para 6,7x → passa. Teste B: DL/EBITDA de 3,5x, cobertura de juros a CDI 15% de 1,2x, FCF negativo → **3 vermelhos → armadilha**. O preço caiu porque o equity ficou pequeno diante da dívida. Isso é matemática, não pânico.

Uma exportadora caixa líquido cai 15% no mesmo dia por fluxo estrangeiro. ROE de 20%, revisões estáveis → candidata a desconto irracional.

Os limites numéricos estão em `../dados/criterios_value.csv`, para uso como régua na Etapa 2.
