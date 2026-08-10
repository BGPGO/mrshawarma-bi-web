#!/usr/bin/env node
/**
 * fetch-pedidos.cjs — pull dos Pedidos de Venda (ListarPedidos) da Omie.
 *
 * Versão Limpuz: gera data/pedidos.json com cada ITEM de pedido já resolvido
 * (Categoria, Cliente, Situação no estilo do Power BI do cliente). A tela CMV
 * (build-data.cjs → window.BI_CMV) consome esse arquivo, aplicando o hard filter
 * Situação = "Faturado" e Operação = "Pedido de Venda".
 *
 * Situação (réplica do M-query):
 *   cancelado=S            -> "Cancelado"
 *   devolvido=S            -> "Devolvido"
 *   faturado=S & autorizado=S       -> "Faturado"
 *   faturado=S & autorizado!=S      -> "Rejeitado"
 *   senão                  -> "Em aberto"
 *
 * Uso: node fetch-pedidos.cjs [--no-cache]
 *   --no-cache  limpa cache de paginação e força re-pull completo
 */
'use strict';

const fs   = require('node:fs');
const path = require('node:path');

try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch (e) {}

const APP_KEY    = process.env.OMIE_APP_KEY;
const APP_SECRET = process.env.OMIE_APP_SECRET;
if (!APP_KEY || !APP_SECRET) {
  console.error('ERRO: OMIE_APP_KEY e OMIE_APP_SECRET precisam estar no .env');
  process.exit(1);
}

const BASE       = 'https://app.omie.com.br/api/v1';
const OUT        = path.join(__dirname, 'data');
const PAGE_SIZE  = 200;
const PAGE_DELAY = 200;
const noCache    = process.argv.includes('--no-cache');

fs.mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ---- Omie call com retry ----
async function call(p, method, params, retries = 8) {
  const body = JSON.stringify({ call: method, app_key: APP_KEY, app_secret: APP_SECRET, param: [params] });
  let res;
  try {
    res = await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  } catch (netErr) {
    if (retries > 0) { await sleep(Math.min(30000, 2000 * (9 - retries))); return call(p, method, params, retries - 1); }
    throw netErr;
  }
  let j;
  try { j = await res.json(); } catch {
    if (retries > 0) { await sleep(2000); return call(p, method, params, retries - 1); }
    throw new Error(`${method}: bad JSON (${res.status})`);
  }
  if (j.faultstring) {
    const transient = /Consumo|consumo|excedido|simultane|Many|busy|Broken|gateway|timeout|503|502|504|existe uma/i.test(j.faultstring);
    if (transient && retries > 0) {
      const aguardeMatch = j.faultstring.match(/Aguarde\s+(\d+)\s+segundo/i);
      const wait = aguardeMatch
        ? (parseInt(aguardeMatch[1]) + 3) * 1000
        : Math.min(30000, 2000 * (9 - retries));
      console.error(`  [retry] ${method} → ${j.faultstring.slice(0, 80)} → wait ${wait}ms`);
      await sleep(wait);
      return call(p, method, params, retries - 1);
    }
    throw new Error(`${method}: ${j.faultstring}`);
  }
  return j;
}

// ---- Paginação resumável com cache em disco (estilo snake: /produtos/, /geral/) ----
async function fetchPaginated(apiPath, method, baseParam, dataKey, label) {
  const cacheDir = path.join(OUT, '_cache', label);
  if (noCache && fs.existsSync(cacheDir)) fs.rmSync(cacheDir, { recursive: true });
  fs.mkdirSync(cacheDir, { recursive: true });
  const pFile   = n => path.join(cacheDir, `page-${String(n).padStart(5, '0')}.json`);
  const readPg  = n => { try { return JSON.parse(fs.readFileSync(pFile(n), 'utf8')); } catch { return null; } };
  const writePg = (n, arr) => fs.writeFileSync(pFile(n), JSON.stringify(arr));

  const pgParam = (p) => ({ ...baseParam, pagina: p, registros_por_pagina: PAGE_SIZE });

  const first    = await call(apiPath, method, pgParam(1));
  const totalPgs = first.total_de_paginas || 1;
  const totalReg = first.total_de_registros || 0;
  writePg(1, first[dataKey] || []);
  console.log(`  [${label}] ${totalReg} registros em ${totalPgs} páginas`);

  let failed = 0;
  for (let p = 2; p <= totalPgs; p++) {
    if (!readPg(p)) {
      await sleep(PAGE_DELAY);
      try {
        const r = await call(apiPath, method, pgParam(p));
        writePg(p, r[dataKey] || []);
      } catch (e) {
        if (++failed > 50) { console.error(`  [${label}] ABORT: +50 falhas`); break; }
        console.error(`  [${label}] pag ${p} FAIL: ${e.message.slice(0, 80)}`);
      }
    }
    if (p % 10 === 0 || p === totalPgs) process.stdout.write(`  [${label}] pag ${p}/${totalPgs}\r`);
  }

  const all = [];
  for (let p = 1; p <= totalPgs; p++) all.push(...(readPg(p) || []));
  console.log(`  [${label}] OK ${all.length} registros                      `);
  return all;
}

// ---- Normaliza data Omie dd/mm/yyyy → yyyy-mm-dd ----
function normDate(s) { return s ? s.split('/').reverse().join('-') : null; }

// ---- Parse numérico tolerante (aceita "22,6" ou 22.6 ou 22) ----
function num(v) {
  if (typeof v === 'number') return v;
  if (!v) return 0;
  return parseFloat(String(v).replace(',', '.')) || 0;
}

// ---- Situação no estilo Power BI do cliente ----
function situacao(info) {
  if (info.cancelado === 'S') return 'Cancelado';
  if (info.devolvido === 'S') return 'Devolvido';
  if (info.faturado === 'S' && info.autorizado === 'S') return 'Faturado';
  if (info.faturado === 'S') return 'Rejeitado';
  return 'Em aberto';
}

// ---- Main ----
(async () => {
  console.log('=== Omie pull: pedidos de venda (ListarPedidos) ===\n');

  // Categorias — usa data/categorias.json (fetch-data) ou puxa da API
  let catMap = new Map();
  const catPath = path.join(OUT, 'categorias.json');
  let categorias = [];
  if (fs.existsSync(catPath)) {
    try { categorias = JSON.parse(fs.readFileSync(catPath, 'utf8')); } catch (e) { categorias = []; }
  }
  if (!categorias.length) {
    console.log('  Puxando categorias da API...');
    try {
      categorias = await fetchPaginated('/geral/categorias/', 'ListarCategorias', {}, 'categoria_cadastro', 'categorias');
      fs.writeFileSync(catPath, JSON.stringify(categorias, null, 2));
    } catch (e) { console.warn('  categorias WARN:', e.message); }
  }
  for (const c of categorias) {
    if (c.codigo) catMap.set(String(c.codigo), c.descricao || c.descricao_categoria || String(c.codigo));
  }
  console.log(`  categorias: ${catMap.size}`);

  // Clientes — usa data/clientes.json (fetch-data) ou puxa da API
  let cliMap = new Map(), cliRazaoMap = new Map();
  const cliPath = path.join(OUT, 'clientes.json');
  let clientes = [];
  if (fs.existsSync(cliPath)) {
    try { clientes = JSON.parse(fs.readFileSync(cliPath, 'utf8')); } catch (e) { clientes = []; }
  }
  if (!clientes.length) {
    console.log('  Puxando clientes da API...');
    try {
      clientes = await fetchPaginated('/geral/clientes/', 'ListarClientes', { apenas_importado_api: 'N' }, 'clientes_cadastro', 'clientes');
      fs.writeFileSync(cliPath, JSON.stringify(clientes, null, 2));
    } catch (e) { console.warn('  clientes WARN:', e.message); }
  }
  for (const c of clientes) {
    const k = String(c.codigo_cliente_omie);
    cliMap.set(k, c.nome_fantasia || c.razao_social || '');
    cliRazaoMap.set(k, c.razao_social || c.nome_fantasia || '');
  }
  console.log(`  clientes: ${cliMap.size}`);

  // Pedidos de venda
  const rawPedidos = await fetchPaginated(
    '/produtos/pedido/', 'ListarPedidos', {}, 'pedido_venda_produto', 'pedidos'
  );

  const canonical = [];
  const sitCount = {};
  for (const ped of rawPedidos) {
    const cab  = ped.cabecalho              || {};
    const info = ped.informacoes_adicionais || {};
    const cad  = ped.infoCadastro           || {};
    const sit  = situacao(cad);
    sitCount[sit] = (sitCount[sit] || 0) + 1;
    const dataStr     = normDate(cad.dFat) || normDate(cab.data_previsao);
    const cliKey      = String(cab.codigo_cliente || '');
    const clienteNome = cliMap.get(cliKey) || cliKey;
    const clienteRaz  = cliRazaoMap.get(cliKey) || clienteNome;
    const codCateg    = String(info.codigo_categoria || '');
    const catNome     = catMap.get(codCateg) || codCateg || 'Sem categoria';
    const vendedor    = String(info.codVend || 'Sem Vendedor');

    for (const det of (Array.isArray(ped.det) ? ped.det : [])) {
      const prod  = det.produto || {};
      const valor = num(prod.valor_total);
      if (valor <= 0) continue;
      canonical.push({
        nCodPed:      String(cab.numero_pedido || cab.codigo_pedido || ''),
        data:         dataStr,
        operacao:     'Pedido de Venda',
        situacao:     sit,
        etapa:        String(cab.etapa || ''),
        codCategoria: codCateg,
        categoria:    catNome,
        cliente:      clienteNome,
        clienteRazao: clienteRaz,
        vendedor,
        produto:      prod.descricao || '',
        codigo:       String(prod.codigo_produto || ''),
        qtd:          num(prod.quantidade),
        vlrUnit:      num(prod.valor_unitario),
        valor,
      });
    }
  }

  fs.writeFileSync(path.join(OUT, 'pedidos.json'), JSON.stringify(canonical, null, 2));
  console.log(`\n  ${canonical.length} itens em ${rawPedidos.length} pedidos → data/pedidos.json`);
  console.log('  situações:', JSON.stringify(sitCount));
  const fat = canonical.filter(x => x.situacao === 'Faturado');
  const totFat = fat.reduce((s, x) => s + x.valor, 0);
  console.log(`  Faturado: ${fat.length} itens | R$ ${totFat.toFixed(2)}`);

  console.log('\n=== OK ===');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
