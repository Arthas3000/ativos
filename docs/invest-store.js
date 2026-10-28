/* Painel B3 — módulo de investimentos: estado, dados, cotação, utilidades de UI e aba Configurações.
   Expõe window.INV (contrato: spec.md, seção 4). Requer window.INVCalc, window.PB e window.dash. */
(function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const W = window;
  if (W.INV || !W.INVCalc || !W.PB || !W.dash) return;

  // ---------------------------------------------------------------- constantes e utilidades
  const KEY = 'pb-invest-v1';
  const KEY_CORROMPIDO = 'pb-invest-v1-corrompido';
  const TKEY = 'pb-invest-token-brapi';
  const TIPOS = ['compra', 'venda', 'deposito', 'retirada', 'cancelamento'];
  const CLASSES = ['Ação', 'FII', 'ETF', 'BDR', 'Outro'];
  const FONTES_PRECO = ['manual', 'brapi', 'fechamento', 'yahoo'];
  const RE_DATA = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2})?$/;
  const RE_TICKER = /^[A-Z]{4}\d{1,2}$/;
  const LISTA_MAX = 100;
  const C = () => W.INVCalc;

  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isObj = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
  const isInt = (x) => typeof x === 'number' && Number.isSafeInteger(x);
  const pad = (n) => String(n).padStart(2, '0');
  const hoje = () => { const d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
  const agoraLocal = () => { const d = new Date(); return hoje() + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); };
  const diasDesde = (iso) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return null;
    const a = Date.UTC(+m[1], +m[2] - 1, +m[3]);
    const h = hoje().split('-').map(Number);
    return Math.round((Date.UTC(h[0], h[1] - 1, h[2]) - a) / 864e5);
  };

  const padrao = () => ({
    schema: 1, ativosCustom: [], transacoes: [], alvos: {}, lista: [],
    config: { taxaFixaCent: 0, taxaPct: 0, intensidadeScore: 0.3, lotePadrao: 1 }, rascunhos: {}
  });

  // ---------------------------------------------------------------- armazenamento
  let memOnly = false;      // true quando o navegador não deixa gravar (modo privado etc.)
  let corrompido = false;   // true quando havia dados ilegíveis no localStorage
  let memToken = '';
  try {
    localStorage.setItem('__pb_probe__', '1');
    localStorage.removeItem('__pb_probe__');
  } catch (e) { memOnly = true; }

  // ---------------------------------------------------------------- validação / migração
  const num = (v, nome, o) => {
    if (typeof v !== 'number' || !Number.isFinite(v)) throw new Error(nome + ': número inválido.');
    if (o.int && !Number.isSafeInteger(v)) throw new Error(nome + ': deve ser inteiro.');
    if (o.min !== undefined && v < o.min) throw new Error(nome + ': deve ser maior ou igual a ' + o.min + '.');
    if (o.max !== undefined && v > o.max) throw new Error(nome + ': deve ser menor ou igual a ' + o.max + '.');
    return v;
  };

  // Aceita valores ausentes (usa o padrão); lança Error se algo presente estiver malformado.
  // estrito = importação de backup (rejeita o que é duvidoso); avisos (array) recebe avisos não fatais da importação.
  function normalizar(raw, estrito, avisos) {
    if (!isObj(raw)) throw new Error('Formato inválido: esperado um objeto.');
    if (raw.schema !== undefined && raw.schema !== 1) throw new Error('Versão de dados não suportada (schema ' + raw.schema + ').');
    const s = padrao();
    if (raw.config !== undefined) {
      if (!isObj(raw.config)) throw new Error('Configuração inválida.');
      const c = raw.config;
      if (c.taxaFixaCent !== undefined) s.config.taxaFixaCent = num(c.taxaFixaCent, 'Corretagem fixa (centavos)', { int: true, min: 0 });
      if (c.taxaPct !== undefined) s.config.taxaPct = num(c.taxaPct, 'Taxas (%)', { min: 0, max: 100 });
      if (c.intensidadeScore !== undefined) s.config.intensidadeScore = num(c.intensidadeScore, 'Intensidade do score', { min: 0, max: 1 });
      if (c.lotePadrao !== undefined) s.config.lotePadrao = num(c.lotePadrao, 'Lote padrão', { int: true, min: 1 });
    }
    if (raw.ativosCustom !== undefined) {
      if (!Array.isArray(raw.ativosCustom)) throw new Error('Lista de ativos personalizados inválida.');
      const vistos = new Set();
      const doPainel = estrito ? painelTickers() : null;
      raw.ativosCustom.forEach((a, i) => {
        if (!isObj(a)) throw new Error('Ativo personalizado #' + (i + 1) + ' inválido.');
        if (typeof a.ticker !== 'string' || !RE_TICKER.test(a.ticker)) throw new Error('Ativo personalizado #' + (i + 1) + ': ticker inválido.');
        if (vistos.has(a.ticker)) throw new Error('Ativo personalizado duplicado: ' + a.ticker + '.');
        vistos.add(a.ticker);
        if (doPainel && doPainel.has(a.ticker)) throw new Error(a.ticker + ' já faz parte dos 20 ativos do painel e não pode ser um ativo personalizado.');
        if (!CLASSES.includes(a.classe)) throw new Error(a.ticker + ': classe inválida.');
        if (a.moeda !== undefined && a.moeda !== 'BRL') throw new Error(a.ticker + ': só há suporte a ativos em BRL.');
        const lote = a.lote === undefined ? 1 : num(a.lote, a.ticker + ': lote', { int: true, min: 1 });
        const pm = a.precoManualCent === undefined || a.precoManualCent === null ? null : num(a.precoManualCent, a.ticker + ': preço manual', { int: true, min: 1 });
        s.ativosCustom.push({
          ticker: a.ticker, nome: typeof a.nome === 'string' && a.nome.trim() ? a.nome.trim().slice(0, 80) : a.ticker,
          classe: a.classe, lote, precoManualCent: pm, moeda: 'BRL',
          criadoEm: typeof a.criadoEm === 'string' ? a.criadoEm : ''
        });
      });
    }
    if (raw.transacoes !== undefined) {
      if (!Array.isArray(raw.transacoes)) throw new Error('Lista de transações inválida.');
      const ids = new Set();
      raw.transacoes.forEach((t, i) => {
        const r = 'Transação #' + (i + 1) + ': ';
        if (!isObj(t)) throw new Error(r + 'formato inválido.');
        if (typeof t.id !== 'string' || !/^tx_[A-Za-z0-9_-]+$/.test(t.id)) throw new Error(r + 'id inválido.');
        if (ids.has(t.id)) throw new Error(r + 'id repetido (' + t.id + ').');
        ids.add(t.id);
        if (!TIPOS.includes(t.tipo)) throw new Error(r + 'tipo inválido.');
        if (typeof t.data !== 'string' || !RE_DATA.test(t.data)) throw new Error(r + 'data inválida.');
        if (t.moeda !== undefined && t.moeda !== 'BRL') throw new Error(r + 'só há suporte a BRL.');
        if (t.ticker !== undefined && t.ticker !== null && (typeof t.ticker !== 'string' || !RE_TICKER.test(t.ticker))) throw new Error(r + 'ticker inválido.');
        if (t.fontePreco !== undefined && t.fontePreco !== null && !FONTES_PRECO.includes(t.fontePreco)) throw new Error(r + 'fonte de preço inválida.');
        if (t.substitui !== undefined && t.substitui !== null && typeof t.substitui !== 'string') throw new Error(r + 'referência de correção inválida.');
        s.transacoes.push({
          id: t.id, tipo: t.tipo, ticker: t.ticker || null, data: t.data,
          qtd: t.qtd === undefined ? 0 : num(t.qtd, r + 'quantidade', { int: true, min: 0 }),
          precoCent: t.precoCent === undefined ? 0 : num(t.precoCent, r + 'preço', { int: true, min: 0 }),
          taxasCent: t.taxasCent === undefined ? 0 : num(t.taxasCent, r + 'taxas', { int: true, min: 0 }),
          valorCent: t.valorCent === undefined ? 0 : num(t.valorCent, r + 'valor', { int: true, min: 0 }),
          moeda: 'BRL', status: 'executada', fontePreco: t.fontePreco || null,
          obs: typeof t.obs === 'string' ? t.obs.slice(0, 500) : '',
          criadoEm: typeof t.criadoEm === 'string' ? t.criadoEm : '', substitui: t.substitui || null
        });
      });
      if (estrito) s.transacoes.forEach((t, i) => {
        if (t.substitui && !ids.has(t.substitui)) throw new Error('Transação #' + (i + 1) + ': aponta para uma transação que não existe no arquivo.');
      });
    }
    if (raw.alvos !== undefined) {
      if (!isObj(raw.alvos)) throw new Error('Alvos inválidos.');
      Object.keys(raw.alvos).forEach((k) => {
        if (!RE_TICKER.test(k)) throw new Error('Alvo com ticker inválido: ' + k + '.');
        s.alvos[k] = num(raw.alvos[k], 'Alvo de ' + k, { min: 0, max: 100 });
      });
    }
    if (raw.lista !== undefined) {
      // Lista de acompanhamento (tela Hoje): só códigos válidos, sem repetição; o que não serve é descartado sem bloquear.
      if (!Array.isArray(raw.lista)) { if (estrito && avisos) avisos.push('A lista de ativos acompanhados estava num formato inválido e foi descartada.'); }
      else raw.lista.forEach((t) => { if (typeof t === 'string' && RE_TICKER.test(t) && !s.lista.includes(t) && s.lista.length < LISTA_MAX) s.lista.push(t); });
    }
    if (raw.rascunhos !== undefined) {
      // Rascunhos são só conveniência: o que estiver malformado é descartado (com aviso na importação), nunca bloqueia.
      const aviso = (m) => { if (estrito && avisos) avisos.push(m); };
      if (!isObj(raw.rascunhos)) aviso('Os rascunhos do arquivo estavam num formato inválido e foram descartados.');
      else {
        let tam = 0;
        Object.keys(raw.rascunhos).forEach((k) => {
          const v = raw.rascunhos[k];
          let txt = null;
          if (isObj(v)) { try { txt = JSON.stringify(v); } catch (e) { txt = null; } }
          if (txt === null || tam + txt.length > 200000) { aviso('O rascunho "' + k + '" estava inválido ou grande demais e foi descartado.'); return; }
          tam += txt.length;
          s.rascunhos[k] = JSON.parse(txt);
        });
      }
    }
    return s;
  }

  const cmpTx = (a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.criadoEm || '') < (b.criadoEm || '') ? -1 : (a.criadoEm || '') > (b.criadoEm || '') ? 1 : 0);

  // Refaz o livro em ordem cronológica e devolve os erros de validarTx (ex.: venda maior que a posição na época).
  function validarLivro(txs) {
    const ef = C().efetivas(txs).slice().sort(cmpTx);
    const erros = [];
    for (let i = 0; i < ef.length; i++) {
      const e = C().validarTx(ef[i], { posicoes: C().posicoes(ef.slice(0, i)) });
      if (e && e.length) erros.push(ef[i].data.slice(0, 10).split('-').reverse().join('/') + ' ' + (ef[i].ticker || ef[i].tipo) + ': ' + e.join(' '));
    }
    return erros;
  }

  // ---------------------------------------------------------------- estado
  let estado = null;
  function lerStorage() {
    corrompido = false;
    if (memOnly) return null;
    let txt = null;
    try { txt = localStorage.getItem(KEY); } catch (e) { memOnly = true; return null; }
    if (txt === null) return null;
    try { return normalizar(JSON.parse(txt), false); } catch (e) {
      corrompido = true;
      try { localStorage.setItem(KEY_CORROMPIDO, txt); } catch (e2) { /* sem espaço: segue */ }
      return null;
    }
  }
  estado = lerStorage() || padrao();

  // Outra aba pode ter gravado depois da nossa leitura: antes de qualquer mudança, relê o armazenamento persistente
  // (estado = lerStorage() || estado) para duas abas não se sobrescreverem.
  function atualizarDoStorage() {
    if (memOnly) return;
    const lido = lerStorage();
    if (lido) estado = lido;
  }

  const ouvintes = {};
  function on(ev, fn) {
    (ouvintes[ev] = ouvintes[ev] || []).push(fn);
    return () => { ouvintes[ev] = (ouvintes[ev] || []).filter((f) => f !== fn); };
  }
  function emit(ev, detalhe) {
    (ouvintes[ev] || []).slice().forEach((fn) => { try { fn(detalhe); } catch (e) { console.error(e); } });
  }

  function gravar(novo, silencioso, origem) {
    if (!memOnly) {
      try { localStorage.setItem(KEY, JSON.stringify(novo)); } catch (e) {
        throw new Error('Não foi possível gravar os dados neste navegador (armazenamento cheio ou bloqueado). Nada foi alterado. Exporte um backup em Ajustes › Backup.');
      }
    }
    estado = novo;
    if (!memOnly) corrompido = false;   // o armazenamento agora tem dados válidos (a cópia dos ilegíveis continua guardada)
    if (!silencioso) emit('mudou', { origem: origem || 'salvar' });
  }

  function salvar(mutador, opcoes) {
    if (typeof mutador !== 'function') throw new Error('salvar: informe uma função.');
    atualizarDoStorage();
    const copia = clone(estado);
    mutador(copia);
    let novo;
    try { novo = normalizar(copia, false); } catch (e) { throw new Error('Dados inválidos: ' + e.message); }
    gravar(novo, !!(opcoes && opcoes.silencioso));
    return clone(estado);
  }

  W.addEventListener('storage', (ev) => {
    if (ev.key !== KEY && ev.key !== null) return;
    const novo = lerStorage();
    estado = novo || padrao();
    emit('mudou', { origem: 'storage' });
  });

  function exportar() {
    return JSON.stringify(Object.assign({ app: 'painel-b3-invest', schema: 1, exportadoEm: new Date().toISOString() }, clone(estado)), null, 2);
  }

  function analisarImport(texto) {
    let raw;
    try { raw = JSON.parse(texto); } catch (e) { throw new Error('O arquivo não é um JSON válido.'); }
    if (!isObj(raw) || raw.app !== 'painel-b3-invest') throw new Error('Este arquivo não parece um backup deste painel (campo "app" ausente ou diferente).');
    let novo;
    const avisos = [];
    try { novo = normalizar(raw, true, avisos); } catch (e) { throw new Error('Backup inválido: ' + e.message); }
    const erros = validarLivro(novo.transacoes);
    if (erros.length) throw new Error('Backup inconsistente: ' + erros.slice(0, 3).join(' | ') + (erros.length > 3 ? ' (e mais ' + (erros.length - 3) + ')' : ''));
    return { estado: novo, exportadoEm: typeof raw.exportadoEm === 'string' ? raw.exportadoEm : null,
      resumo: { transacoes: novo.transacoes.length, ativos: novo.ativosCustom.length, avisos } };
  }
  function importar(texto) {
    const a = analisarImport(texto);
    gravar(a.estado, false, 'importar');
    return a.resumo;
  }
  function apagarTudo() {
    const novo = padrao();
    if (!memOnly) {
      try { localStorage.removeItem(KEY); localStorage.removeItem(KEY_CORROMPIDO); } catch (e) { throw new Error('Não foi possível apagar os dados do navegador.'); }
    }
    corrompido = false;
    estado = novo;
    emit('mudou', { origem: 'apagar' });
  }

  // Cópia dos dados ilegíveis (guardada por lerStorage em KEY_CORROMPIDO) para o usuário poder baixá-la.
  function copiaCorrompida() {
    if (memOnly) return null;
    try { return localStorage.getItem(KEY_CORROMPIDO); } catch (e) { return null; }
  }
  function baixarCopiaCorrompida() {
    const txt = copiaCorrompida();
    if (txt === null) throw new Error('Não há cópia de dados corrompidos neste navegador.');
    const nome = 'painel-b3-dados-corrompidos-' + hoje() + '.json';
    const url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url; a.download = nome;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return nome;
  }
  function descartarCopiaCorrompida() {
    try { localStorage.removeItem(KEY_CORROMPIDO); } catch (e) { throw new Error('Não foi possível apagar a cópia dos dados corrompidos.'); }
    emit('mudou', { origem: 'descartar-copia' });
  }

  // ---------------------------------------------------------------- transações
  const novoId = () => 'tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  function prepararTx(tx) {
    const t = Object.assign({ ticker: null, qtd: 0, precoCent: 0, taxasCent: 0, valorCent: 0, fontePreco: null, obs: '', substitui: null }, tx || {});
    t.id = novoId(); t.criadoEm = new Date().toISOString(); t.moeda = 'BRL'; t.status = 'executada';
    if (t.ticker) t.ticker = String(t.ticker).trim().toUpperCase(); else t.ticker = null;
    if (!t.data) t.data = agoraLocal();
    return t;
  }
  function achar(id) { return estado.transacoes.find((t) => t.id === id) || null; }
  function checarSubstituivel(orig, id) {
    if (!orig) throw new Error('Transação não encontrada.');
    if (orig.tipo === 'cancelamento') throw new Error('Um cancelamento não pode ser corrigido nem cancelado.');
    if (!C().efetivas(estado.transacoes).some((t) => t.id === id)) throw new Error('Esta transação já foi corrigida ou cancelada. Use a versão mais recente.');
  }
  function gravarTx(t, novas) {
    const erros = validarLivro(novas);
    if (erros.length) throw new Error(erros.join(' '));
    salvar((s) => { s.transacoes.push(t); });
    return clone(t);
  }
  // Recusa data além de agora + 1 dia (folga para fuso horário). Aceita 'AAAA-MM-DD' e 'AAAA-MM-DDTHH:MM' (hora local).
  function erroDataFutura(t) {
    const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(t.data || ''));
    if (!m) return null;
    const quando = new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0).getTime();
    if (Number.isFinite(quando) && quando > Date.now() + 864e5) {
      return 'A data da operação (' + INV.ui.fmtDataHora(t.data) + ') está no futuro. Registre apenas operações que já aconteceram: corrija a data.';
    }
    return null;
  }
  function adicionarTx(tx) {
    atualizarDoStorage();
    const t = prepararTx(tx);
    t.substitui = null;
    const futuro = erroDataFutura(t);
    if (futuro) throw new Error(futuro);
    const erros = C().validarTx(t, { posicoes: C().posicoes(C().efetivas(estado.transacoes)) });
    if (erros && erros.length) throw new Error(erros.join(' '));
    return gravarTx(t, estado.transacoes.concat([t]));
  }
  function adicionarTxs(lista) {
    if (!Array.isArray(lista) || !lista.length) throw new Error('Nenhuma transação para registrar.');
    atualizarDoStorage();
    const acumulado = estado.transacoes.slice();
    const novas = [], erros = [];
    lista.forEach((tx, i) => {
      const t = prepararTx(tx);
      t.substitui = null;
      const e = C().validarTx(t, { posicoes: C().posicoes(C().efetivas(acumulado)) }) || [];
      const futuro = erroDataFutura(t);
      if (futuro) e.push(futuro);
      if (e && e.length) erros.push('Item ' + (i + 1) + (t.ticker ? ' (' + t.ticker + ')' : '') + ': ' + e.join(' '));
      else { novas.push(t); acumulado.push(t); }
    });
    if (erros.length) throw new Error('Nada foi gravado. ' + erros.join(' | '));
    const le = validarLivro(acumulado);
    if (le.length) throw new Error('Nada foi gravado. ' + le.join(' '));
    salvar((s) => { novas.forEach((t) => s.transacoes.push(t)); });
    return clone(novas);
  }
  function corrigirTx(idAntigo, txNova) {
    atualizarDoStorage();
    const orig = achar(idAntigo);
    checarSubstituivel(orig, idAntigo);
    const t = prepararTx(txNova);
    t.substitui = idAntigo;
    const futuro = erroDataFutura(t);
    if (futuro) throw new Error(futuro);
    const base = C().efetivas(estado.transacoes).filter((x) => x.id !== idAntigo);
    const erros = C().validarTx(t, { posicoes: C().posicoes(base) });
    if (erros && erros.length) throw new Error(erros.join(' '));
    return gravarTx(t, estado.transacoes.concat([t]));
  }
  function cancelarTx(id, motivo) {
    atualizarDoStorage();
    const orig = achar(id);
    checarSubstituivel(orig, id);
    const t = prepararTx({ tipo: 'cancelamento', ticker: orig.ticker, data: agoraLocal(), qtd: 0, precoCent: 0, taxasCent: 0, valorCent: 0,
      obs: String(motivo || '').trim().slice(0, 500), substitui: id });
    const erros = C().validarTx(t, { posicoes: C().posicoes(C().efetivas(estado.transacoes)) });
    if (erros && erros.length) throw new Error(erros.join(' '));
    return gravarTx(t, estado.transacoes.concat([t]));
  }

  // ---------------------------------------------------------------- ativos personalizados e alvos
  const painelTickers = () => new Set((W.dash.data('ativos').data || []).map((r) => r.ticker));
  const temMovimento = (ticker) => C().efetivas(estado.transacoes).some((t) => t.ticker === ticker);
  const ativoCustom = {
    adicionar(a) {
      atualizarDoStorage();
      a = a || {};
      const v = C().validarTicker(a.ticker);
      if (!v || !v.ok) throw new Error((v && v.erro) || 'Ticker inválido. Use o formato PETR4 ou HGLG11.');
      const ticker = v.ticker;
      if (painelTickers().has(ticker)) throw new Error(ticker + ' já faz parte dos 20 ativos do painel.');
      if (estado.ativosCustom.some((x) => x.ticker === ticker)) throw new Error(ticker + ' já está cadastrado como ativo personalizado.');
      const classe = a.classe || 'Outro';
      if (!CLASSES.includes(classe)) throw new Error('Classe inválida. Use: ' + CLASSES.join(', ') + '.');
      const lote = a.lote === undefined || a.lote === null || a.lote === '' ? estado.config.lotePadrao : a.lote;
      if (!isInt(lote) || lote < 1) throw new Error('O lote deve ser um número inteiro maior ou igual a 1.');
      const pm = a.precoManualCent === undefined || a.precoManualCent === null ? null : a.precoManualCent;
      if (pm !== null && (!isInt(pm) || pm < 1)) throw new Error('O preço manual deve ser maior que zero.');
      const nome = String(a.nome || '').trim().slice(0, 80) || ticker;
      salvar((s) => { s.ativosCustom.push({ ticker, nome, classe, lote, precoManualCent: pm, moeda: 'BRL', criadoEm: new Date().toISOString() }); });
      return INV.ativo(ticker);
    },
    editar(ticker, campos) {
      atualizarDoStorage();
      ticker = String(ticker || '').toUpperCase();
      if (!estado.ativosCustom.some((x) => x.ticker === ticker)) throw new Error(ticker + ' não é um ativo personalizado.');
      campos = campos || {};
      if (campos.classe !== undefined && !CLASSES.includes(campos.classe)) throw new Error('Classe inválida. Use: ' + CLASSES.join(', ') + '.');
      if (campos.lote !== undefined && (!isInt(campos.lote) || campos.lote < 1)) throw new Error('O lote deve ser um número inteiro maior ou igual a 1.');
      if (campos.precoManualCent !== undefined && campos.precoManualCent !== null && (!isInt(campos.precoManualCent) || campos.precoManualCent < 1)) throw new Error('O preço manual deve ser maior que zero.');
      salvar((s) => {
        const x = s.ativosCustom.find((y) => y.ticker === ticker);
        ['nome', 'classe', 'lote', 'precoManualCent'].forEach((k) => {
          if (campos[k] === undefined) return;
          x[k] = k === 'nome' ? (String(campos[k]).trim().slice(0, 80) || ticker) : campos[k];
        });
      });
      return INV.ativo(ticker);
    },
    remover(ticker) {
      atualizarDoStorage();
      ticker = String(ticker || '').toUpperCase();
      if (!estado.ativosCustom.some((x) => x.ticker === ticker)) throw new Error(ticker + ' não é um ativo personalizado.');
      const pos = C().posicoes(C().efetivas(estado.transacoes));
      if ((pos[ticker] && pos[ticker].qtd > 0) || temMovimento(ticker)) {
        throw new Error('Não dá para remover ' + ticker + ': há posição ou transações registradas com ele. Cancele as transações antes.');
      }
      salvar((s) => { s.ativosCustom = s.ativosCustom.filter((x) => x.ticker !== ticker); delete s.alvos[ticker]; });
    }
  };
  function definirAlvo(ticker, pct) {
    ticker = String(ticker || '').toUpperCase();
    if (!RE_TICKER.test(ticker)) throw new Error('Ticker inválido.');
    if (pct !== null && pct !== undefined && (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100)) throw new Error('O alvo deve estar entre 0 e 100%.');
    salvar((s) => { if (pct === null || pct === undefined) delete s.alvos[ticker]; else s.alvos[ticker] = pct; });
  }

  // ---------------------------------------------------------------- lista de acompanhamento (tela Hoje do modo Fácil)
  // Começa vazia: o usuário inclui um ativo por vez, quando quer ver o preço ou comprar.
  const lista = {
    ler: () => estado.lista.slice(),
    adicionar(texto) {
      const v = C().validarTicker(String(texto || ''));
      if (!v || !v.ok) throw new Error((v && v.erro) || 'Código inválido. Use o formato PETR4 ou HGLG11.');
      if (!RE_TICKER.test(v.ticker)) throw new Error('Código fora do formato aceito (4 letras e 1 ou 2 números, ex.: PETR4).');
      atualizarDoStorage();
      if (estado.lista.includes(v.ticker)) return { ticker: v.ticker, novo: false };
      if (estado.lista.length >= LISTA_MAX) throw new Error('A lista chegou ao limite de ' + LISTA_MAX + ' ativos. Remova algum antes.');
      salvar((s) => { s.lista.push(v.ticker); });
      return { ticker: v.ticker, novo: true };
    },
    remover(ticker) { salvar((s) => { s.lista = s.lista.filter((t) => t !== ticker); }); },
    limpar() { salvar((s) => { s.lista = []; }); }
  };

  // nome e classe de um código: dados do painel, ativo próprio ou catálogo de triagem (carregado em segundo plano)
  let catalogo = null;
  function infoTicker(ticker) {
    const t = String(ticker || '').toUpperCase();
    const p = (W.dash.data('ativos').data || []).find((r) => r.ticker === t);
    if (p) return { ticker: t, nome: p.nome, classe: p.classe, conhecido: true };
    const cu = estado.ativosCustom.find((x) => x.ticker === t);
    if (cu) return { ticker: t, nome: cu.nome, classe: cu.classe, conhecido: true };
    const c = (catalogo || []).find((x) => x.ticker === t);
    if (c) return { ticker: t, nome: c.nome, classe: CLASSES.includes(c.classe) ? c.classe : 'Outro', conhecido: true };
    const u = universo().find((x) => x.ticker === t);
    if (u) return { ticker: t, nome: u.nome, classe: u.classe, conhecido: true };
    // sem cadastro: final 11 costuma ser FII (ou unit); 3 a 8, ação
    return { ticker: t, nome: t, classe: /11$/.test(t) ? 'FII' : 'Ação', conhecido: false };
  }
  // código para negociar: ações no mercado fracionário levam o F no fim (PETR4F); FII, ETF e BDR não têm fracionário
  const codigoNegociacao = (ticker) => (infoTicker(ticker).classe === 'Ação' ? ticker + 'F' : ticker);
  // garante que o ativo exista no app (para registrar compra de um código fora do painel); devolve o ticker
  function garantirAtivo(ticker) {
    const t = String(ticker || '').toUpperCase();
    if (ativo(t)) return t;
    const i = infoTicker(t);
    ativoCustom.adicionar({ ticker: t, nome: i.nome, classe: i.classe, lote: 1 });
    return t;
  }

  // ---------------------------------------------------------------- dados do Actions
  const fontes = {
    serie: { status: 'carregando', data: null, mensagem: '' },
    indices: { status: 'carregando', data: null, mensagem: '' }
  };
  let carregando = null;
  const baseDados = () => (typeof W.PB_BASE === 'string' ? W.PB_BASE : '');
  function buscar(nome, valida) {
    return fetch(baseDados() + 'dados/' + nome + '.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(r.status === 404 ? 'arquivo ainda não gerado (404)' : 'HTTP ' + r.status); return r.json(); })
      .then((data) => { if (!valida(data)) throw new Error('formato inesperado'); return { status: 'ok', data, mensagem: '' }; })
      .catch((e) => ({ status: 'erro', data: null, mensagem: String((e && e.message) || e) }));
  }
  function carregar() {
    if (carregando) return carregando;
    fontes.serie = { status: 'carregando', data: null, mensagem: '' };
    fontes.indices = { status: 'carregando', data: null, mensagem: '' };
    carregando = Promise.all([
      buscar('serie_longa', (d) => isObj(d) && isObj(d.ativos)),
      buscar('indices', (d) => isObj(d)),
      catalogo ? null : buscar('catalogo', (d) => Array.isArray(d))
    ]).then(([s, i, c]) => {
      fontes.serie = s; fontes.indices = i; carregando = null;
      if (c && c.status === 'ok') catalogo = c.data;
      emit('mudou', { origem: 'carregar' });
    });
    return carregando;
  }
  // cotações do dia (docs/dados/cotacoes.json, gravado pelo workflow cotacoes.yml durante o pregão): renovadas sozinhas
  let cotDia = null, cotBuscando = false;
  function carregarCotacoes() {
    if (cotBuscando) return;
    cotBuscando = true;
    buscar('cotacoes', (d) => isObj(d) && isObj(d.precos)).then((r) => {
      cotBuscando = false;
      if (r.status !== 'ok') return;
      const mudou = !cotDia || cotDia.gerado_em !== r.data.gerado_em;
      cotDia = r.data;
      if (mudou) { uniCache = null; emit('mudou', { origem: 'cotacoes' }); }
    });
  }
  setInterval(() => { if (document.visibilityState === 'visible') carregarCotacoes(); }, 5 * 60 * 1000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') carregarCotacoes(); });
  const cotacoesInfo = () => (cotDia ? { gerado_em: cotDia.gerado_em, fonte: cotDia.fonte, n: Object.keys(cotDia.precos).length } : { gerado_em: null, fonte: null, n: 0 });

  const serie = () => Object.assign({}, fontes.serie);
  const indices = () => Object.assign({}, fontes.indices);

  // ---------------------------------------------------------------- universo
  let uniCache = null;
  function universo() {
    const a = W.dash.data('ativos');
    const sd = fontes.serie.data;
    if (uniCache && uniCache.a === a.data && uniCache.s === sd && uniCache.e === estado) return uniCache.v;
    const lp = estado.config.lotePadrao;
    const mapa = new Map();
    const base = (o) => Object.assign({ mercado: 'B3', moeda: 'BRL', segmento: '—', score: null, sinal: null, custom: false, temSerie: false }, o);
    (a.data || []).forEach((r) => mapa.set(r.ticker, base({
      ticker: r.ticker, nome: r.nome, classe: r.classe, segmento: r.segmento || '—', lote: lp,
      score: Number.isFinite(r.score) ? r.score : null, sinal: r.sinal || null
    })));
    // Um personalizado com o ticker de um dos 20 do painel nunca sobrescreve a entrada do painel.
    estado.ativosCustom.forEach((c) => mapa.has(c.ticker) || mapa.set(c.ticker, base({ ticker: c.ticker, nome: c.nome, classe: c.classe, lote: c.lote, custom: true })));
    const sa = (sd && sd.ativos) || {};
    Object.keys(sa).forEach((t) => {
      if (t === 'IBOV') return;
      const ser = sa[t];
      const tem = !!(ser && Array.isArray(ser.d) && ser.d.length > 0);
      if (mapa.has(t)) { if (tem) mapa.get(t).temSerie = true; return; }
      if (tem) mapa.set(t, base({ ticker: t, nome: ser.nome || t, classe: 'Outro', lote: lp, temSerie: true }));
    });
    const v = Array.from(mapa.values()).sort((x, y) => (x.ticker < y.ticker ? -1 : x.ticker > y.ticker ? 1 : 0));
    uniCache = { a: a.data, s: sd, e: estado, v };
    return v;
  }
  const ativo = (ticker) => {
    const t = String(ticker || '').toUpperCase();
    return universo().find((x) => x.ticker === t) || null;
  };

  // ---------------------------------------------------------------- cotação
  function precoRef(ticker, prefixo) {
    ticker = String(ticker || '').toUpperCase();
    const pre = prefixo || '';
    const res = (precoCent, em, fonte, estadoP, msg) => ({ ticker, precoCent, em, fonte, estado: estadoP, mensagem: pre + msg });
    // 2) último fechamento: o de data MAIS RECENTE entre serie_longa e ativos.json (parametros.data_ref).
    // A série pode estar defasada se o comando "historico" manteve a anterior após uma falha.
    let em = null, valor = null;
    const sa = fontes.serie.data && fontes.serie.data.ativos && fontes.serie.data.ativos[ticker];
    if (sa && Array.isArray(sa.d) && sa.d.length && Array.isArray(sa.c) && sa.c.length === sa.d.length) {
      em = sa.d[sa.d.length - 1]; valor = sa.c[sa.c.length - 1];
    }
    const r = (W.dash.data('ativos').data || []).find((x) => x.ticker === ticker);
    const p = W.dash.data('parametros');
    if (r && Number.isFinite(r.preco_atual) && p.status === 'ok' && p.data && p.data[0]) {
      const dr = p.data[0].data_ref;
      if (typeof dr === 'string' && RE_DATA.test(dr) && (em === null || dr.slice(0, 10) > String(em).slice(0, 10))) { em = dr.slice(0, 10); valor = r.preco_atual; }
    }
    // 1b) cotação do dia (Yahoo, atraso de ~15 min), se for mais nova que o último fechamento
    const q = cotDia && cotDia.precos[ticker];
    if (q && q[0] > 0 && typeof q[1] === 'string' && (em === null || q[1].slice(0, 10) >= String(em).slice(0, 10))) {
      const deHoje = q[1].slice(0, 10) === hoje();
      return res(C().toCents(q[0]), q[1], 'yahoo', deHoje ? 'do-dia' : 'atrasado',
        (deHoje ? 'Cotação de hoje às ' + q[1].slice(11, 16) : 'Último preço de ' + fmtDataHora(q[1])) + ' (Yahoo Finance, atraso de cerca de 15 minutos).');
    }
    const cent = valor === null ? null : C().toCents(valor);
    if (cent !== null && cent > 0 && em) {
      const dias = diasDesde(em);
      const velho = dias !== null && dias > 5;
      return res(cent, em, 'fechamento', 'atrasado',
        'Último fechamento (' + INV.ui.fmtData(em) + ')' + (velho ? ' — desatualizado há ' + dias + ' dias' : '') + '. Não é cotação ao vivo.');
    }
    // 3) preço manual de ativo personalizado
    const cu = estado.ativosCustom.find((x) => x.ticker === ticker);
    if (cu && cu.precoManualCent > 0) return res(cu.precoManualCent, null, 'manual', 'manual', 'Preço informado manualmente por você.');
    // 4) nada
    return res(null, null, null, 'indisponivel', 'Sem preço disponível. Informe um preço manualmente.');
  }

  const token = {
    // O token nunca é registrado em console. Se o localStorage falhar (ou não tiver o valor), vale o da memória.
    ler() {
      if (memOnly) return memToken;
      try { return localStorage.getItem(TKEY) || memToken; } catch (e) { return memToken; }
    },
    salvar(t) {
      t = String(t || '').trim();
      memToken = t; cacheCot.clear();
      if (memOnly) return false;
      try { localStorage.setItem(TKEY, t); return true; } catch (e) { return false; }
    },
    apagar() {
      memToken = ''; cacheCot.clear();
      try { localStorage.removeItem(TKEY); } catch (e) { /* sem acesso: já limpo em memória */ }
    },
    testar() {
      const tk = token.ler();
      if (!tk) return Promise.resolve({ ok: false, mensagem: 'Nenhum token salvo.', latenciaMs: null });
      const t0 = performance.now();
      const ms = () => Math.round(performance.now() - t0);
      return brapi('PETR4', tk).then(
        (q) => ({ ok: true, mensagem: 'Token válido: PETR4 a ' + C().fmtBRL(q.precoCent) + '.', latenciaMs: ms() }),
        (e) => ({ ok: false, mensagem: e.message, latenciaMs: ms() }));
    }
  };

  const cacheCot = new Map();
  const emVoo = new Map();
  function brapi(ticker, tk) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 8000);
    return fetch('https://brapi.dev/api/quote/' + encodeURIComponent(ticker) + '?token=' + encodeURIComponent(tk), { signal: ctl.signal })
      .then((r) => {
        if (r.status === 401 || r.status === 403) throw new Error('token recusado pela brapi (HTTP ' + r.status + '). Confira se copiou o token inteiro.');
        if (r.status === 402 || r.status === 429) throw new Error('limite do plano da brapi atingido (HTTP ' + r.status + ').');
        if (r.status === 404) throw new Error('ativo não encontrado na brapi.');
        if (!r.ok) throw new Error('a brapi respondeu HTTP ' + r.status + '.');
        return r.json();
      })
      .then((j) => {
        const q = j && Array.isArray(j.results) ? j.results[0] : null;
        const preco = q ? Number(q.regularMarketPrice) : NaN;
        if (!q || !(preco > 0)) throw new Error('resposta da brapi sem preço válido.');
        if (q.currency && q.currency !== 'BRL') throw new Error('moeda ' + q.currency + ' descartada (só BRL).');
        const t = q.regularMarketTime;
        let d = typeof t === 'number' ? new Date(t < 1e12 ? t * 1000 : t) : new Date(t);
        if (!t || Number.isNaN(d.getTime())) d = new Date();
        return { precoCent: C().toCents(preco), em: d.toISOString() };
      })
      .catch((e) => {
        if (e && e.name === 'AbortError') throw new Error('tempo esgotado (8 s) ao consultar a brapi.');
        if (e instanceof TypeError) throw new Error('sem conexão com a brapi ou bloqueio do navegador (CORS).');
        throw e;
      })
      .finally(() => clearTimeout(timer));
  }
  function cotacao(ticker, opcoes) {
    ticker = String(ticker || '').toUpperCase();
    const forcar = !!(opcoes && opcoes.forcar);
    const tk = token.ler();
    if (!tk) return Promise.resolve(precoRef(ticker, ''));
    const c = cacheCot.get(ticker);
    if (!forcar && c && Date.now() - c.t < 60000) return Promise.resolve(Object.assign({}, c.v));
    if (emVoo.has(ticker) && !forcar) return emVoo.get(ticker).then((v) => Object.assign({}, v));
    const p = brapi(ticker, tk).then((q) => {
      const v = { ticker, precoCent: q.precoCent, em: q.em, fonte: 'brapi', estado: 'ao-vivo',
        mensagem: 'Cotação da brapi.dev; o atraso depende do seu plano.' };
      cacheCot.set(ticker, { t: Date.now(), v });
      return v;
    }, (e) => precoRef(ticker, 'Cotação ao vivo falhou: ' + e.message + ' ')).finally(() => emVoo.delete(ticker));
    emVoo.set(ticker, p);
    return p.then((v) => Object.assign({}, v));
  }

  // ---------------------------------------------------------------- UI: helpers de DOM
  function el(tag, attrs, ...filhos) {
    const n = document.createElement(tag);
    if (attrs) {
      if (attrs.type !== undefined && attrs.type !== null) n.setAttribute('type', attrs.type);
      Object.keys(attrs).forEach((k) => {
        const v = attrs[k];
        if (k === 'type' || v === null || v === undefined || v === false) return;
        if (k === 'class' || k === 'className') n.className = v;
        else if (k === 'text') n.textContent = v;
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (k.slice(0, 2) === 'on' && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
        else if (['value', 'checked', 'disabled', 'hidden', 'selected', 'indeterminate'].includes(k)) n[k] = v;
        else n.setAttribute(k, v === true ? '' : String(v));
      });
    }
    const add = (f) => {
      if (f === null || f === undefined || f === false) return;
      if (Array.isArray(f)) f.forEach(add);
      else if (f instanceof Node) n.appendChild(f);
      else n.appendChild(document.createTextNode(String(f)));
    };
    filhos.forEach(add);
    return n;
  }

  function parseNumero(v) {
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (v === null || v === undefined) return null;
    let s = String(v).replace(/R\$|%|\s/g, '');
    if (!s) return null;
    let neg = false;
    if (s[0] === '-' || s[0] === '+') { neg = s[0] === '-'; s = s.slice(1); }
    const vi = s.lastIndexOf(','), po = s.lastIndexOf('.');
    if (vi >= 0 && po >= 0) s = vi > po ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (vi >= 0) { if (s.indexOf(',') !== vi) return null; s = s.replace(',', '.'); }
    else if (po >= 0) {
      if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
      else if (s.indexOf('.') !== po) return null;
    }
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? (neg ? -n : n) : null;
  }
  const fmtData = (s) => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    return m ? m[3] + '/' + m[2] + '/' + m[1] : '—';
  };
  const fmtDataHora = (s) => {
    s = String(s || '');
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(s);
    if (m) return m[3] + '/' + m[2] + '/' + m[1] + ' ' + m[4] + ':' + m[5];
    if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
      const d = new Date(s);
      if (!Number.isNaN(d.getTime())) return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
    }
    return fmtData(s);
  };

  // Campo com label, ajuda e erro ligados por aria-describedby.
  function campo(o) {
    const id = o.id, ajudaId = id + '-ajuda', erroId = id + '-erro';
    const tipo = o.tipo || 'text';
    const valor = o.valor === null || o.valor === undefined ? '' : o.valor;
    let entrada;
    if (tipo === 'select') {
      entrada = el('select', Object.assign({ id, class: 'pb-in' }, o.attrs),
        (o.opcoes || []).map((op) => el('option', { value: op.valor, selected: String(op.valor) === String(valor) }, op.rotulo)));
    } else if (tipo === 'textarea') {
      entrada = el('textarea', Object.assign({ id, class: 'pb-in', rows: 3 }, o.attrs), String(valor));
    } else {
      entrada = el('input', Object.assign({ id, type: tipo, class: 'pb-in', value: tipo === 'file' ? null : valor }, o.attrs));
    }
    const aj = o.ajuda ? el('small', { id: ajudaId, class: 'pb-note inv-help' }, o.ajuda) : null;
    const er = el('small', { id: erroId, class: 'inv-err', hidden: true });
    const wrap = el('div', { class: 'inv-field' }, el('label', { for: id }, o.rotulo), entrada, aj, er);
    const sync = () => {
      const d = [aj ? ajudaId : null, er.hidden ? null : erroId].filter(Boolean).join(' ');
      if (d) entrada.setAttribute('aria-describedby', d); else entrada.removeAttribute('aria-describedby');
    };
    wrap.input = entrada;
    wrap.valor = () => entrada.value;
    wrap.setErro = (msg) => {
      if (msg) { er.textContent = msg; er.hidden = false; entrada.setAttribute('aria-invalid', 'true'); }
      else { er.textContent = ''; er.hidden = true; entrada.removeAttribute('aria-invalid'); }
      sync();
    };
    sync();
    return wrap;
  }

  const ROT_AVISO = { warn: 'Atenção: ', bad: 'Erro: ', ok: 'Pronto: ', info: '' };
  function aviso(texto, tipo) {
    tipo = ROT_AVISO[tipo] !== undefined ? tipo : 'info';
    return el('div', { class: 'inv-aviso inv-aviso-' + tipo, role: tipo === 'bad' ? 'alert' : 'status' },
      ROT_AVISO[tipo] ? el('strong', null, ROT_AVISO[tipo]) : null, texto);
  }

  const ROT_ESTADO = { 'ao-vivo': 'ao vivo', 'do-dia': 'do dia', atrasado: 'atrasado', manual: 'manual', indisponivel: 'indisponível' };
  function estadoPreco(cot) {
    const e = cot && ROT_ESTADO[cot.estado] ? cot.estado : 'indisponivel';
    const partes = [ROT_ESTADO[e]];
    if (cot && cot.em) partes.push(cot.em.length > 10 ? fmtDataHora(cot.em) : fmtData(cot.em));
    if (cot && cot.fonte) partes.push(cot.fonte);
    return el('span', { class: 'inv-chip inv-chip-' + e, title: (cot && cot.mensagem) || '' }, partes.join(' · '));
  }

  // Avisos de armazenamento (modo privado / dados só em memória / dados corrompidos), iguais em todas as abas.
  // Devolve uma lista de nós DOM (vazia se está tudo bem). Os botões da cópia corrompida vêm junto.
  function avisosArmazenamento() {
    const arm = {
      persistente: !memOnly, corrompido, copiaCorrompida: copiaCorrompida() !== null
    };
    const out = [];
    if (!arm.persistente) {
      out.push(aviso('Este navegador não permite gravar dados locais (modo privado ou bloqueio). O app funciona só na memória e tudo se perde ao fechar a página. Em Ajustes › Backup, use "Exportar backup" para guardar.', 'warn'));
    }
    if (arm.corrompido || arm.copiaCorrompida) {
      const msg = el('div', { 'aria-live': 'polite' });
      const acoes = el('div', { class: 'inv-actions' });
      const mostrar = (n) => { msg.replaceChildren(n); };
      const botoes = () => {
        acoes.replaceChildren(
          el('button', { type: 'button', class: 'pb-btn', onclick: () => {
            try { mostrar(aviso('Cópia baixada: ' + baixarCopiaCorrompida() + '.', 'ok')); } catch (e) { mostrar(aviso(e.message, 'bad')); }
          } }, 'Baixar cópia dos dados corrompidos'),
          el('button', { type: 'button', class: 'pb-btn', onclick: () => {
            acoes.replaceChildren(
              el('span', { class: 'pb-note' }, 'Descartar a cópia apaga os dados ilegíveis deste navegador de vez.'),
              el('button', { type: 'button', class: 'pb-btn', onclick: () => {
                try { descartarCopiaCorrompida(); } catch (e) { mostrar(aviso(e.message, 'bad')); botoes(); }
              } }, 'Confirmar descarte'),
              el('button', { type: 'button', class: 'pb-btn', onclick: botoes }, 'Manter'));
          } }, 'Descartar cópia'));
      };
      if (arm.copiaCorrompida) botoes();
      out.push(el('div', { style: 'display:grid;gap:var(--cds-gap-xs)' },
        aviso(arm.copiaCorrompida
          ? 'Havia dados ilegíveis no armazenamento local. Uma cópia foi mantida neste navegador (use "Baixar cópia" neste aviso) e o app começou vazio; se tiver um backup, importe-o em Ajustes › Backup.'
          : 'Havia dados ilegíveis no armazenamento local e o app começou vazio; se tiver um backup, importe-o em Ajustes › Backup.', 'warn'),
        arm.copiaCorrompida ? acoes : null, msg));
    }
    return out;
  }

  // colunas: [{rotulo, chave?, render?(linha, i), alinhar?: 'l'|'r', classe?}]
  function tabela(colunas, linhas, opcoes) {
    const cls = (c) => [c.alinhar === 'l' ? 'l' : '', c.classe || ''].filter(Boolean).join(' ') || null;
    const t = el('table', { class: 'pb-table' },
      opcoes && opcoes.legenda ? el('caption', { class: 'inv-sr' }, opcoes.legenda) : null,
      el('thead', null, el('tr', null, colunas.map((c) => el('th', { scope: 'col', class: cls(c) }, c.rotulo)))),
      el('tbody', null, (linhas || []).map((l, i) => el('tr', null, colunas.map((c) => {
        let v = c.render ? c.render(l, i) : l[c.chave];
        if (v === null || v === undefined || v === '') v = '—';
        return el('td', { class: cls(c) }, v);
      })))));
    return el('div', { class: 'pb-tablewrap' }, t);
  }

  // Seletor pesquisável de ativos do universo. .valor() → ticker válido ou null.
  function seletorAtivo(o) {
    const id = o.id, lista = id + '-lista';
    const dl = el('datalist', { id: lista });
    const filtro = typeof o.filtro === 'function' ? o.filtro : () => true;
    const permitidos = () => universo().filter(filtro);
    const rotulo = (a) => a.ticker + ' — ' + a.nome;
    const wrap = campo({ id, rotulo: o.rotulo || 'Ativo', tipo: 'search', ajuda: o.ajuda || 'Digite o ticker ou o nome e escolha na lista.',
      attrs: Object.assign({ list: lista, autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false' }, o.attrs) });
    const recarregar = () => { dl.replaceChildren(...permitidos().map((a) => el('option', { value: rotulo(a) }))); };
    wrap.appendChild(dl);
    recarregar();
    wrap.input.addEventListener('focus', recarregar);
    wrap.valor = () => {
      const txt = wrap.input.value.trim().toUpperCase();
      if (!txt) return null;
      const t = txt.split(/\s+—\s+|\s+-\s+|\s+/)[0];
      const a = permitidos().find((x) => x.ticker === t);
      return a ? a.ticker : null;
    };
    wrap.definir = (ticker) => { const a = ticker ? ativo(ticker) : null; wrap.input.value = a ? rotulo(a) : ''; };
    return wrap;
  }

  // ---------------------------------------------------------------- CSS extra
  function injetarCss() {
    if (document.getElementById('inv-css')) return;
    const css = `
.inv-page[hidden]{display:none}
.inv-page .pb-tiles .pb-big{font-size:clamp(1.2rem,1.9vw,1.6rem);white-space:nowrap}
.inv-form{display:grid;gap:var(--cds-gap-md);grid-template-columns:repeat(auto-fit,minmax(min(100%,13rem),1fr));align-items:start}
.inv-field{display:grid;gap:var(--cds-gap-xs);min-width:0;align-content:start}
.inv-field label{font-size:var(--cds-font-size-caption);color:var(--color-fg-muted)}
.inv-field .pb-in{width:100%;box-sizing:border-box;min-width:0}
.inv-help{overflow-wrap:anywhere}
.inv-err{display:block;color:var(--color-bad);font-size:var(--cds-font-size-caption)}
.inv-err[hidden]{display:none}
.inv-actions{display:flex;flex-wrap:wrap;gap:var(--cds-gap-sm);align-items:center}
.inv-steps{display:flex;flex-wrap:wrap;gap:var(--cds-gap-xs);list-style:none;margin:0;padding:0}
.inv-steps li{border:1px solid var(--color-border-line);border-radius:var(--cds-radius);padding:var(--cds-pad-xs) var(--cds-pad-sm);color:var(--color-fg-muted);font-size:var(--cds-font-size-caption)}
.inv-steps li[aria-current="step"]{color:var(--color-fg);background:var(--color-panel);border-color:var(--color-fg-muted);font-weight:var(--cds-font-weight-medium)}
.inv-chip{display:inline-flex;align-items:center;padding:0 var(--cds-pad-sm);border:1px solid currentColor;border-radius:var(--cds-radius);font-size:var(--cds-font-size-caption);white-space:nowrap}
.inv-chip-ao-vivo,.inv-chip-do-dia{color:var(--color-ok)}
.inv-chip-atrasado{color:var(--color-warn)}
.inv-chip-manual{color:var(--c2)}
.inv-chip-indisponivel{color:var(--color-bad)}
.inv-aviso{--inv-tone:var(--color-fg-muted);border-left:3px solid var(--inv-tone);padding:var(--cds-pad-xs) var(--cds-pad-sm);font-size:var(--cds-font-size-caption);overflow-wrap:anywhere}
.inv-aviso-warn{--inv-tone:var(--color-warn)}
.inv-aviso-bad{--inv-tone:var(--color-bad)}
.inv-aviso-ok{--inv-tone:var(--color-ok)}
.inv-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.inv-kv{display:grid;grid-template-columns:minmax(0,auto) minmax(0,1fr);gap:var(--cds-gap-xs) var(--cds-gap-md);margin:0;font-size:var(--cds-font-size-caption)}
.inv-kv dt{color:var(--color-fg-muted)}
.inv-kv dd{margin:0;overflow-wrap:anywhere}
.inv-code{margin:0;padding:var(--cds-pad-sm);overflow:auto;border:1px solid var(--color-border-line);border-radius:var(--cds-radius);background:var(--color-bg);font-size:var(--cds-font-size-caption)}
.inv-code:focus-visible,.inv-field input:focus-visible,.inv-field select:focus-visible,.inv-field textarea:focus-visible{outline:2px solid var(--color-fg);outline-offset:2px}
.inv-steps-list{margin:0;padding-left:1.25rem;display:grid;gap:var(--cds-gap-xs);font-size:var(--cds-font-size-caption)}
.inv-card-sep{border:0;border-top:1px solid var(--color-border-line);margin:var(--cds-gap-sm) 0;width:100%}
`;
    const st = document.createElement('style');
    st.id = 'inv-css';
    st.textContent = css;
    document.head.appendChild(st);
  }

  // ---------------------------------------------------------------- abas
  const abas = {};
  let timerHash = null, hashAplicado = false;
  // endereço: #pagina ou #pagina/secao (ex.: #corretora/caixa)
  const lerHash = () => { const [pg, sc] = (location.hash || '').replace(/^#/, '').split('/'); return { pg, sc }; };
  function irHash(pg, sc) {
    if (!abas[pg]) return false;
    if (W.PB.current !== pg) W.PB.show(pg);
    if (sc && secoesReg[pg]) secoesReg[pg].mostrar(sc);
    return true;
  }
  function verHash() {
    timerHash = null;
    const { pg, sc } = lerHash();
    if (!pg || !abas[pg] || hashAplicado) return;
    hashAplicado = true;
    irHash(pg, sc);
  }
  function agendarHash() {
    if (timerHash !== null) clearTimeout(timerHash);
    timerHash = setTimeout(verHash, 0);
  }
  W.addEventListener('hashchange', () => { const { pg, sc } = lerHash(); irHash(pg, sc); });
  function aba(o) {
    if (!o || !o.id) throw new Error('aba: informe {id, rotulo}.');
    if (abas[o.id]) return abas[o.id];
    const nav = document.querySelector('nav.pb-tabs');
    const host = document.querySelector('div.pb');
    if (!nav || !host) return null;
    injetarCss();
    const btn = el('button', { type: 'button', class: 'pb-tab', role: 'tab', 'data-tab': o.id, 'aria-selected': 'false' }, o.rotulo || o.id);
    const sec = el('section', { class: 'pb-page inv-page', id: o.id, 'data-page': o.id, hidden: true });
    btn.addEventListener('click', () => W.PB.show(o.id));
    const cfg = o.id !== 'config' ? abas.config : null;
    if (cfg) {
      nav.insertBefore(btn, nav.querySelector('[data-tab="config"]'));
      host.insertBefore(sec, cfg);
    } else {
      nav.appendChild(btn);
      host.appendChild(sec);
    }
    abas[o.id] = sec;
    agendarHash();
    return sec;
  }
  // ---------------------------------------------------------------- seções dentro de uma aba
  // Cada seção vive no seu próprio painel; uma barra de subabas troca entre elas (a escolha fica lembrada).
  const secoesReg = {};
  const UIKEY = 'pb-ui-v1';
  const lerUi = () => { try { return JSON.parse(W.localStorage.getItem(UIKEY)) || {}; } catch (e) { return {}; } };
  const gravarUi = (fn) => { try { const u = lerUi(); fn(u); W.localStorage.setItem(UIKEY, JSON.stringify(u)); } catch (e) { /* preferência: sem armazenamento, só não lembra */ } };
  function secoes(sec, o) {
    const pg = o.id, itens = o.itens.filter(Boolean);
    const nav = el('div', { class: 'inv-sub', role: 'tablist', 'aria-label': o.rotulo || 'Seções' });
    const bts = {}, pns = {};
    itens.forEach((it) => {
      const bid = 'inv-sub-' + pg + '-' + it.id, pid = 'inv-sec-' + pg + '-' + it.id;
      const b = el('button', { type: 'button', role: 'tab', class: 'inv-sub-tab', id: bid, 'aria-controls': pid, 'aria-selected': 'false', tabindex: '-1' },
        it.passo ? el('span', { class: 'inv-sub-n', 'aria-hidden': 'true' }, it.passo) : null, it.rotulo);
      b.addEventListener('click', () => mostrar(it.id));
      const intro = it.intro ? el('p', { class: 'inv-sec-intro' }, it.intro) : null;
      const pn = el('div', { class: 'inv-secao', id: pid, role: 'tabpanel', 'aria-labelledby': bid, 'data-secao': it.id, hidden: true }, intro, ...(it.nodes || []));
      nav.appendChild(b); bts[it.id] = b; pns[it.id] = pn;
    });
    nav.addEventListener('keydown', (ev) => {
      const ids = itens.map((i) => i.id), k = ids.indexOf(atual);
      const alvo = ev.key === 'ArrowRight' ? ids[(k + 1) % ids.length] : ev.key === 'ArrowLeft' ? ids[(k - 1 + ids.length) % ids.length]
        : ev.key === 'Home' ? ids[0] : ev.key === 'End' ? ids[ids.length - 1] : null;
      if (!alvo) return;
      ev.preventDefault(); mostrar(alvo); bts[alvo].focus();
    });
    let atual = null;
    function mostrar(id, opts) {
      if (!pns[id]) return;
      const mudou = atual !== id;
      atual = id;
      itens.forEach((it) => {
        const ativo = it.id === id;
        pns[it.id].hidden = !ativo;
        bts[it.id].setAttribute('aria-selected', String(ativo));
        bts[it.id].tabIndex = ativo ? 0 : -1;
      });
      if (bts[id].scrollIntoView && nav.scrollWidth > nav.clientWidth) bts[id].scrollIntoView({ block: 'nearest', inline: 'center' });
      gravarUi((u) => { (u.secoes = u.secoes || {})[pg] = id; });
      if (W.PB.current === pg) { try { history.replaceState(null, '', '#' + pg + '/' + id); } catch (e) { /* ok */ } }
      if (mudou && !(opts && opts.silencioso)) {
        emit('secao', { pagina: pg, secao: id });
        try { W.PB.redraw(); } catch (e) { console.error(e); }
        // a troca não deve deixar o leitor no meio da página anterior
        const topo = nav.getBoundingClientRect().top;
        if (topo < 0) W.scrollBy({ top: topo - 80, behavior: 'auto' });
      }
    }
    if (o.antes) o.antes.filter(Boolean).forEach((n) => sec.appendChild(n));
    sec.appendChild(nav);
    itens.forEach((it) => sec.appendChild(pns[it.id]));
    const ctl = { mostrar, atual: () => atual, botao: (id) => bts[id], painel: (id) => pns[id] };
    secoesReg[pg] = ctl;
    const { pg: hp, sc } = lerHash();
    const salvo = (lerUi().secoes || {})[pg];
    mostrar(hp === pg && pns[sc] ? sc : pns[salvo] ? salvo : (o.inicial || itens[0].id), { silencioso: true });
    return ctl;
  }
  // mostra a seção que contém o elemento (usado pelo tutorial e por links internos)
  function revelar(n) {
    const pn = n && n.closest ? n.closest('.inv-secao') : null;
    if (!pn) return;
    const pg = pn.closest('[data-page]');
    const ctl = pg && secoesReg[pg.dataset.page];
    if (ctl && pn.hidden) ctl.mostrar(pn.dataset.secao, { silencioso: true });
    if (ctl) try { W.PB.redraw(); } catch (e) { /* ok */ }
  }
  // vai para uma aba e, se houver, para uma seção dela
  function ir(pg, sc) {
    if (abas[pg] || document.querySelector('[data-page="' + pg + '"]')) W.PB.show(pg);
    if (sc && secoesReg[pg]) secoesReg[pg].mostrar(sc);
  }

  function aoMostrar(id, fn) {
    const roda = () => {
      if (W.PB.current !== id) return;
      try { fn(); } catch (e) { console.error(e); }
    };
    W.PB.draws.push(roda);
    on('mudou', roda);
  }

  // ---------------------------------------------------------------- API pública
  const INV = {
    estado: () => clone(estado), salvar, on, exportar, importar, apagarTudo,
    adicionarTx, adicionarTxs, corrigirTx, cancelarTx, ativoCustom, definirAlvo, lista, infoTicker, codigoNegociacao, garantirAtivo,
    carregar, serie, indices, universo, ativo, cotacao, cotacoesInfo, carregarCotacoes,
    precoReferencia: (t) => precoRef(t, ''), token, aba, aoMostrar, secoes, revelar, ir, preferencias: { ler: lerUi, gravar: gravarUi },
    armazenamento: () => ({ persistente: !memOnly, corrompido, copiaCorrompida: copiaCorrompida() !== null }),
    copiaCorrompida, baixarCopiaCorrompida, descartarCopiaCorrompida,
    ui: { el, campo, aviso, estadoPreco, tabela, parseNumero, fmtData, fmtDataHora, seletorAtivo, agoraLocal, hoje, avisosArmazenamento }
  };
  W.INV = INV;

  // ---------------------------------------------------------------- aba Configurações
  const fmtIn = (n, casas) => Number(n).toFixed(casas).replace('.', ',');
  const { aviso: av } = INV.ui;

  function montarConfig() {
    const sec = aba({ id: 'config', rotulo: 'Ajustes' });
    if (!sec) return;
    const status = (host, ...filhos) => { host.replaceChildren(...filhos.filter(Boolean)); };
    const card = (titulo, ...filhos) => el('div', { class: 'pb-card' }, el('h2', null, titulo), filhos);

    // Aviso de armazenamento (atualizado em cada desenho)
    const avisoArm = el('div', { 'aria-live': 'polite' });

    // ---- 1) Cotações
    const campoToken = campo({ id: 'inv-cfg-token', rotulo: 'Token da brapi', tipo: 'password', valor: token.ler(),
      ajuda: 'Cole aqui o token copiado do site da brapi.',
      attrs: { autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off' } });
    const stToken = el('div', { 'aria-live': 'polite' });
    const btnVer = el('button', { type: 'button', class: 'pb-btn', 'aria-pressed': 'false', 'aria-controls': 'inv-cfg-token',
      onclick: () => {
        const mostrando = campoToken.input.type === 'text';
        campoToken.input.type = mostrando ? 'password' : 'text';
        btnVer.setAttribute('aria-pressed', String(!mostrando));
      } }, 'Mostrar token');
    const btnSalvarTk = el('button', { type: 'button', class: 'pb-btn inv-pri', onclick: salvarETestar }, 'Salvar e testar');
    const btnApagarTk = el('button', { type: 'button', class: 'pb-btn', onclick: () => {
      token.apagar(); campoToken.input.value = ''; campoToken.setErro(null);
      status(stToken, av('Token apagado deste navegador. Sem token, o app usa o último fechamento (atrasado).', 'info'));
    } }, 'Apagar token');
    function statusTokenInicial() {
      status(stToken, av(token.ler() ? 'Há um token salvo neste navegador.' : 'Nenhum token salvo: as cotações usam o último fechamento (marcado como atrasado) ou o preço manual.', 'info'));
    }
    async function salvarETestar() {
      const v = campoToken.input.value.trim();
      if (!v) { campoToken.setErro('Cole o token antes de salvar.'); campoToken.input.focus(); return; }
      if (/\s/.test(v)) { campoToken.setErro('O token não pode ter espaços ou quebras de linha.'); campoToken.input.focus(); return; }
      campoToken.setErro(null);
      const gravou = token.salvar(v);
      btnSalvarTk.disabled = true;
      status(stToken, av('Testando a cotação de PETR4…', 'info'));
      const r = await token.testar();
      btnSalvarTk.disabled = false;
      const extra = gravou ? '' : ' Atenção: o navegador não deixou gravar; o token vale só até fechar a página.';
      if (r.ok) status(stToken, av(r.mensagem + ' Resposta em ' + r.latenciaMs + ' ms.' + extra, 'ok'));
      else status(stToken, av('Token salvo, mas o teste falhou: ' + r.mensagem + extra, 'bad'));
    }
    const cardCot = card('Cotações (brapi.dev)',
      el('p', { class: 'pb-note' }, 'Opcional. Sem token, o app já mostra o preço do dia pelo Yahoo Finance, renovado sozinho a cada 15 minutos durante o pregão (atraso de cerca de 15 min). Com o token gratuito da brapi.dev, o preço fica mais próximo do tempo real, conforme o seu plano.'),
      el('ol', { class: 'inv-steps-list' },
        el('li', null, 'Acesse ', el('a', { href: 'https://brapi.dev', target: '_blank', rel: 'noopener noreferrer' }, 'https://brapi.dev'), ' e crie uma conta gratuita.'),
        el('li', null, 'No painel da conta, abra a área de tokens/API e copie o seu token.'),
        el('li', null, 'Cole abaixo e toque em "Salvar e testar".')),
      campoToken,
      el('div', { class: 'inv-actions' }, btnVer, btnSalvarTk, btnApagarTk),
      stToken,
      av('O token fica só neste navegador (localStorage). Não vai para o GitHub nem para o backup. Consulte limites e atraso das cotações do seu plano no site da brapi.', 'info'));

    // ---- 2) Custos padrão
    const cf = {
      taxaFixa: campo({ id: 'inv-cfg-fixa', rotulo: 'Corretagem fixa por ordem (R$)', tipo: 'text', ajuda: 'Ex.: 0 ou 4,90.', attrs: { inputmode: 'decimal' } }),
      taxaPct: campo({ id: 'inv-cfg-pct', rotulo: 'Emolumentos e taxas (%)', tipo: 'text', ajuda: 'Percentual sobre o valor da ordem. Ex.: 0,03.', attrs: { inputmode: 'decimal' } }),
      lote: campo({ id: 'inv-cfg-lote', rotulo: 'Lote padrão dos 20 ativos do painel', tipo: 'select',
        opcoes: [{ valor: '1', rotulo: '1 — mercado fracionário (compra de 1 em 1)' }, { valor: '100', rotulo: '100 — lote padrão (compra de 100 em 100)' }],
        ajuda: 'Define de quantas em quantas ações as estimativas e o planejamento calculam. FIIs costumam negociar de 1 em 1.' }),
      intens: campo({ id: 'inv-cfg-intens', rotulo: 'Intensidade padrão do score', tipo: 'range',
        ajuda: 'Quanto o score do painel muda a ordem de prioridade ao planejar aportes. 0% = ignora o score; nunca dá dinheiro a quem já está acima do alvo.',
        attrs: { min: '0', max: '100', step: '5' } })
    };
    let sujo = false;
    // mostra o valor do controle deslizante e o efeito em palavras
    const saidaIntens = el('output', { for: 'inv-cfg-intens', class: 'inv-range-val', 'aria-live': 'polite' });
    cf.intens.input.after(saidaIntens);
    // no Fácil ficam só as taxas: a compra é sempre no fracionário (lote 1) e o score não entra no planejamento simples
    cf.lote.setAttribute('data-so-avancado', '1');
    cf.intens.setAttribute('data-so-avancado', '1');
    function mostrarIntens() {
      const v = Number(cf.intens.input.value);
      saidaIntens.textContent = v + '% — ' + (v === 0 ? 'não usa o score' : v <= 30 ? 'efeito suave' : v <= 70 ? 'efeito moderado' : 'efeito forte');
    }
    cf.intens.input.addEventListener('input', mostrarIntens);
    const stCustos = el('div', { 'aria-live': 'polite' });
    Object.keys(cf).forEach((k) => cf[k].input.addEventListener('input', () => { sujo = true; }));
    function preencherCustos() {
      const c = estado.config;
      cf.taxaFixa.input.value = fmtIn(C().fromCents(c.taxaFixaCent), 2);
      cf.taxaPct.input.value = fmtIn(c.taxaPct, 2);
      const sl = cf.lote.input;
      if (![].some.call(sl.options, (o) => o.value === String(c.lotePadrao))) sl.append(el('option', { value: String(c.lotePadrao) }, String(c.lotePadrao) + ' (valor salvo antes)'));
      sl.value = String(c.lotePadrao);
      cf.intens.input.value = String(Math.round(c.intensidadeScore * 100));
      mostrarIntens();
    }
    function salvarCustos() {
      let ok = true;
      const erro = (campoX, msg) => { campoX.setErro(msg); ok = false; };
      const fx = parseNumero(cf.taxaFixa.input.value);
      let taxaFixaCent = null;
      if (fx === null || fx < 0) erro(cf.taxaFixa, 'Informe um valor em reais, zero ou maior (ex.: 4,90).');
      else { taxaFixaCent = C().toCents(fx); cf.taxaFixa.setErro(null); }
      const pc = parseNumero(cf.taxaPct.input.value);
      if (pc === null || pc < 0 || pc > 100) erro(cf.taxaPct, 'Informe um percentual de 0 a 100 (ex.: 0,03).'); else cf.taxaPct.setErro(null);
      const lt = parseNumero(cf.lote.input.value);
      if (lt === null || !Number.isInteger(lt) || lt < 1) erro(cf.lote, 'Informe um número inteiro maior ou igual a 1.'); else cf.lote.setErro(null);
      const it = parseNumero(cf.intens.input.value);
      if (it === null || it < 0 || it > 100) erro(cf.intens, 'Informe um percentual de 0 a 100.'); else cf.intens.setErro(null);
      if (!ok) {
        status(stCustos, av('Corrija os campos destacados.', 'bad'));
        const primeiro = Object.keys(cf).map((k) => cf[k]).find((f) => f.input.getAttribute('aria-invalid') === 'true');
        if (primeiro) primeiro.input.focus();
        return;
      }
      try {
        salvar((s) => { s.config.taxaFixaCent = taxaFixaCent; s.config.taxaPct = pc; s.config.lotePadrao = lt; s.config.intensidadeScore = it / 100; });
        sujo = false;
        status(stCustos, av('Custos padrão salvos.', 'ok'));
      } catch (e) { status(stCustos, av(e.message, 'bad')); }
    }
    const cardCustos = card('Custos padrão',
      el('p', { class: 'pb-note' }, 'Usados no planejamento de compra. Se a sua corretora não cobra corretagem, deixe 0.'),
      el('div', { class: 'inv-form' }, cf.taxaFixa, cf.taxaPct, cf.lote, cf.intens),
      el('div', { class: 'inv-actions' }, el('button', { type: 'button', class: 'pb-btn inv-pri', onclick: salvarCustos }, 'Salvar custos')),
      stCustos);

    // ---- 3) Ativos extras no histórico
    const corpoExtras = el('div', { class: 'pb-card-body', style: 'display:grid;gap:var(--cds-gap-sm)' });
    const stCopiar = el('div', { 'aria-live': 'polite' });
    function copiar(texto) {
      const fim = (ok) => status(stCopiar, av(ok ? 'Trecho copiado.' : 'Não foi possível copiar automaticamente; selecione o trecho e copie.', ok ? 'ok' : 'warn'));
      const fallback = () => {
        const ta = el('textarea', { 'aria-hidden': 'true', tabindex: '-1', style: 'position:fixed;opacity:0;top:0;left:0' }, texto);
        document.body.appendChild(ta); ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
        ta.remove(); fim(ok);
      };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(texto).then(() => fim(true), fallback);
      else fallback();
    }
    function desenharExtras() {
      const lista = estado.ativosCustom.map((a) => a.ticker);
      const trecho = '"extras": [' + (lista.length ? lista : ['TICK1', 'TICK2']).map((t) => '"' + t + '"').join(', ') + ']';
      const u = (t) => ativo(t);
      const av2 = (n) => { n.setAttribute('data-so-avancado', '1'); return n; };
      corpoExtras.replaceChildren(
        lista.length
          ? INV.ui.tabela([
            { rotulo: 'Ticker', alinhar: 'l', render: (a) => a.ticker },
            { rotulo: 'Nome', alinhar: 'l', classe: 'pb-hide-sm', render: (a) => a.nome },
            { rotulo: 'Classe', alinhar: 'l', render: (a) => a.classe },
            { rotulo: 'Histórico longo', alinhar: 'l', render: (a) => (u(a.ticker) && u(a.ticker).temSerie ? 'já tem série' : 'ainda sem série') }
          ], estado.ativosCustom, { legenda: 'Ativos personalizados e situação do histórico' })
          : el('p', { class: 'pb-note' }, 'Você ainda não cadastrou ativos próprios. Eles são cadastrados em Minha carteira › Meus ativos.'),
        el('p', { class: 'pb-note', 'data-so-facil': '1' }, 'Para ter nota e histórico de um ativo novo, use Mercado › Adicionar ativo.'),
        av2(el('p', { class: 'pb-note' }, lista.length
          ? 'Para que o Simulador tenha histórico desses ativos, o ticker precisa estar na lista "extras" do arquivo 03_painel/config.json. Junte o trecho abaixo aos tickers que já estiverem lá:'
          : 'Exemplo do trecho que vai no arquivo 03_painel/config.json (troque pelos seus tickers):')),
        av2(el('pre', { class: 'inv-code', tabindex: '0', 'aria-label': 'Trecho para o config.json' }, trecho)),
        av2(el('div', { class: 'inv-actions' },
          el('button', { type: 'button', class: 'pb-btn', onclick: () => copiar(trecho) }, 'Copiar trecho'),
          el('a', { class: 'pb-btn', href: 'https://github.com/Arthas3000/ativos/edit/main/03_painel/config.json', target: '_blank', rel: 'noopener noreferrer' }, 'Editar config.json no GitHub'))),
        stCopiar,
        el('p', { class: 'pb-note', 'data-so-avancado': '1' }, 'Depois de salvar a alteração no GitHub, o histórico desses ativos chega na próxima atualização automática (GitHub Actions, depois de cada pregão). Até lá a Simulação não os enxerga; a Corretora e o Assistente já funcionam.'));
    }
    const cardExtras = card('Ativos extras no histórico', corpoExtras);

    // ---- 4) Backup
    const stBackup = el('div', { 'aria-live': 'polite' });
    const stImport = el('div', { 'aria-live': 'polite' });
    const campoArq = campo({ id: 'inv-cfg-arquivo', rotulo: 'Importar backup (.json)', tipo: 'file', attrs: { accept: '.json,application/json' } });
    const confirma = el('div', { class: 'inv-actions' });
    let textoPendente = null;
    const limparImport = () => { textoPendente = null; confirma.replaceChildren(); campoArq.input.value = ''; };
    function exportarArquivo() {
      try {
        const txt = exportar();
        const nome = 'painel-b3-carteira-' + hoje() + '.json';
        const url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
        const a = el('a', { href: url, download: nome });
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status(stBackup, av('Backup gerado: ' + nome + ' (' + estado.transacoes.length + ' transações, ' + estado.ativosCustom.length + ' ativos personalizados). O token da brapi não é incluído.', 'ok'));
      } catch (e) { status(stBackup, av('Não foi possível gerar o backup: ' + e.message, 'bad')); }
    }
    campoArq.input.addEventListener('change', () => {
      const f = campoArq.input.files && campoArq.input.files[0];
      textoPendente = null; confirma.replaceChildren();
      if (!f) { status(stImport); return; }
      if (f.size > 20 * 1024 * 1024) { status(stImport, av('Arquivo grande demais (limite de 20 MB).', 'bad')); return; }
      status(stImport, av('Lendo o arquivo…', 'info'));
      const ler = f.text ? f.text() : new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsText(f); });
      ler.then((txt) => {
        const a = analisarImport(txt);
        textoPendente = txt;
        status(stImport, av('Arquivo válido' + (a.exportadoEm ? ' (exportado em ' + fmtDataHora(a.exportadoEm) + ')' : '') + ': ' + a.resumo.transacoes + ' transações e ' + a.resumo.ativos
          + ' ativos personalizados. Importar vai SUBSTITUIR todos os dados atuais deste aparelho (' + estado.transacoes.length + ' transações, ' + estado.ativosCustom.length + ' ativos personalizados).'
          + (a.resumo.avisos.length ? ' Avisos: ' + a.resumo.avisos.join(' ') : ''), 'warn'));
        confirma.replaceChildren(
          el('button', { type: 'button', class: 'pb-btn', onclick: () => {
            try {
              const r = importar(textoPendente);
              limparImport();
              status(stImport, av('Dados substituídos: ' + r.transacoes + ' transações e ' + r.ativos + ' ativos personalizados.' + (r.avisos.length ? ' Avisos: ' + r.avisos.join(' ') : ''), 'ok'));
            } catch (e) { status(stImport, av(e.message, 'bad')); }
          } }, 'Substituir dados'),
          el('button', { type: 'button', class: 'pb-btn', onclick: () => { limparImport(); status(stImport, av('Importação cancelada. Nada foi alterado.', 'info')); } }, 'Cancelar'));
      }).catch((e) => { textoPendente = null; confirma.replaceChildren(); status(stImport, av(e.message || 'Não foi possível ler o arquivo.', 'bad')); });
    });
    const campoApagar = campo({ id: 'inv-cfg-apagar', rotulo: 'Para apagar tudo, digite APAGAR', tipo: 'text', attrs: { autocomplete: 'off', autocapitalize: 'characters' } });
    const btnApagar = el('button', { type: 'button', class: 'pb-btn', disabled: true, onclick: () => {
      if (campoApagar.input.value !== 'APAGAR') return;
      try {
        apagarTudo(); campoApagar.input.value = ''; btnApagar.disabled = true; limparImport();
        status(stApagar, av('Todos os dados da carteira foram apagados deste aparelho. O token da brapi não foi apagado (use "Apagar token" em Ajustes › Cotações).', 'ok'));
      } catch (e) { status(stApagar, av(e.message, 'bad')); }
    } }, 'Apagar todos os dados');
    campoApagar.input.addEventListener('input', () => { btnApagar.disabled = campoApagar.input.value !== 'APAGAR'; });
    const stApagar = el('div', { 'aria-live': 'polite' });
    const cardBackup = card('Backup',
      av('Seus dados ficam só neste navegador. Limpar os dados do navegador, trocar de aparelho ou desinstalar o app apaga a carteira. Exporte um backup com frequência.', 'warn'),
      el('div', { class: 'inv-actions' }, el('button', { type: 'button', class: 'pb-btn inv-pri', onclick: exportarArquivo }, 'Exportar backup')),
      stBackup,
      el('hr', { class: 'inv-card-sep' }),
      campoArq, stImport, confirma,
      el('hr', { class: 'inv-card-sep' }),
      campoApagar, el('div', { class: 'inv-actions' }, btnApagar), stApagar);

    // ---- 5) Fontes de dados
    const corpoFontes = el('div', { style: 'display:grid;gap:var(--cds-gap-sm)' });
    function periodoSerie(d) {
      let ini = null, fim = null, n = 0;
      Object.keys(d.ativos || {}).forEach((t) => {
        const x = d.ativos[t];
        if (!x || !Array.isArray(x.d) || !x.d.length) return;
        n++;
        if (ini === null || x.d[0] < ini) ini = x.d[0];
        if (fim === null || x.d[x.d.length - 1] > fim) fim = x.d[x.d.length - 1];
      });
      return { ini, fim, n };
    }
    function falhasTxt(f) {
      const ks = f && isObj(f) ? Object.keys(f) : [];
      return ks.length ? ks.map((k) => k + ': ' + f[k]).join('; ') : 'nenhuma';
    }
    function blocoFonte(titulo, f, linhas) {
      if (f.status === 'carregando') return el('div', null, el('h3', null, titulo), av('Carregando…', 'info'));
      if (f.status !== 'ok') return el('div', null, el('h3', null, titulo), av('Histórico longo indisponível (' + f.mensagem + '). Ele é gerado pela atualização automática (GitHub Actions); o resto do app continua funcionando.', 'warn'));
      return el('div', { style: 'display:grid;gap:var(--cds-gap-xs)' }, el('h3', null, titulo),
        el('dl', { class: 'inv-kv' }, linhas.map(([k, v]) => [el('dt', null, k), el('dd', null, v)])));
    }
    function desenharFontes() {
      const s = fontes.serie, i = fontes.indices;
      const ls = s.status === 'ok' ? (() => {
        const p = periodoSerie(s.data);
        return [['Gerado em', fmtDataHora(s.data.gerado_em)], ['Data de referência', fmtData(s.data.data_ref)],
          ['Período', p.ini ? fmtData(p.ini) + ' a ' + fmtData(p.fim) : '—'], ['Ativos com série', String(p.n)],
          ['Fonte', s.data.fonte || '—'], ['Falhas', falhasTxt(s.data.falhas)]];
      })() : [];
      const li = i.status === 'ok' ? (() => {
        const d = i.data, cd = d.cdi && d.cdi.d && d.cdi.d.length ? fmtData(d.cdi.d[0]) + ' a ' + fmtData(d.cdi.d[d.cdi.d.length - 1]) : 'sem dados';
        const ip = d.ipca && d.ipca.m && d.ipca.m.length ? d.ipca.m[0].split('-').reverse().join('/') + ' a ' + d.ipca.m[d.ipca.m.length - 1].split('-').reverse().join('/') : 'sem dados';
        return [['Gerado em', fmtDataHora(d.gerado_em)], ['CDI (SGS 12)', cd], ['IPCA (SGS 433)', ip],
          ['Fonte', d.fonte || '—'], ['Falhas', falhasTxt(d.falhas)]];
      })() : [];
      const p = W.dash.data('parametros');
      const dref = p.status === 'ok' && p.data[0] ? fmtData(p.data[0].data_ref) : '—';
      const resumo = el('dl', { class: 'inv-kv', 'data-so-facil': '1' },
        el('dt', null, 'Preços e notas'), el('dd', null, 'fechamento de ' + dref + ' (Yahoo Finance e Fundamentus), atualizados sozinhos depois de cada pregão'),
        el('dt', null, 'Preço do dia'), el('dd', null, (token.ler() ? 'brapi.dev, com o seu token; sem resposta dela, ' : '') + (cotDia
          ? 'Yahoo Finance a cada 15 min durante o pregão (última: ' + fmtDataHora(cotDia.gerado_em) + ', atraso de cerca de 15 min)'
          : 'Yahoo Finance a cada 15 min durante o pregão (ainda sem cotação nesta sessão)')),
        el('dt', null, 'Histórico de 5 anos'), el('dd', null, s.status === 'ok' ? 'carregado' : s.status === 'carregando' ? 'carregando…' : 'indisponível'));
      const det = el('div', { 'data-so-avancado': '1', style: 'display:grid;gap:var(--cds-gap-sm)' },
        blocoFonte('Histórico longo (serie_longa.json)', s, ls),
        blocoFonte('Índices (indices.json)', i, li));
      corpoFontes.replaceChildren(resumo, det,
        el('div', { class: 'inv-actions' }, el('button', { type: 'button', class: 'pb-btn', onclick: () => { carregar(); } }, 'Recarregar dados')));
    }
    const cardFontes = card('Fontes de dados', corpoFontes);

    // ---- montagem
    sec.replaceChildren();
    secoes(sec, {
      id: 'config', rotulo: 'Seções dos ajustes',
      antes: [avisoArm],
      itens: [
        { id: 'cotacoes', rotulo: 'Cotações', nodes: [cardCot] },
        { id: 'custos', rotulo: 'Custos', nodes: [cardCustos] },
        { id: 'extras', rotulo: 'Ativos extras', nodes: [cardExtras] },
        { id: 'backup', rotulo: 'Backup', nodes: [cardBackup] },
        { id: 'fontes', rotulo: 'Fontes de dados', nodes: [cardFontes] }
      ]
    });

    statusTokenInicial();
    preencherCustos();

    aoMostrar('config', () => {
      status(avisoArm, ...avisosArmazenamento());
      if (!sujo) preencherCustos();
      desenharExtras();
      desenharFontes();
    });
  }

  montarConfig();
  carregar();
  carregarCotacoes();
})();
