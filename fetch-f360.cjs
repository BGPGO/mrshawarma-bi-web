#!/usr/bin/env node
/**
 * fetch-f360.cjs — Puxa dados da API F360 (Financeiro 360) e grava
 * em data/*.json no formato compatível com build-data.cjs (Omie-like).
 *
 * Endpoints usados:
 *   - PublicLoginAPI/DoLogin (JWT)
 *   - ParcelasDeTituloPublicAPI/ListarParcelasDeTitulos (contas a pagar/receber)
 *   - PlanoDeContasPublicAPI/ListarPlanosContas
 *   - ContaBancariaPublicAPI/ListarContasBancarias
 *   - CentroDeCustoPublicAPI/ListarCentrosDeCusto
 *   - PessoasPublicAPI/ListarPessoas
 *
 * Saida: data/movimentos.json, data/categorias.json, data/contas_correntes.json,
 *        data/clientes.json, data/empresa.json, data/_summary.json
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const ROOT = __dirname;
const OUT = path.join(ROOT, 'data');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// Load .env
try { require('dotenv').config({ path: path.join(ROOT, '.env') }); } catch (e) {}
const F360_TOKEN = process.env.F360_API_TOKEN;
if (!F360_TOKEN) {
  console.error('ERRO: defina F360_API_TOKEN em .env');
  process.exit(1);
}

const BASE_URL = 'https://financas.f360.com.br';
let JWT = null;

// ---------- helpers ----------
async function login() {
  const resp = await fetch(`${BASE_URL}/PublicLoginAPI/DoLogin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: F360_TOKEN }),
  });
  if (!resp.ok) throw new Error(`Login falhou: HTTP ${resp.status}`);
  const data = await resp.json();
  JWT = data.Token;
  console.log('  [login] OK');
}

async function apiGet(endpoint) {
  const resp = await fetch(`${BASE_URL}/${endpoint}`, {
    headers: { 'Authorization': `Bearer ${JWT}` },
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`GET ${endpoint} falhou: HTTP ${resp.status} ${text.slice(0,200)}`);
  }
  return resp.json();
}

async function apiPost(endpoint, body) {
  const resp = await fetch(`${BASE_URL}/${endpoint}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${JWT}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`POST ${endpoint} falhou: HTTP ${resp.status} ${text.slice(0,200)}`);
  }
  return resp.json();
}

function save(name, data) {
  const p = path.join(OUT, name + '.json');
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
  const count = Array.isArray(data) ? data.length : '(object)';
  console.log(`  [${name}] salvo — ${count} registros`);
}

// ---------- fetch parcelas (paginado, max 31 dias por chamada) ----------
async function fetchParcelas(tipo, inicio, fim, tipoDatas) {
  const all = [];
  let pagina = 1;
  while (true) {
    const url = `ParcelasDeTituloPublicAPI/ListarParcelasDeTitulos?tipo=${tipo}&inicio=${inicio}&fim=${fim}&tipoDatas=${tipoDatas}&status=Todos&pagina=${pagina}`;
    const data = await apiGet(url);
    const result = data.Result || data;
    const parcelas = result.Parcelas || [];
    all.push(...parcelas);
    const totalPages = result.QuantidadeDePaginas || 0;
    if (pagina >= totalPages) break;
    pagina++;
  }
  return all;
}

// Fetch all parcelas across months for a given year
async function fetchAllParcelas(year) {
  const allParcelas = [];
  const months = [
    { inicio: `${year}-01-01`, fim: `${year}-01-31` },
    { inicio: `${year}-02-01`, fim: `${year}-02-28` },
    { inicio: `${year}-03-01`, fim: `${year}-03-31` },
    { inicio: `${year}-04-01`, fim: `${year}-04-30` },
    { inicio: `${year}-05-01`, fim: `${year}-05-31` },
    { inicio: `${year}-06-01`, fim: `${year}-06-30` },
    { inicio: `${year}-07-01`, fim: `${year}-07-31` },
    { inicio: `${year}-08-01`, fim: `${year}-08-31` },
    { inicio: `${year}-09-01`, fim: `${year}-09-30` },
    { inicio: `${year}-10-01`, fim: `${year}-10-31` },
    { inicio: `${year}-11-01`, fim: `${year}-11-30` },
    { inicio: `${year}-12-01`, fim: `${year}-12-31` },
  ];

  for (const { inicio, fim } of months) {
    const parcelas = await fetchParcelas('Ambos', inicio, fim, 'Vencimento');
    if (parcelas.length > 0) {
      console.log(`  [parcelas] ${inicio.slice(0,7)}: ${parcelas.length} registros`);
    }
    allParcelas.push(...parcelas);
  }
  return allParcelas;
}

// ---------- fetch parcelas de cartoes (paginado, max 31 dias) ----------
async function fetchCartoesPage(tipo, inicio, fim, tipoDatas, pagina) {
  const url = `ParcelasDeCartoesPublicAPI/ListarParcelasDeCartoes?tipo=${tipo}&inicio=${inicio}&fim=${fim}&tipoDatas=${tipoDatas}&status=Todos&pagina=${pagina}`;
  const data = await apiGet(url);
  const result = data.Result || data;
  return { parcelas: result.Parcelas || [], totalPages: result.QuantidadeDePaginas || 0 };
}

async function fetchAllCartoes(year) {
  const allCartoes = [];
  const months = [
    { inicio: `${year}-01-01`, fim: `${year}-01-31` },
    { inicio: `${year}-02-01`, fim: `${year}-02-28` },
    { inicio: `${year}-03-01`, fim: `${year}-03-31` },
    { inicio: `${year}-04-01`, fim: `${year}-04-30` },
    { inicio: `${year}-05-01`, fim: `${year}-05-31` },
    { inicio: `${year}-06-01`, fim: `${year}-06-30` },
    { inicio: `${year}-07-01`, fim: `${year}-07-31` },
    { inicio: `${year}-08-01`, fim: `${year}-08-31` },
    { inicio: `${year}-09-01`, fim: `${year}-09-30` },
    { inicio: `${year}-10-01`, fim: `${year}-10-31` },
    { inicio: `${year}-11-01`, fim: `${year}-11-30` },
    { inicio: `${year}-12-01`, fim: `${year}-12-31` },
  ];

  for (const { inicio, fim } of months) {
    let pagina = 1;
    let monthTotal = 0;
    while (true) {
      const { parcelas, totalPages } = await fetchCartoesPage('Receita', inicio, fim, 'Venda', pagina);
      allCartoes.push(...parcelas);
      monthTotal += parcelas.length;
      if (pagina >= totalPages) break;
      pagina++;
    }
    if (monthTotal > 0) {
      console.log(`  [cartoes] ${inicio.slice(0,7)}: ${monthTotal} registros`);
    }
  }
  return allCartoes;
}

/* rateioDe — as entradas do rateio de uma parcela, normalizadas.
 *
 * Cada entrada é uma LINHA de plano de contas com valor e lado próprios. Uma
 * parcela de cartão de R$ 66,80 rateia em 102-1 Delivery (+66,80), Tarifa
 * Delivery (-15,36), Taxa de entrega (-6,99) e Desconto (-2,14) — e a soma dá o
 * ValorLiquido de 42,31. Ler só a primeira entrada joga fora o resto e atribui
 * o valor todo a ela.
 *
 * Parcela sem rateio (aparece: 3 em ~1000) cai numa entrada sintética com o
 * ValorBruto e o Tipo da própria parcela, pra não desaparecer do BI. */
function rateioDe(p, fallbackCategoria) {
  const rs = Array.isArray(p.Rateio) ? p.Rateio.filter(r => r && Number(r.Valor)) : [];
  if (rs.length) {
    return rs.map(r => ({
      plano: r.PlanoDeContas || fallbackCategoria || 'Sem categoria',
      valor: Math.abs(Number(r.Valor) || 0),
      // O lado vem do Tipo do RATEIO, não do Tipo da parcela: numa parcela de
      // cartão (Tipo 'Receita') as linhas de tarifa vêm com Tipo 'Despesa'.
      receita: String(r.Tipo || '').toLowerCase() !== 'despesa',
      competencia: r.Competencia || '',
      centroCusto: r.CentroDeCusto || '',
    }));
  }
  return [{
    plano: fallbackCategoria || 'Sem categoria',
    valor: Math.abs(Number(p.ValorBruto) || 0),
    receita: String(p.Tipo || '').toLowerCase() !== 'despesa',
    competencia: '',
    centroCusto: '',
  }];
}

// Converte parcela de cartão para formato movimentos (mesma struct que títulos)
function cartaoToMovimentos(p) {
  const dc = p.DadosDoCartao || {};

  const st = (p.Status || '').toLowerCase();
  const isLiquidado = st.includes('liquidado') || st.includes('conciliado') || st.includes('baixado');
  const statusTitulo = p.Cancelada ? 'CANCELADO' : (isLiquidado ? 'PAGO' : 'RECEBER');

  function isoToBr(iso) {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  const venc = p.Vencimento || dc.DataDaVenda || '';
  const liq = p.Liquidacao || '';
  const dataRef = isLiquidado ? (liq || venc) : venc;
  const adquirente = dc.Adquirente || '';
  const bandeira = dc.Bandeira || '';
  const modalidade = p.Modalidade || '';

  // UM movimento por linha do rateio. Antes era um só, com Rateio[0] e o
  // ValorBruto inteiro — e cNatureza chumbado em 'R', o que fazia tarifa de
  // cartão entrar como receita.
  return rateioDe(p, `Vendas ${bandeira} (${modalidade})`).map((r, i) => ({
    detalhes: {
      cCodCateg: r.plano,
      cDetalheCateg: '',
      cNumTitulo: (p.ParcelaId || '') + (i ? '#' + i : ''),
      cTipo: 'REC',
      dDtPagamento: isoToBr(liq),
      dDtPrevisao: isoToBr(venc),
      dDtRegistro: isoToBr(dc.DataDaVenda),
      dDtVencimento: isoToBr(venc),
      nCodCC: p.Conta || '',
      nCodCliente: adquirente || bandeira || 'Cartão',
      nValorTitulo: r.valor,
      nValorPago: r.valor,
      status_titulo: statusTitulo,
      cNatureza: r.receita ? 'R' : 'D',
      nCodProjeto: '',
      _f360_centro_custo: r.centroCusto,
      _f360_empresa: '',
      _f360_competencia: r.competencia,
    },
  }));
}

// ---------- converter F360 -> formato Omie-like (movimentos.json) ----------
// MORTA: substituida pelo buildMovimentos, que expande o Rateio. Mantida so
// porque nao quis mexer em mais superficie que o necessario nesta rodada — mas
// ela ainda carrega o bug do Rateio[0]. Nao voltar a usar sem expandir o rateio.
function parcelaToMovimento(p) {
  const tipo = p.Tipo; // 'Receita' ou 'Despesa'
  const dados = p.DadosDoTitulo || {};
  const rateio = (p.Rateio && p.Rateio[0]) || {};
  const empresa = dados.Empresa || {};
  const clienteFornecedor = dados.ClienteFornecedor || {};

  // Determinar status
  let statusTitulo = 'RECEBER';
  if (tipo === 'Despesa') statusTitulo = 'PAGAR';
  if (p.Status === 'Liquidado' || p.Status === 'LiquidadoConciliado' || p.Status === 'Baixado') {
    statusTitulo = 'PAGO';
  } else if (p.Cancelada) {
    statusTitulo = 'CANCELADO';
  }

  // Data de vencimento -> formato dd/mm/yyyy
  const venc = p.Vencimento || '';
  const liq = p.Liquidacao || '';
  const emissao = dados.Emissao || '';

  function isoToBr(iso) {
    if (!iso) return '';
    const parts = iso.split('-');
    if (parts.length !== 3) return iso;
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }

  // Usar data de liquidação se pago, senão vencimento
  const dataRef = statusTitulo === 'PAGO' ? (liq || venc) : venc;

  return {
    // Formato compatível com o que build-data.cjs espera de movimentos
    detalhes: {
      cCodCateg: rateio.PlanoDeContas || 'Sem categoria',
      cDetalheCateg: '',
      cNumTitulo: dados.NumeroDoTitulo || p.Numero || '',
      cTipo: tipo === 'Receita' ? 'REC' : 'PAG',
      dDtPagamento: isoToBr(liq),
      dDtPrevisao: isoToBr(venc),
      dDtRegistro: isoToBr(emissao),
      dDtVencimento: isoToBr(venc),
      nCodCC: p.Conta || '',
      nCodCliente: clienteFornecedor.Nome || '',
      nValorTitulo: p.ValorBruto || 0,
      nValorPago: p.ValorLiquido || 0,
      status_titulo: statusTitulo,
      cNatureza: tipo === 'Receita' ? 'R' : 'D',
      // Extra fields for build-data compatibility
      _f360_id: p.ParcelaId,
      _f360_conta: p.Conta || '',
      _f360_centro_custo: rateio.CentroDeCusto || '',
      _f360_empresa: empresa.Nome || '',
      _f360_empresa_cnpj: empresa.Inscricao || '',
    },
    // Simplified movimentos format
    nCodTitulo: p.ParcelaId,
    tipo: tipo === 'Receita' ? 'r' : 'd',
    valor: p.ValorBruto || 0,
    valor_pago: p.ValorLiquido || 0,
    data: dataRef,
    data_br: isoToBr(dataRef),
    vencimento: venc,
    vencimento_br: isoToBr(venc),
    liquidacao: liq,
    liquidacao_br: isoToBr(liq),
    emissao: emissao,
    categoria: rateio.PlanoDeContas || 'Sem categoria',
    cliente_fornecedor: clienteFornecedor.Nome || 'Não informado',
    conta_corrente: p.Conta || '',
    centro_custo: rateio.CentroDeCusto || '',
    status: statusTitulo,
    empresa: empresa.Nome || '',
  };
}

// Convert parcelas to the flat movimentos format that build-data.cjs expects
function buildMovimentos(parcelas) {
  // build-data.cjs reads movimentos.json and expects each entry to have:
  // detalhes.cCodCateg, detalhes.nCodCliente, detalhes.nCodCC, detalhes.nValorTitulo,
  // detalhes.status_titulo, detalhes.dDtPagamento, detalhes.dDtVencimento, etc.
  // BUT the main loop uses the "movimentos" (ListarMovimentos) format.
  // Let's convert to that format instead.

  return parcelas.flatMap(p => {
    const dados = p.DadosDoTitulo || {};
    const clienteFornecedor = dados.ClienteFornecedor || {};
    const empresa = dados.Empresa || {};

    let statusTitulo = p.Tipo === 'Receita' ? 'RECEBER' : 'PAGAR';
    const st = (p.Status || '').toLowerCase();
    const isLiquidado = st.startsWith('liquidado') || st === 'baixado';
    if (isLiquidado) statusTitulo = 'PAGO';
    if (p.Cancelada) statusTitulo = 'CANCELADO';

    function isoToBr(iso) {
      if (!iso) return '';
      const parts = iso.split('-');
      if (parts.length !== 3) return iso;
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    }

    const dataRef = isLiquidado ? (p.Liquidacao || p.Vencimento) : p.Vencimento;

    // UM movimento por linha do rateio, igual ao caminho de cartão. Título com
    // rateio em várias contas (aluguel dividido, folha rateada) também perdia
    // linhas aqui.
    return rateioDe(p, 'Sem categoria').map((r, i) => ({
      detalhes: {
        cCodCateg: r.plano,
        cDetalheCateg: '',
        cNumTitulo: (dados.NumeroDoTitulo || String(p.Numero || '')) + (i ? '#' + i : ''),
        cTipo: r.receita ? 'REC' : 'PAG',
        dDtPagamento: isoToBr(p.Liquidacao),
        dDtPrevisao: isoToBr(p.Vencimento),
        dDtRegistro: isoToBr(dados.Emissao),
        dDtVencimento: isoToBr(p.Vencimento),
        nCodCC: p.Conta || '',
        nCodCliente: clienteFornecedor.Nome || 'Não informado',
        nValorTitulo: r.valor,
        nValorPago: r.valor,
        status_titulo: statusTitulo,
        cNatureza: r.receita ? 'R' : 'D',
        nCodProjeto: '',
        _f360_competencia: r.competencia,
      },
    }));
  });
}

// Convert to categorias format for build-data.cjs
function buildCategorias(planosContas) {
  return planosContas.map((pc, i) => ({
    codigo: pc.Nome,
    descricao: pc.Nome,
    descricao_categoria: pc.Nome,
    natureza: pc.Tipo === 'A receber' ? 'R' : 'D',
    tipo_categoria: pc.Tipo === 'A receber' ? 'R' : 'D',
    categoria_superior: '',
    _f360_id: pc.PlanoDeContasId,
  }));
}

// Convert to clientes format
function buildClientes(pessoas) {
  return pessoas.map(p => ({
    codigo_cliente_omie: p.Nome, // usar Nome como ID pq F360 referencia por nome
    nome_fantasia: p.Nome,
    razao_social: p.RazaoSocial || p.Nome,
    cnpj_cpf: p.CpfCnpj || '',
    definicao: p.Definicao || 'Ambos',
  }));
}

// Convert to contas_correntes format
function buildContasCorrentes(contasBancarias) {
  return contasBancarias.map(cb => ({
    nCodCC: cb.Nome,
    descricao: cb.Nome,
    tipo_conta: cb.TipoDeConta || '',
    codigo_banco: cb.NumeroBanco || '',
    agencia: cb.Agencia || '',
    conta: cb.Conta || '',
    _f360_id: cb.Id,
  }));
}

// ---------- main pipeline ----------
(async () => {
  console.log('=== F360 Fetch — MR Shawarma ===\n');

  // 1. Login
  console.log('=== Login ===');
  await login();

  // 2. Metadata (parallel)
  console.log('\n=== Metadata ===');
  const [planosContas, contasBancarias, centrosCusto, pessoasData] = await Promise.all([
    apiGet('PlanoDeContasPublicAPI/ListarPlanosContas'),
    apiGet('ContaBancariaPublicAPI/ListarContasBancarias'),
    apiGet('CentroDeCustoPublicAPI/ListarCentrosDeCusto'),
    apiGet('PessoasPublicAPI/ListarPessoas?pagina=1&definicao=ambos'),
  ]);

  const planos = planosContas.Result || [];
  const bancos = contasBancarias.Result || [];
  const centros = centrosCusto.Result || [];
  const pessoasResult = pessoasData.Result || pessoasData;
  const pessoas = pessoasResult.Pessoas || pessoasResult || [];

  console.log(`  plano de contas: ${planos.length}`);
  console.log(`  contas bancarias: ${bancos.length}`);
  console.log(`  centros de custo: ${centros.length}`);
  console.log(`  pessoas: ${Array.isArray(pessoas) ? pessoas.length : '?'}`);

  // Fetch all pessoas pages
  let allPessoas = Array.isArray(pessoas) ? [...pessoas] : [];
  const totalPessoasPages = pessoasResult.QuantidadeDePaginas || 1;
  for (let pg = 2; pg <= totalPessoasPages; pg++) {
    const pgData = await apiGet(`PessoasPublicAPI/ListarPessoas?pagina=${pg}&definicao=ambos`);
    const pgResult = pgData.Result || pgData;
    const pgPessoas = pgResult.Pessoas || pgResult || [];
    if (Array.isArray(pgPessoas)) allPessoas.push(...pgPessoas);
  }

  // 3. Parcelas (contas a pagar + receber)
  console.log('\n=== Parcelas de Títulos (2026) ===');
  const parcelas2026 = await fetchAllParcelas(2026);
  console.log(`  TOTAL 2026: ${parcelas2026.length} parcelas`);

  // Also try 2025
  console.log('\n=== Parcelas de Títulos (2025) ===');
  const parcelas2025 = await fetchAllParcelas(2025);
  console.log(`  TOTAL 2025: ${parcelas2025.length} parcelas`);

  const allParcelas = [...parcelas2025, ...parcelas2026];
  console.log(`\n  GRAND TOTAL TITULOS: ${allParcelas.length} parcelas`);

  // Deduplicate by ParcelaId
  const seen = new Set();
  const uniqueParcelas = allParcelas.filter(p => {
    if (seen.has(p.ParcelaId)) return false;
    seen.add(p.ParcelaId);
    return true;
  });
  console.log(`  Apos dedup: ${uniqueParcelas.length} parcelas unicas`);

  // 4. Parcelas de CARTOES (vendas por maquininha/iFood/etc)
  console.log('\n=== Parcelas de Cartões (2026) ===');
  const cartoes2026 = await fetchAllCartoes(2026);
  console.log(`  TOTAL CARTOES 2026: ${cartoes2026.length} parcelas`);

  // Converte cartoes para movimentos
  const movimentosCartoes = cartoes2026.flatMap(cartaoToMovimentos);
  console.log(`  Movimentos de cartao: ${movimentosCartoes.length}`);

  // 5. Convert & save
  console.log('\n=== Salvando dados ===');

  // Empresa
  const empresaData = {
    nome_fantasia: 'MR SHAWARMA FOOD LTDA',
    razao_social: 'MR SHAWARMA FOOD LTDA',
    cnpj: centros.length > 0 ? centros[0].Nome : '',
  };
  save('empresa', empresaData);

  // Categorias
  save('categorias', buildCategorias(planos));

  // Clientes
  save('clientes', buildClientes(allPessoas));

  // Contas correntes
  save('contas_correntes', buildContasCorrentes(bancos));

  // Movimentos — convert parcelas + cartoes to the format build-data.cjs expects
  const movimentosTitulos = buildMovimentos(uniqueParcelas);
  const movimentos = [...movimentosTitulos, ...movimentosCartoes];
  console.log(`  Movimentos titulo: ${movimentosTitulos.length} + cartao: ${movimentosCartoes.length} = ${movimentos.length} total`);
  save('movimentos', movimentos);

  // Contas pagar/receber separados (para compatibilidade)
  const contasPagar = uniqueParcelas.filter(p => p.Tipo === 'Despesa');
  const contasReceber = uniqueParcelas.filter(p => p.Tipo === 'Receita');
  save('contas_pagar', contasPagar);
  save('contas_receber', contasReceber);

  // Summary
  const summaryData = {
    fetched_at: new Date().toISOString(),
    empresa: empresaData.nome_fantasia,
    source: 'F360',
    counts: {
      parcelas: uniqueParcelas.length,
      contas_pagar: contasPagar.length,
      contas_receber: contasReceber.length,
      categorias: planos.length,
      pessoas: allPessoas.length,
      contas_bancarias: bancos.length,
      centros_custo: centros.length,
    },
  };
  save('_summary', summaryData);

  console.log('\n=== DONE ===');
  console.log(JSON.stringify(summaryData, null, 2));
})().catch(e => {
  console.error('ERRO:', e.message);
  process.exit(1);
});
