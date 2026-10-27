# Revisão de UX/UI do app — 27/10/2026

Escopo: app do GitHub Pages (áreas Mercado, Minha carteira, Simulador e Ajustes). A página do painel publicada no Claude não muda.
Público: investidor pessoa física que acompanha ações e FIIs da B3, de iniciante (precisa entender os termos) a experiente (quer registrar e planejar rápido).

Método: carteira de exemplo montada no navegador. As 4 áreas e as 21 seções foram percorridas em desktop (1280 px) e celular (375 px), com dados reais da versão v4 e com dados vazios. O código de cada tela foi lido para confirmar a causa de cada problema.

## Prioridades

| # | Problema | Onde | Impacto | Esforço | Situação |
|---|---|---|---|---|---|
| 1 | Termos técnicos sem explicação na tela | Todas as áreas | Alto: iniciante não entende TWR, XIRR, P/VP, gap, lote | Médio | Feito |
| 2 | Campos parecem desabilitados | Formulários de todo o app | Alto: o usuário hesita em digitar | Baixo | Feito |
| 3 | Simulador indica período errado antes de marcar ativos | Simulador › Montar carteira | Alto: "5 anos" bloqueado sem motivo real | Baixo | Feito |
| 4 | Transações sem busca nem filtro; "Cancelar" ambíguo | Minha carteira › Transações | Alto com o uso contínuo | Médio | Feito |
| 5 | Comprar/Vender pouco distinguíveis; botão "Registrar" genérico | Minha carteira › Comprar ou vender | Médio: risco de registrar venda como compra | Baixo | Feito |
| 6 | Textos apontando para "abaixo" ou com nomes antigos após a reorganização | Carteira, Ajustes, avisos | Médio: instruções levam a lugar nenhum | Baixo | Feito |
| 7 | Etiqueta de preço repetida em todas as linhas | Posições, Planejar aporte | Médio: ruído visual | Baixo | Feito |
| 8 | Marcar ativo por ativo a cada aporte | Planejar aporte › passo 1 | Médio para quem aporta todo mês | Baixo | Feito |
| 9 | Números digitados à mão onde há faixa ou poucas opções | Ajustes › Custos; Planejar aporte › passo 2 | Médio: erros de digitação e dúvida sobre o efeito | Baixo | Feito |
| 10 | Blocos de números um por linha no celular | Resumo da carteira, Simulador, Visão geral | Médio: rolagem longa | Baixo | Feito |
| 11 | Atalho interno não abria as seções do Mercado | Links "Ver no glossário" e similares | Alto quando acontece (bug) | Baixo | Feito |

## Detalhe de cada melhoria

### 1. Termos técnicos explicados onde aparecem
- **Problema:** o app usa dezenas de termos (TWR, XIRR, margem de segurança, P/VP, FFO, CET1, gap, lote, fator do score) sem explicação na tela. A única fonte era o tour, que é longo.
- **Impacto:** um iniciante não sabe se +225% de TWR e 26,8% de XIRR se contradizem, nem o que "gap 30 p.p." pede que ele faça.
- **Solução:** um **Glossário** com 66 termos, agrupados em 6 categorias, com busca e filtro, como seção do Mercado. Botões **?** ao lado dos termos (mais de 50 pontos da interface) abrem uma explicação curta ali mesmo, com o link "Ver no glossário". Escolhi o padrão de dica que abre ao toque, e não o de passar o mouse, porque funciona no celular e no teclado.
- **Interação:**
  - Antes: o "?" fica discreto ao lado do rótulo.
  - Ao tocar: abre uma bolha com o termo e a definição, que o leitor de tela anuncia.
  - Depois: Esc ou um toque fora fecha a bolha e o foco volta ao "?". "Ver no glossário" abre a definição destacada.
- **Efeitos colaterais:**
  - Os "?" são inseridos depois de cada redesenho, por observação do DOM; os cálculos não mudam.
  - Os cabeçalhos ordenáveis do Ranking ficaram sem "?", para não poluir a tabela; o glossário cobre essas colunas.
- **Verificação:** a bolha abre e fecha com Esc e devolve o foco; o link abre o glossário com o termo focado; a busca "twr" acha 2 termos; uma busca sem resultado mostra a mensagem de vazio.

### 2. Campos com aparência de campo
- **Problema:** os campos tinham fundo cinza sobre o cartão branco e borda com contraste de cerca de 1,2:1. Pareciam desabilitados.
- **Solução:** fundo do cartão, borda com contraste de cerca de 3:1 (WCAG 1.4.11) e borda vermelha quando o campo tem erro (`aria-invalid`). Campo desabilitado fica tracejado. A mesma regra vale para os temas claro e escuro.
- **Verificação:** inspeção nas telas de Comprar, Caixa, Ajustes e Simulador, nos dois temas, pelos tokens de cor.

### 3. Períodos do Simulador antes de marcar ativos
- **Problema:** sem nenhum ativo marcado, o Simulador usava o ativo de histórico mais curto (KNSC11, desde 17/02/2022). Por isso dizia "o histórico dos ativos marcados começa em 17/02/2022" e bloqueava "Últimos 5 anos".
- **Solução:**
  - Sem seleção, a tela mostra o maior período disponível e a frase "Marque os ativos para ver o período comum a todos eles".
  - Com seleção, o texto vira "Período com dados de todos os ativos marcados".
- **Verificação:** sem seleção, os 5 anos ficam liberados; ao marcar o KNSC11, eles são bloqueados com a data correta.

### 4. Transações: encontrar e anular com clareza
- **Problema:**
  - Com o uso contínuo, a lista cresce sem busca nem filtro.
  - "Cancelar" ao lado de "Corrigir" lê-se como "desistir desta ação".
- **Solução:**
  - Busca por ticker ou observação, filtro por tipo e contador ("1 de 3 transação(ões)").
  - "Cancelar" virou **Anular**: pede o motivo, o botão de confirmação fica em vermelho e, depois, uma mensagem diz onde a transação anulada continua visível.
  - A lista vazia sugere o primeiro passo (Registrar depósito); um filtro sem resultado oferece "Limpar filtros".
- **Efeitos colaterais:** o tipo interno `cancelamento` não muda, então backups antigos continuam válidos.
- **Verificação:** os filtros testados no navegador dão 3 → 1 → 1 → 1 → 3; anular sem motivo mostra erro; com motivo, mostra a confirmação e reduz o total.

### 5. Comprar ou vender
- **Problema:** os botões Comprar e Vender só se diferenciavam por uma borda, e o botão final dizia apenas "Registrar".
- **Solução:** a opção escolhida fica preenchida (`aria-pressed`) e o botão final diz "Registrar compra" ou "Registrar venda". A confirmação "executada na corretora" continua obrigatória.
- **Verificação:** o rótulo muda ao alternar; os fluxos de compra e de correção passam de ponta a ponta.

### 6. Textos coerentes com a nova organização
- **Problema:** depois da separação em seções, alguns textos ainda diziam "registre uma compra abaixo", "aba Corretora" ou "em Configurações".
- **Solução:** cada texto aponta para o lugar certo ("Minha carteira › Transações", "Ajustes › Backup"), e os estados vazios trazem botões que levam direto à seção.
- **Verificação:** busca no código pelos nomes antigos (só sobram em comentários) e o botão "Registrar uma compra" leva a `#corretora/operar`.

### 7. Etiqueta de preço uma vez só
- **Problema:** "atrasado · 26/10/2026 · fechamento" se repetia em cada linha, 20 vezes no planejamento de aporte.
- **Solução:** quando todas as linhas têm a mesma etiqueta, ela aparece uma vez acima da tabela, com o "?" que explica os estados do preço. Se alguma linha difere (ex.: um preço manual), as etiquetas voltam a aparecer por linha.
- **Verificação:** em Posições e no passo 1, a etiqueta aparece uma vez e nenhuma fica visível nas linhas.

### 8. Seleção rápida no planejamento de aporte
- **Solução:** botões "Os N com alvo definido", "Os N da minha carteira" e "Limpar seleção". Ficam desabilitados quando o número é zero.
- **Verificação:** "com alvo definido" marca exatamente os 2 ativos com alvo.

### 9. Controles numéricos adequados
- **Intensidade do score** (em Ajustes e no passo 2): virou um controle deslizante de 0 a 100% em passos de 5, que mostra o efeito em palavras ("0% — não usa o score", "efeito suave", "moderado" ou "forte").
- **Lote padrão:** virou uma lista com as duas opções reais, "1 — mercado fracionário" e "100 — lote padrão". Um valor diferente salvo antes é preservado.
- **Verificação:** os valores salvos 100 e 0,45 foram lidos de volta corretamente.

### 10. Celular
- Os blocos de números passam a vir dois por linha, com o valor sem quebrar o "R$".
- Botões e campos têm pelo menos 44 px.
- Não há rolagem lateral em 375 px em nenhuma área.

### 11. Bug: atalho para seções do Mercado
- `INV.ir()` só abria as abas criadas pelo app. Agora abre qualquer seção, o que corrige o link "Ver no glossário" e outros atalhos.

## Validação
- 40 testes de cálculo (`node --test`) e o `atualizar.py teste` passam.
- Fluxos de ponta a ponta no navegador passam:
  - Carteira: depósito, compra com preço manual preservado, confirmação obrigatória, correção (o caixa fica em R$ 9.100,00, como esperado) e ativos próprios com bloqueio de duplicata.
  - Planejamento e Simulador: o assistente nos 5 passos (bloqueia quantidade acima do orçamento) e a simulação com dados reais.
  - Ajustes: backup sem o token e o token sem rede.
  - Persistência após recarregar e celular sem rolagem lateral.
- Tutorial: 92 passos no desktop e no celular, sem erro. Os 6 passos do resultado do Simulador mostram a explicação de que o bloco aparece depois de simular.

## Limitações e próximos passos
- A cotação ao vivo (brapi) não pôde ser testada contra a rede neste ambiente.
- Uma anulação não se desfaz: para voltar atrás, registre a transação de novo, o que deixa o histórico explícito.
- O campo de data e hora segue o idioma do navegador; em português, aparece como DD/MM/AAAA.
- Sugestão futura: um modo "registro rápido" para quem já tem a nota de corretagem em mãos (pular a estimativa), se o uso mostrar essa necessidade.
