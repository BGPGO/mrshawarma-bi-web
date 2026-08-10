#!/usr/bin/env node
/**
 * build-data.cjs — gera data.js (window.BIT) a partir dos JSONs Omie em data/.
 *
 * Como funciona:
 *  1. Le todos os JSONs de data/ (com tolerancia a arquivos faltantes/vazios).
 *  2. Constroi mapas de resolucao (categoria, departamento, cliente).
 *  3. Para cada lancamento (contas_pagar, contas_receber):
 *      - Resolve nomes legiveis
 *      - Normaliza datas (dd/mm/aaaa -> Date)
 *      - Marca realizado (status_titulo === 'PAGO')
 *  4. Calcula 3 cortes (realizado / a_pagar_receber / tudo) com:
 *      - MONTH_DATA (12 meses do ano corrente)
 *      - RECEITA_CATEGORIAS / DESPESA_CATEGORIAS
 *      - RECEITA_CLIENTES / DESPESA_FORNECEDORES
 *      - EXTRATO (top 200 lancamentos por data desc)
 *      - Totais e KPIs
 *  5. Escreve data.js com `window.BIT = {...}` hardcoded (sem fetch async no boot).
 *
 * Tolerancia:
 *  - Se um arquivo nao existe ou esta vazio, usa array vazio e segue.
 *  - Console mostra warnings claros pra o operador.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const DATA_DIR = path.join(__dirname, 'data');
const OUT_FILE = path.join(__dirname, 'data.js');

const MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MONTHS_FULL = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

// ---------- helpers ----------
function readJson(name, fallback) {
  const p = path.join(DATA_DIR, name + '.json');
  if (!fs.existsSync(p)) {
    console.warn(`  [warn] ${name}.json nao existe — usando fallback (${Array.isArray(fallback) ? 'array vazio' : 'null'})`);
    return fallback;
  }
  try {
    const raw = fs.readFileSync(p, 'utf8');
    if (!raw.trim()) {
      console.warn(`  [warn] ${name}.json vazio — usando fallback`);
      return fallback;
    }
    return JSON.parse(raw);
  } catch (e) {
    console.warn(`  [warn] ${name}.json parse falhou: ${e.message} — usando fallback`);
    return fallback;
  }
}

// dd/mm/aaaa -> Date | null
function parseBR(d) {
  if (!d || typeof d !== 'string') return null;
  const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dt = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
  if (isNaN(dt.getTime())) return null;
  return dt;
}

function fmtBR(d) {
  if (!d) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function num(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  // Omie devolve numeros como number, mas vai com cinto e suspensorio
  const s = String(v).replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

// ---------- carregar dados ----------
console.log('=== Lendo data/*.json ===');
const empresa = readJson('empresa', null);
const categorias = readJson('categorias', []);
const departamentos = readJson('departamentos', []);
const clientes = readJson('clientes', []);
const contasPagar = readJson('contas_pagar', []);
const contasReceber = readJson('contas_receber', []);
const movimentos = readJson('movimentos', []);
const contasCorrentes = readJson('contas_correntes', []);
const projetos = readJson('projetos', []);
const saldos = readJson('saldos', null); // gerado por fetch-saldos.cjs (fluxo projetado)
const summary = readJson('_summary', null);

// Bancos aceitos: lido de bi.config.js (bancos_ok). Array vazio = sem filtro (todas as contas).
let _cfgBancos = [];
try { _cfgBancos = require('./bi.config.js').fontes?.omie?.bancos_ok || []; } catch(e) {}
const BANCOS_OK = new Set(_cfgBancos.map(String));
const ccOk = new Set();
for (const c of contasCorrentes) {
  if (!BANCOS_OK.size || BANCOS_OK.has(String(c.codigo_banco))) ccOk.add(String(c.nCodCC));
}
console.log(`  contas correntes ok: ${ccOk.size}/${contasCorrentes.length} (filtro bancos: ${_cfgBancos.length ? _cfgBancos.join(',') : 'nenhum — todas'})`);

console.log(`  empresa: ${empresa ? empresa.nome_fantasia : '(faltando)'}`);
console.log(`  categorias: ${categorias.length}`);
console.log(`  departamentos: ${departamentos.length}`);
console.log(`  clientes/fornecedores: ${clientes.length}`);
console.log(`  contas_pagar: ${contasPagar.length}`);
console.log(`  contas_receber: ${contasReceber.length}`);
console.log(`  movimentos: ${movimentos.length}`);

// ---------- montar mapas ----------
const catById = new Map();
for (const c of categorias) {
  // codigo (string) eh chave em ListarCategorias
  if (c.codigo) catById.set(String(c.codigo), c);
}

// PE (Ponto de Equilibrio): classifica cada despesa por categoria_superior nivel-2.
// Espelha o DAX do PBI do cliente:
//   Custos Fixos     = categoria_superior IN 2.03,2.04,2.05,2.07,2.08,2.09
//   Custos Variaveis = categoria_superior IN 2.01,2.02,2.06
// (grupo 2.10 "Despesas Operacionais" fica de fora dos dois, igual ao DAX.)
const PE_FIXO = new Set(['2.03', '2.04', '2.05', '2.07', '2.08', '2.09']);
const PE_VAR = new Set(['2.01', '2.02', '2.06']);
function peClassOf(codCateg) {
  const c = catById.get(String(codCateg));
  const sup = c ? String(c.categoria_superior || '') : '';
  if (PE_FIXO.has(sup)) return 'F';
  if (PE_VAR.has(sup)) return 'V';
  return '';
}
const depById = new Map();
for (const d of departamentos) {
  if (d.codigo) depById.set(String(d.codigo), d);
}
const cliById = new Map();
for (const c of clientes) {
  if (c.codigo_cliente_omie) cliById.set(String(c.codigo_cliente_omie), c);
}
const projById = new Map();
for (const p of projetos) {
  if (p.codigo) projById.set(String(p.codigo), p.nome || `Projeto ${p.codigo}`);
}
function getProjetoNome(codigo) {
  if (!codigo) return '';
  return projById.get(String(codigo)) || '';
}

// Renomeia categorias do grupo Impostos sobre Receita (2.06.x) para nomes padronizados
const CAT_RENAME = {
  '2.06.03': '100112 - Imposto PIS e COFINS',
  '2.06.04': '100112 - Imposto PIS e COFINS',
  '2.06.07': '100103 - Impostos ISS',
};

function getCategoriaNome(codigo) {
  if (!codigo) return 'Sem categoria';
  if (CAT_RENAME[codigo]) return CAT_RENAME[codigo];
  const c = catById.get(String(codigo));
  if (!c) return `Cat ${codigo}`;
  return c.descricao || c.descricao_categoria || `Cat ${codigo}`;
}

function getCategoriaNatureza(codigo) {
  // Omie: natureza pode ser "R" (receita) | "D" (despesa) | "T" (transferencia)
  const c = catById.get(String(codigo));
  return (c && (c.natureza || c.tipo_categoria)) || null;
}

function getDepartamentoNome(codigo) {
  if (!codigo) return null;
  const d = depById.get(String(codigo));
  return d ? d.descricao : `CC ${codigo}`;
}

function getNaturezaDRE(codCateg) {
  if (!codCateg) return '';
  const c = catById.get(String(codCateg));
  return (c && c.dadosDRE && c.dadosDRE.descricaoDRE) || '';
}

function getClienteNome(codigo) {
  if (!codigo) return 'Sem cliente';
  const c = cliById.get(String(codigo));
  if (!c) return `Cliente ${codigo}`;
  return c.nome_fantasia || c.razao_social || `Cliente ${codigo}`;
}

// ---------- normalizar lancamentos ----------
// Estrategia: prefere ListarMovimentos (fonte canonica do PBI do cliente) por
// trazer nValPago + dDtPagamento (caixa) E nValorTitulo + dDtVenc (competencia).
// Fallback: ListarContasPagar/Receber (so competencia, sem nValPago).
function normalize(t, kind) {
  const dataVenc = parseBR(t.data_vencimento) || parseBR(t.data_previsao) || parseBR(t.data_emissao) || parseBR(t.data_entrada);
  const dataPago = parseBR(t.data_pagamento) || (t.info && parseBR(t.info.dAlt)) || dataVenc;
  const status = (t.status_titulo || '').toUpperCase();
  const realizado = status === 'PAGO' || status === 'RECEBIDO';
  const cancelado = status === 'CANCELADO';
  const valor = num(t.valor_documento);
  const cliente = getClienteNome(t.codigo_cliente_fornecedor || t.codigo_cliente);
  if (CLIENTE_PROPRIO_RE.test(cliente)) return null;
  return {
    id: t.codigo_lancamento_omie || t.codigo_lancamento_integracao || null,
    kind,
    cliente,
    codCateg: t.codigo_categoria || '',
    categoria: getCategoriaNome(t.codigo_categoria),
    centroCusto: getNaturezaDRE(t.codigo_categoria || ''),
    data_venc: dataVenc,
    data_efetiva: realizado ? dataPago : dataVenc,
    valor,
    status,
    realizado,
    cancelado,
    nf: t.numero_documento_fiscal || '',
    parcela: t.numero_parcela || '',
  };
}

// Normaliza UMA row de ListarMovimentos aplicando "estilo conta" DAX do PBI.
//
// CRITICO: a row do TITULO e a row da BAIXA aparecem AMBAS com mesmo cStatus.
// Sem o filtro de cGrupo, contamos duplicado:
//   27.244 P|PAGO|CONTA_CORRENTE_PAG (baixa real - efetivo no caixa)
//   14.416 P|PAGO|CONTA_A_PAGAR      (titulo - apenas marca que ta pago)
// O DAX so conta se cGrupo bater com a categoria esperada:
//   Realizado receita: R + RECEBIDO + CONTA_CORRENTE_REC
//   Previsto  receita: R + (A VENCER|ATRASADO|VENCE HOJE) + CONTA_A_RECEBER
//   Realizado despesa: P + PAGO + CONTA_CORRENTE_PAG
//   Previsto  despesa: P + (A VENCER|ATRASADO|VENCE HOJE) + CONTA_A_PAGAR
// Tudo o mais (CANCELADO, PREVISAO_*, etc) -> exclui.
//
// Tambem exclui transferencias (categoria Entrada/Saida de Transferencia)
// porque sao movimentacoes internas entre contas, nao receita/despesa real.
const TRANSFERENCIA_RE = /transfer[eê]ncia/i;
const CLIENTE_PROPRIO_RE = /mr\s*shawarma/i;
let _cfgCatExcluir = [];
try { _cfgCatExcluir = require('./bi.config.js').fontes?.omie?.categorias_excluir || []; } catch(e) {}
const CATEGORIAS_EXCLUIR = new Set(_cfgCatExcluir);

function normalizeMovimento(m) {
  const d = m.detalhes || {};
  const r = m.resumo || {};
  const status = (d.cStatus || '').toUpperCase();
  const natureza = d.cNatureza || '';
  const grupo = d.cGrupo || '';
  // Filtro DAX estilo conta — combinacao natureza × status × grupo precisa bater.
  let realizado = null;
  if (natureza === 'R' && status === 'RECEBIDO' && grupo === 'CONTA_CORRENTE_REC') realizado = true;
  else if (natureza === 'R' && (status === 'A VENCER' || status === 'ATRASADO' || status === 'VENCE HOJE') && grupo === 'CONTA_A_RECEBER') realizado = false;
  else if (natureza === 'P' && status === 'PAGO' && grupo === 'CONTA_CORRENTE_PAG') realizado = true;
  else if (natureza === 'P' && (status === 'A VENCER' || status === 'ATRASADO' || status === 'VENCE HOJE') && grupo === 'CONTA_A_PAGAR') realizado = false;
  else return null; // CANCELADO, PREVISAO, ou combinacao espuria - exclui

  // Filtro transferencias entre contas (nao sao receita/despesa real)
  const categoria = getCategoriaNome(d.cCodCateg);
  if (TRANSFERENCIA_RE.test(categoria)) return null;
  // Filtro categorias não-operacionais (CDB, empréstimo, investimento, etc.)
  if (CATEGORIAS_EXCLUIR.size && CATEGORIAS_EXCLUIR.has(d.cCodCateg || '')) return null;

  // Filtro categorias sem código de referência (ex: "Advogados", "Aluguel de Imóveis")
  // Apenas categorias com código numérico na frente (ex: "500100 - Receita com Serviços")
  // Exceção: categorias do grupo 2.06 (Impostos sobre Receita) usam nomes sem prefixo numérico
  const CAT_IMPOSTO_WHITELIST = new Set(['2.06.01','2.06.03','2.06.04','2.06.07']);
  if (categoria && !/^\d/.test(categoria) && !CAT_IMPOSTO_WHITELIST.has(d.cCodCateg || '')) return null;

  // Filtro contas correntes: apenas bancos formais (Santander/Sicredi/Sicoob).
  // Operacional interno (Caixa, adiantamentos de viagem, contas de socio) fica fora.
  if (ccOk.size && !ccOk.has(String(d.nCodCC))) return null;

  // Exclui lancamentos cujo cliente/fornecedor e a propria empresa (lancamentos internos).
  const cliente = getClienteNome(d.nCodCliente);
  if (CLIENTE_PROPRIO_RE.test(cliente)) return null;
  const codCateg = d.cCodCateg || '';

  const dataPago = parseBR(d.dDtCredito || d.dDtPagamento);
  const dataVenc = parseBR(d.dDtVenc) || parseBR(d.dDtPrevisao) || parseBR(d.dDtEmissao);
  const data_efetiva = realizado ? (dataPago || dataVenc) : dataVenc;
  if (!data_efetiva) return null;
  // Valor: realizado = nValPago (caixa). Previsto = nValAberto (saldo nao pago).
  let valor = realizado ? num(r.nValPago) : (num(r.nValAberto) || num(d.nValorTitulo));
  if (!valor && !realizado) valor = num(d.nValorTitulo);
  if (!valor) return null;
  return {
    id: d.nCodTitulo || null,
    kind: natureza === 'R' ? 'receita' : 'despesa',
    cliente,
    categoria,
    codCateg,
    centroCusto: getNaturezaDRE(codCateg),
    data_venc: dataVenc,
    data_efetiva,
    valor: Math.abs(valor),
    status,
    realizado,
    cancelado: false,
    grupo,
    nf: d.cNumDocFiscal || '',
    parcela: d.cNumParcela || '',
    empresa: m._empresa || '',
    projeto: getProjetoNome(d.cCodProjeto),
  };
}


// Normaliza uma row F360 (parcela de titulo) — formato gerado pelo fetch-f360.cjs.
function normalizeF360(m) {
  const d = m.detalhes || {};
  const status = (d.status_titulo || '').toUpperCase();
  const natureza = d.cNatureza || '';

  let realizado = false;
  if (status === 'PAGO' || status === 'RECEBIDO') realizado = true;
  if (status === 'CANCELADO') return null;

  const categoria = d.cCodCateg || 'Sem categoria';
  if (TRANSFERENCIA_RE.test(categoria)) return null;

  const cliente = d.nCodCliente || 'Não informado';
  if (CLIENTE_PROPRIO_RE.test(cliente)) return null;

  const dataPago = parseBR(d.dDtPagamento);
  const dataVenc = parseBR(d.dDtVencimento) || parseBR(d.dDtPrevisao);
  const data_efetiva = realizado ? (dataPago || dataVenc) : dataVenc;
  if (!data_efetiva) return null;

  let valor = realizado ? (num(d.nValorPago) || num(d.nValorTitulo)) : num(d.nValorTitulo);
  if (!valor) return null;

  return {
    id: null,
    kind: natureza === 'R' ? 'receita' : 'despesa',
    cliente,
    categoria,
    codCateg: d.cCodCateg || '',
    centroCusto: d._f360_centro_custo || '',
    data_venc: dataVenc,
    data_efetiva,
    valor: Math.abs(valor),
    status,
    realizado,
    cancelado: false,
    grupo: '',
    nf: '',
    parcela: '',
    empresa: d._f360_empresa || '',
    projeto: '',
  };
}

// Detecta fonte: F360 se o primeiro movimiento tem detalhes.cNatureza mas nao tem detalhes.cGrupo
const isF360 = movimentos.length > 0 && movimentos[0].detalhes && !movimentos[0].detalhes.cGrupo && movimentos[0].detalhes.cNatureza;

console.log('\n=== Normalizando lancamentos ===');
let recNorm, despNorm, dataSource;
if (isF360) {
  // Fonte F360: parcelas de titulo convertidas pelo fetch-f360.cjs
  dataSource = 'f360';
  const allMovs = movimentos.map(normalizeF360).filter(Boolean);
  recNorm = allMovs.filter((t) => t.kind === 'receita');
  despNorm = allMovs.filter((t) => t.kind === 'despesa');
  console.log(`  fonte: F360 (${movimentos.length} rows brutos -> ${allMovs.length} validos)`);
} else if (movimentos.length > 1000) {
  // Source canonica: ListarMovimentos. Bate 100% com PBI personalizado.
  dataSource = 'movimentos';
  const allMovs = movimentos.map(normalizeMovimento).filter(Boolean);
  recNorm = allMovs.filter((t) => t.kind === 'receita');
  despNorm = allMovs.filter((t) => t.kind === 'despesa');
  console.log(`  fonte: ListarMovimentos (${movimentos.length} rows brutos -> ${allMovs.length} validos)`);
} else {
  // Fallback: ListarContasPagar/Receber. So bate competencia.
  dataSource = 'contas_pagar_receber';
  recNorm = contasReceber.map((t) => normalize(t, 'receita')).filter((t) => t && !t.cancelado);
  despNorm = contasPagar.map((t) => normalize(t, 'despesa')).filter((t) => t && !t.cancelado);
  console.log(`  fonte: contas_pagar/receber (sem nValPago — pode divergir do PBI no caixa)`);
}
console.log(`  receitas validas: ${recNorm.length}`);
console.log(`  despesas validas: ${despNorm.length}`);

// ---------- decidir ano de referencia ----------
// Default: ANO CORRENTE (operador quer ver o que ta acontecendo agora).
// Tambem expomos lista de anos disponiveis pro selector no header.
const yearCount = {};
for (const t of [...recNorm, ...despNorm]) {
  if (!t.data_efetiva) continue;
  const y = t.data_efetiva.getFullYear();
  yearCount[y] = (yearCount[y] || 0) + 1;
}
const REF_YEAR = new Date().getFullYear();
const AVAILABLE_YEARS = Object.keys(yearCount).map(Number).sort((a, b) => b - a);
console.log(`  ano de referencia: ${REF_YEAR} | anos disponiveis: ${AVAILABLE_YEARS.join(', ')}`);

// ---------- segmentos por filtro ----------
function selectByFilter(items, filter) {
  // 'realizado'      => status PAGO/RECEBIDO
  // 'a_pagar_receber'=> status A VENCER, ATRASADO, VENCE HOJE (nao pago)
  // 'tudo'           => tudo (exceto CANCELADO, ja filtrado antes)
  if (filter === 'realizado') return items.filter((t) => t.realizado);
  if (filter === 'a_pagar_receber') return items.filter((t) => !t.realizado);
  return items;
}

// ---------- agregacoes ----------
function buildMonthData(rec, desp, year) {
  const data = MONTHS_FULL.map((m) => ({ m, receita: 0, despesa: 0 }));
  for (const t of rec) {
    const d = t.data_efetiva;
    if (!d || d.getFullYear() !== year) continue;
    data[d.getMonth()].receita += t.valor;
  }
  for (const t of desp) {
    const d = t.data_efetiva;
    if (!d || d.getFullYear() !== year) continue;
    data[d.getMonth()].despesa += t.valor;
  }
  return data;
}

function buildCategoriaAgg(items, year, kindLabel) {
  const map = new Map();
  for (const t of items) {
    const d = t.data_efetiva;
    if (year && d && d.getFullYear() !== year) continue;
    const k = t.categoria;
    if (!map.has(k)) map.set(k, { name: k, value: 0, count: 0, clientesSet: new Set() });
    const obj = map.get(k);
    obj.value += t.valor;
    obj.count += 1;
    obj.clientesSet.add(t.cliente);
  }
  const out = [];
  for (const v of map.values()) {
    const o = { name: v.name, value: v.value };
    if (kindLabel === 'receita') o.clientes = v.clientesSet.size;
    else o.fornecedores = v.clientesSet.size;
    out.push(o);
  }
  return out.sort((a, b) => b.value - a.value).slice(0, 12);
}

function buildClienteAgg(items, year) {
  const map = new Map();
  for (const t of items) {
    const d = t.data_efetiva;
    if (year && d && d.getFullYear() !== year) continue;
    const k = t.cliente;
    if (!map.has(k)) map.set(k, { name: k, value: 0 });
    map.get(k).value += t.valor;
  }
  return Array.from(map.values()).sort((a, b) => b.value - a.value).slice(0, 12);
}

function buildExtrato(rec, desp, limit = 200) {
  // tupla compativel com mock: [data, cc, categoria, cliente, valor, status]
  const all = [], recArr = [], despArr = [];
  for (const t of rec) {
    const r = [fmtBR(t.data_efetiva), t.centroCusto || 'Operações', t.categoria, t.cliente, t.valor, t.status];
    all.push(r); recArr.push(r);
  }
  for (const t of desp) {
    const r = [fmtBR(t.data_efetiva), t.centroCusto || 'Operações', t.categoria, t.cliente, -t.valor, t.status];
    all.push(r); despArr.push(r);
  }
  // sort por data desc
  const sortDesc = (a, b) => {
    const [da, ma, ya] = (a[0] || '01/01/1970').split('/').map(Number);
    const [db, mb, yb] = (b[0] || '01/01/1970').split('/').map(Number);
    return new Date(yb, mb - 1, db) - new Date(ya, ma - 1, da);
  };
  all.sort(sortDesc); recArr.sort(sortDesc); despArr.sort(sortDesc);
  return {
    EXTRATO: all.slice(0, limit),
    EXTRATO_RECEITAS: recArr.slice(0, limit),
    EXTRATO_DESPESAS: despArr.slice(0, limit),
  };
}

function buildKpis(monthData) {
  const TOTAL_RECEITA = monthData.reduce((s, x) => s + x.receita, 0);
  const TOTAL_DESPESA = monthData.reduce((s, x) => s + x.despesa, 0);
  const VALOR_LIQUIDO = TOTAL_RECEITA - TOTAL_DESPESA;
  const MARGEM_LIQUIDA = TOTAL_RECEITA > 0 ? (VALOR_LIQUIDO / TOTAL_RECEITA) * 100 : 0;
  // Heuristicas — sem dados reais de impostos/capex separados, estimamos via categorias
  const VALOR_LIQ_SERIES = monthData.map((m) => m.receita - m.despesa);
  return { TOTAL_RECEITA, TOTAL_DESPESA, VALOR_LIQUIDO, MARGEM_LIQUIDA, VALOR_LIQ_SERIES };
}

function buildSegment(rec, desp, year, label) {
  const r = selectByFilter(rec, label);
  const d = selectByFilter(desp, label);
  const MONTH_DATA = buildMonthData(r, d, year);
  const RECEITA_CATEGORIAS = buildCategoriaAgg(r, year, 'receita');
  const DESPESA_CATEGORIAS = buildCategoriaAgg(d, year, 'despesa');
  const RECEITA_CLIENTES = buildClienteAgg(r, year);
  const DESPESA_FORNECEDORES = buildClienteAgg(d, year);
  const extOut = buildExtrato(r, d, 200);
  const EXTRATO = extOut.EXTRATO;
  const EXTRATO_RECEITAS = extOut.EXTRATO_RECEITAS;
  const EXTRATO_DESPESAS = extOut.EXTRATO_DESPESAS;
  const KPIS = buildKpis(MONTH_DATA);
  // count de lancamentos por mes (pra DailyBars/RECEITA_DIA usar como proxy)
  const RECEITA_DIA = Array(31).fill(0);
  const DESPESA_DIA = Array(31).fill(0);
  for (const t of r) {
    const dt = t.data_efetiva;
    if (!dt || dt.getFullYear() !== year) continue;
    RECEITA_DIA[dt.getDate() - 1] += t.valor;
  }
  for (const t of d) {
    const dt = t.data_efetiva;
    if (!dt || dt.getFullYear() !== year) continue;
    DESPESA_DIA[dt.getDate() - 1] += t.valor;
  }
  // saldos cumulativos
  const SALDOS_MES = [];
  let saldo = 0;
  for (const m of MONTH_DATA) {
    saldo += m.receita - m.despesa;
    SALDOS_MES.push(saldo);
  }
  // FLUXO horizontal com hierarquia (agrupa categorias por categoria_superior)
  // Constrói map de codCateg -> categoria_superior para agrupar
  function buildFluxoHierarchy(items, sign) {
    // Agrupa valores por codCateg e mês
    const catMonthMap = new Map(); // codCateg -> [12 valores]
    for (const t of items) {
      const dt = t.data_efetiva;
      if (!dt || dt.getFullYear() !== year) continue;
      const mi = dt.getMonth();
      const cod = t.codCateg || '';
      if (!catMonthMap.has(cod)) catMonthMap.set(cod, { values: Array(12).fill(0), name: t.categoria, cod });
      catMonthMap.get(cod).values[mi] += t.valor * sign;
    }
    // Agrupa por categoria_superior (parent)
    const parentMap = new Map(); // parentCod -> { name, children: [{cat, values, cod}] }
    for (const [cod, entry] of catMonthMap) {
      const catObj = catById.get(String(cod));
      const parentCod = catObj ? String(catObj.categoria_superior || '') : '';
      const parentObj = parentCod ? catById.get(parentCod) : null;
      const parentName = parentObj ? (parentObj.descricao || `Grupo ${parentCod}`) : 'Outros';
      const parentKey = parentCod || '_outros';
      if (!parentMap.has(parentKey)) parentMap.set(parentKey, { cat: parentName, children: [], values: Array(12).fill(0) });
      const parent = parentMap.get(parentKey);
      parent.children.push({ cat: entry.name, values: entry.values, cod: entry.cod });
      for (let i = 0; i < 12; i++) parent.values[i] += entry.values[i];
    }
    // Ordena pais por valor total descendente, filhos tambem
    const result = Array.from(parentMap.values());
    const totalOf = (row) => row.values.reduce((s, v) => s + Math.abs(v), 0);
    result.sort((a, b) => totalOf(b) - totalOf(a));
    for (const p of result) {
      p.children.sort((a, b) => totalOf(b) - totalOf(a));
      // Se o pai só tem 1 filho com mesmo nome, promove (sem hierarquia desnecessária)
      if (p.children.length === 1 && p.children[0].cat === p.cat) {
        p.children = [];
      }
    }
    return result.slice(0, 8);
  }
  const FLUXO_RECEITA = buildFluxoHierarchy(r, 1);
  const FLUXO_DESPESA = buildFluxoHierarchy(d, -1);
  // Comparativo: trim1 vs trim2 do ano corrente
  const buildTrimAgg = (items, mStart, mEnd) => {
    const map = new Map();
    let total = 0;
    for (const t of items) {
      const dt = t.data_efetiva;
      if (!dt || dt.getFullYear() !== year) continue;
      if (dt.getMonth() < mStart || dt.getMonth() > mEnd) continue;
      const k = t.categoria;
      map.set(k, (map.get(k) || 0) + t.valor);
      total += t.valor;
    }
    return { map, total };
  };
  const recT1 = buildTrimAgg(r, 0, 2), recT2 = buildTrimAgg(r, 3, 5);
  const despT1 = buildTrimAgg(d, 0, 2), despT2 = buildTrimAgg(d, 3, 5);
  const COMP_DATA = [
    { tipo: 'Receita', isHeader: true, d1: recT1.total, d2: recT2.total },
  ];
  const allRecCats = new Set([...recT1.map.keys(), ...recT2.map.keys()]);
  for (const k of allRecCats) {
    COMP_DATA.push({ tipo: k, parent: 'Receita', d1: recT1.map.get(k) || 0, d2: recT2.map.get(k) || 0 });
  }
  COMP_DATA.push({ tipo: 'Despesa', isHeader: true, d1: -despT1.total, d2: -despT2.total });
  const allDespCats = new Set([...despT1.map.keys(), ...despT2.map.keys()]);
  for (const k of allDespCats) {
    COMP_DATA.push({ tipo: k, parent: 'Despesa', d1: -(despT1.map.get(k) || 0), d2: -(despT2.map.get(k) || 0) });
  }
  return {
    MONTH_DATA, RECEITA_CATEGORIAS, DESPESA_CATEGORIAS,
    RECEITA_CLIENTES, DESPESA_FORNECEDORES, EXTRATO,
    EXTRATO_RECEITAS, EXTRATO_DESPESAS,
    KPIS, RECEITA_DIA, DESPESA_DIA, SALDOS_MES,
    FLUXO_RECEITA, FLUXO_DESPESA, COMP_DATA,
  };
}

console.log('\n=== Construindo segmentos (realizado / a_pagar_receber / tudo) ===');
const realizado = buildSegment(recNorm, despNorm, REF_YEAR, 'realizado');
const a_pagar_receber = buildSegment(recNorm, despNorm, REF_YEAR, 'a_pagar_receber');
const tudo = buildSegment(recNorm, despNorm, REF_YEAR, 'tudo');

console.log(`  realizado: receita=${realizado.KPIS.TOTAL_RECEITA.toFixed(2)} despesa=${realizado.KPIS.TOTAL_DESPESA.toFixed(2)} liq=${realizado.KPIS.VALOR_LIQUIDO.toFixed(2)}`);
console.log(`  a_pagar:   receita=${a_pagar_receber.KPIS.TOTAL_RECEITA.toFixed(2)} despesa=${a_pagar_receber.KPIS.TOTAL_DESPESA.toFixed(2)}`);
console.log(`  tudo:      receita=${tudo.KPIS.TOTAL_RECEITA.toFixed(2)} despesa=${tudo.KPIS.TOTAL_DESPESA.toFixed(2)}`);

// ---------- CMV / Pedidos de Venda (tela Limpuz) ----------
// Vendas        = itens de pedido com Situação "Faturado" e Operação "Pedido de Venda"
//                 (gerados por fetch-pedidos.cjs em data/pedidos.json).
// Compra de Merc = despesas (movimentos) na categoria "5.1.1 COMPRA DE MERCADORIA".
// CMV%           = Compra de Mercadoria / Vendas.
const COMPRA_MERC_RE = /compra de mercadoria/i;
function isCompraMercadoria(t) {
  return /^5\.1\.1/.test(String(t.codCateg || '')) || COMPRA_MERC_RE.test(String(t.categoria || ''));
}
function buildCMV(despesas) {
  const pedidos = readJson('pedidos', []);
  const vendas = pedidos.filter(p => p.situacao === 'Faturado' && p.operacao === 'Pedido de Venda' && p.data);

  // compra de mercadoria por ano/mes (despesas categoria 5.1.1 COMPRA DE MERCADORIA)
  const compraByYear = {};
  for (const t of despesas) {
    if (!isCompraMercadoria(t)) continue;
    const d = t.data_efetiva;
    if (!d) continue;
    const y = d.getFullYear();
    (compraByYear[y] = compraByYear[y] || Array(12).fill(0))[d.getMonth()] += t.valor;
  }

  const anosSet = new Set();
  for (const v of vendas) anosSet.add(Number(v.data.slice(0, 4)));
  for (const y of Object.keys(compraByYear)) anosSet.add(Number(y));
  const anos = [...anosSet].filter(Boolean).sort((a, b) => b - a);

  const porAno = {};
  for (const ano of anos) {
    const vAno = vendas.filter(v => Number(v.data.slice(0, 4)) === ano);
    // itens compactos — a página recalcula tudo aplicando o filtro de Categoria:
    // [mes(0-11), categoria, clienteFantasia, clienteRazao, valor, nCodPed, dataBR]
    const itens = vAno.map(v => [
      Number(v.data.slice(5, 7)) - 1,
      v.categoria,
      v.cliente,
      v.clienteRazao || v.cliente,
      v.valor,
      v.nCodPed,
      v.data.split('-').reverse().join('/'),
    ]);
    const compraMes = compraByYear[ano] || Array(12).fill(0);
    const categorias = [...new Set(vAno.map(v => v.categoria))].sort();
    porAno[ano] = { itens, compraMes, compraTotal: compraMes.reduce((s, x) => s + x, 0), categorias };
  }
  return { anos, anoRef: anos[0] || REF_YEAR, porAno };
}
const BI_CMV = buildCMV(despNorm);
{
  const a = BI_CMV.porAno[BI_CMV.anoRef] || { itens: [], compraTotal: 0 };
  const tot = (a.itens || []).reduce((s, r) => s + r[4], 0);
  console.log(`  CMV: anos=${BI_CMV.anos.join(',')} | ref ${BI_CMV.anoRef} vendas=${tot.toFixed(2)} compra=${(a.compraTotal || 0).toFixed(2)} cmv%=${tot > 0 ? ((a.compraTotal / tot) * 100).toFixed(2) : '0'} itens=${(a.itens || []).length}`);
}

// ---------- meta + posicao caixa (placeholder) ----------
const meta = {
  empresa: empresa ? {
    nome_fantasia: empresa.nome_fantasia,
    razao_social: empresa.razao_social,
    cnpj: empresa.cnpj,
    cidade: empresa.cidade,
  } : null,
  fetched_at: summary ? summary.fetched_at : null,
  ref_year: REF_YEAR,
  counts: {
    contas_pagar: contasPagar.length,
    contas_receber: contasReceber.length,
    categorias: categorias.length,
    departamentos: departamentos.length,
    clientes: clientes.length,
  },
};

// Posicao caixa: nao temos dados de saldo bancario direto. Usamos saldo_acumulado do realizado.
const POSICAO_CAIXA = [
  { name: 'Saldo realizado YTD', value: realizado.KPIS.VALOR_LIQUIDO },
  { name: 'A receber (futuro)', value: a_pagar_receber.KPIS.TOTAL_RECEITA },
  { name: 'A pagar (futuro)', value: a_pagar_receber.KPIS.TOTAL_DESPESA },
];

const COMPOSICAO_DESPESA = realizado.DESPESA_CATEGORIAS.slice(0, 6).map((c, i) => ({
  name: c.name,
  value: c.value,
  color: ['#2dd4bf', '#22c55e', '#a78bfa', '#f59e0b', '#ef4444', '#6b7686'][i] || '#6b7686',
}));

// ---------- escrever data.js ----------
const DATA_JS = `/* BGP BI — gerado por build-data.cjs em ${new Date().toISOString()} */
/* Empresa: ${meta.empresa ? meta.empresa.nome_fantasia : '(faltando)'} | Ano ref: ${REF_YEAR} */
const MONTHS = ${JSON.stringify(MONTHS)};
const MONTHS_FULL = ${JSON.stringify(MONTHS_FULL)};

function fmt(n, opts = {}) {
  const { dec = 2, prefix = "R$", showSign = false } = opts;
  const sign = n < 0 ? "-" : (showSign ? "+" : "");
  const abs = Math.abs(n);
  const parts = abs.toFixed(dec).split(".");
  parts[0] = parts[0].replace(/\\B(?=(\\d{3})+(?!\\d))/g, ".");
  return \`\${sign}\${prefix}\${parts.join(",")}\`;
}
function fmtK(n) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : "";
  if (abs >= 1e6) return \`\${sign}R$\${(abs / 1e6).toFixed(2).replace(".", ",")} M\`;
  if (abs >= 1e3) return \`\${sign}R$\${(abs / 1e3).toFixed(2).replace(".", ",")} K\`;
  return \`\${sign}R$\${abs.toFixed(0)}\`;
}
function fmtPct(n, dec = 2) {
  const sign = n > 0 ? "+" : (n < 0 ? "-" : "");
  return \`\${sign}\${Math.abs(n).toFixed(dec).replace(".", ",")}%\`;
}

const META = ${JSON.stringify(meta, null, 2)};
const POSICAO_CAIXA = ${JSON.stringify(POSICAO_CAIXA, null, 2)};
const COMPOSICAO_DESPESA = ${JSON.stringify(COMPOSICAO_DESPESA, null, 2)};

const SEGMENTS = ${JSON.stringify({ realizado, a_pagar_receber, tudo }, null, 2)};

// ALL_TX: lista flat de TODAS as transacoes normalizadas (despesa + receita,
// realizadas + a pagar + canceladas excluidas). Usada pra cross-filter real
// — pagina recalcula KPIs/charts/tabelas em runtime via aggregateTx().
// Cada row eh tupla compacta pra reduzir tamanho do bundle:
// [kind, mes, dia, categoria, cliente, valor, realizado, fornecedor, centroCusto, semInvFlag, peClass, empresa, projeto]
// peClass: 'F'=custo fixo, 'V'=custo variavel, ''=neutro (receita ou grupo 2.10) — usado por computePE.
// empresa: label da conta Omie (ex: 'Matriz', 'Filial') — usado pelo filtro de empresa.
// projeto: nome do projeto Omie (ex: '5620 - 3R Petroleum') — usado pelo filtro de projeto.
const ALL_TX = ${JSON.stringify([
  ...recNorm.map(t => [
    'r',
    t.data_efetiva ? t.data_efetiva.toISOString().slice(0,7) : '',
    t.data_efetiva ? t.data_efetiva.getDate() : 0,
    t.categoria,
    t.cliente,
    t.valor,
    t.realizado ? 1 : 0,
    '',
    t.centroCusto || '',
    0,
    '',
    t.empresa || '',
    t.projeto || '',
  ]),
  ...despNorm.map(t => [
    'd',
    t.data_efetiva ? t.data_efetiva.toISOString().slice(0,7) : '',
    t.data_efetiva ? t.data_efetiva.getDate() : 0,
    t.categoria,
    '',
    t.valor,
    t.realizado ? 1 : 0,
    t.cliente,
    t.centroCusto || '',
    String(t.codCateg || '').startsWith('2.07') ? 1 : 0,
    peClassOf(t.codCateg),
    t.empresa || '',
    t.projeto || '',
  ]),
])};

const REF_YEAR = ${REF_YEAR};
const AVAILABLE_YEARS = ${JSON.stringify(AVAILABLE_YEARS)};

// aggregateTx: recomputa MONTH_DATA, KPIS, top categorias/clientes/fornecedores
// e EXTRATO a partir de uma lista filtrada de transacoes. Chamada pelas Pages
// quando drilldown ou statusFilter estao ativos.
function aggregateTx(txList, year) {
  year = year || REF_YEAR;
  const months = ${JSON.stringify(MONTHS_FULL)};
  const MONTH_DATA = months.map(m => ({ m, receita: 0, despesa: 0 }));
  const recCat = new Map(), despCat = new Map();
  const recCli = new Map(), despForn = new Map();
  const extratoArr = [];
  const extratoRecArr = [], extratoDespArr = [];
  let totalReceita = 0, totalDespesa = 0;

  for (const row of txList) {
    const [kind, mes, dia, categoria, cliente, valor, realizado, fornecedor, cc] = row;
    if (!mes) continue;
    const ymonth = mes.slice(0,4);
    if (Number(ymonth) !== year) continue;
    const mIdx = parseInt(mes.slice(5,7), 10) - 1;
    if (mIdx < 0 || mIdx > 11) continue;
    if (kind === 'r') {
      MONTH_DATA[mIdx].receita += valor;
      totalReceita += valor;
      recCat.set(categoria, (recCat.get(categoria) || 0) + valor);
      if (cliente) recCli.set(cliente, (recCli.get(cliente) || 0) + valor);
    } else {
      MONTH_DATA[mIdx].despesa += valor;
      totalDespesa += valor;
      despCat.set(categoria, (despCat.get(categoria) || 0) + valor);
      if (fornecedor) despForn.set(fornecedor, (despForn.get(fornecedor) || 0) + valor);
    }
    // Extrato compacto pra tabela (renomeado pra extRow porque outer for já usa 'row')
    const dataStr = String(dia).padStart(2,'0') + '/' + mes.slice(5,7) + '/' + mes.slice(0,4);
    const extRow = [dataStr, cc || 'Operações', categoria, kind === 'r' ? cliente : fornecedor, kind === 'r' ? valor : -valor, realizado ? 'PAGO' : ''];
    extratoArr.push(extRow);
    if (kind === 'r') extratoRecArr.push(extRow); else extratoDespArr.push(extRow);
  }

  // sort por data desc (string DD/MM/YYYY → Date) — aplica nos 3 arrays
  const sortByDateDesc = (a, b) => {
    const [da,ma,ya] = a[0].split('/').map(Number);
    const [db,mb,yb] = b[0].split('/').map(Number);
    return new Date(yb,mb-1,db) - new Date(ya,ma-1,da);
  };
  extratoArr.sort(sortByDateDesc);
  extratoRecArr.sort(sortByDateDesc);
  extratoDespArr.sort(sortByDateDesc);

  const topN = (mp, n) => Array.from(mp.entries()).map(([name,value]) => ({name,value})).sort((a,b)=>b.value-a.value).slice(0,n);
  const VALOR_LIQUIDO = totalReceita - totalDespesa;
  const MARGEM_LIQUIDA = totalReceita > 0 ? (VALOR_LIQUIDO / totalReceita) * 100 : 0;

  return {
    MONTH_DATA,
    RECEITA_CATEGORIAS: topN(recCat, 12),
    DESPESA_CATEGORIAS: topN(despCat, 12),
    RECEITA_CLIENTES: topN(recCli, 12),
    DESPESA_FORNECEDORES: topN(despForn, 12),
    TOTAL_CLIENTES: recCli.size,
    TOTAL_FORNECEDORES: despForn.size,
    EXTRATO: extratoArr.slice(0, 200),
    EXTRATO_RECEITAS: extratoRecArr.slice(0, 200),
    EXTRATO_DESPESAS: extratoDespArr.slice(0, 200),
    KPIS: {
      TOTAL_RECEITA: totalReceita,
      TOTAL_DESPESA: totalDespesa,
      VALOR_LIQUIDO,
      MARGEM_LIQUIDA,
      VALOR_LIQ_SERIES: MONTH_DATA.map(m => m.receita - m.despesa),
    },
  };
}

// applyDrilldown: filtra ALL_TX baseado em statusFilter + drilldown.
// statusFilter: 'realizado' | 'a_pagar_receber' | 'tudo'
// drilldown: null | { type: 'mes'|'categoria'|'cliente'|'fornecedor', value: ... }
function filterTx(allTx, statusFilter, drilldown) {
  let out = allTx;
  if (statusFilter === 'realizado') out = out.filter(r => r[6] === 1);
  else if (statusFilter === 'a_pagar_receber') out = out.filter(r => r[6] === 0);
  if (drilldown) {
    if (drilldown.type === 'mes') out = out.filter(r => r[1] === drilldown.value);
    else if (drilldown.type === 'categoria') out = out.filter(r => r[3] === drilldown.value);
    else if (drilldown.type === 'cliente') out = out.filter(r => r[0] === 'r' && r[4] === drilldown.value);
    else if (drilldown.type === 'fornecedor') out = out.filter(r => r[0] === 'd' && r[7] === drilldown.value);
    else if (drilldown.type === 'dia') out = out.filter(r => r[2] === drilldown.value);
  }
  return out;
}
function filterTxSemInv(out) { return out.filter(r => !r[9]); }

// Sintetiza um BIT "flat" baseado no filtro escolhido (window.BIT_FILTER).
// Default: 'realizado' (PAGO).
function _makeBit(filter) {
  const seg = SEGMENTS[filter] || SEGMENTS.realizado;
  const K = seg.KPIS;
  const indicadores = {
    TOTAL_RECEITA: K.TOTAL_RECEITA,
    TOTAL_DESPESA: K.TOTAL_DESPESA,
    VALOR_LIQUIDO: K.VALOR_LIQUIDO,
    MARGEM_LIQUIDA: K.MARGEM_LIQUIDA,
    IMPOSTOS: 0,
    EBITDA: K.VALOR_LIQUIDO,
    RESULTADO_OPERACIONAL: K.VALOR_LIQUIDO,
    CAPEX: 0,
    MARGEM_CONTRIB: K.MARGEM_LIQUIDA,
    EBITDA_PCT: K.MARGEM_LIQUIDA,
    IMPOSTOS_PCT: 0,
  };
  return Object.assign({
    META, POSICAO_CAIXA, COMPOSICAO_DESPESA,
    MONTHS, MONTHS_FULL, fmt, fmtK, fmtPct,
    SEGMENTS,
    MONTH_DATA: seg.MONTH_DATA,
    RECEITA_CATEGORIAS: seg.RECEITA_CATEGORIAS,
    DESPESA_CATEGORIAS: seg.DESPESA_CATEGORIAS,
    RECEITA_CLIENTES: seg.RECEITA_CLIENTES,
    DESPESA_FORNECEDORES: seg.DESPESA_FORNECEDORES,
    TOTAL_CLIENTES: seg.TOTAL_CLIENTES,
    TOTAL_FORNECEDORES: seg.TOTAL_FORNECEDORES,
    EXTRATO: seg.EXTRATO,
    DIAS: Array.from({ length: 31 }, (_, i) => i + 1),
    RECEITA_DIA: seg.RECEITA_DIA,
    DESPESA_DIA: seg.DESPESA_DIA,
    SALDOS_MES: seg.SALDOS_MES,
    VALOR_LIQ_SERIES: K.VALOR_LIQ_SERIES,
    FLUXO_RECEITA: seg.FLUXO_RECEITA,
    FLUXO_DESPESA: seg.FLUXO_DESPESA,
    COMP_DATA: seg.COMP_DATA,
    RECDESP_AREA: seg.MONTH_DATA.map(m => ({ m: m.m.slice(0,3), receita: m.receita, despesa: m.despesa })),
  }, indicadores);
}

window.BIT = _makeBit(window.BIT_FILTER || 'realizado');
window._makeBit = _makeBit;
window.BIT_SEGMENTS = SEGMENTS;
window.BIT_META = META;
window.ALL_TX = ALL_TX;
window.REF_YEAR = REF_YEAR;
window.AVAILABLE_YEARS = AVAILABLE_YEARS;
window.aggregateTx = aggregateTx;
window.filterTx = filterTx;
// Listas únicas de natureza DRE e categoria extraídas de ALL_TX
window.ALL_NATUREZAS = (function () {
  const s = new Set();
  for (const r of ALL_TX) { if (r[8]) s.add(r[8]); }
  return Array.from(s).sort();
})();
window.ALL_CATEGORIAS = (function () {
  const s = new Set();
  for (const r of ALL_TX) { if (r[3]) s.add(r[3]); }
  return Array.from(s).sort();
})();
window.ALL_EMPRESAS = (function () {
  const s = new Set();
  for (const r of ALL_TX) { if (r[11]) s.add(r[11]); }
  return Array.from(s).sort();
})();
window.ALL_PROJETOS = ${JSON.stringify((() => {
  const s = new Set();
  for (const t of [...recNorm, ...despNorm]) {
    if (t.projeto && / - /.test(t.projeto)) s.add(t.projeto);
  }
  return Array.from(s).sort();
})())};
window.FLUXO_PROJETADO = ${JSON.stringify(saldos || { totais: [], contas: [], rows: [], updatedAt: null, error: 'execute fetch-saldos.cjs to generate' })};
window.BI_CMV = ${JSON.stringify(BI_CMV)};
// getBit: SEMPRE recomputa via recomputeBit (sem cache de window.BIT).
// Evita lag no toggle Previsto/Realizado e suporta year/month arbitrario.
// month: 0 = ano completo, 1-12 = mes especifico.
window.getBit = function (statusFilter, drilldown, year, month, semInv, extraFilters) {
  const sf = statusFilter || window.BIT_FILTER || 'realizado';
  const y = year || window.REF_YEAR;
  let dd = drilldown;
  if (!dd && month && month >= 1 && month <= 12) {
    const mm = String(month).padStart(2, '0');
    const ym = y + '-' + mm;
    dd = { type: 'mes', value: ym, label: ym };
  }
  return window.recomputeBit(sf, dd, y, semInv, extraFilters);
};
// Cross-filter helper: combina statusFilter + drilldown + semInv + extraFilters e retorna BIT-like
// com KPIs/charts/extrato recalculados em ~10ms (17k rows).
// extraFilters: { centroCusto: string[], categoria: string[], empresa: string[] } — arrays vazios = sem filtro
window.recomputeBit = function (statusFilter, drilldown, year, semInv, extraFilters) {
  let filtered = filterTx(ALL_TX, statusFilter, drilldown);
  if (semInv) filtered = filterTxSemInv(filtered);
  if (extraFilters) {
    const cc = extraFilters.centroCusto;
    const cat = extraFilters.categoria;
    const emp = extraFilters.empresa;
    if (cc && cc.length > 0) {
      const ccSet = new Set(cc);
      filtered = filtered.filter(r => ccSet.has(r[8] || ''));
    }
    if (cat && cat.length > 0) {
      const catSet = new Set(cat);
      filtered = filtered.filter(r => catSet.has(r[3]));
    }
    if (emp && emp.length > 0) {
      const empSet = new Set(emp);
      filtered = filtered.filter(r => empSet.has(r[11] || ''));
    }
  }
  const agg = aggregateTx(filtered, year || REF_YEAR);
  // Mescla com BIT base pra preservar META, helpers (fmt, fmtK), MONTHS etc.
  const base = window.BIT || {};
  return Object.assign({}, base, agg, {
    TOTAL_RECEITA: agg.KPIS.TOTAL_RECEITA,
    TOTAL_DESPESA: agg.KPIS.TOTAL_DESPESA,
    VALOR_LIQUIDO: agg.KPIS.VALOR_LIQUIDO,
    MARGEM_LIQUIDA: agg.KPIS.MARGEM_LIQUIDA,
  });
};
// computePE: indicadores de Ponto de Equilibrio (break-even) sob o MESMO contexto
// de filtro do resto da Visao Geral (statusFilter + drilldown + ano/mes + semInv),
// pra a receita aqui bater com BIT.TOTAL_RECEITA. Espelha o DAX do cliente:
//   Margem de Contribuicao % = (Receita - Custos Variaveis) / Receita
//   Ponto de Equilibrio      = Custos Fixos / Margem de Contribuicao %
//   Margem de Seguranca %     = (Receita - Ponto de Equilibrio) / Receita
// Custos Fixos/Variaveis sao classificados em build-data via categoria_superior (row[10]).
window.computePE = function (statusFilter, drilldown, year, month, semInv, extraFilters) {
  const sf = statusFilter || window.BIT_FILTER || 'realizado';
  const y = year || window.REF_YEAR;
  let dd = drilldown;
  if (!dd && month && month >= 1 && month <= 12) {
    const mm = String(month).padStart(2, '0');
    dd = { type: 'mes', value: y + '-' + mm, label: y + '-' + mm };
  }
  let filtered = filterTx(ALL_TX, sf, dd);
  if (semInv) filtered = filterTxSemInv(filtered);
  if (extraFilters) {
    const cc = extraFilters.centroCusto;
    const cat = extraFilters.categoria;
    const emp = extraFilters.empresa;
    if (cc && cc.length > 0) { const s = new Set(cc); filtered = filtered.filter(r => s.has(r[8] || '')); }
    if (cat && cat.length > 0) { const s = new Set(cat); filtered = filtered.filter(r => s.has(r[3])); }
    if (emp && emp.length > 0) { const s = new Set(emp); filtered = filtered.filter(r => s.has(r[11] || '')); }
  }
  let receita = 0, custosFixos = 0, custosVariaveis = 0;
  for (let i = 0; i < filtered.length; i++) {
    const row = filtered[i];
    if (!row[1] || Number(row[1].slice(0, 4)) !== y) continue;
    if (row[0] === 'r') { receita += row[5]; continue; }
    if (row[10] === 'F') custosFixos += row[5];
    else if (row[10] === 'V') custosVariaveis += row[5];
  }
  const margemContrib = receita > 0 ? (receita - custosVariaveis) / receita : null;
  const pontoEquilibrio = (margemContrib != null && margemContrib > 0) ? custosFixos / margemContrib : null;
  const margemSeguranca = (pontoEquilibrio != null && receita > 0) ? (receita - pontoEquilibrio) / receita : null;
  return {
    receita: receita,
    custosFixos: custosFixos,
    custosVariaveis: custosVariaveis,
    margemContrib: margemContrib,
    pontoEquilibrio: pontoEquilibrio,
    margemSeguranca: margemSeguranca,
  };
};
`;

// ---------- embutir reports IA (report*.json) no bundle ----------
const reportFiles = fs.readdirSync(path.join(__dirname)).filter(f => /^report(-\d{4}(-\d{2})?)?\.json$/.test(f));
const reports = {};
for (const f of reportFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
    reports[f] = data;
    console.log(`  report embutido: ${f}`);
  } catch (e) {
    console.warn(`  [warn] ${f} parse falhou: ${e.message}`);
  }
}
const REPORTS_JS = `\nwindow.BI_REPORTS = ${JSON.stringify(reports)};\n`;

fs.writeFileSync(OUT_FILE, DATA_JS + REPORTS_JS);
const stat = fs.statSync(OUT_FILE);
console.log(`\n=== OK ===`);
console.log(`  ${OUT_FILE} (${(stat.size / 1024).toFixed(1)} KB) (${reportFiles.length} reports embutidos)`);
