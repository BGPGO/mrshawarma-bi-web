#!/usr/bin/env node
/**
 * Pre-compila JSX → JS minificado em UM unico bundle.
 * Antes: 3 .jsx files transformados em runtime pelo Babel-standalone (~5MB CDN
 * + parse + transform a cada page load → muito lento).
 * Agora: 1 app.bundle.js minificado (~50-100KB), zero runtime.
 *
 * Os .jsx originais usam variaveis globais cross-file (Icon, DATE_RANGES,
 * Sidebar, etc) — nao sao modulos. Estrategia: concatena ordem importa
 * (components.jsx → pages-1.jsx → pages-2.jsx → app.jsx do index.html)
 * e roda esbuild --transform pra resolver tudo em escopo unico.
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const esbuild = require('esbuild');

const ROOT = __dirname;
const SOURCES = [
  'components.jsx',
  'pages-1.jsx',
  'pages-2.jsx',
  'pages-3.jsx',
  'pages-4.jsx',
  'page-dre.jsx',
  'upsell-pages.jsx',
];

// Lê bi.config.js (se existir) pra injetar BI_PAGE_MODE
let pageModes = {};
try {
  const cfg = require(path.join(ROOT, 'bi.config.js'));
  const flat = (obj) => {
    const out = {};
    for (const k of Object.keys(obj || {})) out[k] = obj[k];
    return out;
  };
  pageModes = { ...flat(cfg.pages?.geral), ...flat(cfg.pages?.outros) };
} catch (e) {
  // Sem config — todas as pages ativas (default)
}
// Finalidade das contas bancárias (bi.config > fontes.omie.contas_finalidade).
// A Tesouraria usa pra rotular cada saldo — conta sem rótulo é saldo que o
// cliente não sabe se deve considerar.
let contasFinalidade = {};
try {
  const _f = require(path.join(ROOT, 'bi.config.js')).fontes || {};
  contasFinalidade = _f.f360?.contas_finalidade || _f.omie?.contas_finalidade || {};
} catch (e) {}

// Nome legível da fonte, pra tela não dizer "Omie" num BI que lê F360. Sai do
// adapter declarado no bi.config; sem match, string vazia e a tela omite o nome.
let fonteLabel = '';
try {
  const _ad = (require(path.join(ROOT, 'bi.config.js')).fontes?.adapters || [])[0] || '';
  fonteLabel = { omie: 'Omie', 'omie-multi': 'Omie', f360: 'F360', fin40: 'fin40',
                 nibo: 'NIBO', 'nibo-api': 'NIBO', sienge: 'Sienge', sponte: 'Sponte' }[_ad] || '';
} catch (e) {}

const PAGE_MODE_INJECT = `\n// Injetado por build-jsx.cjs a partir de bi.config.js > pages\nwindow.BI_PAGE_MODE = ${JSON.stringify(pageModes)};\n`
  + `window.BI_CONTAS_FINALIDADE = ${JSON.stringify(contasFinalidade)};\n`
  + `window.BI_FONTE = ${JSON.stringify(fonteLabel)};\n`;

(async () => {
  // Cada .jsx redeclara `const { useState } = React;` no topo (era pra Babel-
  // standalone funcionar com escopo isolado por <script>). Concatenado vira
  // duplicate declaration. Strip e re-injeta uma vez no inicio do bundle.
  const HOIST_HEADER = `\nvar { useState, useEffect, useMemo, useRef, useCallback, useLayoutEffect, Fragment } = React;\n`;
  const stripReactHooks = (src) => src.replace(/^\s*const\s*\{[^}]*\}\s*=\s*React\s*;?\s*$/gm, '');

  const concat = HOIST_HEADER + SOURCES.map((f) => {
    const body = stripReactHooks(fs.readFileSync(path.join(ROOT, f), 'utf8'));
    return `\n/* ===== ${f} ===== */\n${body}`;
  }).join('\n');

  // O App.jsx original esta inline no index.html. Movemos pra ca pra ficar
  // bundlado tambem. SE o operador editar index.html, manter a IIFE de boot.
  const APP_BODY = `
/* ===== App (raiz) ===== */
(function () {
  var useState = React.useState;
  var useEffect = React.useEffect;
  var PAGE_LABELS = {
    overview: '01 Visão geral',
    indicators: '02 Indicadores',
    receita: '03 Receita',
    despesa: '04 Despesa',
    fluxo: '05 Fluxo de caixa',
    tesouraria: '06 Tesouraria',
    comparativo: '07 Comparativo',
    dre: '07 DRE Gerencial',
    orcamento_mensal: '08 Orçamento Mensal',
    relatorio: '09 Relatório IA',
    fluxo_projetado: '09 Fluxo Projetado',
    faturamento_produto: '10 Faturamento por Produto',
    cmv: '10 CMV',
    curva_abc: '11 Curva ABC',
    marketing: '12 Marketing ADS',
    valuation: '13 Valuation',
    hierarquia: '14 Hierarquia ADS',
    detalhado: '15 Detalhado',
    profunda_cliente: '16 Profunda Cliente',
    crm: '17 CRM',
  };
  function App() {
    var p = useState('overview'); var page = p[0], setPage = p[1];
    var f = useState(Object.assign({}, DEFAULT_FILTERS)); var filters = f[0], setFilters = f[1];
    var fo = useState(false); var filtersOpen = fo[0], setFiltersOpen = fo[1];
    var so = useState(false); var sidebarOpen = so[0], setSidebarOpen = so[1];
    var sf = useState(function () {
      try { return localStorage.getItem('bi.statusFilter') || 'realizado'; } catch (e) { return 'realizado'; }
    });
    var statusFilter = sf[0], setStatusFilter = sf[1];
    // Drilldown global: setado quando o usuario clica numa barra/linha de grafico.
    var dd = useState(null);
    var drilldown = dd[0], setDrilldown = dd[1];
    // Year selector: padrao = ano corrente (window.REF_YEAR)
    var ys = useState(function () {
      try { var y = parseInt(localStorage.getItem('bi.year'), 10); return y > 1900 ? y : (window.REF_YEAR || new Date().getFullYear()); } catch (e) { return window.REF_YEAR || new Date().getFullYear(); }
    });
    var year = ys[0], setYear = ys[1];
    var ms = useState(function () {
      try { var m = parseInt(localStorage.getItem('bi.month'), 10); return (m >= 0 && m <= 12) ? m : 0; } catch (e) { return 0; }
    });
    var month = ms[0], setMonth = ms[1];
    var ds = useState(function () {
      try { var d = parseInt(localStorage.getItem('bi.day'), 10); return (d >= 1 && d <= 31) ? d : 0; } catch (e) { return 0; }
    });
    var day = ds[0], setDay = ds[1];
    var dm = useState(function () {
      try { return localStorage.getItem('bi.dayMode') || 'dia'; } catch (e) { return 'dia'; }
    });
    var dayMode = dm[0], setDayMode = dm[1];
    var df = useState(function () {
      try { var d = parseInt(localStorage.getItem('bi.dayFrom'), 10); return (d >= 1 && d <= 31) ? d : 0; } catch (e) { return 0; }
    });
    var dayFrom = df[0], setDayFrom = df[1];
    var dt = useState(function () {
      try { var d = parseInt(localStorage.getItem('bi.dayTo'), 10); return (d >= 1 && d <= 31) ? d : 0; } catch (e) { return 0; }
    });
    var dayTo = dt[0], setDayTo = dt[1];
    var wk = useState(function () {
      try { var w = parseInt(localStorage.getItem('bi.week'), 10); return (w >= 1 && w <= 5) ? w : 0; } catch (e) { return 0; }
    });
    var week = wk[0], setWeek = wk[1];
    var si = useState(function () {
      try { return localStorage.getItem('bi.semInvestimento') === 'true'; } catch (e) { return false; }
    });
    var semInvestimento = si[0], setSemInvestimento = si[1];

    // visao: 'operacional' (default) tira financiamento e socios de
    // receita/despesa/margem; 'completo' devolve tudo. Ver
    // categorias_nao_operacionais no bi.config.js.
    var vs = useState(function () {
      try { return localStorage.getItem('bi.visao') === 'completo' ? 'completo' : 'operacional'; } catch (e) { return 'operacional'; }
    });
    var visao = vs[0], setVisao = vs[1];

    // regime: 'caixa' (default) | 'competencia'. Competencia usa a data de
    // emissao do titulo — conferido contra o relatorio de julho da Silmara.
    var rg = useState(function () {
      try { return localStorage.getItem('bi.regime') === 'competencia' ? 'competencia' : 'caixa'; } catch (e) { return 'caixa'; }
    });
    var regime = rg[0], setRegime = rg[1];

    var fcc = useState([]); var filterCentroCusto = fcc[0], setFilterCentroCusto = fcc[1];
    var fcat = useState([]); var filterCategoria = fcat[0], setFilterCategoria = fcat[1];
    var femp = useState([]); var filterEmpresa = femp[0], setFilterEmpresa = femp[1];
    var fcta = useState([]); var filterConta = fcta[0], setFilterConta = fcta[1];

    // BI export multi-tela: array de page-ids ou null. Quando setado, renderiza
    // todas as telas em sequencia + chama window.print() depois do layout pintar.
    var pp = useState(null); var printPages = pp[0], setPrintPages = pp[1];
    useEffect(function () {
      window.startBiExport = function (pages) {
        document.body.classList.add('bi-print-mode');
        setPrintPages(pages);
      };
      return function () { window.startBiExport = null; };
    }, []);
    useEffect(function () {
      if (!printPages) return;
      var cancelled = false;
      var waitReady = function () {
        // 1) fonts
        var fontsP = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
        // 2) imagens (todas as <img> do bi-print-root tem que ter terminado)
        var imgsP = new Promise(function (resolve) {
          var imgs = Array.prototype.slice.call(document.querySelectorAll('.bi-print-root img'));
          var pending = imgs.filter(function (i) { return !i.complete; });
          if (pending.length === 0) return resolve();
          var done = 0;
          pending.forEach(function (i) {
            var fin = function () { done++; if (done >= pending.length) resolve(); };
            i.addEventListener('load', fin, { once: true });
            i.addEventListener('error', fin, { once: true });
          });
          // safety net
          setTimeout(resolve, 5000);
        });
        // 3) PageRelatorio: se foi incluído no export, esperar até ele renderizar conteudo
        //    (carrega async via fetch). Damos até 30s, polling a cada 200ms.
        var hasRelatorio = printPages.indexOf('relatorio') !== -1;
        var relatorioP = !hasRelatorio ? Promise.resolve() : new Promise(function (resolve) {
          var deadline = Date.now() + 30000;
          var poll = function () {
            if (cancelled) return resolve();
            // Sinal: PageRelatorio renderizou .report-cover OU mensagem de erro/help
            var rendered = document.querySelector('.bi-print-root .report-cover')
              || document.querySelector('.bi-print-root .report');
            if (rendered) return resolve();
            if (Date.now() > deadline) return resolve();
            setTimeout(poll, 200);
          };
          poll();
        });
        Promise.all([fontsP, imgsP, relatorioP]).then(function () {
          if (cancelled) return;
          // 2 frames pra garantir reflow final + 400ms pra layout estabilizar
          requestAnimationFrame(function () {
            requestAnimationFrame(function () {
              setTimeout(function () {
                if (cancelled) return;
                window.print();
                setTimeout(function () {
                  document.body.classList.remove('bi-print-mode');
                  setPrintPages(null);
                }, 800);
              }, 400);
            });
          });
        });
      };
      waitReady();
      return function () { cancelled = true; };
    }, [printPages]);

    useEffect(function () {
      try { localStorage.setItem('bi.statusFilter', statusFilter); } catch (e) {}
      if (typeof window._makeBit === 'function') {
        window.BIT = window._makeBit(statusFilter);
      }
      setDrilldown(null);
    }, [statusFilter]);

    useEffect(function () {
      try { localStorage.setItem('bi.year', String(year)); } catch (e) {}
      setDrilldown(null);
      setDay(0); setDayFrom(0); setDayTo(0); setWeek(0);
    }, [year]);

    useEffect(function () {
      try { localStorage.setItem('bi.month', String(month)); } catch (e) {}
      setDrilldown(null);
      setDay(0); setDayFrom(0); setDayTo(0); setWeek(0);
    }, [month]);

    useEffect(function () {
      try { localStorage.setItem('bi.day', String(day)); } catch (e) {}
    }, [day]);

    useEffect(function () {
      try { localStorage.setItem('bi.dayMode', dayMode); } catch (e) {}
    }, [dayMode]);

    useEffect(function () {
      try { localStorage.setItem('bi.dayFrom', String(dayFrom)); } catch (e) {}
    }, [dayFrom]);

    useEffect(function () {
      try { localStorage.setItem('bi.dayTo', String(dayTo)); } catch (e) {}
    }, [dayTo]);

    useEffect(function () {
      try { localStorage.setItem('bi.week', String(week)); } catch (e) {}
    }, [week]);

    useEffect(function () {
      try { localStorage.setItem('bi.semInvestimento', String(semInvestimento)); } catch (e) {}
    }, [semInvestimento]);

    useEffect(function () {
      try { localStorage.setItem('bi.visao', String(visao)); } catch (e) {}
    }, [visao]);

    useEffect(function () {
      try { localStorage.setItem('bi.regime', String(regime)); } catch (e) {}
    }, [regime]);

    var handleSetPage = function (newPage) {
      setPage(newPage);
      setSidebarOpen(false);
      setDrilldown(null);
      setDay(0); setDayFrom(0); setDayTo(0); setWeek(0);
    };

    var MESES_ABBR_D = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
    var WEEK_RANGES_MAP = [[1,7],[8,14],[15,21],[22,28],[29,31]];
    var effectiveDrilldown;
    if (month > 0) {
      if (dayMode === 'dia' && day > 0) {
        effectiveDrilldown = { type: 'dia', value: day, label: String(day) + ' ' + (MESES_ABBR_D[month - 1] || '') };
      } else if (dayMode === 'intervalo' && dayFrom > 0 && dayTo > 0) {
        effectiveDrilldown = { type: 'dia_range', from: Math.min(dayFrom, dayTo), to: Math.max(dayFrom, dayTo), label: String(dayFrom) + '–' + String(dayTo) + ' ' + (MESES_ABBR_D[month - 1] || '') };
      } else if (dayMode === 'semana' && week > 0) {
        var wr = WEEK_RANGES_MAP[week - 1];
        effectiveDrilldown = { type: 'dia_range', from: wr[0], to: wr[1], label: 'Sem. ' + String(week) + ' ' + (MESES_ABBR_D[month - 1] || '') };
      } else {
        effectiveDrilldown = drilldown;
      }
    } else {
      effectiveDrilldown = drilldown;
    }
    var handleSetDrilldown = function (dd) { setDay(0); setDayFrom(0); setDayTo(0); setWeek(0); setDrilldown(dd); };

    var PAGE_COMPS = {
      overview: PageOverview,
      indicators: PageIndicators,
      receita: PageReceita,
      despesa: PageDespesa,
      fluxo: PageFluxo,
      tesouraria: PageTesouraria,
      comparativo: PageComparativo,
      dre: PageDRE,
      orcamento: PageOrcamento,
      orcamento_mensal: PageOrcamentoMensal,
      relatorio: PageRelatorio,
      fluxo_projetado: PageFluxoProjetado,
      faturamento_produto: PageFaturamentoProduto,
      cmv: PageCMV,
      curva_abc: PageCurvaABC,
      marketing: PageMarketing,
      valuation: PageValuation,
      hierarquia: PageHierarquia,
      detalhado: PageDetalhado,
      profunda_cliente: PageProfundaCliente,
      crm: PageCRM,
    };
    // Modo da page atual: 'active' (default), 'upsell' (mostra UpsellPage), 'hidden' (não renderiza)
    var pageMode = (window.BI_PAGE_MODE && window.BI_PAGE_MODE[page]) || 'active';
    var PageComp = (pageMode === 'upsell' && window.UpsellPage)
      ? function (props) { return React.createElement(window.UpsellPage, { pageId: page }); }
      : PAGE_COMPS[page];

    var PAGES_WITH_INVESTIMENTO = ['overview', 'despesa', 'fluxo', 'tesouraria', 'comparativo'];
    // extraFilters agora carrega tambem a visao (Operacional | Completo), e por
    // isso esta memoizado: antes era objeto literal criado a cada render, o que
    // invalidava o useMemo de TODA page em todo render sempre que houvesse
    // filtro ativo. Com a visao ele passaria a ser sempre definido, e o
    // recalculo viraria constante. As deps sao primitivas + as tres listas.
    var extraFilters = useMemo(function () {
      var temFiltro = filterCentroCusto.length > 0 || filterCategoria.length > 0
        || filterEmpresa.length > 0 || filterConta.length > 0;
      if (!temFiltro && visao === 'operacional' && regime === 'caixa') return undefined;  // default: nada a passar
      return {
        centroCusto: filterCentroCusto,
        categoria: filterCategoria,
        empresa: filterEmpresa,
        conta: filterConta,
        visao: visao,
        regime: regime,
      };
    }, [filterCentroCusto, filterCategoria, filterEmpresa, filterConta, visao, regime]);

    var commonProps = {
      filters: filters,
      setFilters: setFilters,
      onOpenFilters: function () { setFiltersOpen(true); },
      statusFilter: statusFilter,
      year: year,
      setYear: setYear,
      month: month,
      setMonth: setMonth,
      drilldown: effectiveDrilldown,
      setDrilldown: handleSetDrilldown,
      semInvestimento: semInvestimento,
      extraFilters: extraFilters,
    };

    // Modo print multi-tela: renderiza todas as paginas selecionadas em sequencia
    if (printPages && printPages.length > 0) {
      return (
        <div className="app bi-print-root">
          {printPages.map(function (id, i) {
            var Comp = PAGE_COMPS[id];
            if (!Comp) return null;
            return (
              <div key={id + '-' + i} className="bi-print-page">
                <div className="bi-print-header">
                  <img src="assets/bgp-logo-white.png" alt="BGP" className="bi-print-logo" />
                  <div className="bi-print-title">
                    <div className="bi-print-pagenum">{PAGE_LABELS[id] || id}</div>
                    <div className="bi-print-brand">BI Financeiro</div>
                  </div>
                </div>
                <Comp {...commonProps} />
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className={'app ' + (sidebarOpen ? 'sidebar-open' : '')} data-screen-label={PAGE_LABELS[page]}>
        <Sidebar active={page} onSelect={handleSetPage} open={sidebarOpen} />
        <div className="sidebar-backdrop" onClick={function () { setSidebarOpen(false); }} />
        <div className="main">
          <Header
            page={page}
            onToggleSidebar={function () { setSidebarOpen(function (o) { return !o; }); }}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            year={year}
            setYear={setYear}
            month={month}
            setMonth={setMonth}
            dayMode={dayMode}
            setDayMode={setDayMode}
            day={day}
            setDay={setDay}
            dayFrom={dayFrom}
            setDayFrom={setDayFrom}
            dayTo={dayTo}
            setDayTo={setDayTo}
            week={week}
            setWeek={setWeek}
            visao={visao}
            setVisao={setVisao}
            regime={regime}
            setRegime={setRegime}
            filterConta={filterConta}
            setFilterConta={setFilterConta}
            semInvestimento={semInvestimento}
            setSemInvestimento={PAGES_WITH_INVESTIMENTO.indexOf(page) !== -1 ? setSemInvestimento : null}
            filterCentroCusto={filterCentroCusto}
            setFilterCentroCusto={setFilterCentroCusto}
            filterCategoria={filterCategoria}
            setFilterCategoria={setFilterCategoria}
            filterEmpresa={filterEmpresa}
            setFilterEmpresa={setFilterEmpresa}
          />
          <PageComp {...commonProps} />
        </div>
        <FiltersDrawer open={filtersOpen} onClose={function () { setFiltersOpen(false); }} filters={filters} setFilters={setFilters} />
      </div>
    );
  }
  ReactDOM.createRoot(document.getElementById('root')).render(<App />);
})();
`;

  const finalSource = PAGE_MODE_INJECT + concat + '\n' + APP_BODY;

  const result = await esbuild.transform(finalSource, {
    loader: 'jsx',
    jsx: 'transform',
    minify: true,
    target: ['es2017'],
  });

  const out = path.join(ROOT, 'app.bundle.js');
  fs.writeFileSync(out, result.code);
  const sizeKB = (result.code.length / 1024).toFixed(1);
  console.log(`OK app.bundle.js (${sizeKB} KB) — concat de ${SOURCES.length} .jsx + App raiz`);
})().catch((e) => { console.error('ERR:', e.message); process.exit(1); });
