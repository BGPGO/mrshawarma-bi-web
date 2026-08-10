#!/usr/bin/env node
/**
 * fetch-saldos.cjs — Fluxo de Caixa Projetado (multi-conta Omie)
 *
 * Saída: data/saldos.json
 *   totais[]   — saldoFinal diário somado de todas as contas
 *   contas[]   — por conta: rows[] + movimentos[]
 *
 * Suporta múltiplas contas Omie via bi.config.js > fontes.omie.contas[]
 * Exclui contas internas (Caixinha, Previsão, Adiantamento, Omie.CASH)
 */
'use strict';

const fs   = require('node:fs');
const path = require('node:path');

try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch (e) {}

const BASE  = 'https://app.omie.com.br/api/v1';
const OUT   = path.join(__dirname, 'data');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Contas a EXCLUIR (internas, não são banco real)
const EXCLUIR_RE = /caixinha|previs[aã]o|adiantamento|omie\.cash/i;

fs.mkdirSync(OUT, { recursive: true });

// Resolve contas Omie do config
let cfg;
try { cfg = require('./bi.config.js'); } catch (e) { console.error('ERR: bi.config.js'); process.exit(1); }
const omie = cfg.fontes && cfg.fontes.omie;
const contasOmie = (omie && omie.contas && Array.isArray(omie.contas))
  ? omie.contas.map(c => ({
      label: c.label,
      appKey: process.env[c.app_key_env],
      appSecret: process.env[c.app_secret_env],
    }))
  : [{
      label: 'Principal',
      appKey: process.env.OMIE_APP_KEY || process.env.OMIE_APP_KEY_MATRIZ,
      appSecret: process.env.OMIE_APP_SECRET || process.env.OMIE_APP_SECRET_MATRIZ,
    }];

function makeCall(appKey, appSecret) {
  return async function call(endpoint, method, params, retries = 6) {
    const body = JSON.stringify({ call: method, app_key: appKey, app_secret: appSecret, param: [params] });
    let res;
    try {
      res = await fetch(`${BASE}${endpoint}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
    } catch (e) {
      if (retries > 0) { await sleep(2000); return call(endpoint, method, params, retries - 1); }
      throw e;
    }
    const j = await res.json();
    if (j.faultstring) {
      const transient = /consumo|excedido|simult|busy|timeout|503|502|504/i.test(j.faultstring);
      if (transient && retries > 0) {
        await sleep(Math.min(20000, 2000 * (7 - retries)));
        return call(endpoint, method, params, retries - 1);
      }
      throw new Error(`${method}: ${j.faultstring}`);
    }
    return j;
  };
}

function toOmieDate(d) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function fromOmieDate(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
}

function isoDate(d) {
  if (!d) return null;
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

(async () => {
  const hoje      = new Date();
  hoje.setHours(0, 0, 0, 0);
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const fimProj   = new Date(hoje.getFullYear(), hoje.getMonth() + 12, 0);

  console.log(`\n=== fetch-saldos.cjs (SubSea multi-conta) ===`);
  console.log(`  Período: ${toOmieDate(inicioMes)} → ${toOmieDate(fimProj)}`);
  console.log(`  Contas Omie: ${contasOmie.map(c => c.label).join(', ')}`);

  const porDiaTotal  = new Map();
  const contasOutput = [];

  for (const contaOmie of contasOmie) {
    console.log(`\n--- ${contaOmie.label} ---`);
    const call = makeCall(contaOmie.appKey, contaOmie.appSecret);

    // 1. Contas correntes
    let ccList;
    try {
      const ccResp = await call('/geral/contacorrente/', 'ListarContasCorrentes', {
        pagina: 1, registros_por_pagina: 100, apenas_importado_api: 'N',
      });
      ccList = (ccResp.ListarContasCorrentes || []).filter(c => c.inativo !== 'S' && !EXCLUIR_RE.test(c.descricao || c.cDesc || ''));
    } catch (e) {
      console.error(`  ERR listando contas: ${e.message.slice(0, 80)}`);
      continue;
    }

    console.log(`  ${ccList.length} contas bancárias (excluídas internas)`);
    ccList.forEach(c => console.log(`    [${c.nCodCC}] ${c.descricao || c.cDesc}`));

    // 2. Extrato por conta
    for (const cc of ccList) {
      const nome = `${cc.descricao || cc.cDesc} (${contaOmie.label})`;
      let movs;
      try {
        const extrato = await call('/financas/extrato/', 'ListarExtrato', {
          nCodCC: cc.nCodCC,
          cCodIntCC: '',
          dPeriodoInicial: toOmieDate(inicioMes),
          dPeriodoFinal:   toOmieDate(fimProj),
        });
        movs = extrato.listaMovimentos || [];
        await sleep(300);
      } catch (e) {
        console.warn(`    SKIP ${nome}: ${e.message.slice(0, 80)}`);
        continue;
      }

      console.log(`    ${nome}: ${movs.length} movimentos`);

      const saldosDia  = new Map();
      const movimentos = [];
      let   ultimoSaldoHist = 0;
      let   postSaldoAccum  = 0;

      movs.forEach((row) => {
        const dt = fromOmieDate(row.dDataLancamento);
        if (!dt) return;

        const isSaldoRow    = row.cDesCliente === 'SALDO';
        const isSaldoAntRow = row.cDesCliente === 'SALDO ANTERIOR';

        if (isSaldoRow || isSaldoAntRow) {
          if (dt < hoje) {
            ultimoSaldoHist = parseFloat(row.nSaldo) || 0;
            postSaldoAccum  = 0;
          } else if (isSaldoRow) {
            const saldoCorr = parseFloat(row.nSaldo) || 0;
            const iso = isoDate(dt);
            saldosDia.set(iso, saldoCorr);
            porDiaTotal.set(iso, (porDiaTotal.get(iso) || 0) + saldoCorr);
          }
        } else {
          if (dt < hoje) {
            postSaldoAccum += parseFloat(row.nValorDocumento) || 0;
            return;
          }
          const valor = parseFloat(row.nValorDocumento) || 0;
          if (valor === 0) return;
          movimentos.push({
            data:       isoDate(dt),
            descricao:  row.cDesCliente || '',
            categoria:  row.cOrigem || '',
            codCateg:   row.cCodCategoria || '',
            desCateg:   row.cDesCategoria || '',
            valor,
          });
        }
      });

      ultimoSaldoHist += postSaldoAccum;

      const sorted = Array.from(saldosDia.entries()).sort(([a], [b]) => a.localeCompare(b));
      const rows = sorted.map(([iso, saldoFinal], i) => {
        const si = i === 0 ? ultimoSaldoHist : sorted[i - 1][1];
        return { data: iso, saldoInicial: si, valorLiquidoDia: saldoFinal - si, saldoFinal };
      });

      movimentos.sort((a, b) => a.data.localeCompare(b.data));

      if (rows.length > 0 || movimentos.length > 0) {
        contasOutput.push({
          nCodCC:    cc.nCodCC,
          descricao: nome,
          rows,
          movimentos,
          _anchor:   ultimoSaldoHist,
        });
        console.log(`      → ${rows.length} dias projetados, ${movimentos.length} movimentos futuros`);
      }
    }
  }

  // Totais consolidados
  const totalAnchor   = contasOutput.reduce((s, c) => s + (c._anchor || 0), 0);
  const diasOrdenados = Array.from(porDiaTotal.entries()).sort(([a], [b]) => a.localeCompare(b));
  const totais = diasOrdenados.map(([iso, saldoFinal], i) => {
    const si = i === 0 ? totalAnchor : diasOrdenados[i - 1][1];
    return { data: iso, saldoInicial: si, valorLiquidoDia: saldoFinal - si, saldoFinal };
  });

  contasOutput.forEach((c) => delete c._anchor);

  console.log(`\n  Totais: ${totais.length} dias (${totais[0]?.data || '—'} → ${totais[totais.length - 1]?.data || '—'})`);
  console.log(`  Contas com dados: ${contasOutput.length}`);

  const output = { totais, contas: contasOutput, updatedAt: new Date().toISOString() };
  fs.writeFileSync(path.join(OUT, 'saldos.json'), JSON.stringify(output, null, 2));
  console.log(`\n=== OK → data/saldos.json (${totais.length} dias, ${contasOutput.length} contas) ===`);
})().catch((e) => { console.error('FATAL:', e.message); process.exit(1); });
