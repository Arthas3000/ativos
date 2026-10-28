'use strict';
// Testes do núcleo de cálculo (INVCalc). Rodar: node --test 03_painel/painel/app/tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../invest.js');

const near = (a, b, tol = 1e-9, msg) => assert.ok(Math.abs(a - b) <= tol, (msg || '') + ` esperado ${b}, obtido ${a}`);

// ======================================================================= dinheiro
test('toCents: números com erro binário e meio para longe do zero', () => {
  assert.equal(C.toCents(1.005), 101);        // 1.005*100 = 100.4999… em binário → 100,5 → 101
  assert.equal(C.toCents(0.1 + 0.2), 30);     // 0.30000000000000004 → 30
  assert.equal(C.toCents(-1.005), -101);      // simétrico
  assert.equal(C.toCents(-0.005), -1);
  assert.equal(C.toCents(0.004), 0);
  assert.equal(C.toCents(1234.56), 123456);
  assert.equal(C.toCents(10), 1000);
  assert.equal(C.toCents(NaN), null);
  assert.equal(C.toCents(Infinity), null);
  assert.equal(C.toCents(null), null);
  assert.equal(C.toCents(undefined), null);
});

test('toCents: textos pt-BR', () => {
  assert.equal(C.toCents('1.234,56'), 123456);
  assert.equal(C.toCents('R$ 10,5'), 1050);
  assert.equal(C.toCents('R$ 1.234.567,89'), 123456789);
  assert.equal(C.toCents('10.5'), 1050);       // ponto decimal também aceito
  assert.equal(C.toCents('1.234'), 123400);    // ponto seguido de 3 dígitos = milhar (pt-BR)
  assert.equal(C.toCents('-12,345'), -1235);   // 12,345 → 1234,5 cent → 1235 (meio p/ longe do zero)
  assert.equal(C.toCents('-R$ 3,00'), -300);
  assert.equal(C.toCents('0,1'), 10);
  assert.equal(C.toCents(''), null);
  assert.equal(C.toCents('   '), null);
  assert.equal(C.toCents('abc'), null);
  assert.equal(C.toCents('1,2,3'), null);
  assert.equal(C.toCents('R$'), null);
});

test('fromCents e fmtBRL', () => {
  assert.equal(C.fromCents(123456), 1234.56);
  assert.equal(C.fromCents(null), null);
  assert.equal(C.fmtBRL(123456), 'R$ 1.234,56');
  assert.equal(C.fmtBRL(5), 'R$ 0,05');
  assert.equal(C.fmtBRL(0), 'R$ 0,00');
  assert.equal(C.fmtBRL(-123456789), '-R$ 1.234.567,89');
  assert.equal(C.fmtBRL(100000000), 'R$ 1.000.000,00');
  assert.equal(C.fmtBRL(null), '—');
  assert.equal(C.fmtBRL(undefined), '—');
});

test('taxas', () => {
  // 10000 * 0,03 / 100 = 3 → 500 + 3
  assert.equal(C.taxas({ brutoCent: 10000, qtd: 1, taxaFixaCent: 500, taxaPct: 0.03 }), 503);
  // 12345 * 0,5 / 100 = 61,725 → 62
  assert.equal(C.taxas({ brutoCent: 12345, qtd: 3, taxaPct: 0.5 }), 62);
  assert.equal(C.taxas({ brutoCent: 0, qtd: 0, taxaFixaCent: 500, taxaPct: 1 }), 0); // sem qtd, sem taxa
});

// ======================================================================= estimarQuantidade
test('estimarQuantidade: lote 1, sem taxas', () => {
  // R$ 100 / R$ 30,00 = 3 unidades (90), sobra 10
  const r = C.estimarQuantidade({ valorCent: 10000, precoCent: 3000 });
  assert.deepEqual(r, { qtd: 3, brutoCent: 9000, taxasCent: 0, totalCent: 9000, sobraCent: 1000, aviso: null });
});

test('estimarQuantidade: lote 100', () => {
  // R$ 1.000 / R$ 3,00: 300 unidades = 900; 400 = 1200 não cabe → qtd 300, sobra 100
  const r = C.estimarQuantidade({ valorCent: 100000, precoCent: 300, lote: 100 });
  assert.equal(r.qtd, 300);
  assert.equal(r.totalCent, 90000);
  assert.equal(r.sobraCent, 10000);
});

test('estimarQuantidade: taxa fixa + %', () => {
  // valor 10000, preço 1000, fixa 500, 1%: 9 un → 9000 + 500 + 90 = 9590 ≤ 10000; 10 → 10000+500+100 > 10000
  const r = C.estimarQuantidade({ valorCent: 10000, precoCent: 1000, taxaFixaCent: 500, taxaPct: 1 });
  assert.deepEqual(r, { qtd: 9, brutoCent: 9000, taxasCent: 590, totalCent: 9590, sobraCent: 410, aviso: null });
  // exatamente no limite: valor 9590 → ainda 9
  assert.equal(C.estimarQuantidade({ valorCent: 9590, precoCent: 1000, taxaFixaCent: 500, taxaPct: 1 }).qtd, 9);
  assert.equal(C.estimarQuantidade({ valorCent: 9589, precoCent: 1000, taxaFixaCent: 500, taxaPct: 1 }).qtd, 8);
});

test('estimarQuantidade: valor menor que um lote e preço inválido', () => {
  const r = C.estimarQuantidade({ valorCent: 20000, precoCent: 300, lote: 100 }); // 1 lote = 30000
  assert.equal(r.qtd, 0);
  assert.equal(r.sobraCent, 20000);
  assert.match(r.aviso, /menor que 1 lote/);
  for (const preco of [0, null, undefined, -5, 1.5]) {
    const z = C.estimarQuantidade({ valorCent: 10000, precoCent: preco });
    assert.equal(z.qtd, 0);
    assert.equal(z.totalCent, 0);
    assert.match(z.aviso, /Preço inválido/);
  }
});

// ======================================================================= livro de transações
const tx = (o) => Object.assign({ moeda: 'BRL', status: 'executada', taxasCent: 0, qtd: 0, precoCent: 0, valorCent: 0, ticker: null, substitui: null, obs: '', criadoEm: '2026-01-01T00:00:00Z' }, o);

test('efetivas: correção em cadeia e cancelamento', () => {
  const a = tx({ id: 'a', tipo: 'compra', ticker: 'PETR4', data: '2026-01-02T10:00', qtd: 10, precoCent: 3000, valorCent: 30000 });
  const b = tx({ id: 'b', tipo: 'compra', ticker: 'PETR4', data: '2026-01-02T10:00', qtd: 12, precoCent: 3000, valorCent: 36000, substitui: 'a' });
  const c = tx({ id: 'c', tipo: 'compra', ticker: 'PETR4', data: '2026-01-02T10:00', qtd: 15, precoCent: 3000, valorCent: 45000, substitui: 'b' });
  const d = tx({ id: 'd', tipo: 'deposito', data: '2026-01-01T09:00', valorCent: 100000 });
  const e = tx({ id: 'e', tipo: 'retirada', data: '2026-01-03T09:00', valorCent: 1000 });
  const x = tx({ id: 'x', tipo: 'cancelamento', data: '2026-01-04T09:00', substitui: 'e' });
  const todas = [a, b, c, d, e, x];
  const copia = JSON.parse(JSON.stringify(todas));
  const ef = C.efetivas(todas);
  assert.deepEqual(ef.map((t) => t.id), ['c', 'd']); // A←B←C resolve para C; e cancelada; cancelamento some
  assert.deepEqual(todas, copia);                  // original intacto
});

test('validarTx', () => {
  const ok = tx({ id: 'v', tipo: 'compra', ticker: 'PETR4', data: '2026-01-02T10:00', qtd: 10, precoCent: 3000, taxasCent: 500, valorCent: 30500 });
  assert.deepEqual(C.validarTx(ok, {}), []);
  // valorCent incoerente (esperado 10*3000+500 = 30500)
  assert.ok(C.validarTx(Object.assign({}, ok, { valorCent: 30000 }), {}).some((m) => /incoerente/.test(m)));
  // venda maior que a posição
  const venda = tx({ id: 'w', tipo: 'venda', ticker: 'PETR4', data: '2026-01-05', qtd: 11, precoCent: 3000, taxasCent: 0, valorCent: 33000 });
  assert.ok(C.validarTx(venda, { posicoes: { PETR4: { qtd: 10 } } }).some((m) => /maior que a posição/.test(m)));
  assert.deepEqual(C.validarTx(Object.assign({}, venda, { qtd: 10, valorCent: 30000 }), { posicoes: { PETR4: { qtd: 10 } } }), []);
  // venda: valor = qtd*preço − taxas
  assert.deepEqual(C.validarTx(Object.assign({}, venda, { qtd: 5, taxasCent: 100, valorCent: 14900 }), { posicoes: { PETR4: { qtd: 10 } } }), []);
  // diversos erros
  assert.ok(C.validarTx(Object.assign({}, ok, { tipo: 'troca' })).length > 0);
  assert.ok(C.validarTx(Object.assign({}, ok, { data: '2026-02-30' })).some((m) => /Data/.test(m)));
  assert.ok(C.validarTx(Object.assign({}, ok, { qtd: 1.5 })).length > 0);
  assert.ok(C.validarTx(Object.assign({}, ok, { qtd: 0, valorCent: 500 })).some((m) => /Quantidade/.test(m)));
  assert.ok(C.validarTx(Object.assign({}, ok, { precoCent: 0, valorCent: 500 })).some((m) => /Preço/.test(m)));
  assert.ok(C.validarTx(Object.assign({}, ok, { moeda: 'USD' })).length > 0);
  assert.ok(C.validarTx(tx({ tipo: 'deposito', data: '2026-01-01', valorCent: 0 })).length > 0);
  assert.deepEqual(C.validarTx(tx({ tipo: 'deposito', data: '2026-01-01', valorCent: 1 })), []);
  assert.ok(C.validarTx(tx({ tipo: 'cancelamento', data: '2026-01-01' })).length > 0); // sem substitui
});

test('posicoes, caixa e alocacao', () => {
  const lista = [
    tx({ id: '1', tipo: 'deposito', data: '2026-01-01T09:00', valorCent: 100000 }),
    // compra 10 × 30,00 + 5,00 taxa = 305,00
    tx({ id: '2', tipo: 'compra', ticker: 'PETR4', data: '2026-01-02T10:00', qtd: 10, precoCent: 3000, taxasCent: 500, valorCent: 30500 }),
    // compra 20 × 33,00 + 5,00 = 665,00 → 30 un, custo 970,00, PM = 97000/30 = 3233,33 → 3233
    tx({ id: '3', tipo: 'compra', ticker: 'PETR4', data: '2026-01-03T10:00', qtd: 20, precoCent: 3300, taxasCent: 500, valorCent: 66500 }),
    // venda 7 × 35,00 − 2,00 = 243,00; custo reduz round(97000*7/30) = round(22633,33) = 22633 → 74367; 23 un; PM round(74367/23)=3233,35→3233
    tx({ id: '4', tipo: 'venda', ticker: 'PETR4', data: '2026-01-04T10:00', qtd: 7, precoCent: 3500, taxasCent: 200, valorCent: 24300 }),
    tx({ id: '5', tipo: 'compra', ticker: 'VALE3', data: '2026-01-04T11:00', qtd: 1, precoCent: 6000, valorCent: 6000 }),
    tx({ id: '6', tipo: 'compra', ticker: 'ITUB4', data: '2026-01-04T11:00', qtd: 2, precoCent: 3000, valorCent: 6000 }),
    tx({ id: '7', tipo: 'venda', ticker: 'ITUB4', data: '2026-01-05T11:00', qtd: 2, precoCent: 3100, valorCent: 6200 }),
  ];
  // ordem embaralhada: posicoes ordena cronologicamente
  const pos = C.posicoes([lista[3], lista[0], lista[2], lista[1], lista[4], lista[6], lista[5]]);
  assert.deepEqual(pos, {
    PETR4: { qtd: 23, custoCent: 74367, precoMedioCent: 3233 },
    VALE3: { qtd: 1, custoCent: 6000, precoMedioCent: 6000 },
  }); // ITUB4 zerada sai
  // caixa = 100000 − 30500 − 66500 + 24300 − 6000 − 6000 + 6200 = 21500
  assert.equal(C.caixa(lista), 21500);
  for (const v of Object.values(pos)) assert.ok(Number.isSafeInteger(v.custoCent) && Number.isSafeInteger(v.precoMedioCent));

  // alocação: PETR4 23 × 3500 = 80500; VALE3 sem preço fica fora do total
  const al = C.alocacao(pos, { PETR4: 3500, VALE3: null });
  assert.equal(al.totalCent, 80500);
  assert.deepEqual(al.semPreco, ['VALE3']);
  assert.deepEqual(al.linhas[0], { ticker: 'PETR4', qtd: 23, precoCent: 3500, valorCent: 80500, pct: 100 });
  assert.deepEqual(al.linhas[1], { ticker: 'VALE3', qtd: 1, precoCent: null, valorCent: null, pct: null });
  // dois com preço: 80500 e 6500 → 92,53% / 7,47%
  const al2 = C.alocacao(pos, { PETR4: 3500, VALE3: 6500 });
  assert.equal(al2.totalCent, 87000);
  near(al2.linhas[1].pct, 6500 / 87000 * 100);
});

// ======================================================================= planejarAportes
const base = (o) => Object.assign({ orcamentoCent: 10000, reservaCent: 0, taxaFixaCent: 0, taxaPct: 0, intensidadeScore: 0, outrosCent: 0 }, o);
const porTk = (r) => Object.fromEntries(r.linhas.map((l) => [l.ticker, l]));

test('planejarAportes (a): caso simples fecha a meta exatamente', () => {
  // T = 0 + 10000; need A = B = 5000; A: 5 × 1000 = 5000; B: 2 × 2500 = 5000; sobra 0
  const r = C.planejarAportes(base({ ativos: [
    { ticker: 'AAAA3', precoCent: 1000, alvoPct: 50 },
    { ticker: 'BBBB3', precoCent: 2500, alvoPct: 50 },
  ] }));
  const L = porTk(r);
  assert.equal(L.AAAA3.qtd, 5); assert.equal(L.BBBB3.qtd, 2);
  assert.equal(r.totalCent, 10000); assert.equal(r.sobraCent, 0);
  assert.equal(r.totalCarteiraDepoisCent, 10000);
  near(L.AAAA3.depoisPct, 50); near(L.BBBB3.depoisPct, 50);
  assert.equal(r.disponivelCent, 10000);
});

test('planejarAportes (b): orçamento menor que a necessidade → proporcional ao gap', () => {
  // V = 10000, T = 12000. need A = 4800, B = 4800−2000 = 2800, C = 2400−8000 → 0
  // A = 2000×4800/7600 = 1263,16; B = 736,84 → pisos 1263+736, sobra 1 cent vai para B (fração ,84) → 1263 / 737
  const r = C.planejarAportes(base({ orcamentoCent: 2000, ativos: [
    { ticker: 'AAAA3', precoCent: 1, alvoPct: 40 },
    { ticker: 'BBBB3', precoCent: 1, alvoPct: 40, valorAtualCent: 2000 },
    { ticker: 'CCCC3', precoCent: 1, alvoPct: 20, valorAtualCent: 8000 },
  ] }));
  const L = porTk(r);
  assert.equal(L.AAAA3.propostoCent, 1263); assert.equal(L.BBBB3.propostoCent, 737); assert.equal(L.CCCC3.propostoCent, 0);
  assert.equal(L.AAAA3.qtd, 1263); assert.equal(L.BBBB3.qtd, 737); assert.equal(L.CCCC3.qtd, 0);
  assert.equal(L.CCCC3.motivo, 'acima da meta');
  assert.match(L.AAAA3.motivo, /^abaixo da meta 40,0 p\.p\./);
  near(L.CCCC3.atualPct, 80); near(L.CCCC3.gapPct, -60);
  assert.equal(r.sobraCent, 0);
});

test('planejarAportes (c): todos na meta → resto pelos alvos', () => {
  // V = 6000+2000+12000 = 20000, T = 22000. need A = 6600−6000 = 600; B = 2200−2000 = 200.
  // Sobra 1200 dividida 30:10 → 900 / 300. Total A 1500, B 500.
  const r = C.planejarAportes(base({ orcamentoCent: 2000, outrosCent: 12000, ativos: [
    { ticker: 'AAAA3', precoCent: 1, alvoPct: 30, valorAtualCent: 6000 },
    { ticker: 'BBBB3', precoCent: 1, alvoPct: 10, valorAtualCent: 2000 },
  ] }));
  const L = porTk(r);
  assert.equal(L.AAAA3.propostoCent, 1500); assert.equal(L.BBBB3.propostoCent, 500);
  assert.equal(r.totalCarteiraDepoisCent, 22000);
});

test('planejarAportes (d): teto maxPct', () => {
  // T = 10000. need 5000 cada; teto A = 30% × 10000 = 3000. A fica em 3000, B recebe 5000 + resto 2000 = 7000
  const r = C.planejarAportes(base({ ativos: [
    { ticker: 'AAAA3', precoCent: 1, alvoPct: 30, maxPct: 30 },
    { ticker: 'BBBB3', precoCent: 1, alvoPct: 50 },
  ] }));
  const L = porTk(r);
  assert.equal(L.AAAA3.propostoCent, 3000); assert.equal(L.AAAA3.qtd, 3000);
  assert.equal(L.BBBB3.propostoCent, 7000);
  assert.equal(L.AAAA3.motivo, 'teto atingido');
  // teto com lote: A preço 700, teto 3000 → 4 un (2800); um 5º lote (3500) passaria do teto, mesmo sobrando dinheiro
  const r2 = C.planejarAportes(base({ ativos: [
    { ticker: 'AAAA3', precoCent: 700, alvoPct: 30, maxPct: 30 },
    { ticker: 'BBBB3', precoCent: 3000, alvoPct: 50, maxPct: 60 },
  ] }));
  const L2 = porTk(r2);
  assert.equal(L2.AAAA3.qtd, 4); assert.ok(L2.AAAA3.brutoCent <= 3000);
  assert.equal(L2.BBBB3.qtd, 2); // teto B = 6000 → 2 × 3000
  assert.equal(r2.sobraCent, 10000 - 2800 - 6000);
});

test('planejarAportes (e): intensidade do score muda só a prioridade entre os abaixo da meta', () => {
  // V = 6000 (D), T = 9000. need A = B = C = 2700; D = 900−6000 → 0. Σneed = 8100 > 3000.
  // Scores A 800, B 200, C 500 → média 500, desvio máx 300 → z = +1, −1, 0.
  const ativos = [
    { ticker: 'AAAA3', precoCent: 1, alvoPct: 30, score: 800 },
    { ticker: 'BBBB3', precoCent: 1, alvoPct: 30, score: 200 },
    { ticker: 'CCCC3', precoCent: 1, alvoPct: 30, score: 500 },
    { ticker: 'DDDD3', precoCent: 1, alvoPct: 10, valorAtualCent: 6000 },
  ];
  const r0 = porTk(C.planejarAportes(base({ orcamentoCent: 3000, intensidadeScore: 0, ativos })));
  const r1raw = C.planejarAportes(base({ orcamentoCent: 3000, intensidadeScore: 1, ativos }));
  const r1 = porTk(r1raw);
  // intensidade 0: 1000 cada
  assert.equal(r0.AAAA3.propostoCent, 1000); assert.equal(r0.BBBB3.propostoCent, 1000); assert.equal(r0.CCCC3.propostoCent, 1000);
  // intensidade 1: fatores 2, 0, 1 → pesos 5400, 0, 2700 → 2000 / 0 / 1000
  assert.equal(r1.AAAA3.fatorScore, 2); assert.equal(r1.BBBB3.fatorScore, 0); assert.equal(r1.CCCC3.fatorScore, 1);
  assert.equal(r1.AAAA3.propostoCent, 2000); assert.equal(r1.BBBB3.propostoCent, 0); assert.equal(r1.CCCC3.propostoCent, 1000);
  // D (acima da meta) não recebe nada em nenhum caso; total igual
  assert.equal(r0.DDDD3.propostoCent, 0); assert.equal(r1.DDDD3.propostoCent, 0);
  assert.equal(r1raw.totalCent, 3000);
  assert.ok(r1raw.avisos.some((a) => /DDDD3: sem score: tratado como neutro/.test(a)));
  assert.match(r1.AAAA3.motivo, /score \+1,00/);
  // com dinheiro para todas as metas, o score não muda o resultado das metas
  const big0 = porTk(C.planejarAportes(base({ orcamentoCent: 8100 + 0, outrosCent: 0, intensidadeScore: 0, ativos: ativos.slice(0, 3).map((a) => Object.assign({}, a, { alvoPct: 100 / 3 })) })));
  const big1 = porTk(C.planejarAportes(base({ orcamentoCent: 8100 + 0, outrosCent: 0, intensidadeScore: 1, ativos: ativos.slice(0, 3).map((a) => Object.assign({}, a, { alvoPct: 100 / 3 })) })));
  for (const t of ['AAAA3', 'BBBB3', 'CCCC3']) assert.equal(big0[t].propostoCent, big1[t].propostoCent);
});

test('planejarAportes (f): lote 100 e taxa fixa', () => {
  const p = base({ orcamentoCent: 5000000, reservaCent: 100000, taxaFixaCent: 500, taxaPct: 0.03, ativos: [
    { ticker: 'AAAA3', precoCent: 3712, lote: 100, alvoPct: 40 },
    { ticker: 'BBBB3', precoCent: 2589, lote: 100, alvoPct: 35 },
    { ticker: 'CCCC3', precoCent: 9876, lote: 100, alvoPct: 25 },
  ] });
  const r = C.planejarAportes(p);
  assert.equal(r.disponivelCent, 4900000);
  assert.ok(r.totalCent <= r.disponivelCent);
  assert.equal(r.sobraCent, 5000000 - r.totalCent); // inclui a reserva
  for (const l of r.linhas) {
    assert.equal(l.qtd % 100, 0);
    assert.equal(l.taxasCent, C.taxas({ brutoCent: l.brutoCent, qtd: l.qtd, taxaFixaCent: 500, taxaPct: 0.03 }));
  }
  // a sobra livre é menor que o custo de um lote a mais do mais barato que ainda caberia
  const livre = r.disponivelCent - r.totalCent;
  for (const l of r.linhas) {
    const nb = l.brutoCent + 100 * l.precoCent;
    const inc = nb + C.taxas({ brutoCent: nb, qtd: l.qtd + 100, taxaFixaCent: 500, taxaPct: 0.03 }) - l.totalCent;
    assert.ok(inc > livre, `${l.ticker}: mais um lote (${inc}) caberia na sobra ${livre}`);
  }
});

test('planejarAportes (g): sem preço → 0 + aviso', () => {
  const r = C.planejarAportes(base({ ativos: [
    { ticker: 'AAAA3', precoCent: null, alvoPct: 50 },
    { ticker: 'BBBB3', precoCent: 1000, alvoPct: 50 },
  ] }));
  const L = porTk(r);
  assert.equal(L.AAAA3.qtd, 0); assert.equal(L.AAAA3.propostoCent, 0); assert.equal(L.AAAA3.motivo, 'sem preço');
  assert.ok(r.avisos.some((a) => /AAAA3: sem preço/.test(a)));
  // T = 10000. B tem meta 5000 (5 un); a meta de A (5000) NÃO vai para B (B passaria de 50%): fica como sobra.
  // Lote extra: B é candidato até alvo × T + 1 lote = 5000 + 1000 → 6 un (6000). Sobra = 10000 − 6000 = 4000.
  assert.equal(L.BBBB3.qtd, 6);
  assert.equal(r.sobraCent, 4000);
  assert.ok(r.avisos.some((a) => /sem uso.*AAAA3/.test(a)));
});

test('planejarAportes (h): erros de validação', () => {
  const a = [{ ticker: 'AAAA3', precoCent: 100, alvoPct: 60 }, { ticker: 'BBBB3', precoCent: 100, alvoPct: 50 }];
  assert.throws(() => C.planejarAportes(base({ ativos: a })), /soma dos alvos/);
  assert.throws(() => C.planejarAportes(base({ reservaCent: 10000, ativos: [a[0]] })), /reserva/);
  assert.throws(() => C.planejarAportes(base({ reservaCent: 20000, ativos: [a[0]] })), /reserva/);
  assert.throws(() => C.planejarAportes(base({ orcamentoCent: 0, ativos: [a[0]] })), /orçamento/);
  assert.throws(() => C.planejarAportes(base({ ativos: [{ ticker: 'AAAA3', precoCent: 100, alvoPct: 40, maxPct: 30 }] })), /teto/);
  assert.throws(() => C.planejarAportes(base({ ativos: [{ ticker: 'AAAA3', precoCent: 100, alvoPct: 140 }] })), /alvo/);
  assert.throws(() => C.planejarAportes(base({ ativos: [] })), /ao menos um/);
});

// gerador determinístico (mulberry32)
function rng(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

test('planejarAportes: propriedade em 200 casos pseudo-aleatórios', () => {
  const R = rng(20261027);
  const ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  for (let caso = 0; caso < 200; caso++) {
    const n = ri(1, 5);
    let resto = 100;
    const ativos = [];
    for (let i = 0; i < n; i++) {
      const alvo = i === n - 1 ? ri(0, resto) : ri(0, Math.floor(resto / 2));
      resto -= alvo;
      ativos.push({
        ticker: 'TK' + String.fromCharCode(65 + i) + 'X3',
        precoCent: R() < 0.1 ? null : ri(1, 50000),
        lote: [1, 1, 10, 100][ri(0, 3)],
        valorAtualCent: R() < 0.3 ? 0 : ri(0, 2000000),
        alvoPct: alvo,
        maxPct: R() < 0.3 ? Math.min(100, alvo + ri(0, 20)) : null,
        score: R() < 0.2 ? null : ri(0, 1000),
      });
    }
    const orc = ri(100, 5000000);
    const p = {
      orcamentoCent: orc, reservaCent: R() < 0.5 ? 0 : ri(0, orc - 1),
      taxaFixaCent: R() < 0.5 ? 0 : ri(0, 1000), taxaPct: R() < 0.5 ? 0 : ri(0, 50) / 100,
      intensidadeScore: ri(0, 10) / 10, outrosCent: R() < 0.5 ? 0 : ri(0, 3000000), ativos,
    };
    const r = C.planejarAportes(p);
    const tag = `caso ${caso}`;
    let soma = 0, somaBruto = 0;
    for (const v of [r.disponivelCent, r.totalCent, r.taxasCent, r.sobraCent, r.totalCarteiraDepoisCent]) assert.ok(Number.isSafeInteger(v), tag);
    assert.equal(r.disponivelCent, orc - p.reservaCent, tag);
    const V = p.outrosCent + ativos.reduce((s, a) => s + a.valorAtualCent, 0);
    const T = V + r.disponivelCent;
    for (const l of r.linhas) {
      for (const k of ['propostoCent', 'qtd', 'brutoCent', 'taxasCent', 'totalCent']) assert.ok(Number.isSafeInteger(l[k]) && l[k] >= 0, `${tag} ${l.ticker}.${k}`);
      assert.equal(l.qtd % l.lote, 0, tag);
      assert.equal(l.brutoCent, l.qtd * (l.precoCent || 0), tag);
      assert.equal(l.taxasCent, C.taxas({ brutoCent: l.brutoCent, qtd: l.qtd, taxaFixaCent: p.taxaFixaCent, taxaPct: p.taxaPct }), tag);
      assert.equal(l.totalCent, l.brutoCent + l.taxasCent, tag);
      if (l.precoCent === null) assert.equal(l.qtd, 0, tag);
      soma += l.totalCent; somaBruto += l.brutoCent;
    }
    assert.equal(soma, r.totalCent, tag);
    assert.ok(r.totalCent <= r.disponivelCent, tag);
    assert.equal(r.sobraCent, orc - r.totalCent, tag);
    assert.equal(r.totalCarteiraDepoisCent, V + somaBruto, tag);
    // base única de depoisPct/alvo/teto: T = V + disponível
    assert.equal(r.baseDepoisCent, T, tag);
    // nenhum lote adicional cabe na sobra entre os candidatos:
    // se alguém tinha need > 0, só quem tinha need > 0 (sem passar de alvo×T + 1 lote); senão, qualquer alvo > 0 (respeita o teto)
    const livre = r.disponivelCent - r.totalCent;
    const alvoC = ativos.map((a) => Math.round(a.alvoPct / 100 * T));
    const haNec = ativos.some((a, i) => alvoC[i] - a.valorAtualCent > 0);
    r.linhas.forEach((l, i) => {
      const a = ativos[i];
      assert.ok(Math.abs(l.depoisPct - (a.valorAtualCent + l.brutoCent) / T * 100) < 1e-9, `${tag} ${l.ticker}: depoisPct`);
      const teto = a.maxPct === null ? Infinity : Math.max(0, Math.round(a.maxPct / 100 * T) - a.valorAtualCent);
      if (a.maxPct !== null) assert.ok(l.brutoCent <= teto, `${tag} ${l.ticker}: passou do teto`);
      if (l.precoCent === null || a.alvoPct <= 0) return;
      if (haNec && alvoC[i] - a.valorAtualCent <= 0) return; // não candidato
      const nb = l.brutoCent + l.lote * l.precoCent;
      const inc = nb + C.taxas({ brutoCent: nb, qtd: l.qtd + l.lote, taxaFixaCent: p.taxaFixaCent, taxaPct: p.taxaPct }) - l.totalCent;
      const passaAlvo = haNec && a.valorAtualCent + nb > alvoC[i] + l.lote * l.precoCent;
      assert.ok(inc > livre || nb > teto || passaAlvo, `${tag} ${l.ticker}: mais um lote caberia`);
    });
    // quem tinha necessidade em algum ativo nunca manda lote extra para quem estava na/acima da meta
    if (haNec) r.linhas.forEach((l, i) => {
      if (alvoC[i] - ativos[i].valorAtualCent <= 0 && l.precoCent !== null) {
        // o que recebeu veio só da distribuição em dinheiro (sem lote extra): bruto ≤ proposto
        assert.ok(l.brutoCent <= l.propostoCent, `${tag} ${l.ticker}: lote extra para ativo sem necessidade`);
      }
    });
    // determinismo
    assert.deepEqual(C.planejarAportes(p), r, tag);
  }
});

test('planejarAportes: lote extra não vai para ativo acima da meta enquanto outro está abaixo', () => {
  // A: alvo 50%, valor 0, lote R$ 500 (preço R$ 500); B: alvo 50%, já 100% da carteira, lote R$ 1.
  // R$ 100: A não cabe (1 lote = 50000) → a sobra fica como sobra; B NÃO recebe 100 unidades.
  const r = C.planejarAportes(base({ orcamentoCent: 10000, ativos: [
    { ticker: 'AAAA3', precoCent: 50000, lote: 1, valorAtualCent: 0, alvoPct: 50 },
    { ticker: 'BBBB3', precoCent: 100, lote: 1, valorAtualCent: 1000000, alvoPct: 50 },
  ] }));
  const L = porTk(r);
  assert.equal(L.AAAA3.qtd, 0);
  assert.equal(L.BBBB3.qtd, 0);
  assert.equal(r.totalCent, 0);
  assert.equal(r.sobraCent, 10000);
});

test('planejarAportes: todos na meta → lote extra vale para quem tem alvo > 0 (respeitando o teto)', () => {
  // A: alvo 10%, valor 5000 → T = 5100, alvo 510 → need 0 (todos na meta); B: alvo 0.
  const r = C.planejarAportes(base({ orcamentoCent: 100, ativos: [
    { ticker: 'AAAA3', precoCent: 30, valorAtualCent: 5000, alvoPct: 10 },
    { ticker: 'BBBB3', precoCent: 30, valorAtualCent: 0, alvoPct: 0 },
  ] }));
  const L = porTk(r);
  assert.equal(L.AAAA3.qtd, 3); // 3 × 30 = 90 ≤ 100
  assert.equal(L.BBBB3.qtd, 0); // alvo 0 nunca recebe
  assert.equal(r.sobraCent, 10);
  // com teto, o lote extra respeita o teto (maxPct 10% de T = 510 → teto = 510 − 5000 → 0)
  const r2 = C.planejarAportes(base({ orcamentoCent: 100, ativos: [
    { ticker: 'AAAA3', precoCent: 30, valorAtualCent: 5000, alvoPct: 10, maxPct: 10 },
  ] }));
  assert.equal(r2.linhas[0].qtd, 0);
  assert.equal(r2.sobraCent, 100);
});

test('planejarAportes: depoisPct usa a mesma base do alvo e do teto (T = V + disponível)', () => {
  // orçamento 10000, reserva 2000 → disponível 8000; V = 0; T = 8000. Preço 3000 → 2 un. (6000); sobra do disponível 2000.
  const r = C.planejarAportes(base({ orcamentoCent: 10000, reservaCent: 2000, ativos: [
    { ticker: 'AAAA3', precoCent: 3000, alvoPct: 100 },
  ] }));
  assert.equal(r.baseDepoisCent, 8000);
  near(r.linhas[0].depoisPct, 6000 / 8000 * 100);
  assert.equal(r.totalCarteiraDepoisCent, 6000);
});

// ======================================================================= simulação
const dias = (ini, n) => { const out = []; let d = ini; for (let i = 0; i < n; i++) { out.push(d); d = C._fmtDataISO(Date.parse(d + 'T00:00:00Z') + 86400000); } return out; };
const simBase = (o) => Object.assign({ aporteInicial: 1000, aporteMensal: 0, diaAporte: 1, estrategia: 'pesos', dividendos: 'reinvestir', custoPct: 0, inteiros: false, ibov: null, cdi: null, ipca: null }, o);

test('simular: preço constante + aportes → lucro 0 e TWR 0', () => {
  const d = dias('2024-01-01', 120);
  const r = C.simular(simBase({
    series: { AAAA3: { d, c: d.map(() => 10), div: [] }, BBBB3: { d, c: d.map(() => 25), div: [] } },
    pesos: { AAAA3: 60, BBBB3: 40 }, inicio: d[0], fim: d[d.length - 1], aporteMensal: 500, diaAporte: 5,
  }));
  // aportes: 01/01 (1000), 05/02, 05/03, 05/04 (500 cada) → 2500
  assert.deepEqual(r.aportes, [{ data: '2024-01-01', valor: 1000 }, { data: '2024-02-05', valor: 500 }, { data: '2024-03-05', valor: 500 }, { data: '2024-04-05', valor: 500 }]);
  near(r.resumo.totalInvestido, 2500); near(r.resumo.aportesAdicionais, 1500); near(r.resumo.inicial, 1000);
  near(r.resumo.valorFinal, 2500, 1e-9); near(r.resumo.lucro, 0, 1e-9); near(r.resumo.twr, 0, 1e-9);
  near(r.resumo.xirr, 0, 1e-5);
  assert.equal(r.linhas.length, 120);
  assert.equal(r.resumo.twrAnual, null); // < 365 dias
  near(r.linhas[r.linhas.length - 1].porAtivo.AAAA3, 1500, 1e-9); // 60%
});

test('simular: preço dobra num dia → TWR 100% independentemente dos aportes posteriores', () => {
  const d = dias('2024-01-01', 100);
  const c = d.map((x, i) => (i < 10 ? 10 : 20)); // dobra em 11/01
  const mk = (mensal) => C.simular(simBase({ series: { AAAA3: { d, c, div: [] } }, pesos: { AAAA3: 100 }, inicio: d[0], fim: d[99], aporteMensal: mensal }));
  const a = mk(0), b = mk(1000), e = mk(77777);
  near(a.resumo.twr, 100, 1e-9); near(b.resumo.twr, 100, 1e-9); near(e.resumo.twr, 100, 1e-9);
  // sem aportes mensais: 1000 → 2000
  near(a.resumo.valorFinal, 2000, 1e-9);
  // com 1000/mês (01/02, 01/03, 01/04 após a alta): 2000 + 3000 = 5000; lucro 1000
  near(b.resumo.valorFinal, 5000, 1e-9); near(b.resumo.lucro, 1000, 1e-9);
});

test('simular: dividendos reinvestir vs caixa vs ignorar', () => {
  // preço 10 constante; 1000 → 100 unidades; dividendo R$ 1,00 por ação com data ex no 2º pregão = R$ 100
  const d = ['2024-03-01', '2024-03-04', '2024-03-05'];
  const s = { AAAA3: { d, c: [10, 10, 10], div: [['2024-03-04', 1]] } };
  const run = (m) => C.simular(simBase({ series: s, pesos: { AAAA3: 100 }, inicio: d[0], fim: d[2], dividendos: m }));
  const re = run('reinvestir'), cx = run('caixa'), ig = run('ignorar');
  // reinvestir: 100 + 10 un = 110 × 10 = 1100, caixa 0
  near(re.resumo.valorFinal, 1100); near(re.linhas[2].caixa, 0); near(re.resumo.dividendos, 100); near(re.resumo.twr, 10, 1e-9);
  near(re.linhas[1].porAtivo.AAAA3, 1100);
  // caixa: ação 1000 + caixa 100
  near(cx.resumo.valorFinal, 1100); near(cx.linhas[2].caixa, 100); near(cx.linhas[2].porAtivo.AAAA3, 1000); near(cx.resumo.dividendos, 100);
  // ignorar: 1000, lucro 0
  near(ig.resumo.valorFinal, 1000); near(ig.resumo.lucro, 0); near(ig.resumo.dividendos, 0);
  // por ativo: lucro = valor + dividendos − gasto = 1100 + 100 − 1100 (reinvestir) = 100
  near(re.porAtivo[0].lucro, 100); near(re.porAtivo[0].investido, 1000); near(re.porAtivo[0].contribuicaoPct, 100);
  near(cx.porAtivo[0].lucro, 100);
  near(re.porAtivo[0].retornoPrecoPct, 0);
  // dividendo de caixa entra no próximo aporte
  const d2 = dias('2024-03-01', 40);
  const cx2 = C.simular(simBase({ series: { AAAA3: { d: d2, c: d2.map(() => 10), div: [['2024-03-04', 1]] } }, pesos: { AAAA3: 100 }, inicio: d2[0], fim: d2[39], dividendos: 'caixa', aporteMensal: 500 }));
  const l = cx2.linhas.find((x) => x.data === '2024-04-01');
  near(l.caixa, 0); near(l.porAtivo.AAAA3, 1600); // 100 + 10 (caixa) + 50 un
});

test('simular: ativo que começa depois → inicioEfetivo e aviso', () => {
  const da = dias('2024-01-01', 10), db = da.slice(4);
  const r = C.simular(simBase({ series: { AAAA3: { d: da, c: da.map(() => 10) }, BBBB3: { d: db, c: db.map(() => 20) } }, pesos: { AAAA3: 50, BBBB3: 50 }, inicio: da[0], fim: da[9] }));
  assert.equal(r.inicioEfetivo, '2024-01-05');
  assert.equal(r.fimEfetivo, '2024-01-10');
  assert.equal(r.linhas[0].data, '2024-01-05');
  assert.ok(r.avisos.some((a) => /BBBB3/.test(a) && /2024-01-05/.test(a)));
});

test('simular: datas diferentes entre ativos usam o último preço anterior (nunca o seguinte)', () => {
  // B não tem pregão em 03/01 (feriado só para ele, hipotético); em 03/01 vale o preço de 02/01 (20), não o de 04/01 (40)
  const r = C.simular(simBase({
    series: {
      AAAA3: { d: ['2024-01-02', '2024-01-03', '2024-01-04'], c: [10, 10, 10] },
      BBBB3: { d: ['2024-01-02', '2024-01-04'], c: [20, 40] },
    },
    pesos: { AAAA3: 50, BBBB3: 50 }, inicio: '2024-01-01', fim: '2024-01-04',
  }));
  assert.deepEqual(r.linhas.map((l) => l.data), ['2024-01-02', '2024-01-03', '2024-01-04']);
  near(r.linhas[1].porAtivo.BBBB3, 500); // 25 un × 20
  near(r.linhas[2].porAtivo.BBBB3, 1000); // 25 un × 40
});

test('simular: inteiros deixa troco em caixa que entra no próximo aporte', () => {
  const d = dias('2024-01-01', 40);
  const r = C.simular(simBase({ series: { AAAA3: { d, c: d.map(() => 30) } }, pesos: { AAAA3: 100 }, inicio: d[0], fim: d[39], aporteInicial: 100, aporteMensal: 100, inteiros: true }));
  // 100 → 3 un (90), troco 10; 01/02: 100 + 10 = 110 → 3 un (90), troco 20
  near(r.linhas[0].caixa, 10); near(r.linhas[0].porAtivo.AAAA3, 90); near(r.linhas[0].valor, 100);
  const f = r.linhas.find((l) => l.data === '2024-02-01');
  near(f.caixa, 20); near(f.porAtivo.AAAA3, 180); near(f.valor, 200);
  // com custo 1%: 100/(30×1,01) = 3,3 → 3 un; bruto 90, custo 0,90, troco 9,10
  const rc = C.simular(simBase({ series: { AAAA3: { d, c: d.map(() => 30) } }, pesos: { AAAA3: 100 }, inicio: d[0], fim: d[0], aporteInicial: 100, inteiros: true, custoPct: 1 }));
  near(rc.linhas[0].caixa, 9.1, 1e-9); near(rc.resumo.custos, 0.9, 1e-9);
});

test('simular: sem look-ahead', () => {
  const d = dias('2024-01-01', 90);
  const c = d.map((x, i) => 10 + Math.sin(i / 5) * 2);
  const mk = (cc, divs) => C.simular(simBase({ series: { AAAA3: { d, c: cc, div: divs }, BBBB3: { d, c: cc.map((v) => v * 3) } }, pesos: { AAAA3: 30, BBBB3: 70 }, inicio: d[0], fim: d[89], aporteMensal: 300, estrategia: 'rebalancear-aportes', inteiros: true }));
  const a = mk(c, [['2024-01-20', 0.5]]);
  const c2 = c.map((v, i) => (i > 40 ? v * 5 : v));
  const b = mk(c2, [['2024-01-20', 0.5], ['2024-03-01', 9]]);
  // até o índice 40 (2024-02-10) as linhas são idênticas
  assert.deepEqual(b.linhas.slice(0, 41), a.linhas.slice(0, 41));
  assert.notDeepEqual(b.linhas[60], a.linhas[60]);
});

test('simular: rebalancear-aportes compra o que está abaixo do peso', () => {
  // A sobe de 10 para 20 após o aporte inicial (500/500 → A 1000, B 500); aporte 500 em 01/02:
  // total 2000, alvo 1000 cada, need A 0, B 500 → tudo em B
  const d = dias('2024-01-01', 35);
  const r = C.simular(simBase({ series: { AAAA3: { d, c: d.map((x, i) => (i === 0 ? 10 : 20)) }, BBBB3: { d, c: d.map(() => 10) } }, pesos: { AAAA3: 50, BBBB3: 50 }, inicio: d[0], fim: d[34], aporteMensal: 500, estrategia: 'rebalancear-aportes' }));
  const f = r.linhas.find((l) => l.data === '2024-02-01');
  near(f.porAtivo.AAAA3, 1000); near(f.porAtivo.BBBB3, 1000);
});

test('simular: benchmarks IBOV e CDI com os mesmos aportes (percentuais)', () => {
  const d = ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'];
  const r = C.simular(simBase({
    series: { AAAA3: { d, c: [10, 10, 10, 10] } }, pesos: { AAAA3: 100 }, inicio: d[0], fim: d[3],
    ibov: { d, c: [100000, 105000, 110000, 110000] },
    cdi: { d: ['2024-01-02', '2024-01-03', '2024-01-04', '2024-01-05'], v: [0.05, 0.05, 0.05, 0.05] },
  }));
  // IBOV: 1000 / 100000 = 0,01 do índice → 0,01 × 110000 = 1100; TWR 10%
  near(r.benchmarks.IBOV.valorFinal, 1100, 1e-9); near(r.benchmarks.IBOV.lucro, 100, 1e-9); near(r.benchmarks.IBOV.twr, 10, 1e-9);
  assert.equal(r.benchmarks.IBOV.twrAnual, null);
  assert.equal(r.benchmarks.IBOV.linhas.length, 4);
  // CDI: aporte em 02/01 não rende no próprio dia; rende 03, 04, 05 → 1000 × 1,0005³
  near(r.benchmarks.CDI.valorFinal, 1000 * Math.pow(1.0005, 3), 1e-9);
  near(r.benchmarks.CDI.twr, (Math.pow(1.0005, 3) - 1) * 100, 1e-9);
  // xirr em %: (1,0005³)^(365/3) − 1
  near(r.benchmarks.CDI.xirr, (Math.pow(Math.pow(1.0005, 3), 365 / 3) - 1) * 100, 1e-4);
  // IBOV +10% em 3 dias anualiza para fora do intervalo de busca [−99,99%, 1000%] → xirr null
  assert.equal(r.benchmarks.IBOV.xirr, null);
  // aporte no meio: CDI com aporte de 500 em 01/02 só rende a partir do pregão seguinte
  const d2 = dias('2024-01-31', 4); // 31/01, 01/02, 02/02, 03/02
  const r2 = C.simular(simBase({ series: { AAAA3: { d: d2, c: [10, 10, 10, 10] } }, pesos: { AAAA3: 100 }, inicio: d2[0], fim: d2[3], aporteMensal: 500, cdi: { d: d2, v: [0.1, 0.1, 0.1, 0.1] } }));
  // 1000 × 1,001³ + 500 × 1,001²
  near(r2.benchmarks.CDI.valorFinal, 1000 * Math.pow(1.001, 3) + 500 * Math.pow(1.001, 2), 1e-9);
  // TWR do CDI = 1,001³ − 1 (independe do aporte)
  near(r2.benchmarks.CDI.twr, (Math.pow(1.001, 3) - 1) * 100, 1e-9);
  // sem séries → null + aviso
  assert.equal(r2.benchmarks.IBOV, null);
  assert.ok(r2.avisos.some((a) => /Ibovespa/.test(a)));
});

test('simular: twrAnual em % para ≥ 365 dias (carteira e benchmark)', () => {
  const d = dias('2023-01-01', 731); // 2023-01-01 .. 2024-12-31 (730 dias corridos)
  const c = d.map((x, i) => 10 * Math.pow(1.21, i / 730)); // +21% em 730 dias → 10% a.a.
  const r = C.simular(simBase({ series: { AAAA3: { d, c } }, pesos: { AAAA3: 100 }, inicio: d[0], fim: d[730], ibov: { d, c } }));
  assert.equal(r.resumo.dias, 730);
  near(r.resumo.twr, 21, 1e-9);
  near(r.resumo.twrAnual, 10, 1e-9);
  near(r.resumo.xirr, 10, 1e-5);
  near(r.benchmarks.IBOV.twrAnual, 10, 1e-9);
  near(r.benchmarks.IBOV.xirr, 10, 1e-5);
});

test('simular: IPCA e twrReal', () => {
  const d = dias('2024-01-15', 55); // até 2024-03-09
  const c = d.map((x, i) => (i === 0 ? 10 : 11));
  const r = C.simular(simBase({ series: { AAAA3: { d, c } }, pesos: { AAAA3: 100 }, inicio: d[0], fim: d[54], ipca: { m: ['2024-01', '2024-02', '2024-03'], v: [1, 2, 0.5] } }));
  // meses depois de jan até mar: fev e mar → 1,02 × 1,005 − 1 = 2,51%
  near(r.resumo.ipcaAcum, 2.51, 1e-9);
  near(r.resumo.twr, 10, 1e-9);
  near(r.resumo.twrReal, (1.1 / 1.0251 - 1) * 100, 1e-9);
  near(r.resumo.valorFinalReal, 1100 / 1.0251, 1e-9);
  // mês sem dado → aviso
  const r2 = C.simular(simBase({ series: { AAAA3: { d, c } }, pesos: { AAAA3: 100 }, inicio: d[0], fim: d[54], ipca: { m: ['2024-01', '2024-02'], v: [1, 2] } }));
  near(r2.resumo.ipcaAcum, 2, 1e-9);
  assert.ok(r2.avisos.some((a) => /IPCA/.test(a) && /2024-03/.test(a)));
  // sem série → null
  assert.equal(C.simular(simBase({ series: { AAAA3: { d, c } }, pesos: { AAAA3: 100 }, inicio: d[0], fim: d[54] })).resumo.twrReal, null);
});

test('simular: erros', () => {
  const d = dias('2024-01-01', 10);
  const s = { AAAA3: { d, c: d.map(() => 10) } };
  assert.throws(() => C.simular(simBase({ series: s, pesos: { AAAA3: 100 }, inicio: '2025-01-01', fim: '2025-02-01' })), /Não há pregões/);
  assert.throws(() => C.simular(simBase({ series: s, pesos: { AAAA3: 90 }, inicio: d[0], fim: d[9] })), /soma dos pesos/);
  assert.throws(() => C.simular(simBase({ series: s, pesos: { ZZZZ3: 100 }, inicio: d[0], fim: d[9] })), /sem série/);
  assert.throws(() => C.simular(simBase({ series: s, pesos: { AAAA3: 100 }, inicio: d[9], fim: d[0] })), /anterior/);
});

// ======================================================================= xirr / twr
test('xirr', () => {
  // −1000 e +1100 após 365 dias → 10%
  near(C.xirr([{ data: '2023-01-01', valor: -1000 }, { data: '2024-01-01', valor: 1100 }]), 0.1, 1e-7);
  // −1000, −1000 (+365 d), +2310 (+730 d): 1000×1,1² + 1000×1,1 = 1210 + 1100 = 2310 → 10%
  near(C.xirr([{ data: '2021-01-01', valor: -1000 }, { data: '2022-01-01', valor: -1000 }, { data: '2023-01-01', valor: 2310 }]), 0.1, 1e-7);
  // 12 aportes mensais de 100 (dia 1, 2023) e resgate em 2024-01-01 com valor calculado a 12% a.a. (base 365):
  // VF = Σ 100 × 1,12^((dias até 2024-01-01)/365) — calculado à parte aqui
  const fl = [];
  let vf = 0;
  for (let m = 0; m < 12; m++) {
    const dt = C.addMeses('2023-01-01', m);
    fl.push({ data: dt, valor: -100 });
    vf += 100 * Math.pow(1.12, C.diasEntre(dt, '2024-01-01') / 365);
  }
  fl.push({ data: '2024-01-01', valor: vf });
  // dias até 01/01/2024: 365, 334, 306, 275, 245, 214, 184, 153, 122, 92, 61, 31 → VF ≈ 1276,96
  near(vf, 1276.96, 0.01);
  near(C.xirr(fl), 0.12, 1e-7);
  // todos negativos ou todos positivos → null
  assert.equal(C.xirr([{ data: '2023-01-01', valor: -1 }, { data: '2023-06-01', valor: -2 }]), null);
  assert.equal(C.xirr([{ data: '2023-01-01', valor: 1 }]), null);
  // perda: −1000 → 500 em 1 ano = −50%
  near(C.xirr([{ data: '2023-01-01', valor: -1000 }, { data: '2024-01-01', valor: 500 }]), -0.5, 1e-7);
});

test('twr exportada (fração)', () => {
  // 100 → 110 (+10%); aporte 50 → 160 (sem ganho); 160 → 176 (+10%) → 1,1×1,1 − 1 = 21%
  near(C.twr([{ valor: 100, fluxo: 100 }, { valor: 110, fluxo: 0 }, { valor: 160, fluxo: 50 }, { valor: 176, fluxo: 0 }]), 0.21, 1e-12);
});

// ======================================================================= utilidades
test('validarTicker', () => {
  assert.deepEqual(C.validarTicker('PETR4'), { ok: true, ticker: 'PETR4', erro: null, aviso: null });
  assert.equal(C.validarTicker('petr4').ticker, 'PETR4');
  assert.equal(C.validarTicker('b3sa3').ok, true);                 // dígito no meio é válido (B3SA3)
  assert.equal(C.validarTicker('B3SA3').ticker, 'B3SA3');
  assert.equal(C.validarTicker('BBFI11B').ok, true);               // cota classe B de FII
  assert.equal(C.validarTicker('3ABC4').ok, false);               // começa com letra
  assert.equal(C.validarTicker(' petr4 ').ticker, 'PETR4');
  const f = C.validarTicker('PETR4F');
  assert.equal(f.ok, true); assert.equal(f.ticker, 'PETR4'); assert.match(f.aviso, /fracionário/);
  assert.equal(C.validarTicker('TAEE11').ticker, 'TAEE11');
  assert.equal(C.validarTicker('AAPL34').ticker, 'AAPL34');
  for (const t of ['', 'PETR', 'PETRA4', 'PE4', '1234', 'PETR123', 'PET4', 'PETR4FF', 'PETR-4', null, undefined, 42]) {
    const r = C.validarTicker(t);
    assert.equal(r.ok, false, String(t)); assert.equal(r.ticker, null); assert.ok(r.erro);
  }
});

test('addMeses e diasEntre', () => {
  assert.equal(C.addMeses('2024-01-31', 1), '2024-02-29');
  assert.equal(C.addMeses('2023-12-15', 1), '2024-01-15');
  assert.equal(C.addMeses('2024-03-31', -1), '2024-02-29');
  assert.equal(C.diasEntre('2023-01-01', '2024-01-01'), 365);
  assert.equal(C.diasEntre('2024-01-01', '2025-01-01'), 366);
});

test('planejarAportes: ativo sem preço abaixo da meta não trava os lotes extras dos outros', () => {
  // A sem preço (alvo 50%, precisa de R$ 500); B e C com preço, já na meta pelo total T = 0 + 1000.
  // B alvo 25% (R$ 250 / R$ 10 = 25 un), C alvo 25% (R$ 250 / R$ 30 = 8 un = R$ 240, sobra R$ 10).
  const r = C.planejarAportes({ orcamentoCent: 100000, ativos: [
    { ticker: 'A', precoCent: null, alvoPct: 50 },
    { ticker: 'B', precoCent: 1000, alvoPct: 25 },
    { ticker: 'C', precoCent: 3000, alvoPct: 25 }] });
  const by = Object.fromEntries(r.linhas.map((l) => [l.ticker, l]));
  assert.equal(by.A.qtd, 0);
  assert.ok(r.avisos.some((a) => a.includes('A')));
  assert.ok(r.totalCent <= r.disponivelCent);
  // B e C recebem só a própria meta + no máximo 1 lote extra (alvo × T + 1 lote); a meta de A fica como sobra.
  assert.equal(by.B.qtd, 26); // 25 un (R$ 250) + 1 lote
  assert.equal(by.C.qtd, 9);  // 8 un (R$ 240) + 1 lote = R$ 270 ≤ R$ 250 + R$ 30
  assert.equal(r.sobraCent, 100000 - 26000 - 27000);
});

// ======================================================================= risco e concentração
// Valores de referência calculados à parte em Python (statistics.stdev, produtos acumulados), sem usar este código.
const mkLinhas = (vals, flx = {}) => vals.map((valor, i) => ({ data: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), valor, fluxo: flx[i] || 0 }));

test('concentracao: exemplo de 5 posições (30/25/20/15/10) dá HHI 2250', () => {
  const c = C.concentracao([30, 25, 20, 15, 10]);
  near(c.hhi, 2250, 1e-9); near(c.nEfetivo, 10000 / 2250, 1e-9);
  near(c.maiorPct, 30); near(c.top3Pct, 75); assert.equal(c.n, 5); assert.equal(c.nivel, 'alta');
});
test('concentracao: normaliza valores em R$, ignora zeros/negativos e trata vazio e ativo único', () => {
  near(C.concentracao([300, 250, 200, 150, 100, 0, -5, NaN]).hhi, 2250, 1e-9);
  const u = C.concentracao([1000]); near(u.hhi, 10000); near(u.nEfetivo, 1); assert.equal(u.nivel, 'muito alta');
  assert.equal(C.concentracao([]), null); assert.equal(C.concentracao([0, 0]), null); assert.equal(C.concentracao(null), null);
  const ig = C.concentracao(new Array(20).fill(5)); near(ig.hhi, 500); near(ig.nEfetivo, 20); assert.equal(ig.nivel, 'baixa');
});
test('drawdown: série de referência (pico 1,10 → vale 0,90 = −18,18%; atual −5%)', () => {
  const d = C.drawdown(mkLinhas([100, 110, 99, 105, 90, 95, 120, 114]));
  near(d.maxPct, -18.181818181818187, 1e-9); near(d.atualPct, -5.000000000000004, 1e-9);
  assert.equal(d.dataPico, '2024-01-02'); assert.equal(d.dataVale, '2024-01-05'); assert.equal(d.emQueda, true); assert.equal(d.diasPicoAVale, 3);
});
test('drawdown: só sobe = 0; aporte não conta como retorno', () => {
  assert.equal(C.drawdown(mkLinhas([100, 101, 102])).maxPct, 0);
  // 1000 → 1100 (+10%) → aporte de 500 e queda de 10% sobre 1600 base: (1100+500)*0.9 = 1440
  const d = C.drawdown(mkLinhas([1000, 1100, 1440], { 2: 500 }));
  near(d.maxPct, ((1440 - 500) / 1100 - 1) * 100, 1e-9);          // −14,545…%
  // sem a neutralização o valor subiria (1100 → 1440) e o drawdown seria 0: o teste pega esse erro
  assert.ok(d.maxPct < -14);
});
test('drawdown: poucos pontos e série com zero', () => {
  assert.equal(C.drawdown([]), null); assert.equal(C.drawdown([{ data: '2024-01-01', valor: 1 }]), null);
  assert.doesNotThrow(() => C.drawdown(mkLinhas([0, 0, 10, 9])));
});
test('volatilidadeAnual: 30 retornos de referência = 29,4342%; menos de 20 observações = null', () => {
  const rr = [-0.0219, 0.0208, 0.0158, -0.0147, -0.0003, -0.003, 0.0091, 0.0173, -0.0244, -0.0283, 0.0201, -0.004, 0.0157, -0.0299, -0.0033, 0.0133, -0.0163, 0.0267, 0.0241, -0.0282, -0.0285, 0.0025, 0.0263, -0.0071, -0.017, -0.0047, -0.0283, -0.0167, -0.0037, -0.0003];
  near(C.volatilidadeAnual(rr), 29.434191448159343, 1e-9);
  near(C.volatilidadeAnual(rr, 12), 29.434191448159343 * Math.sqrt(12 / 252), 1e-9);
  assert.equal(C.volatilidadeAnual(rr.slice(0, 19)), null); assert.equal(C.volatilidadeAnual([]), null); assert.equal(C.volatilidadeAnual(null), null);
  near(C.volatilidadeAnual(new Array(25).fill(0.01)), 0, 1e-12);       // retorno constante: sem dispersão
});
test('retornosLinhas segue a convenção do TWR (composição dos retornos = twr)', () => {
  const l = mkLinhas([1000, 1100, 1700, 1600], { 2: 500, 3: 0 });
  const r = C.retornosLinhas(l);
  let g = 1; r.forEach((x) => { g *= 1 + x; });
  near(g - 1, C.twr(l), 1e-12);
});
test('riscoSerie: série curta avisa, sem volatilidade e sem nível; série longa classifica', () => {
  const curta = C.riscoSerie(mkLinhas([100, 101, 99, 100]));
  assert.equal(curta.volAnualPct, null); assert.equal(curta.nivel, null);
  assert.ok(curta.avisos.some((a) => /observações/.test(a)));
  assert.ok(curta.avisos.some((a) => /passado/.test(a)));          // o aviso de limitação nunca some
  const vals = [100]; for (let i = 1; i <= 60; i++) vals.push(vals[i - 1] * (i % 2 ? 1.03 : 0.97));
  const longa = C.riscoSerie(mkLinhas(vals));
  assert.ok(longa.volAnualPct > 25); assert.equal(longa.nivel, 'alto'); assert.equal(longa.observacoes, 60);
  assert.equal(C.riscoSerie(null).nivel, null);
});

test('risco × simulação: retornos de riscoSerie recompõem o TWR da carteira e dos benchmarks (mesma série nos dois modos)', () => {
  const d = dias('2024-01-01', 150);
  const c = d.map((_, i) => 10 * (1 + 0.1 * Math.sin(i / 7)) + i * 0.01);
  const ib = { d, c: c.map((x) => x * 10) };                          // série de índice
  const cdi = { d, v: d.map(() => 0.04) };                            // 0,04% ao dia
  const r = C.simular(simBase({
    series: { AAAA3: { d, c, div: [] } }, pesos: { AAAA3: 100 }, inicio: d[0], fim: d[d.length - 1],
    aporteMensal: 300, diaAporte: 10, ibov: ib, cdi,
  }));
  const comp = (linhas) => C.retornosLinhas(linhas).reduce((g, x) => g * (1 + x), 1) - 1;
  near(comp(r.linhas) * 100, r.resumo.twr, 1e-9, 'carteira');
  assert.ok(r.benchmarks.IBOV && r.benchmarks.CDI);
  near(comp(r.benchmarks.IBOV.linhas) * 100, r.benchmarks.IBOV.twr, 1e-9, 'ibov');
  near(comp(r.benchmarks.CDI.linhas) * 100, r.benchmarks.CDI.twr, 1e-9, 'cdi');
  const k = C.riscoSerie(r.linhas);
  assert.ok(k.drawdown.maxPct <= 0 && k.drawdown.maxPct > -100);
  assert.equal(k.observacoes, r.linhas.length - 1);
  // CDI acumulado só sobe: sem queda
  assert.equal(C.riscoSerie(r.benchmarks.CDI.linhas).drawdown.maxPct, 0);
});
