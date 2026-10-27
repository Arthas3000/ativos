---
name: atualizar-painel-b3
description: Atualiza o Painel de Oportunidades B3 e a base de pesquisa deste projeto (raiz com 01_diagnostico, 02_etapa2_score, 03_painel). Cria uma nova versão (vN+1) com preços, fundamentos, dados manuais, macro, score, relatório e painel, e guarda a versão anterior como histórico. Use quando o usuário pedir para atualizar o painel, os dados, os preços, o score ou o ranking de ações e FIIs da B3, ou para rodar uma nova versão da análise.
---

# Atualizar o Painel de Oportunidades B3

Toda atualização gera uma **nova versão** (v3, v4…). As versões anteriores ficam intactas em
`03_painel/historico/<data>_<versao>/`, e os scores de todas as versões em `03_painel/historico/scores_historico.csv`.
O painel publicado é `painel_url` em `03_painel/config.json`.

## Regras que não mudam

1. **Não altere estruturas.** Mantenha:
   - pastas, nomes de arquivos e colunas de `dados_entrada.csv` e `notas_ativos.csv`;
   - ids dos datasets do painel (`ativos`, `precos`, `macro`, `sensibilidade`, `historico`, `parametros`);
   - fórmulas e pesos de `score.py`;
   - nomes de indicadores do snapshot macro.
   Mudança de método só com pedido explícito do usuário. Quando houver, aplique a regra a todos os ativos e registre-a na revisão.
2. **Nunca sobrescreva o histórico.** Não edite nada em `03_painel/historico/` (a não ser o script anexar linhas ao CSV de scores). Não apague `fundamentus_*.json` nem `dados/snapshot_mercado_*.csv` antigos: cada versão cria os seus.
3. **Nunca invente número.** Dado não localizado vira `N/D` e o campo fica vazio. Fonte secundária é marcada como secundária em `obs`. Divergência entre fontes é registrada.
4. **O universo é fixo:** 13 ações e 7 FIIs, sem trocar ticker sem avisar.
5. Use o mesmo idioma e o mesmo formato das versões anteriores: português, R$, percentuais com 2 casas.
6. É material educacional. Não é recomendação individual de investimento. O disclaimer fica no relatório e no painel.

## Antes de começar

- Leia `03_painel/config.json`, `README.md` e o topo de `02_etapa2_score/relatorio_etapa2.md` (última "Revisão").
- Pergunte ao usuário só o que muda o trabalho:
  - **Escopo:** atualização completa (padrão) ou só preços.
  - **Evento de estresse:** se houve um evento novo de estresse (padrão: manter o atual, `evento`/`data_pre_estresse`/`data_estresse`).
- Crie a lista de passos no `update_plan`.

## Passo a passo (nesta ordem)

Comandos rodam na raiz do projeto. No Windows, `python`.

1. **Nova versão**
   ```bash
   python 03_painel/atualizar.py nova-versao
   ```
2. **Preços** (Yahoo, 3 meses):
   ```bash
   python 03_painel/atualizar.py precos
   ```
   Depois ajuste em `config.json`:
   - `data_ref`: último pregão fechado. Não use pregão em andamento.
   - `data_1m`: pregão de cerca de 1 mês antes.
   - `data_1s`: pregão de cerca de 1 semana antes.
   As datas de estresse só mudam se o usuário confirmou um evento novo. Nesse caso, `var_stress` em `dados_entrada.csv` precisa ser recalculado para todos os ativos (fechamento pré → estresse), e `fii_mediana` vira a mediana dos FIIs.
3. **Fundamentos automáticos** (Fundamentus):
   ```bash
   python 03_painel/atualizar.py fundamentus --nao-aplicar
   ```
   - Mostre ao usuário as mudanças relevantes (balanço novo, saltos grandes).
   - Depois aplique:
     ```bash
     python 03_painel/atualizar.py fundamentus
     ```
   - O script não toca colunas manuais nem as listadas em `travar` (`notas_ativos.csv`).
4. **Dados manuais.** Pesquise na web e preencha em `dados_entrada.csv`. Prefira RI/CVM/FNET e registre a fonte em `obs`.
   | Coluna | Ativos | O que é |
   |---|---|---|
   | `cet1`, `npl90`, `cobertura`, `cresc` | BBAS3, ITUB4 | Capital principal, inadimplência > 90d, PDD/NPL90, lucro a/a do trimestre |
   | `ll12_rec` | VALE3 | Lucro proforma dos últimos 4 trimestres em R$. Se só houver em US$: contábil × (proforma ÷ contábil), marcado como estimativa por razão |
   | `dy_rec` | WEGE3 (e outro com provento extraordinário) | DY sem o extraordinário |
   | `dl_ebitda` | ASAI3, MGLU3 | Alavancagem oficial da companhia |
   | `ll3` | HAPV3 | Lucro oficial do trimestre (o Fundamentus diverge) |
   | `credito`, `perfil` | KNCR11, KNSC11, MXRF11 | Regra em `relatorio_etapa2.md`, Seção 5.3 |
   - Quando sair balanço novo, revise o campo daquele ativo. Se não mudou, mantenha e diga isso.
   - Com 4 ou mais pesquisas independentes, pode usar `/model-router` (workers sonnet/medium em paralelo, só leitura). O coordenador confere cada número antes de gravar.
5. **Macro.**
   - Crie `dados/snapshot_mercado_<data_ref>.csv` com as **mesmas colunas e os mesmos nomes de indicador** do snapshot anterior. O painel lê "Ibovespa variação", "DI jan/31", "DI jan/31 ajuste anterior", "Selic meta", "Focus Selic fim 2026", "Dólar comercial fechamento", "Dólar variação dia" e "Focus IPCA 2026".
   - Indicadores podem ser acrescentados, mas não renomeados.
   - Aponte `macro_csv` em `config.json` para o novo arquivo.
   - Se o cenário mudou de verdade, crie uma nova revisão no topo dos arquivos de `01_diagnostico/`, no mesmo formato, sem apagar o texto anterior.
6. **Notas qualitativas.** Em `03_painel/notas_ativos.csv`, atualize `tese`, `risco`, `nota`, `sinal` e `confianca` só onde os fatos mudaram. Os sinais válidos são `oportunidade`, `oportunidade-com-risco`, `qualidade-sem-margem`, `neutro`, `risco-rendimento` e `armadilha`. Separe itens com ` · `, nunca com `;`.
7. **Score e dados do painel:**
   ```bash
   python 03_painel/atualizar.py build
   ```
   Em seguida:
   ```bash
   python 03_painel/atualizar.py teste
   ```
   Se o teste falhar, corrija a causa antes de seguir.
8. **Relatório.** Acrescente no **topo** de `02_etapa2_score/relatorio_etapa2.md` um bloco "Revisão vN (data)", no mesmo formato da "Revisão v2":
   - o que mudou e por quê;
   - scores que se moveram mais de 20 pontos;
   - o novo top 5;
   - lacunas que continuam N/D.
   Atualize a Tabela B e o ranking da Seção 6 com os números novos (`03_painel/dados/ativos.json`). Não reescreva as demais seções: a versão anterior completa está no snapshot.
9. **Publicar no painel** (`painel_url`):
   - Envie cada JSON de `03_painel/dados/` com o Artifact tool (`asset: true`, `url`, um arquivo por chamada).
   - Leia os documentos `datasets/<id>` (ArtifactData `get`, para pegar o `version`).
   - Faça um `batch` de `update` em cada um, com `source.url` e `source.name` novos, `updated: {at: <ISO agora>, by: "Claude, versão vN"}` e `if_version`.
   - Se `03_painel/painel/index.html` mudou, atualize `files/index.html` com `{text}`.
   - Leia `data/users/me/check` (até 5 leituras). Se vier `failed`, corrija o que o código confirmar.
   - Não apague assets antigos.
10. **App do celular e versão guardada:**
    ```bash
    python 03_painel/atualizar.py site
    ```
    Depois:
    ```bash
    python 03_painel/atualizar.py snapshot
    ```
    - `site` regera `docs/` (GitHub Pages) com a mesma página e os dados novos.
    - Se o projeto tem remoto no GitHub (`git remote -v`), faça o commit com a mensagem `Versão vN (data): <resumo>`.
    - O push publica no site público. Peça confirmação ao usuário antes de rodar `git push`.
    - Antes do commit, rode `git pull --rebase`: o workflow do GitHub pode ter criado versões automáticas no meio. Se houver conflito em `config.json` ou `scores_historico.csv`, mantenha as duas versões em sequência (renumere a sua para a próxima livre) e rode `build`, `site` e `snapshot` de novo.
11. **Resumo ao usuário:**
    - a versão;
    - as datas;
    - o que mudou no ranking (aba Histórico do painel);
    - o que ficou N/D;
    - fontes secundárias usadas;
    - o link do painel;
    - o lembrete de que não é recomendação de investimento.

## Atualização pelo app (GitHub Actions)

O botão "Atualizar dados" do app abre `.github/workflows/atualizar.yml` no GitHub, onde o usuário toca em "Run workflow".
O workflow roda só a parte automática:
- `nova-versao`, `precos`, `auto-datas`, `fundamentus`;
- `build`, `teste`, `site`, `snapshot`;
- e o commit.

Ele **não** pesquisa os dados manuais, não muda o macro e não publica no painel do Claude. Quando esta skill rodar depois de versões automáticas, revise os campos manuais e o macro, que podem estar defasados.

## Se algo falhar

| Problema | O que fazer |
|---|---|
| Yahoo ou Fundamentus fora do ar ou com HTML diferente | Pare e avise. Não preencha à mão. Rótulos novos do Fundamentus se ajustam em `LABELS` de `atualizar.py`. |
| Ticker sem dados (deslistado, grupamento) | Avise o usuário antes de qualquer troca. O grupamento muda a série de preços: confira `preco_1m` contra o histórico ajustado. |
| `snapshot` diz que a pasta já existe | Rode `nova-versao` antes. O histórico nunca é sobrescrito. |
