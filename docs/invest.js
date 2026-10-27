/* Painel B3 — núcleo de cálculo do controle de investimentos (INVCalc).
 * Puro: sem DOM, sem fetch, sem Date.now() em cálculos. Datas sempre 'AAAA-MM-DD'.
 * Dinheiro da Corretora/Assistente em CENTAVOS INTEIROS; a Simulação usa ponto flutuante.
 * Material educacional; não é recomendação de investimento.
 */
(function () {
  'use strict';

  // ------------------------------------------------------------------ utilidades
  var DIA_MS = 86400000;

  function isNum(x) { return typeof x === 'number' && isFinite(x); }
  function isInt(x) { return Number.isSafeInteger(x); }

  /** Arredonda meio para longe do zero, tolerante a erro binário (1.005*100 → 100.49999… → 101). */
  function rnd(x) {
    if (!isNum(x)) return NaN;
    var a = Math.abs(x);
    var f = Number(a.toPrecision(15));
    var r = Math.floor(f + 0.5);
    if (r === 0) return 0;
    return x < 0 ? -r : r;
  }

  /** round(a*b/c) exato com BigInt (meio para longe do zero). a, b, c inteiros; c != 0. */
  function mulDivRound(a, b, c) {
    var A = BigInt(a), B = BigInt(b), C = BigInt(c);
    var num = A * B;
    var neg = (num < 0n) !== (C < 0n);
    if (num < 0n) num = -num;
    if (C < 0n) C = -C;
    var q = num / C, r = num % C;
    if (r * 2n >= C) q += 1n;
    var out = Number(neg ? -q : q);
    return out === 0 ? 0 : out;
  }

  var RE_DATA = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2})(?::(\d{2}))?)?$/;

  function dataValida(s) {
    if (typeof s !== 'string') return false;
    var m = RE_DATA.exec(s);
    if (!m) return false;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1) return false;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return false;
    if (m[4] !== undefined) {
      if (+m[4] > 23 || +m[5] > 59) return false;
      if (m[6] !== undefined && +m[6] > 59) return false;
    }
    return true;
  }

  function toUTC(data) {
    var m = RE_DATA.exec(data);
    if (!m) throw new Error('Data inválida: ' + data);
    return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function fmtDataISO(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }

  /** Dias corridos de a até b (b − a), datas 'AAAA-MM-DD'. */
  function diasEntre(a, b) {
    return Math.round((toUTC(b) - toUTC(a)) / DIA_MS);
  }

  /** Soma n meses; o dia é limitado ao último dia do mês resultante. */
  function addMeses(data, n) {
    var m = RE_DATA.exec(data);
    if (!m) throw new Error('Data inválida: ' + data);
    var y = +m[1], mo = +m[2] - 1 + n, d = +m[3];
    y += Math.floor(mo / 12);
    mo = ((mo % 12) + 12) % 12;
    var ultimo = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    return y + '-' + pad2(mo + 1) + '-' + pad2(Math.min(d, ultimo));
  }

  function fmtNum(x, casas) {
    var s = Math.abs(x).toFixed(casas).replace('.', ',');
    return (x < 0 && Number(s.replace(',', '.')) !== 0 ? '-' : '') + s;
  }

  function cmpStr(a, b) { return a < b ? -1 : a > b ? 1 : 0; }

  // ------------------------------------------------------------------ 3.1 dinheiro
  /** Reais (número) ou texto pt-BR → centavos inteiros, ou null. */
  function toCents(x) {
    if (x === null || x === undefined) return null;
    if (typeof x === 'number') {
      if (!isFinite(x)) return null;
      var r = rnd(x * 100);
      return isInt(r) ? r : null;
    }
    if (typeof x !== 'string') return null;
    var s = x.replace(/[\s ]/g, '').replace(/^R\$/i, '');
    var neg = false;
    if (s.charAt(0) === '-' || s.charAt(0) === '−') { neg = true; s = s.slice(1); }
    s = s.replace(/^R\$/i, '');
    if (s === '') return null;
    var inteiro, frac;
    if (s.indexOf(',') >= 0) {
      // pt-BR: '.' milhar, ',' decimal
      if (!/^\d{1,3}(\.\d{3})*(,\d*)?$/.test(s) && !/^\d+(,\d*)?$/.test(s)) return null;
      var partes = s.split(',');
      inteiro = partes[0].replace(/\./g, '');
      frac = partes[1] || '';
    } else if (/^\d{1,3}(\.\d{3})+$/.test(s)) {
      // '1.234' ou '1.234.567' → separador de milhar (pt-BR tem prioridade)
      inteiro = s.replace(/\./g, '');
      frac = '';
    } else if (/^\d+(\.\d*)?$/.test(s)) {
      var p = s.split('.');
      inteiro = p[0];
      frac = p[1] || '';
    } else if (/^\.\d+$/.test(s)) {
      inteiro = '0';
      frac = s.slice(1);
    } else {
      return null;
    }
    if (inteiro === '') inteiro = '0';
    // aritmética exata em texto: centavos = inteiro*100 + 2 primeiras casas, arredonda pela 3ª
    var f2 = (frac + '00').slice(0, 2);
    var c = Number(inteiro) * 100 + Number(f2);
    var resto = frac.slice(2);
    if (resto.length && resto.charAt(0) >= '5') c += 1;
    if (!isInt(c)) return null;
    if (c === 0) return 0;
    return neg ? -c : c;
  }

  function fromCents(c) {
    if (c === null || c === undefined || !isNum(c)) return null;
    return c / 100;
  }

  function fmtBRL(c) {
    if (c === null || c === undefined || !isNum(c)) return '—';
    c = rnd(c);
    var neg = c < 0;
    var a = Math.abs(c);
    var inteiro = String(Math.floor(a / 100));
    var cent = pad2(a % 100);
    inteiro = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (neg ? '-' : '') + 'R$ ' + inteiro + ',' + cent;
  }

  function taxas(o) {
    var bruto = o.brutoCent || 0, qtd = o.qtd || 0;
    var fixa = o.taxaFixaCent || 0, pct = o.taxaPct || 0;
    if (!(qtd > 0)) return 0;
    return fixa + rnd(bruto * pct / 100);
  }

  /** Maior qtd múltiplo de lote com qtd*preco + taxas ≤ valor. Cresce com qtd, então busca decrescente. */
  function maiorQtd(valorCent, precoCent, lote, fixa, pct) {
    var porLote = precoCent * lote;
    var k = Math.floor((valorCent - fixa) / (porLote * (1 + pct / 100)));
    if (!(k > 0)) return 0;
    k += 1; // começa um acima e desce até caber (cobre arredondamento das taxas)
    while (k > 0) {
      var bruto = k * porLote;
      if (bruto + taxas({ brutoCent: bruto, qtd: k * lote, taxaFixaCent: fixa, taxaPct: pct }) <= valorCent) break;
      k -= 1;
    }
    return k * lote;
  }

  function estimarQuantidade(o) {
    var valor = o.valorCent, preco = o.precoCent;
    var lote = o.lote === undefined || o.lote === null ? 1 : o.lote;
    var fixa = o.taxaFixaCent || 0, pct = o.taxaPct || 0;
    var vazio = function (aviso, v) {
      return { qtd: 0, brutoCent: 0, taxasCent: 0, totalCent: 0, sobraCent: isInt(v) && v > 0 ? v : 0, aviso: aviso };
    };
    if (!isInt(preco) || preco <= 0) return vazio('Preço inválido ou indisponível: não é possível estimar a quantidade.', valor);
    if (!isInt(lote) || lote < 1) return vazio('Lote inválido (use um inteiro ≥ 1).', valor);
    if (!isInt(fixa) || fixa < 0 || !isNum(pct) || pct < 0) return vazio('Taxas inválidas.', valor);
    if (!isInt(valor) || valor <= 0) return vazio('Informe um valor a investir maior que zero.', valor);
    var qtd = maiorQtd(valor, preco, lote, fixa, pct);
    if (qtd === 0) {
      var bruto1 = preco * lote;
      var custo1 = bruto1 + taxas({ brutoCent: bruto1, qtd: lote, taxaFixaCent: fixa, taxaPct: pct });
      return vazio('Valor menor que 1 lote (' + lote + (lote === 1 ? ' unidade' : ' unidades') +
        ' custa ' + fmtBRL(custo1) + ' com taxas).', valor);
    }
    var bruto = qtd * preco;
    var tx = taxas({ brutoCent: bruto, qtd: qtd, taxaFixaCent: fixa, taxaPct: pct });
    return { qtd: qtd, brutoCent: bruto, taxasCent: tx, totalCent: bruto + tx, sobraCent: valor - bruto - tx, aviso: null };
  }

  // ------------------------------------------------------------------ 3.2 livro de transações
  var TIPOS = ['compra', 'venda', 'deposito', 'retirada', 'cancelamento'];

  function efetivas(txs) {
    var lista = Array.isArray(txs) ? txs : [];
    var substituidas = {};
    lista.forEach(function (t) { if (t && t.substitui) substituidas[t.substitui] = true; });
    return lista.filter(function (t) {
      return t && t.tipo !== 'cancelamento' && !substituidas[t.id];
    });
  }

  function valorEsperado(tx) {
    if (tx.tipo === 'compra') return tx.qtd * tx.precoCent + tx.taxasCent;
    if (tx.tipo === 'venda') return tx.qtd * tx.precoCent - tx.taxasCent;
    if (tx.tipo === 'cancelamento') return 0;
    return null;
  }

  function validarTx(tx, ctx) {
    var erros = [];
    if (!tx || typeof tx !== 'object') return ['Transação inválida.'];
    if (TIPOS.indexOf(tx.tipo) < 0) { erros.push('Tipo de transação inválido.'); return erros; }
    if (!dataValida(tx.data)) erros.push('Data inválida (use AAAA-MM-DD ou AAAA-MM-DDTHH:MM).');
    ['qtd', 'precoCent', 'taxasCent', 'valorCent'].forEach(function (k) {
      var v = tx[k] === undefined ? 0 : tx[k];
      if (!isInt(v) || v < 0) erros.push('Campo ' + k + ' deve ser inteiro maior ou igual a zero.');
    });
    if (tx.moeda !== undefined && tx.moeda !== 'BRL') erros.push('Só operações em reais (BRL) são aceitas.');
    if (erros.length) return erros;
    var t = { tipo: tx.tipo, qtd: tx.qtd || 0, precoCent: tx.precoCent || 0, taxasCent: tx.taxasCent || 0, valorCent: tx.valorCent || 0 };
    if (tx.tipo === 'compra' || tx.tipo === 'venda') {
      if (typeof tx.ticker !== 'string' || !tx.ticker) erros.push('Informe o ativo.');
      if (!(t.qtd > 0)) erros.push('Quantidade deve ser maior que zero.');
      if (!(t.precoCent > 0)) erros.push('Preço deve ser maior que zero.');
      var esp = valorEsperado(t);
      if (tx.tipo === 'venda' && esp < 0) erros.push('Taxas maiores que o valor da venda.');
      else if (esp !== t.valorCent) erros.push('Valor total incoerente: esperado ' + fmtBRL(esp) + ', informado ' + fmtBRL(t.valorCent) + '.');
      if (tx.tipo === 'venda' && ctx && ctx.posicoes && typeof tx.ticker === 'string') {
        var pos = ctx.posicoes[tx.ticker];
        var tem = pos ? pos.qtd : 0;
        if (t.qtd > tem) erros.push('Venda de ' + t.qtd + ' maior que a posição de ' + tem + ' em ' + tx.ticker + '.');
      }
    } else if (tx.tipo === 'deposito' || tx.tipo === 'retirada') {
      if (!(t.valorCent > 0)) erros.push('Valor deve ser maior que zero.');
    } else if (tx.tipo === 'cancelamento') {
      if (!tx.substitui) erros.push('Cancelamento precisa indicar a transação cancelada.');
      if (t.valorCent !== 0) erros.push('Cancelamento não tem valor.');
    }
    return erros;
  }

  function ordenarCrono(txs) {
    return txs.map(function (t, i) { return { t: t, i: i }; }).sort(function (a, b) {
      return cmpStr(a.t.data || '', b.t.data || '') || cmpStr(a.t.criadoEm || '', b.t.criadoEm || '') || a.i - b.i;
    }).map(function (x) { return x.t; });
  }

  function posicoes(txs) {
    var out = {};
    ordenarCrono(Array.isArray(txs) ? txs : []).forEach(function (t) {
      if (!t.ticker || (t.tipo !== 'compra' && t.tipo !== 'venda')) return;
      var p = out[t.ticker] || (out[t.ticker] = { qtd: 0, custoCent: 0, precoMedioCent: 0 });
      if (t.tipo === 'compra') {
        p.qtd += t.qtd;
        p.custoCent += t.valorCent;
      } else {
        var q = Math.min(t.qtd, p.qtd); // nunca negativa (venda maior é barrada em validarTx)
        if (q >= p.qtd) { p.qtd = 0; p.custoCent = 0; }
        else {
          p.custoCent -= mulDivRound(p.custoCent, q, p.qtd);
          p.qtd -= q;
        }
      }
      p.precoMedioCent = p.qtd > 0 ? mulDivRound(p.custoCent, 1, p.qtd) : 0;
      if (p.qtd === 0) delete out[t.ticker];
    });
    return out;
  }

  function caixa(txs) {
    var c = 0;
    (Array.isArray(txs) ? txs : []).forEach(function (t) {
      var v = t.valorCent || 0;
      if (t.tipo === 'deposito') c += v;
      else if (t.tipo === 'retirada') c -= v;
      else if (t.tipo === 'compra') c -= v;
      else if (t.tipo === 'venda') c += v;
    });
    return c;
  }

  function alocacao(pos, precosCent) {
    precosCent = precosCent || {};
    var tickers = Object.keys(pos || {}).sort();
    var total = 0, semPreco = [];
    var linhas = tickers.map(function (tk) {
      var q = pos[tk].qtd;
      var pr = precosCent[tk];
      if (!isInt(pr) || pr <= 0) { semPreco.push(tk); return { ticker: tk, qtd: q, precoCent: null, valorCent: null, pct: null }; }
      var v = q * pr;
      total += v;
      return { ticker: tk, qtd: q, precoCent: pr, valorCent: v, pct: null };
    });
    linhas.forEach(function (l) { if (l.valorCent !== null) l.pct = total > 0 ? l.valorCent / total * 100 : 0; });
    return { linhas: linhas, totalCent: total, semPreco: semPreco };
  }

  // ------------------------------------------------------------------ 3.3 alocação de aporte
  /** Distribui `rem` centavos proporcional a w sem passar de cap (inteiros, determinístico). */
  function waterFillInt(rem, itens) {
    var alloc = itens.map(function () { return 0; });
    var ativos = [];
    itens.forEach(function (it, i) { if (it.w > 0 && it.cap > 0) ativos.push(i); });
    while (rem > 0 && ativos.length) {
      var W = 0;
      ativos.forEach(function (i) { W += itens[i].w; });
      var batem = ativos.filter(function (i) { return rem * itens[i].w / W >= itens[i].cap - alloc[i]; });
      if (batem.length) {
        batem.forEach(function (i) { var g = itens[i].cap - alloc[i]; alloc[i] += g; rem -= g; });
        ativos = ativos.filter(function (i) { return batem.indexOf(i) < 0; });
        continue;
      }
      var frac = [], soma = 0;
      ativos.forEach(function (i) {
        var s = rem * itens[i].w / W, f = Math.floor(s);
        alloc[i] += f; soma += f;
        frac.push({ i: i, r: s - f });
      });
      rem -= soma;
      frac.sort(function (a, b) {
        return (b.r - a.r) || (itens[b.i].w - itens[a.i].w) || cmpStr(itens[a.i].ticker, itens[b.i].ticker);
      });
      for (var k = 0; k < frac.length && rem > 0; k++) {
        var j = frac[k].i;
        if (alloc[j] < itens[j].cap) { alloc[j] += 1; rem -= 1; }
      }
      ativos = ativos.filter(function (i) { return alloc[i] < itens[i].cap; });
    }
    return { alloc: alloc, rem: rem };
  }

  function planejarAportes(p) {
    if (!p || typeof p !== 'object') throw new Error('Parâmetros do aporte ausentes.');
    var orc = p.orcamentoCent, reserva = p.reservaCent || 0;
    var fixa = p.taxaFixaCent || 0, pct = p.taxaPct || 0;
    var intens = p.intensidadeScore === undefined || p.intensidadeScore === null ? 0 : p.intensidadeScore;
    var outros = p.outrosCent || 0;
    var lista = Array.isArray(p.ativos) ? p.ativos : [];

    // 1. validação
    if (!isInt(orc) || orc <= 0) throw new Error('O orçamento deve ser maior que zero.');
    if (!isInt(reserva) || reserva < 0) throw new Error('A reserva deve ser zero ou mais.');
    if (reserva >= orc) throw new Error('A reserva deve ser menor que o orçamento.');
    if (!isInt(fixa) || fixa < 0) throw new Error('Corretagem fixa inválida.');
    if (!isNum(pct) || pct < 0 || pct >= 100) throw new Error('Taxa percentual inválida.');
    if (!isNum(intens) || intens < 0 || intens > 1) throw new Error('A intensidade do score deve estar entre 0% e 100%.');
    if (!isInt(outros) || outros < 0) throw new Error('Valor das outras posições inválido.');
    if (!lista.length) throw new Error('Selecione ao menos um ativo.');
    var somaAlvo = 0, vistos = {};
    lista.forEach(function (a) {
      if (!a || typeof a.ticker !== 'string' || !a.ticker) throw new Error('Ativo sem ticker.');
      if (vistos[a.ticker]) throw new Error('Ativo repetido: ' + a.ticker + '.');
      vistos[a.ticker] = true;
      if (!isNum(a.alvoPct) || a.alvoPct < 0 || a.alvoPct > 100) throw new Error(a.ticker + ': o alvo deve estar entre 0% e 100%.');
      if (a.maxPct !== null && a.maxPct !== undefined) {
        if (!isNum(a.maxPct) || a.maxPct > 100) throw new Error(a.ticker + ': teto inválido.');
        if (a.maxPct < a.alvoPct) throw new Error(a.ticker + ': o teto deve ser maior ou igual ao alvo.');
      }
      var lote = a.lote === undefined || a.lote === null ? 1 : a.lote;
      if (!isInt(lote) || lote < 1) throw new Error(a.ticker + ': lote inválido.');
      var va = a.valorAtualCent || 0;
      if (!isInt(va) || va < 0) throw new Error(a.ticker + ': valor atual inválido.');
      if (a.precoCent !== null && a.precoCent !== undefined && (!isInt(a.precoCent) || a.precoCent < 0)) throw new Error(a.ticker + ': preço inválido.');
      if (a.score !== null && a.score !== undefined && !isNum(a.score)) throw new Error(a.ticker + ': score inválido.');
      somaAlvo += a.alvoPct;
    });
    if (somaAlvo > 100 + 1e-9) throw new Error('A soma dos alvos (' + fmtNum(somaAlvo, 1) + '%) passa de 100%.');

    var avisos = [];
    // 2. totais
    var disp = orc - reserva;
    var V = outros;
    lista.forEach(function (a) { V += a.valorAtualCent || 0; });
    var T = V + disp;

    // 4. fatores de score
    var comScore = lista.filter(function (a) { return isNum(a.score); });
    var media = 0, maxDev = 0;
    comScore.forEach(function (a) { media += a.score; });
    if (comScore.length) media /= comScore.length;
    comScore.forEach(function (a) { maxDev = Math.max(maxDev, Math.abs(a.score - media)); });

    var L = lista.map(function (a) {
      var lote = a.lote === undefined || a.lote === null ? 1 : a.lote;
      var va = a.valorAtualCent || 0;
      var preco = isInt(a.precoCent) && a.precoCent > 0 ? a.precoCent : null;
      var temScore = isNum(a.score);
      var z = temScore && comScore.length > 1 && maxDev > 0 ? (a.score - media) / maxDev : 0;
      var fator = 1 + intens * z;
      if (!temScore) avisos.push(a.ticker + ': sem score: tratado como neutro.');
      if (preco === null) avisos.push(a.ticker + ': sem preço — recebe 0 nesta rodada.');
      var temTeto = a.maxPct !== null && a.maxPct !== undefined;
      var tetoCent = temTeto ? Math.max(0, rnd(a.maxPct / 100 * T) - va) : Infinity;
      // 3. necessidade
      var alvoCent = rnd(a.alvoPct / 100 * T);
      var need = Math.max(0, alvoCent - va);
      var atualPct = V > 0 ? va / V * 100 : 0;
      return {
        ticker: a.ticker, precoCent: preco, lote: lote, valorAtualCent: va, atualPct: atualPct,
        alvoPct: a.alvoPct, maxPct: temTeto ? a.maxPct : null, gapPct: a.alvoPct - atualPct,
        score: temScore ? a.score : null, z: z, fatorScore: fator,
        need: need, alvoCent: alvoCent, teto: tetoCent, limite: preco === null ? 0 : Math.min(need, tetoCent)
      };
    });

    // 5. water-filling em centavos
    var rem = disp;
    var prop = L.map(function () { return 0; });
    function rodada(fnW, fnCap) {
      var itens = L.map(function (l, i) { return { ticker: l.ticker, w: fnW(l, i), cap: fnCap(l, i) }; });
      var r = waterFillInt(rem, itens);
      r.alloc.forEach(function (g, i) { prop[i] += g; });
      rem = r.rem;
    }
    // prioridade 1: metas (peso = necessidade × fator do score)
    rodada(function (l) { return l.need * l.fatorScore; }, function (l, i) { return l.limite - prop[i]; });
    // se ainda há necessidade só em ativos com fator 0, completa sem o score (o score só reordena)
    if (rem > 0) rodada(function (l, i) { return l.limite - prop[i]; }, function (l, i) { return l.limite - prop[i]; });
    // a meta de um ativo sem preço não vai para os outros (eles passariam da meta): fica como sobra, com aviso
    var semPreco = 0;
    L.forEach(function (l) { if (l.precoCent === null) semPreco += l.need; });
    if (semPreco > 0) avisos.push(fmtBRL(Math.min(semPreco, rem)) + ' ficam sem uso: é a parte da meta de ativos sem preço (' +
      L.filter(function (l) { return l.precoCent === null && l.need > 0; }).map(function (l) { return l.ticker; }).join(', ') + ').');
    // todos na meta: distribui o resto pelos alvos, respeitando só o teto
    if (rem > semPreco) {
      var guardado = semPreco;
      rem -= guardado;
      var capT = function (l, i) { return l.precoCent === null ? 0 : l.teto - prop[i]; };
      rodada(function (l) { return l.alvoPct * l.fatorScore; }, capT);
      if (rem > 0) rodada(function (l) { return l.alvoPct; }, capT);
      rem += guardado;
    }

    // 6. execução em lotes
    L.forEach(function (l, i) {
      l.propostoCent = prop[i];
      l.qtd = l.precoCent === null ? 0 : maiorQtd(prop[i], l.precoCent, l.lote, fixa, pct);
      l.brutoCent = l.qtd * (l.precoCent || 0);
      l.taxasCent = taxas({ brutoCent: l.brutoCent, qtd: l.qtd, taxaFixaCent: fixa, taxaPct: pct });
      l.totalCent = l.brutoCent + l.taxasCent;
    });
    function somaTotal() { var s = 0; L.forEach(function (l) { s += l.totalCent; }); return s; }
    function somaBruto() { var s = 0; L.forEach(function (l) { s += l.brutoCent; }); return s; }
    // "um lote a mais": se alguém tinha necessidade (need > 0), só quem tinha necessidade é candidato
    // (e sem passar de alvo × T + 1 lote); se todos estavam na meta, vale qualquer alvo > 0 (respeitando o teto).
    // ativo sem preço não compra nada, então não conta como "alguém com necessidade"
    var haNecessidade = L.some(function (l) { return l.need > 0 && l.precoCent !== null; });
    for (;;) {
      var livre = disp - somaTotal();
      var melhor = null;
      L.forEach(function (l) {
        if (l.precoCent === null || l.alvoPct <= 0) return;
        if (haNecessidade && l.need <= 0) return;
        var nb = l.brutoCent + l.lote * l.precoCent;
        if (nb > l.teto) return;
        if (haNecessidade && l.valorAtualCent + nb > l.alvoCent + l.lote * l.precoCent) return;
        var nq = l.qtd + l.lote;
        var nt = nb + taxas({ brutoCent: nb, qtd: nq, taxaFixaCent: fixa, taxaPct: pct });
        if (nt - l.totalCent > livre) return;
        var dif = (l.valorAtualCent + nb) / T * 100 - l.alvoPct;
        var c = { l: l, nb: nb, nq: nq, nt: nt, dif: dif };
        if (!melhor) { melhor = c; return; }
        if (dif < melhor.dif - 1e-9) melhor = c;
        else if (Math.abs(dif - melhor.dif) <= 1e-9) {
          if (l.fatorScore > melhor.l.fatorScore + 1e-12) melhor = c;
          else if (Math.abs(l.fatorScore - melhor.l.fatorScore) <= 1e-12 && l.ticker < melhor.l.ticker) melhor = c;
        }
      });
      if (!melhor) break;
      melhor.l.qtd = melhor.nq;
      melhor.l.brutoCent = melhor.nb;
      melhor.l.taxasCent = melhor.nt - melhor.nb;
      melhor.l.totalCent = melhor.nt;
    }

    // 7. totais e garantias
    var totalCent = somaTotal(), taxasTot = 0, brutoTot = somaBruto();
    L.forEach(function (l) { taxasTot += l.taxasCent; });
    if (totalCent > disp) throw new Error('Erro interno: total acima do disponível.');
    var depois = V + brutoTot;
    // base de "Depois %": a mesma do alvo e do teto — T = V + disponível (a sobra não gasta conta como caixa da carteira)

    var linhas = L.map(function (l) {
      var depoisPct = T > 0 ? (l.valorAtualCent + l.brutoCent) / T * 100 : 0;
      var motivo;
      if (l.precoCent === null) motivo = 'sem preço';
      else if (l.teto !== Infinity && l.brutoCent + l.lote * l.precoCent > l.teto) motivo = 'teto atingido';
      else if (l.need <= 0) motivo = l.gapPct < -0.05 ? 'acima da meta' : 'na meta';
      else if (l.gapPct > 0.05) motivo = 'abaixo da meta ' + fmtNum(l.gapPct, 1) + ' p.p.';
      // hoje acima (ou na) meta, mas a carteira cresce com o aporte: precisa comprar para manter o peso-alvo
      else motivo = 'mantém o alvo após o aporte (faltam ' + fmtBRL(l.need) + ')';
      if (l.score !== null && intens > 0 && l.precoCent !== null) motivo += '; score ' + (l.z >= 0 ? '+' : '') + fmtNum(intens * l.z, 2);
      if (l.precoCent !== null && l.qtd === 0 && l.propostoCent > 0) motivo += '; valor menor que 1 lote';
      return {
        ticker: l.ticker, precoCent: l.precoCent, lote: l.lote, valorAtualCent: l.valorAtualCent,
        atualPct: l.atualPct, alvoPct: l.alvoPct, gapPct: l.gapPct, score: l.score, fatorScore: l.fatorScore,
        propostoCent: l.propostoCent, qtd: l.qtd, brutoCent: l.brutoCent, taxasCent: l.taxasCent,
        totalCent: l.totalCent, depoisPct: depoisPct, motivo: motivo
      };
    });
    return {
      linhas: linhas, disponivelCent: disp, totalCent: totalCent, taxasCent: taxasTot,
      sobraCent: orc - totalCent, totalCarteiraDepoisCent: depois, baseDepoisCent: T, avisos: avisos
    };
  }

  // ------------------------------------------------------------------ 3.4 simulação histórica
  function twr(linhas) {
    var g = 1;
    for (var t = 1; t < linhas.length; t++) {
      var ant = linhas[t - 1].valor;
      if (ant > 0) g *= (linhas[t].valor - (linhas[t].fluxo || 0)) / ant;
    }
    return g - 1;
  }

  function xirr(fluxos) {
    if (!Array.isArray(fluxos) || fluxos.length < 2) return null;
    var temNeg = false, temPos = false;
    fluxos.forEach(function (f) { if (f.valor < 0) temNeg = true; if (f.valor > 0) temPos = true; });
    if (!temNeg || !temPos) return null;
    var d0 = fluxos.reduce(function (m, f) { return f.data < m ? f.data : m; }, fluxos[0].data);
    var fs = fluxos.map(function (f) { return { t: diasEntre(d0, f.data) / 365, v: f.valor }; });
    function npv(r) { var s = 0; fs.forEach(function (f) { s += f.v / Math.pow(1 + r, f.t); }); return s; }
    function dnpv(r) { var s = 0; fs.forEach(function (f) { s -= f.t * f.v / Math.pow(1 + r, f.t + 1); }); return s; }
    var LO = -0.9999, HI = 10, TOL = 1e-7;
    var r = 0.1;
    for (var i = 0; i < 100; i++) {
      var f = npv(r), df = dnpv(r);
      if (!isFinite(f) || !isFinite(df) || df === 0) break;
      var nr = r - f / df;
      if (!isFinite(nr) || nr <= LO || nr >= HI) break;
      if (Math.abs(nr - r) < TOL) { if (Math.abs(npv(nr)) < 1e-6 * Math.max(1, totalAbs())) return nr; break; }
      r = nr;
    }
    function totalAbs() { var s = 0; fs.forEach(function (f) { s += Math.abs(f.v); }); return s; }
    // bisseção
    var a = LO, b = HI, fa = npv(a), fb = npv(b);
    if (!isFinite(fa) || !isFinite(fb) || fa * fb > 0) return null;
    for (var k = 0; k < 200; k++) {
      var m = (a + b) / 2, fm = npv(m);
      if (fm === 0 || (b - a) / 2 < TOL) return m;
      if (fa * fm < 0) { b = m; fb = fm; } else { a = m; fa = fm; }
    }
    return null;
  }

  /** Série limpa e ordenada de um ativo: d/c válidos e preço > 0. */
  function prepSerie(s) {
    var d = [], c = [];
    if (!s || !Array.isArray(s.d) || !Array.isArray(s.c)) return { d: d, c: c, div: [] };
    for (var i = 0; i < s.d.length; i++) {
      var p = s.c[i];
      if (typeof s.d[i] === 'string' && isNum(p) && p > 0 && (!d.length || s.d[i] > d[d.length - 1])) { d.push(s.d[i]); c.push(p); }
    }
    var div = (Array.isArray(s.div) ? s.div : []).filter(function (x) {
      return Array.isArray(x) && typeof x[0] === 'string' && isNum(x[1]) && x[1] > 0;
    }).slice().sort(function (a, b) { return cmpStr(a[0], b[0]); });
    return { d: d, c: c, div: div };
  }

  /** Cursor de "último preço na data ou antes" para datas crescentes. */
  function cursor(serie) {
    var i = -1;
    return function (data) {
      while (i + 1 < serie.d.length && serie.d[i + 1] <= data) i++;
      return i >= 0 ? serie.c[i] : null;
    };
  }

  function waterFillFloat(total, itens) {
    var alloc = itens.map(function () { return 0; });
    var ativos = [];
    itens.forEach(function (it, i) { if (it.w > 0 && it.cap > 0) ativos.push(i); });
    var rem = total;
    while (rem > 1e-12 && ativos.length) {
      var W = 0;
      ativos.forEach(function (i) { W += itens[i].w; });
      var batem = ativos.filter(function (i) { return rem * itens[i].w / W >= itens[i].cap - alloc[i]; });
      if (!batem.length) {
        ativos.forEach(function (i) { alloc[i] += rem * itens[i].w / W; });
        rem = 0;
        break;
      }
      batem.forEach(function (i) { var g = itens[i].cap - alloc[i]; alloc[i] += g; rem -= g; });
      ativos = ativos.filter(function (i) { return batem.indexOf(i) < 0; });
    }
    return { alloc: alloc, rem: rem };
  }

  function simular(p) {
    if (!p || typeof p !== 'object') throw new Error('Parâmetros da simulação ausentes.');
    var pesos = p.pesos || {};
    var tickers = Object.keys(pesos).filter(function (t) { return pesos[t] > 0; });
    if (!tickers.length) throw new Error('Escolha ao menos um ativo com peso maior que zero.');
    var somaP = 0;
    tickers.forEach(function (t) {
      if (!isNum(pesos[t]) || pesos[t] < 0) throw new Error(t + ': peso inválido.');
      somaP += pesos[t];
    });
    if (Math.abs(somaP - 100) > 0.01) throw new Error('A soma dos pesos deve ser 100% (está em ' + fmtNum(somaP, 2) + '%).');
    if (!dataValida(p.inicio) || !dataValida(p.fim)) throw new Error('Período inválido.');
    if (p.inicio > p.fim) throw new Error('A data inicial deve ser anterior à final.');
    var estrategia = p.estrategia || 'pesos';
    if (estrategia !== 'pesos' && estrategia !== 'rebalancear-aportes') throw new Error('Estratégia inválida.');
    var modoDiv = p.dividendos || 'reinvestir';
    if (['reinvestir', 'caixa', 'ignorar'].indexOf(modoDiv) < 0) throw new Error('Tratamento de dividendos inválido.');
    var ap0 = p.aporteInicial || 0, apM = p.aporteMensal || 0;
    if (!isNum(ap0) || ap0 < 0 || !isNum(apM) || apM < 0) throw new Error('Aportes devem ser zero ou mais.');
    if (ap0 + apM <= 0) throw new Error('Informe um aporte inicial ou mensal maior que zero.');
    var diaAp = p.diaAporte === undefined ? 1 : p.diaAporte;
    if (!isInt(diaAp) || diaAp < 1 || diaAp > 28) throw new Error('O dia do aporte deve estar entre 1 e 28.');
    var custo = p.custoPct || 0;
    if (!isNum(custo) || custo < 0 || custo >= 100) throw new Error('Custo por compra inválido.');
    var cf = custo / 100;
    var inteiros = !!p.inteiros;
    var series = p.series || {};
    var avisos = [];

    var S = {};
    tickers.forEach(function (t) {
      if (!series[t]) throw new Error(t + ': sem série histórica.');
      S[t] = prepSerie(series[t]);
      if (!S[t].d.length) throw new Error(t + ': série histórica vazia.');
    });

    // calendário = união das datas dentro de [inicio, fim]
    var cal = {};
    tickers.forEach(function (t) { S[t].d.forEach(function (d) { if (d >= p.inicio && d <= p.fim) cal[d] = true; }); });
    var datas = Object.keys(cal).sort();
    if (!datas.length) throw new Error('Não há pregões no período escolhido.');
    var primeira = {};
    tickers.forEach(function (t) { primeira[t] = S[t].d[0]; });
    var inicioEf = null;
    for (var di = 0; di < datas.length; di++) {
      var ok = tickers.every(function (t) { return primeira[t] <= datas[di]; });
      if (ok) { inicioEf = datas[di]; break; }
    }
    if (!inicioEf) throw new Error('Não há período em que todos os ativos escolhidos tenham preço.');
    var limitantes = tickers.filter(function (t) { return primeira[t] > p.inicio && primeira[t] >= inicioEf; });
    if (limitantes.length && inicioEf > datas[0]) {
      avisos.push('Início ajustado para ' + inicioEf + ': ' + limitantes.join(', ') + ' só tem histórico a partir dessa data.');
    } else if (limitantes.length) {
      avisos.push('Início em ' + inicioEf + ': ' + limitantes.join(', ') + ' só tem histórico a partir dessa data.');
    }
    datas = datas.filter(function (d) { return d >= inicioEf; });
    var fimEf = datas[datas.length - 1];

    // estado
    var un = {}, cur = {}, divPtr = {}, gastoAporte = {}, gastoTotal = {}, divAt = {};
    tickers.forEach(function (t) { un[t] = 0; cur[t] = cursor(S[t]); divPtr[t] = 0; gastoAporte[t] = 0; gastoTotal[t] = 0; divAt[t] = 0; });
    var cx = 0, custos = 0, divTot = 0, investido = 0;
    var linhas = [], aportes = [], twrL = [];

    function comprar(t, valor, preco, deAporte) {
      if (!(valor > 0)) return;
      var bruto, u;
      if (inteiros) {
        u = Math.floor(valor / (preco * (1 + cf)) + 1e-9);
        while (u > 0 && u * preco * (1 + cf) > valor + 1e-9) u--;
        bruto = u * preco;
      } else {
        bruto = valor / (1 + cf);
        u = bruto / preco;
      }
      var c = bruto * cf;
      var gasto = bruto + c;
      un[t] += u;
      custos += c;
      gastoTotal[t] += gasto;
      if (deAporte) gastoAporte[t] += gasto;
      cx += valor - gasto; // troco (só com inteiros)
      if (Math.abs(cx) < 1e-9) cx = 0;
    }

    function aplicar(valor, precos) {
      var aloc;
      if (estrategia === 'pesos') {
        aloc = tickers.map(function (t) { return valor * pesos[t] / somaP; });
      } else {
        var atual = 0;
        tickers.forEach(function (t) { atual += un[t] * precos[t]; });
        var tot = atual + valor;
        var itens = tickers.map(function (t) {
          var need = Math.max(0, pesos[t] / somaP * tot - un[t] * precos[t]);
          return { w: need, cap: need };
        });
        var r = waterFillFloat(valor, itens);
        aloc = r.alloc;
        if (r.rem > 1e-9) tickers.forEach(function (t, i) { aloc[i] += r.rem * pesos[t] / somaP; });
      }
      tickers.forEach(function (t, i) { comprar(t, aloc[i], precos[t], true); });
    }

    // agenda de aportes mensais
    var mesBase = inicioEf.slice(0, 7) + '-01';
    var k = 1;
    var proxAlvo = addMeses(mesBase, 1).slice(0, 8) + pad2(diaAp);

    var anterior = null;
    datas.forEach(function (data, idx) {
      var precos = {};
      tickers.forEach(function (t) { precos[t] = cur[t](data); });
      // 1. dividendos (data ex em (pregão anterior, hoje]) sobre as unidades do pregão anterior
      tickers.forEach(function (t) {
        var dv = S[t].div, valorDiv = 0;
        while (divPtr[t] < dv.length && dv[divPtr[t]][0] <= data) {
          if (anterior !== null && dv[divPtr[t]][0] > anterior) valorDiv += un[t] * dv[divPtr[t]][1];
          divPtr[t]++;
        }
        if (valorDiv > 0 && modoDiv !== 'ignorar') {
          divAt[t] += valorDiv;
          divTot += valorDiv;
          if (modoDiv === 'reinvestir') comprar(t, valorDiv, precos[t], false); // troco (inteiros) vai para o caixa
          else cx += valorDiv;
        }
      });
      // 2. aporte externo
      var fluxo = 0;
      if (idx === 0 && ap0 > 0) fluxo += ap0;
      var mensal = 0;
      while (proxAlvo <= data) {
        mensal += apM;
        k++;
        proxAlvo = addMeses(mesBase, k).slice(0, 8) + pad2(diaAp);
      }
      fluxo += mensal;
      if (fluxo > 0) {
        investido += fluxo;
        aportes.push({ data: data, valor: fluxo });
        var valor = fluxo + cx;
        cx = 0;
        aplicar(valor, precos);
      }
      var porAtivo = {}, v = cx;
      tickers.forEach(function (t) { porAtivo[t] = un[t] * precos[t]; v += porAtivo[t]; });
      linhas.push({ data: data, investido: investido, valor: v, caixa: cx, porAtivo: porAtivo });
      twrL.push({ valor: v, fluxo: fluxo });
      anterior = data;
    });

    var fin = linhas[linhas.length - 1];
    var valorFinal = fin.valor;
    var lucro = valorFinal - investido;
    var dias = diasEntre(inicioEf, fimEf);
    var g = twr(twrL);
    var twrAnual = dias >= 365 ? Math.pow(1 + g, 365 / dias) - 1 : null;
    var fluxosX = aportes.map(function (a) { return { data: a.data, valor: -a.valor }; });
    fluxosX.push({ data: fimEf, valor: valorFinal });
    var xr = xirr(fluxosX);

    // IPCA
    var ipcaAcum = null;
    if (p.ipca && Array.isArray(p.ipca.m) && p.ipca.m.length) {
      var mapa = {};
      p.ipca.m.forEach(function (m, i) { if (isNum(p.ipca.v[i])) mapa[m] = p.ipca.v[i]; });
      var mi = inicioEf.slice(0, 7), mf = fimEf.slice(0, 7), fat = 1, faltam = [];
      var mm = addMeses(mi + '-01', 1).slice(0, 7);
      while (mm <= mf) {
        if (mapa[mm] !== undefined) fat *= 1 + mapa[mm] / 100; else faltam.push(mm);
        mm = addMeses(mm + '-01', 1).slice(0, 7);
      }
      if (faltam.length) avisos.push('IPCA sem dado publicado para ' + faltam.join(', ') + '; inflação calculada só com os meses disponíveis.');
      ipcaAcum = fat - 1;
    } else {
      avisos.push('Série do IPCA indisponível: sem retorno real.');
    }

    var resumo = {
      inicial: ap0 > 0 ? ap0 : 0,
      aportesAdicionais: investido - (ap0 > 0 ? ap0 : 0),
      totalInvestido: investido, valorFinal: valorFinal, lucro: lucro,
      retornoAcumulado: investido > 0 ? lucro / investido * 100 : null,
      twr: g * 100, twrAnual: twrAnual === null ? null : twrAnual * 100,
      xirr: xr === null ? null : xr * 100,
      dividendos: divTot, custos: custos, dias: dias,
      ipcaAcum: ipcaAcum === null ? null : ipcaAcum * 100,
      twrReal: ipcaAcum === null ? null : ((1 + g) / (1 + ipcaAcum) - 1) * 100,
      valorFinalReal: ipcaAcum === null ? null : valorFinal / (1 + ipcaAcum)
    };

    var p0 = {}, p1 = {};
    tickers.forEach(function (t) { var c0 = cursor(S[t]); p0[t] = c0(inicioEf); p1[t] = c0(fimEf); });
    var porAtivo = tickers.map(function (t) {
      var vf = fin.porAtivo[t];
      var l = vf + divAt[t] - gastoTotal[t];
      return {
        ticker: t, investido: gastoAporte[t], valorFinal: vf, lucro: l, dividendos: divAt[t],
        contribuicaoPct: lucro !== 0 ? l / Math.abs(lucro) * 100 : null,
        retornoPrecoPct: (p1[t] / p0[t] - 1) * 100
      };
    });

    // benchmarks com os mesmos aportes nas mesmas datas
    var apPorData = {};
    aportes.forEach(function (a) { apPorData[a.data] = a.valor; });
    function resumoBench(lin, fl) {
      var vf = lin[lin.length - 1].valor;
      var fx = aportes.map(function (a) { return { data: a.data, valor: -a.valor }; });
      fx.push({ data: fimEf, valor: vf });
      var x = xirr(fx);
      var gb = twr(fl);
      return {
        linhas: lin, valorFinal: vf, lucro: vf - investido, twr: gb * 100,
        twrAnual: dias >= 365 ? (Math.pow(1 + gb, 365 / dias) - 1) * 100 : null,
        xirr: x === null ? null : x * 100
      };
    }
    var benchmarks = { IBOV: null, CDI: null };
    var ib = p.ibov ? prepSerie(p.ibov) : null;
    if (ib && ib.d.length && ib.d[0] <= inicioEf) {
      var ci = cursor(ib), u = 0, linI = [], flI = [];
      datas.forEach(function (d) {
        var pr = ci(d), f = apPorData[d] || 0;
        if (f > 0) u += f / pr;
        linI.push({ data: d, valor: u * pr });
        flI.push({ valor: u * pr, fluxo: f });
      });
      benchmarks.IBOV = resumoBench(linI, flI);
      if (ib.d[ib.d.length - 1] < fimEf) avisos.push('Ibovespa disponível só até ' + ib.d[ib.d.length - 1] + '; depois disso usa o último valor.');
    } else {
      avisos.push(ib && ib.d.length ? 'Ibovespa sem dados no início do período: comparação indisponível.' : 'Série do Ibovespa indisponível: comparação omitida.');
    }
    var cdi = p.cdi && Array.isArray(p.cdi.d) && p.cdi.d.length ? p.cdi : null;
    if (cdi) {
      var cd = [], cv = [];
      cdi.d.forEach(function (d, i) { if (isNum(cdi.v[i]) && (!cd.length || d > cd[cd.length - 1])) { cd.push(d); cv.push(cdi.v[i]); } });
      var j = 0, B = 0, linC = [], flC = [], ant = null;
      while (j < cd.length && cd[j] <= inicioEf) j++;
      datas.forEach(function (d) {
        if (ant !== null) { while (j < cd.length && cd[j] <= d) { B *= 1 + cv[j] / 100; j++; } }
        var f = apPorData[d] || 0;
        B += f;
        linC.push({ data: d, valor: B });
        flC.push({ valor: B, fluxo: f });
        ant = d;
      });
      benchmarks.CDI = resumoBench(linC, flC);
      if (cd[cd.length - 1] < fimEf) avisos.push('CDI disponível só até ' + cd[cd.length - 1] + '; sem rendimento depois disso.');
      if (cd[0] > inicioEf) avisos.push('CDI só começa em ' + cd[0] + '.');
    } else {
      avisos.push('Série do CDI indisponível: comparação omitida.');
    }

    var premissas = [
      'Compras no preço de fechamento do pregão do aporte (último fechamento na data ou antes; nunca um preço posterior).',
      'Preços ajustados só por desdobramento/grupamento; os dividendos entram separadamente na data ex.',
      'Dividendos e JCP brutos (sem IR), creditados na data ex sobre as unidades do pregão anterior: ' +
        (modoDiv === 'reinvestir' ? 'reinvestidos no mesmo ativo no fechamento da data ex.' :
          modoDiv === 'caixa' ? 'guardados em caixa sem rendimento e usados no próximo aporte.' :
            'ignorados (retorno só de preço; não aparecem no total de dividendos).'),
      'Sem imposto de renda, come-cotas, custódia ou spread.',
      custo > 0 ? 'Custo de ' + fmtNum(custo, 2) + '% sobre o valor bruto de cada compra (inclusive reinvestimentos).' : 'Sem custos de corretagem ou emolumentos.',
      inteiros ? 'Compra só unidades inteiras; o troco fica em caixa e entra no próximo aporte.' : 'Compra frações de unidade (idealizado; na B3 não há fração).',
      estrategia === 'pesos' ? 'Cada aporte (mais o caixa) é dividido pelos pesos escolhidos; sem rebalanceamento com venda.' :
        'Cada aporte vai para os ativos mais abaixo do peso-alvo, com valores do próprio dia; sem vendas.',
      'Aporte inicial no primeiro pregão; mensais no primeiro pregão a partir do dia ' + diaAp + ' de cada mês.',
      'Ibovespa (índice de retorno total) e CDI recebem os mesmos aportes nas mesmas datas, sem custos.',
      'TWR elimina o efeito dos aportes; XIRR considera datas e valores de cada aporte (base 365).',
      'Resultado histórico simulado. Não garante resultado futuro.'
    ];

    return {
      inicioEfetivo: inicioEf, fimEfetivo: fimEf, linhas: linhas, aportes: aportes, resumo: resumo,
      porAtivo: porAtivo, benchmarks: benchmarks, avisos: avisos, premissas: premissas
    };
  }

  // ------------------------------------------------------------------ 3.5 utilidades
  function validarTicker(t) {
    if (typeof t !== 'string') return { ok: false, ticker: null, erro: 'Informe o código do ativo.' };
    var s = t.replace(/\s+/g, '').toUpperCase();
    if (!s) return { ok: false, ticker: null, erro: 'Informe o código do ativo.' };
    var aviso = null;
    if (/^[A-Z]{4}\d{1,2}F$/.test(s)) {
      s = s.slice(0, -1);
      aviso = 'O sufixo F indica o mercado fracionário; usamos ' + s + '.';
    }
    if (!/^[A-Z]{4}\d{1,2}$/.test(s)) {
      return { ok: false, ticker: null, erro: 'Código inválido: use 4 letras e 1 ou 2 números (ex.: PETR4, TAEE11).' };
    }
    return { ok: true, ticker: s, erro: null, aviso: aviso };
  }

  var API = {
    toCents: toCents, fromCents: fromCents, fmtBRL: fmtBRL, taxas: taxas, estimarQuantidade: estimarQuantidade,
    efetivas: efetivas, validarTx: validarTx, posicoes: posicoes, caixa: caixa, alocacao: alocacao,
    planejarAportes: planejarAportes, simular: simular, xirr: xirr, twr: twr,
    validarTicker: validarTicker, addMeses: addMeses, diasEntre: diasEntre, dataValida: dataValida,
    _rnd: rnd, _fmtDataISO: fmtDataISO
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = API; else window.INVCalc = API;
})();
