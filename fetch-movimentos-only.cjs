#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
try { require('dotenv').config({ path: path.join(__dirname, '.env') }); } catch {}
const APP_KEY = process.env.OMIE_APP_KEY;
const APP_SECRET = process.env.OMIE_APP_SECRET;
const OUT = path.join(__dirname, 'data');
const PAGE_SIZE = 500;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function call(method, params, retries = 20) {
  const body = JSON.stringify({ call: method, app_key: APP_KEY, app_secret: APP_SECRET, param: [params] });
  const res = await fetch('https://app.omie.com.br/api/v1/financas/mf/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
  const j = await res.json();
  if (j.faultstring) {
    if (retries > 0) {
      const wait = /REDUNDANT|Aguarde\s+(\d+)/.test(j.faultstring) ? 60000 : 90000;
      console.log(`  retry in ${wait/1000}s (${retries} left): ${j.faultstring.slice(0,80)}`);
      await sleep(wait);
      return call(method, params, retries - 1);
    }
    throw new Error(j.faultstring);
  }
  return j;
}

(async () => {
  console.log('=== Fetch movimentos only ===');
  const first = await call('ListarMovimentos', { nPagina: 1, nRegPorPagina: PAGE_SIZE, cExibirDepartamentos: 'S' });
  const total = first.nTotRegistros;
  const pages = Math.ceil(total / PAGE_SIZE);
  console.log(`Total: ${total} registros, ${pages} paginas`);

  const all = [...(first.movimentos || [])];
  console.log(`  pag 1/${pages} (${all.length})`);

  for (let p = 2; p <= pages; p++) {
    await sleep(500);
    const r = await call('ListarMovimentos', { nPagina: p, nRegPorPagina: PAGE_SIZE, cExibirDepartamentos: 'S' });
    const movs = r.movimentos || [];
    all.push(...movs);
    if (p % 10 === 0 || p === pages) console.log(`  pag ${p}/${pages} (${all.length} total)`);
  }

  fs.writeFileSync(path.join(OUT, 'movimentos.json'), JSON.stringify(all, null, 2));
  console.log(`=== OK: ${all.length} movimentos salvos ===`);
})();
