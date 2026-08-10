/**
 * Adapter: Omie ERP (multi-conta)
 *
 * Suporta uma conta única (env OMIE_APP_KEY/OMIE_APP_SECRET) OU múltiplas contas
 * via config.fontes.omie.contas[]. Cada conta é puxada separadamente e cada
 * movimento raw recebe o campo _empresa com o label da conta.
 *
 * Configuração multi-conta em bi.config.js:
 *   fontes: {
 *     adapters: ["omie"],
 *     omie: {
 *       contas: [
 *         { label: "Matriz", app_key_env: "OMIE_APP_KEY_MATRIZ", app_secret_env: "OMIE_APP_SECRET_MATRIZ" },
 *         { label: "Filial", app_key_env: "OMIE_APP_KEY_FILIAL", app_secret_env: "OMIE_APP_SECRET_FILIAL" },
 *       ],
 *       bancos_ok: [],
 *     }
 *   }
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://app.omie.com.br/api/v1';
const PAGE_SIZE = 500;
const PAGE_DELAY_MS = 200;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeApiCaller(appKey, appSecret) {
  async function call(p, method, params, retries = 8) {
    const body = JSON.stringify({ call: method, app_key: appKey, app_secret: appSecret, param: [params] });
    let res;
    try {
      res = await fetch(`${BASE}${p}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    } catch (netErr) {
      if (retries > 0) {
        await sleep(Math.min(30000, 2000 * (9 - retries)));
        return call(p, method, params, retries - 1);
      }
      throw netErr;
    }
    let j;
    try { j = await res.json(); }
    catch (e) {
      if (retries > 0) { await sleep(2000); return call(p, method, params, retries - 1); }
      throw new Error(`${method}: bad JSON (${res.status})`);
    }
    if (j.faultstring) {
      const transient = /Consumo|consumo|excedido|simultaneas|simult|Many|busy|Broken response|Application Server|BG|temporariamente|gateway|timeout|503|502|504|SOAP-ERROR/i.test(j.faultstring);
      if (transient && retries > 0) {
        await sleep(Math.min(30000, 2000 * (9 - retries)));
        return call(p, method, params, retries - 1);
      }
      throw new Error(`${method}: ${j.faultstring}`);
    }
    return j;
  }
  return call;
}

function makePaginatedFetcher(call, dataDir) {
  return async function fetchAllPaginated(apiPath, method, baseParam, dataKey, label, opts) {
    const cacheDir = path.join(dataDir, '_cache', label);
    fs.mkdirSync(cacheDir, { recursive: true });
    const pageFile = (n) => path.join(cacheDir, `page-${String(n).padStart(5, '0')}.json`);
    const readCachedPage = (n) => {
      try { return JSON.parse(fs.readFileSync(pageFile(n), 'utf8')); } catch { return null; }
    };
    const writePage = (n, arr) => fs.writeFileSync(pageFile(n), JSON.stringify(arr));
    const style = (opts && opts.style) || 'snake';
    const buildParams = (page, size) => style === 'camel'
      ? { ...baseParam, nPagina: page, nRegPorPagina: size }
      : { ...baseParam, pagina: page, registros_por_pagina: size };
    const readMeta = (resp) => style === 'camel'
      ? { total: resp.nTotRegistros, pages: resp.nTotPaginas }
      : { total: resp.total_de_registros, pages: resp.total_de_paginas };

    const first = await call(apiPath, method, buildParams(1, PAGE_SIZE));
    const meta = readMeta(first);
    const totalPages = meta.pages || 1;
    writePage(1, first[dataKey] || []);
    console.log(`  [${label}] ${meta.total || 0} registros em ${totalPages} paginas`);

    let failed = 0;
    for (let p = 2; p <= totalPages; p++) {
      let arr = readCachedPage(p);
      if (!arr) {
        await sleep(PAGE_DELAY_MS);
        try {
          const r = await call(apiPath, method, buildParams(p, PAGE_SIZE));
          arr = r[dataKey] || [];
          writePage(p, arr);
        } catch (e) {
          failed++;
          console.error(`\n  [${label}] pag ${p} FAIL: ${e.message.slice(0, 80)}`);
          if (failed > 50) break;
          continue;
        }
      }
      if (p % 10 === 0 || p === totalPages) process.stdout.write(`  [${label}] pag ${p}/${totalPages}\r`);
    }

    const all = [];
    for (let p = 1; p <= totalPages; p++) {
      all.push(...(readCachedPage(p) || []));
    }
    console.log(`  [${label}] OK ${all.length} registros                              `);
    return all;
  };
}

async function pullSingleAccount(call, fetchAllPaginated, dataDir, empresaLabel) {
  console.log(`\n--- Puxando conta: ${empresaLabel} ---`);

  const empresas = await call('/geral/empresas/', 'ListarEmpresas', { pagina: 1, registros_por_pagina: 50, apenas_importado_api: 'N' });
  const empresa = empresas.empresas_cadastro?.[0] || null;
  console.log(`  Empresa: ${empresa?.nome_fantasia || '(sem nome)'}`);

  const [categoriasRaw, departamentosRaw] = await Promise.all([
    fetchAllPaginated('/geral/categorias/', 'ListarCategorias', {}, 'categoria_cadastro', 'categorias'),
    fetchAllPaginated('/geral/depart/', 'ListarDepartamentos', {}, 'departamentos', 'departamentos'),
  ]);

  const clientes = await fetchAllPaginated('/geral/clientes/', 'ListarClientes', {}, 'clientes_cadastro', 'clientes');

  const contasCorrentes = await fetchAllPaginated(
    '/geral/contacorrente/', 'ListarContasCorrentes', {}, 'ListarContasCorrentes', 'contas_correntes'
  ).catch(() => []);

  let movimentosOmie = [];
  try {
    movimentosOmie = await fetchAllPaginated(
      '/financas/mf/', 'ListarMovimentos', { cExibirDepartamentos: 'S' }, 'movimentos', 'movimentos', { style: 'camel' }
    );
  } catch (e) {
    console.error('  movs erro:', e.message);
  }

  // Taguear cada movimento raw com _empresa
  for (const m of movimentosOmie) {
    m._empresa = empresaLabel;
  }

  let projetosRaw = [];
  try {
    projetosRaw = await fetchAllPaginated(
      '/geral/projetos/', 'ListarProjetos', {}, 'cadastro', 'projetos'
    );
  } catch (e) {
    console.error('  projetos erro:', e.message);
  }

  let pedidosRaw = [];
  try {
    pedidosRaw = await fetchAllPaginated(
      '/produtos/pedido/', 'ListarPedidos',
      { cStatus: 'FATURADO' },
      'pedido_venda_produto',
      'pedidos',
      { style: 'camel' }
    );
  } catch (e) {
    console.error('  pedidos erro:', e.message);
  }

  const dt = (s) => s ? s.split('/').reverse().join('-') : null;
  const pedidosCanonical = [];
  for (const ped of pedidosRaw) {
    const cab = ped.cabecalho || {};
    const info = ped.informacoes_adicionais || {};
    const status = (cab.cCodStatus || '').toUpperCase();
    if (status !== 'FATURADO') continue;
    const itens = Array.isArray(ped.det) ? ped.det : [];
    for (const det of itens) {
      const prod = det.produto || {};
      pedidosCanonical.push({
        nCodPed:    cab.nCodPed || '',
        data:       dt(cab.dDtPedido) || '',
        status,
        cliente:    info.cNomRazSocial || cab.cNomCliente || '',
        vendedor:   info.cCodVendedor  || info.cVendedor  || '',
        produto:    prod.cDescricao    || prod.cDescrProduto || '',
        familia:    prod.cNomFamProd   || 'Sem Família',
        codigo:     prod.cCodProduto   || '',
        qtd:        Number(prod.nQtdPedido    || 0),
        vlrUnit:    Number(prod.nVlrUnitario  || 0),
        valor:      Number(prod.nVlrTotal     || prod.nValorTotal || 0),
        empresa:    empresaLabel,
      });
    }
  }

  return {
    empresa,
    categoriasRaw,
    departamentosRaw,
    clientes,
    contasCorrentes,
    movimentosOmie,
    pedidosCanonical,
    projetosRaw,
  };
}

module.exports = {
  id: 'omie',
  label: 'Omie ERP',
  required_env: [],

  validate(config) {
    const errors = [];
    if (!config.fontes || !config.fontes.omie) {
      errors.push('config.fontes.omie não definido');
      return { ok: false, errors };
    }
    const omie = config.fontes.omie;
    if (omie.contas && Array.isArray(omie.contas)) {
      for (const conta of omie.contas) {
        const key = process.env[conta.app_key_env];
        const secret = process.env[conta.app_secret_env];
        if (!key) errors.push(`env ${conta.app_key_env} não definido (conta ${conta.label})`);
        if (!secret) errors.push(`env ${conta.app_secret_env} não definido (conta ${conta.label})`);
      }
    } else {
      if (!process.env.OMIE_APP_KEY) errors.push('env OMIE_APP_KEY não definido');
      if (!process.env.OMIE_APP_SECRET) errors.push('env OMIE_APP_SECRET não definido');
    }
    return { ok: errors.length === 0, errors };
  },

  async pull(config, dataDir) {
    fs.mkdirSync(dataDir, { recursive: true });
    const omie = config.fontes.omie;

    // Resolve lista de contas (multi ou single)
    const contas = (omie.contas && Array.isArray(omie.contas))
      ? omie.contas.map(c => ({
          label: c.label,
          appKey: process.env[c.app_key_env],
          appSecret: process.env[c.app_secret_env],
        }))
      : [{
          label: 'Principal',
          appKey: process.env.OMIE_APP_KEY,
          appSecret: process.env.OMIE_APP_SECRET,
        }];

    console.log(`=== Omie pull (${contas.length} conta(s): ${contas.map(c => c.label).join(', ')}) ===`);

    // Pull cada conta sequencialmente (Omie tem rate limit por app_key)
    const allResults = [];
    for (const conta of contas) {
      const contaDir = contas.length > 1 ? path.join(dataDir, conta.label.toLowerCase().replace(/\s+/g, '_')) : dataDir;
      fs.mkdirSync(contaDir, { recursive: true });
      const call = makeApiCaller(conta.appKey, conta.appSecret);
      const fetchPag = makePaginatedFetcher(call, contaDir);
      const result = await pullSingleAccount(call, fetchPag, contaDir, conta.label);
      allResults.push(result);
    }

    // Merge dados de todas as contas
    const mergedEmpresa = allResults.map(r => ({
      ...(r.empresa || {}),
      _conta: r.movimentosOmie[0]?._empresa || 'Principal',
    }));
    const mergedCategorias = [];
    const mergedDepartamentos = [];
    const mergedClientes = [];
    const mergedContasCorrentes = [];
    const mergedMovimentos = [];
    const mergedPedidos = [];
    const mergedProjetos = [];

    const seenCat = new Set();
    const seenDept = new Set();

    for (const r of allResults) {
      for (const c of r.categoriasRaw) {
        const k = c.codigo;
        if (!seenCat.has(k)) { seenCat.add(k); mergedCategorias.push(c); }
      }
      for (const d of r.departamentosRaw) {
        const k = d.codigo;
        if (!seenDept.has(k)) { seenDept.add(k); mergedDepartamentos.push(d); }
      }
      mergedClientes.push(...r.clientes);
      mergedContasCorrentes.push(...r.contasCorrentes);
      mergedMovimentos.push(...r.movimentosOmie);
      mergedPedidos.push(...r.pedidosCanonical);
      mergedProjetos.push(...r.projetosRaw);
    }

    // Escreve arquivos merged
    fs.writeFileSync(path.join(dataDir, 'empresa.json'), JSON.stringify(mergedEmpresa, null, 2));
    fs.writeFileSync(path.join(dataDir, 'categorias.json'), JSON.stringify(mergedCategorias, null, 2));
    fs.writeFileSync(path.join(dataDir, 'departamentos.json'), JSON.stringify(mergedDepartamentos, null, 2));
    fs.writeFileSync(path.join(dataDir, 'clientes.json'), JSON.stringify(mergedClientes, null, 2));
    fs.writeFileSync(path.join(dataDir, 'contas_correntes.json'), JSON.stringify(mergedContasCorrentes, null, 2));
    fs.writeFileSync(path.join(dataDir, 'pedidos.json'), JSON.stringify(mergedPedidos, null, 2));
    fs.writeFileSync(path.join(dataDir, 'projetos.json'), JSON.stringify(mergedProjetos, null, 2));

    // Mapas pra canonical
    const catMap = new Map(mergedCategorias.map(c => [c.codigo, c.descricao]));
    const deptMap = new Map(mergedDepartamentos.map(d => [d.codigo, d.descricao]));
    const cliMap = new Map(mergedClientes.map(c => [c.codigo_cliente_omie, c.nome_fantasia || c.razao_social]));
    const ccMap = new Map(mergedContasCorrentes.map(cc => [cc.nCodCC, { nome: cc.cDesc, banco: cc.cCodCC || '', codigo_banco: (cc.cCodBanco || '').padStart(3, '0') }]));

    const movimentosCanonical = [];
    for (const m of mergedMovimentos) {
      const det = m.detalhes || {};
      const res = m.resumo || {};
      const dept = (m.departamentos && m.departamentos[0]) || {};
      const status = (det.cStatus || '').toUpperCase();
      const realizado = status === 'PAGO' || status === 'RECEBIDO';
      const cc = ccMap.get(det.nCodCC) || {};
      const dtFn = (s) => s ? s.split('/').reverse().join('-') : null;
      movimentosCanonical.push({
        id: String(det.nCodTitulo || m.nCodTitulo || ''),
        fonte: 'omie',
        empresa: m._empresa || 'Principal',
        natureza: det.cNatureza === 'R' ? 'R' : 'P',
        status: status,
        realizado,
        data_emissao: dtFn(det.dDtEmissao),
        data_vencimento: dtFn(det.dDtVenc),
        data_pagamento: dtFn(det.dDtPagamento),
        valor_total: Number(det.nValorTitulo || res.nValPago || 0),
        valor_pago: Number(res.nValPago || 0),
        valor_aberto: Number(res.nValAberto || 0),
        categoria: catMap.get(det.cCodCategoria) || det.cCodCategoria || '',
        centro_custo: deptMap.get(dept.cCodDepartamento) || '',
        cliente: cliMap.get(det.nCodCliente) || '',
        conta_corrente: cc.nome || '',
        codigo_banco: cc.codigo_banco || '',
        observacao: det.cObs || '',
        tags: [],
      });
    }

    fs.writeFileSync(path.join(dataDir, 'movimentos.json'), JSON.stringify(mergedMovimentos, null, 2));
    fs.writeFileSync(path.join(dataDir, 'movimentos_canonical.json'), JSON.stringify(movimentosCanonical, null, 2));
    fs.writeFileSync(path.join(dataDir, '_summary.json'), JSON.stringify({
      adapter: 'omie',
      timestamp: new Date().toISOString(),
      contas: contas.map(c => c.label),
      records: movimentosCanonical.length,
      counts: {
        movimentos: movimentosCanonical.length,
        categorias: mergedCategorias.length,
        departamentos: mergedDepartamentos.length,
        clientes: mergedClientes.length,
        contas_correntes: mergedContasCorrentes.length,
        pedidos_itens: mergedPedidos.length,
      },
    }, null, 2));

    console.log(`\n=== Omie OK: ${movimentosCanonical.length} movimentos canonical (${contas.length} contas) ===`);
    return { fetched: movimentosCanonical.length, summary: { adapter: 'omie', records: movimentosCanonical.length } };
  },
};
