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

## Próximas etapas (planejadas)

- **Etapa 2:** concluída em 27/10/2026 (`02_etapa2_score/`).
- Atualizar `dados/` a cada evento relevante: Copom 04/11/2026, anúncio do ministro da Fazenda, balanços 3T26 (Santander 28/10, BB 11/11).

## Convenções

- Datas em `AAAA-MM-DD` nos nomes de arquivo.
- Cada novo snapshot de mercado = novo CSV em `dados/`, nunca sobrescrever o anterior.
- Toda afirmação numérica deve ter fonte em `fontes.md`.
