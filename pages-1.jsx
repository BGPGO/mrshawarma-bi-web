/* BIT/BGP Finance — Pages 1: Overview, Indicators, Receita, Despesa */
const { useState, useEffect } = React;

// Hook responsivo: detecta viewport mobile (<= 600px). Usado para ajustar SVGs com
// preserveAspectRatio="none" cujas coords sao plotadas em px absolutos.
const useIsMobile = (breakpoint = 600) => {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= breakpoint : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);
  return isMobile;
};

const RangePills = ({ value, onChange }) => {
  const opts = ["7D", "30D", "90D", "YTD", "12M"];
  return (
    <div className="range-pills">
      {opts.map(o => (
        <button key={o} className={value === o ? "active" : ""} onClick={() => onChange(o)}>{o}</button>
      ))}
    </div>
  );
};

// Section heading — kept as a thin alias so all card titles share the standardized style
const SectionHeading = ({ strong, soft }) => (
  <h2 className="card-title">{[strong, soft].filter(Boolean).join(" ")}</h2>
);

// Side-by-side monthly bars (Receita green / Despesa red) with floating value chips
const OverviewBars = ({ data, height = 220, year = "2026", onBarClick, activeIdx }) => {
  const B = window.BIT;
  const max = Math.max(...data.map(d => Math.max(d.receita, d.despesa)), 1);
  // Dynamic tick step: target ~4-5 ticks regardless of magnitude
  const rawStep = max / 4;
  const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const nice = [1, 2, 2.5, 5, 10].find(n => n * mag >= rawStep) * mag;
  const step = Math.max(nice, 100000);
  const niceMax = Math.max(Math.ceil(max / step) * step, step);
  const ticks = [];
  for (let v = 0; v <= niceMax; v += step) ticks.push(v);
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1, 3);
  const hasActive = activeIdx != null && activeIdx >= 0;
  const fmtShort = (v) => `R$${Math.round(v).toLocaleString("pt-BR")}`;

  return (
    <div className="ov-bars">
      <div className="ov-bars-plot" style={{ height }}>
        <div className="ov-bars-axis">
          {ticks.map((t, i) => (
            <div key={i} className="ov-bars-tick" style={{ bottom: `${(t / niceMax) * 100}%` }}>
              <span>{fmtShort(t)}</span>
            </div>
          ))}
        </div>
        <div className="ov-bars-cols">
          {data.map((d, i) => {
            const rH = (d.receita / niceMax) * 100;
            const dH = (d.despesa / niceMax) * 100;
            const cls = "ov-bar-col" + (onBarClick ? " clickable" : "") +
              (hasActive && i === activeIdx ? " active" : "") +
              (hasActive && i !== activeIdx ? " dimmed" : "");
            return (
              <div key={i} className={cls}
                onClick={onBarClick ? () => onBarClick(d, i) : undefined}
                style={onBarClick ? { cursor: "pointer" } : undefined}
              >
                <div className="ov-bar-stack">
                  <div className="ov-bar green" style={{ height: `${rH}%` }} title={`Receita: ${B.fmt(d.receita)}`}>
                    <span className="ov-bar-chip">{fmtShort(d.receita)}</span>
                  </div>
                  <div className="ov-bar red" style={{ height: `${dH}%` }} title={`Despesa: ${B.fmt(d.despesa)}`}>
                    <span className="ov-bar-chip">{fmtShort(d.despesa)}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="ov-bars-x">
        {data.map((d, i) => <span key={i}>{cap(d.m)}</span>)}
      </div>
      <div className="ov-bars-year"><span>{year}</span></div>
    </div>
  );
};

// Diverging line chart — line + zero baseline + value labels above/below points
const IndicatorLine = ({ values, labels, height = 240, color = "var(--cyan)", format }) => {
  // No mobile reduzimos o viewBox horizontal (1100 -> 600) e a altura (240 -> 180).
  // Como preserveAspectRatio="none" estica o conteudo pra preencher a largura do container,
  // um viewBox mais estreito faz os pontos plotados em px absolutos ficarem espacados
  // de forma proporcional ao espaco disponivel no mobile (~326px), evitando o achatamento.
  const isMobile = useIsMobile();
  const w = isMobile ? 600 : 1100;
  const h = isMobile ? 180 : height;
  const padX = isMobile ? 28 : 50;
  const padTop = isMobile ? 28 : 36;
  const padBottom = isMobile ? 28 : 36;
  const min = Math.min(0, ...values);
  const max = Math.max(0, ...values);
  const range = max - min || 1;

  const stepX = (w - padX * 2) / (values.length - 1);
  const xOf = (i) => padX + i * stepX;
  const yOf = (v) => padTop + (1 - (v - min) / range) * (h - padTop - padBottom);

  const pts = values.map((v, i) => [xOf(i), yOf(v)]);
  const curve = (p) => {
    let d = `M ${p[0][0]} ${p[0][1]}`;
    for (let i = 1; i < p.length; i++) {
      const [x0, y0] = p[i - 1];
      const [x1, y1] = p[i];
      const cx = (x0 + x1) / 2;
      d += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return d;
  };
  const path = curve(pts);
  const zeroY = yOf(0);
  const fmt = format || ((v) => window.BIT.fmt(v));

  // Em mobile, mostramos label de valor Y apenas nos pontos extremos
  // (primeiro, ultimo, max, min) pra evitar amassamento sobre a curva.
  const labelIdxSet = (() => {
    if (!isMobile || values.length <= 4) return null;
    let maxI = 0, minI = 0;
    for (let i = 1; i < values.length; i++) {
      if (values[i] > values[maxI]) maxI = i;
      if (values[i] < values[minI]) minI = i;
    }
    return new Set([0, values.length - 1, maxI, minI]);
  })();

  return (
    <svg className="ind-line" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: "100%", height: h }}>
      <defs>
        <linearGradient id="ind-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      <line x1={padX} y1={zeroY} x2={w - padX} y2={zeroY} stroke="rgba(255,255,255,0.18)" strokeDasharray="6 5" strokeWidth="1"/>
      <path d={`${path} L ${pts[pts.length - 1][0]} ${zeroY} L ${pts[0][0]} ${zeroY} Z`} fill="url(#ind-grad)" />
      <path d={path} fill="none" stroke={color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round"/>
      {pts.map((p, i) => {
        const v = values[i];
        const above = v >= 0;
        const showLabel = labelIdxSet ? labelIdxSet.has(i) : true;
        return (
          <g key={i}>
            <circle cx={p[0]} cy={p[1]} r={isMobile ? 3.5 : 4.5} fill={color} stroke="#0a141a" strokeWidth="2.5"/>
            {showLabel && (
              <text x={p[0]} y={above ? p[1] - 12 : p[1] + 22} textAnchor="middle" fill={v >= 0 ? "#e8f6f9" : "#fca5a5"} fontFamily="var(--font-mono)" fontSize={isMobile ? "10" : "11.5"} fontWeight="600">
                {fmt(v)}
              </text>
            )}
          </g>
        );
      })}
      {labels.map((l, i) => (
        i % 2 === 0 ? (
          <text key={i} x={xOf(i)} y={h - 10} textAnchor="middle" fill="var(--mute)" fontSize="11" fontFamily="var(--font-ui)">{l}</text>
        ) : null
      ))}
    </svg>
  );
};

const PageOverview = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month, semInvestimento, extraFilters }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, semInvestimento, extraFilters), [statusFilter, drilldown, year, month, semInvestimento, extraFilters]);
  // Ponto de Equilibrio (break-even): recomputa sob o mesmo contexto de filtro que B.
  const PE = useMemo(() => window.computePE(statusFilter, drilldown, year, month, semInvestimento, extraFilters), [statusFilter, drilldown, year, month, semInvestimento, extraFilters]);
  const pctFmt = (v) => v == null ? "—" : (v * 100).toFixed(2).replace(".", ",") + "%";
  const [indicator, setIndicator] = useState("Valor líquido");
  const [fpVista, setFpVista] = useState('consolidado');
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();
  // descobre o indice ativo se o drilldown for de mes (pra destacar a barra)
  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? B.MONTHS_FULL.findIndex(mn => {
        // drilldown.value formato "YYYY-MM" e MONTHS_FULL e ["janeiro","fevereiro",...]
        const mm = String(parseInt(drilldown.value.slice(5, 7), 10)).padStart(2, "0");
        const idx = parseInt(mm, 10) - 1;
        return B.MONTHS_FULL.indexOf(mn) === idx;
      })
    : -1;
  const handleBarMes = (d, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    const lbl = `${d.m.charAt(0).toUpperCase() + d.m.slice(1, 3)}/${refYear}`;
    setDrilldown({ type: "mes", value: ym, label: lbl });
  };

  /* RESUMO DO MÊS.
   *
   * Ela, no fim da reunião: "mas já tendo, para apresentar para ela nessa
   * primeira tela, um resumo ali do mês, como foi, o que passou, o que fechou,
   * antes de entrar no detalhe, é mais interessante também".
   *
   * Então: o mês de referência (o selecionado, ou o último com movimento),
   * comparado com o anterior, mais o que ainda está em aberto naquele mês —
   * que é o "o que passou, o que fechou". Lê do ALL_TX pra não depender do
   * recorte de status da tela: o resumo tem que mostrar realizado E aberto ao
   * mesmo tempo, senão não responde à pergunta.
   */
  const resumo = useMemo(() => {
    const tx = window.txNoContexto("tudo", null, semInvestimento, extraFilters)
      .filter(r => r[1] && Number(r[1].slice(0, 4)) === refYear);
    if (!tx.length) return null;
    const mesSel = (drilldown && drilldown.type === "mes")
      ? parseInt(String(drilldown.value).slice(5, 7), 10) - 1
      : (month > 0 ? month - 1 : -1);
    const comRealizado = new Set(tx.filter(r => r[6] === 1).map(r => parseInt(r[1].slice(5, 7), 10) - 1));
    const idx = mesSel >= 0 ? mesSel : (comRealizado.size ? Math.max(...comRealizado) : -1);
    if (idx < 0) return null;
    const acc = (mi, pred) => {
      let rec = 0, desp = 0, n = 0;
      for (const r of tx) {
        if (parseInt(r[1].slice(5, 7), 10) - 1 !== mi) continue;
        if (!pred(r)) continue;
        if (r[0] === "r") rec += r[5]; else desp += r[5];
        n++;
      }
      return { rec, desp, liq: rec - desp, n };
    };
    const fechado = acc(idx, r => r[6] === 1);
    const aberto = acc(idx, r => r[6] === 0);
    const anterior = idx > 0 ? acc(idx - 1, r => r[6] === 1) : null;
    // maior variação de categoria contra o mês anterior — o "por que mudou"
    let mover = null;
    if (anterior) {
      const porCat = new Map();
      for (const r of tx) {
        const mi = parseInt(r[1].slice(5, 7), 10) - 1;
        if (r[6] !== 1 || (mi !== idx && mi !== idx - 1)) continue;
        const sinal = r[0] === "r" ? 1 : -1;
        const k = r[3];
        porCat.set(k, (porCat.get(k) || 0) + sinal * r[5] * (mi === idx ? 1 : -1));
      }
      for (const [cat, d] of porCat) if (!mover || Math.abs(d) > Math.abs(mover.delta)) mover = { cat, delta: d };
    }
    return {
      idx, mes: B.MONTHS_FULL[idx], fechado, aberto, anterior, mover,
      margem: fechado.rec > 0 ? (fechado.liq / fechado.rec) * 100 : null,
      variacaoLiq: anterior ? fechado.liq - anterior.liq : null,
      ehSelecionado: mesSel >= 0,
    };
  }, [refYear, drilldown, month, semInvestimento, extraFilters, B.MONTHS_FULL]);

  // Indicator series for the toggle chart (derived da MONTH_DATA real)
  const margemSeries = B.MONTH_DATA.map(m => m.receita > 0 ? ((m.receita - m.despesa) / m.receita) * 100 : 0);
  const indicatorSeries = {
    "Valor líquido":          { values: B.VALOR_LIQ_SERIES, color: "var(--cyan)", fmt: (v) => B.fmt(v) },
    "Receita":                { values: B.MONTH_DATA.map(m => m.receita), color: "var(--green)", fmt: (v) => B.fmt(v) },
    "Despesa":                { values: B.MONTH_DATA.map(m => -m.despesa), color: "var(--red)", fmt: (v) => B.fmt(v) },
    "Margem Líquida":         { values: margemSeries, color: "var(--cyan)", fmt: (v) => `${v.toFixed(2).replace(".", ",")}%` },
  };
  const current = indicatorSeries[indicator];
  const monthLabels = B.MONTHS_FULL.map(m => `${m.charAt(0).toUpperCase() + m.slice(1, 3)} ${refYear}`);

  const indicadores = [
    { value: B.TOTAL_RECEITA, label: "Soma de receita",     kind: "receita" },
    { value: B.TOTAL_DESPESA, label: "Soma de despesa",     kind: "despesa" },
    { value: B.VALOR_LIQUIDO, label: "Valor líquido",       kind: B.VALOR_LIQUIDO >= 0 ? "receita" : "despesa" },
  ];

  const statusLabel = statusFilter === "realizado" ? "realizado (PAGO)" :
                      statusFilter === "a_pagar_receber" ? "pendente (A vencer/receber)" : "tudo (pago + pendente)";

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Visão Geral</h1>
          <div className="status-line">Cliente · ano {refYear} · status <b>{statusLabel}</b></div>
        </div>
        <div className="actions">
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      {resumo && (
        <div className={"resumo-mes " + (resumo.fechado.liq >= 0 ? "resumo-ok" : "resumo-neg")}>
          <div className="resumo-head">
            <span className="resumo-mes-nome">{resumo.mes} de {refYear}</span>
            <span className="resumo-tag">
              {resumo.ehSelecionado ? "mês selecionado no filtro" : "último mês com movimento"}
            </span>
          </div>
          <div className="resumo-grid">
            <div>
              <div className="resumo-label">Entrou</div>
              <div className="resumo-valor green">{B.fmt(resumo.fechado.rec)}</div>
            </div>
            <div>
              <div className="resumo-label">Saiu</div>
              <div className="resumo-valor red">{B.fmt(resumo.fechado.desp)}</div>
            </div>
            <div>
              <div className="resumo-label">Resultado</div>
              <div className={"resumo-valor " + (resumo.fechado.liq >= 0 ? "green" : "red")}>{B.fmt(resumo.fechado.liq)}</div>
            </div>
            <div>
              <div className="resumo-label">Margem</div>
              <div className="resumo-valor">{resumo.margem == null ? "—" : resumo.margem.toFixed(1).replace(".", ",") + "%"}</div>
            </div>
            <div>
              <div className="resumo-label">Ainda em aberto no mês</div>
              <div className="resumo-valor" style={{ fontSize: 15 }}>
                {resumo.aberto.n === 0
                  ? <span style={{ color: "var(--fg-3)" }}>nada — mês fechado</span>
                  : <span>a receber <b className="green">{B.fmt(resumo.aberto.rec)}</b> · a pagar <b className="red">{B.fmt(resumo.aberto.desp)}</b></span>}
              </div>
            </div>
          </div>
          <div className="resumo-leitura">
            {resumo.fechado.n} lançamento{resumo.fechado.n === 1 ? "" : "s"} com baixa
            {resumo.aberto.n > 0 && <span> · {resumo.aberto.n} ainda sem baixa</span>}
            {resumo.anterior && resumo.variacaoLiq != null && (
              <span>
                {" · resultado "}
                <b className={resumo.variacaoLiq >= 0 ? "green" : "red"}>
                  {resumo.variacaoLiq >= 0 ? "melhor" : "pior"} em {B.fmt(Math.abs(resumo.variacaoLiq))}
                </b>
                {" que "}{B.MONTHS_FULL[resumo.idx - 1]}
              </span>
            )}
            {resumo.mover && Math.abs(resumo.mover.delta) > 0.005 && (
              <span> · quem mais mexeu: <b>{resumo.mover.cat}</b> ({resumo.mover.delta >= 0 ? "+" : "−"}{B.fmt(Math.abs(resumo.mover.delta))})</span>
            )}
          </div>
        </div>
      )}

      <div className="row" style={{ gridTemplateColumns: "minmax(280px, 3fr) minmax(0, 9fr)" }}>
        {/* LEFT: Indicadores Principais + Resultado Geral */}
        <div style={{ display: "grid", gap: 16, alignContent: "start" }}>
          <div className="card">
            <SectionHeading strong="INDICADORES" soft="PRINCIPAIS" />
            <div className="kpi-stack">
              {indicadores.map((it, i) => (
                <div key={i} className={`kpi-stack-item ${it.kind}`}>
                  <div className="kpi-stack-value">{B.fmt(it.value)}</div>
                  <div className="kpi-stack-label">{it.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="card resultado-card">
            <SectionHeading strong="RESULTADO" soft="GERAL" />
            <div className="kpi-stack-value resultado-val">{B.fmt(B.VALOR_LIQUIDO)}</div>
            <div className="kpi-stack-label">Valor líquido</div>
            <div className="kpi-stack-pct">{B.MARGEM_LIQUIDA.toFixed(2).replace(".", ",")}%</div>
            <div className="kpi-stack-label">Margem Líquida</div>
          </div>
        </div>

        {/* RIGHT: Receitas e Despesas + Visualização Indicadores */}
        <div style={{ display: "grid", gap: 16, minWidth: 0 }}>
          <div className="card">
            <div className="card-title-row" style={{ marginBottom: 10 }}>
              <h2 className="card-title">Receitas e despesas</h2>
            </div>
            <div className="legend-pills">
              <span className="legend-pill green">
                <span className="dot" />
                <span className="lbl">Soma de receita</span>
                <span className="val">{B.fmtK(B.TOTAL_RECEITA)}</span>
              </span>
              <span className="legend-pill red">
                <span className="dot" />
                <span className="lbl">Soma de despesas</span>
                <span className="val">{B.fmtK(B.TOTAL_DESPESA)}</span>
              </span>
            </div>
            <OverviewBars data={B.MONTH_DATA} height={220} year={String(refYear)} onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
          </div>

          <div className="card">
            <div className="card-title-row" style={{ marginBottom: 12 }}>
              <h2 className="card-title">Visualização indicadores</h2>
              <div className="ind-pills">
                {Object.keys(indicatorSeries).map(k => (
                  <button key={k} className={`ind-pill ${indicator === k ? "active" : ""}`} onClick={() => setIndicator(k)}>{k}</button>
                ))}
              </div>
            </div>
            <div className="legend-pills">
              <span className="legend-pill cyan">
                <span className="dot" />
                <span className="lbl">{indicator}</span>
                <span className="val">{indicator === "Margem Líquida"
                  ? `${(current.values.reduce((s, v) => s + v, 0) / current.values.length).toFixed(2).replace(".", ",")}%`
                  : B.fmtK(current.values.reduce((s, v) => s + v, 0))}</span>
              </span>
            </div>
            <IndicatorLine values={current.values} labels={monthLabels} height={240} color={current.color} format={current.fmt} />
          </div>
        </div>
      </div>

      {/* PONTO DE EQUILÍBRIO (break-even): Margem de Contribuição %, Ponto de Equilíbrio, Margem de Segurança % */}
      <div className="card" style={{ marginTop: 16 }}>
        <SectionHeading strong="PONTO DE" soft="EQUILÍBRIO" />
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginTop: 12 }}>
          <div className="indicator-card">
            <div className="kpi-label">Margem de contribuição</div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 22, color: "var(--cyan)" }}>{pctFmt(PE.margemContrib)}</div>
            <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 4 }}>(Receita − Custos Variáveis) ÷ Receita</div>
          </div>
          <div className="indicator-card">
            <div className="kpi-label">Ponto de equilíbrio</div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 22, color: "var(--text)" }}>{PE.pontoEquilibrio == null ? "—" : B.fmt(PE.pontoEquilibrio)}</div>
            <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 4 }}>Custos Fixos ÷ Margem de contribuição</div>
          </div>
          <div className="indicator-card">
            <div className="kpi-label">Margem de segurança</div>
            <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, fontSize: 22, color: PE.margemSeguranca != null && PE.margemSeguranca >= 0 ? "var(--green)" : "var(--red)" }}>{pctFmt(PE.margemSeguranca)}</div>
            <div style={{ fontSize: 11, color: "var(--mute)", marginTop: 4 }}>(Receita − Ponto de equilíbrio) ÷ Receita</div>
          </div>
        </div>
      </div>

      {/* Fluxo de Caixa Projetado com toggle Consolidado / Sem Investimento */}
      {(function() {
        const fp    = window.FLUXO_PROJETADO || {};
        const total = fp.totais || [];
        const contas = fp.contas || [];
        if (!total.length) return null;

        const fmtV = (n) => {
          const sign = n < 0 ? '-' : '';
          return `${sign}R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        };
        const fmtD = (iso) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };

        const allMovs = contas.flatMap(c => c.movimentos || []);
        const invCount = allMovs.filter(m => m.isInvestimento).length;

        const calcSemInv = (rowsConsol, movs) => {
          const invByDay = {};
          for (const m of movs) {
            if (m.isInvestimento) invByDay[m.data] = (invByDay[m.data] || 0) + m.valor;
          }
          let cum = 0;
          return rowsConsol.map(r => {
            const dayInv = invByDay[r.data] || 0;
            const si = r.saldoInicial - cum;
            const sf = r.saldoFinal - (cum + dayInv);
            cum += dayInv;
            return { data: r.data, saldoInicial: si, valorLiquidoDia: r.valorLiquidoDia - dayInv, saldoFinal: sf };
          });
        };

        const rows = fpVista === 'sem_inv' ? calcSemInv(total, allMovs) : total;
        const ultimoSaldo   = rows[rows.length - 1].saldoFinal;
        const variacaoTotal = rows[rows.length - 1].saldoFinal - rows[0].saldoInicial;
        const minSaldo = Math.min(...rows.map(r => r.saldoFinal));
        const minRow   = rows.find(r => r.saldoFinal === minSaldo);

        const SparkFP = () => {
          const W = 400, H = 72, PAD = 4;
          const vals = rows.map(r => r.saldoFinal);
          const mn = Math.min(...vals), mx = Math.max(...vals);
          const rng = mx - mn || 1;
          const xs = vals.map((_, i) => PAD + (i / Math.max(vals.length - 1, 1)) * (W - PAD * 2));
          const ys = vals.map(v => H - PAD - ((v - mn) / rng) * (H - PAD * 2));
          const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
          const fill = `${line} L${xs[xs.length-1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`;
          const zeroY = H - PAD - ((0 - mn) / rng) * (H - PAD * 2);
          return (
            <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 72, display: 'block' }}>
              <defs>
                <linearGradient id="fpOvGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {mn < 0 && mx > 0 && (
                <line x1={PAD} y1={zeroY.toFixed(1)} x2={W-PAD} y2={zeroY.toFixed(1)}
                  stroke="rgba(239,68,68,0.35)" strokeWidth="1" strokeDasharray="4,3" />
              )}
              <path d={fill} fill="url(#fpOvGrad)" />
              <path d={line} fill="none" stroke="#22d3ee" strokeWidth="1.8" />
            </svg>
          );
        };

        const BtnFP = ({ value, label }) => (
          <button onClick={() => setFpVista(value)} style={{
            padding: '4px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
            background: fpVista === value ? 'var(--cyan)' : 'transparent',
            color: fpVista === value ? '#000' : 'var(--text)',
            fontWeight: fpVista === value ? 600 : 400,
          }}>{label}</button>
        );

        return (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title-row">
              <h2 className="card-title">Fluxo de Caixa Projetado</h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div className="indicator-card" style={{ padding: 10 }}>
                <div className="kpi-label" style={{ fontSize: 10 }}>Saldo inicial</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: rows[0].saldoInicial >= 0 ? 'var(--cyan)' : 'var(--red)' }}>{fmtV(rows[0].saldoInicial)}</div>
                <div style={{ fontSize: 10, color: 'var(--mute)' }}>{fmtD(rows[0].data)}</div>
              </div>
              <div className="indicator-card" style={{ padding: 10 }}>
                <div className="kpi-label" style={{ fontSize: 10 }}>Saldo final projetado</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: ultimoSaldo >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtV(ultimoSaldo)}</div>
                <div style={{ fontSize: 10, color: 'var(--mute)' }}>{fmtD(rows[rows.length-1].data)}</div>
              </div>
              <div className="indicator-card" style={{ padding: 10 }}>
                <div className="kpi-label" style={{ fontSize: 10 }}>Variação total</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: variacaoTotal >= 0 ? 'var(--green)' : 'var(--red)' }}>{variacaoTotal >= 0 ? '+' : ''}{fmtV(variacaoTotal)}</div>
              </div>
              <div className="indicator-card" style={{ padding: 10, background: minSaldo < 0 ? 'rgba(239,68,68,0.07)' : undefined }}>
                <div className="kpi-label" style={{ fontSize: 10 }}>Mínimo projetado</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 14, color: minSaldo >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtV(minSaldo)}</div>
                {minRow && <div style={{ fontSize: 10, color: 'var(--mute)' }}>{fmtD(minRow.data)}</div>}
              </div>
            </div>
            <SparkFP />
          </div>
        );
      })()}
    </div>
  );
};

const PageIndicators = ({ statusFilter, drilldown, setDrilldown, year, month }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month), [statusFilter, drilldown, year, month]);
  const totalReceita = B.TOTAL_RECEITA;
  const totalDespesa = B.TOTAL_DESPESA;
  const valorLiq = B.VALOR_LIQUIDO;
  const margemLiq = B.MARGEM_LIQUIDA;
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();
  // sem segregacao de impostos no Omie sem mapeamento de categorias, deixamos 0 e mostramos "—" se nao houver dado
  const margemSeries = B.MONTH_DATA.map(m => m.receita > 0 ? ((m.receita - m.despesa) / m.receita) * 100 : 0);

  const handleBarMes = (d, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    const lbl = `${(d.m || "").charAt(0).toUpperCase() + (d.m || "").slice(1, 3)}/${refYear}`;
    setDrilldown({ type: "mes", value: ym, label: lbl });
  };
  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(drilldown.value.slice(5, 7), 10) - 1 : -1;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Indicadores</h1>
          <div className="status-line">Receita, despesa, valor líquido e margem · {statusFilter === "realizado" ? "realizado" : statusFilter === "tudo" ? "tudo" : "pendente"}</div>
        </div>
        <div className="actions">
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      <div className="metric-strip">
        <div className="metric">
          <div className="m-label">Receita total</div>
          <div className="m-value">{B.fmt(totalReceita)}</div>
          <div className="m-pct">100%</div>
          <div className="m-bar"><div style={{ width: `100%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Despesa total</div>
          <div className="m-value">{B.fmt(totalDespesa)}</div>
          <div className="m-pct">{totalReceita > 0 ? `${((totalDespesa / totalReceita) * 100).toFixed(2).replace(".",",")}%` : "—"}</div>
          <div className="m-bar red"><div style={{ width: `${totalReceita > 0 ? Math.min(100, (totalDespesa / totalReceita) * 100) : 0}%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Valor líquido</div>
          <div className="m-value" style={{ color: valorLiq >= 0 ? "var(--green)" : "var(--red)" }}>{B.fmt(valorLiq)}</div>
          <div className="m-pct">{margemLiq.toFixed(2).replace(".",",")}%</div>
          <div className="m-bar cyan"><div style={{ width: `${Math.min(100, Math.max(0, margemLiq))}%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Margem líquida</div>
          <div className="m-value">{margemLiq.toFixed(2).replace(".",",")}%</div>
          <div className="m-pct">média do período</div>
          <div className="m-bar"><div style={{ width: `${Math.min(100, Math.max(0, margemLiq))}%` }} /></div>
        </div>
      </div>

      <div className="row row-1-1">
        <div className="card">
          <h2 className="card-title">Margem líquida por mês</h2>
          <TrendChart
            values={margemSeries}
            labels={B.MONTHS}
            color="var(--cyan)"
            height={220}
            gradientId="ml-cyan"
          />
        </div>
        <div className="card">
          <h2 className="card-title">Receita vs Despesa por mês</h2>
          <MonthlyBars data={B.MONTH_DATA} height={240} onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
        </div>
      </div>
    </div>
  );
};

const PageReceita = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month, extraFilters }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, undefined, extraFilters), [statusFilter, drilldown, year, month, extraFilters]);
  const mesesComReceita = B.MONTH_DATA.filter(m => m.receita > 0).length || 1;
  const mediaMes = B.TOTAL_RECEITA / mesesComReceita;
  const numClientes = B.TOTAL_CLIENTES || B.RECEITA_CLIENTES.length;
  const numLancRec = (B.EXTRATO_RECEITAS || B.EXTRATO.filter(e => e[4] > 0)).length;
  const ticket = numLancRec > 0 ? B.TOTAL_RECEITA / numLancRec : 0;
  const [range, setRange] = useState("12M");
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();

  // Drilldown handlers
  const handleBarMes = (v, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    const mn = B.MONTHS_FULL[i] || "";
    setDrilldown({ type: "mes", value: ym, label: `${mn.charAt(0).toUpperCase() + mn.slice(1, 3)}/${refYear}` });
  };
  const handleCategoria = (it) => setDrilldown({ type: "categoria", value: it.name, label: it.name });
  const handleCliente = (it) => setDrilldown({ type: "cliente", value: it.name, label: it.name });

  // Indices ativos para destaque
  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(drilldown.value.slice(5, 7), 10) - 1 : -1;
  const activeCategoria = (drilldown && drilldown.type === "categoria") ? drilldown.value : null;
  const activeCliente = (drilldown && drilldown.type === "cliente") ? drilldown.value : null;

  // Extrato filtrado de receitas (usa EXTRATO_RECEITAS pre-separado pelo build,
  // fallback pro filtro inline pra compat com BIT base)
  const extratoReceitas = B.EXTRATO_RECEITAS || B.EXTRATO.filter(e => e[4] > 0);
  const extratoFiltrado = window.applyDrilldown(extratoReceitas, drilldown);
  const totalFiltrado = drilldown
    ? extratoFiltrado.reduce((s, e) => s + e[4], 0)
    : B.TOTAL_RECEITA;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Receita</h1>
          <div className="status-line">Composição por categoria, cliente e mês</div>
        </div>
        <div className="actions">
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      <div className="row row-4">
        <KpiTile label="Receita total" value={Math.round(B.TOTAL_RECEITA).toLocaleString("pt-BR")} sparkValues={B.MONTH_DATA.map(m => m.receita)} sparkColor="var(--green)" tone="green" />
        <KpiTile label="Média por mês" value={Math.round(mediaMes).toLocaleString("pt-BR")} sparkValues={B.MONTH_DATA.map(m => m.receita)} sparkColor="var(--cyan)" tone="cyan" />
        <KpiTile label="Clientes" value={String(numClientes)} sparkValues={B.MONTH_DATA.map(m => m.receita > 0 ? 1 : 0)} sparkColor="var(--cyan)" tone="cyan" nonMonetary />
        <KpiTile label="Ticket médio" value={ticket > 0 ? Math.round(ticket).toLocaleString("pt-BR") : "0"} sparkValues={B.MONTH_DATA.map(m => m.receita / 30)} sparkColor="var(--green)" tone="green" />
      </div>

      <div className="card">
        <h2 className="card-title">Receita por mês</h2>
        <SingleBars values={B.MONTH_DATA.map(m => m.receita)} labels={B.MONTHS_FULL} color="green" height={240}
          onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
      </div>

      <div className="row" style={{ gridTemplateColumns: "minmax(0, 4fr) minmax(0, 5fr) minmax(0, 4fr)" }}>
        <div className="card">
          <h2 className="card-title">Receita por categoria</h2>
          <BarList items={B.RECEITA_CATEGORIAS} color="green" onItemClick={handleCategoria} activeName={activeCategoria} />
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Extrato de receitas {drilldown ? `· ${drilldown.label}` : ""}</h2>
          </div>
          <ExtratoTabela rows={extratoFiltrado} tone="green" fmt={B.fmt}
            colContraparte="Cliente" vazio="Sem receitas no filtro selecionado" altura={550} />
        </div>

        <div className="card">
          <h2 className="card-title">Receita por cliente</h2>
          <BarList items={B.RECEITA_CLIENTES} color="green" onItemClick={handleCliente} activeName={activeCliente} />
        </div>
      </div>
    </div>
  );
};

const PageDespesa = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month, semInvestimento, extraFilters }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, semInvestimento, extraFilters), [statusFilter, drilldown, year, month, semInvestimento, extraFilters]);
  const totalDespesa = B.TOTAL_DESPESA;
  const mesesComDespesa = B.MONTH_DATA.filter(m => m.despesa > 0).length || 1;
  const mediaMes = totalDespesa / mesesComDespesa;
  const numFornec = B.TOTAL_FORNECEDORES || B.DESPESA_FORNECEDORES.length;
  const numLancDesp = (B.EXTRATO_DESPESAS || B.EXTRATO.filter(e => e[4] < 0)).length;
  const ticketDesp = numLancDesp > 0 ? totalDespesa / numLancDesp : 0;
  const [range, setRange] = useState("12M");
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();

  const handleBarMes = (v, i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    const mn = B.MONTHS_FULL[i] || "";
    setDrilldown({ type: "mes", value: ym, label: `${mn.charAt(0).toUpperCase() + mn.slice(1, 3)}/${refYear}` });
  };
  const handleCategoria = (it) => setDrilldown({ type: "categoria", value: it.name, label: it.name });
  const handleFornecedor = (it) => setDrilldown({ type: "fornecedor", value: it.name, label: it.name });

  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(drilldown.value.slice(5, 7), 10) - 1 : -1;
  const activeCategoria = (drilldown && drilldown.type === "categoria") ? drilldown.value : null;
  const activeFornecedor = (drilldown && drilldown.type === "fornecedor") ? drilldown.value : null;

  // Extrato filtrado de despesas (usa EXTRATO_DESPESAS pre-separado, fallback inline)
  const extratoDespesas = B.EXTRATO_DESPESAS || B.EXTRATO.filter(e => e[4] < 0);
  const extratoFiltrado = window.applyDrilldown(extratoDespesas, drilldown);
  const totalFiltrado = drilldown
    ? Math.abs(extratoFiltrado.reduce((s, e) => s + e[4], 0))
    : totalDespesa;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Despesa</h1>
          <div className="status-line">Composição por categoria, fornecedor e mês</div>
        </div>
        <div className="actions">
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      <div className="row row-4">
        <KpiTile label="Despesas totais" value={Math.round(totalDespesa).toLocaleString("pt-BR")} sparkValues={B.MONTH_DATA.map(m => m.despesa)} sparkColor="var(--red)" tone="red" />
        <KpiTile label="Média por mês" value={Math.round(mediaMes).toLocaleString("pt-BR")} sparkValues={B.MONTH_DATA.map(m => m.despesa)} sparkColor="var(--red)" tone="red" />
        <KpiTile label="Fornecedores" value={String(numFornec)} sparkValues={B.MONTH_DATA.map(m => m.despesa > 0 ? 1 : 0)} sparkColor="var(--cyan)" tone="cyan" nonMonetary />
        <KpiTile label="Ticket médio" value={ticketDesp > 0 ? Math.round(ticketDesp).toLocaleString("pt-BR") : "0"} sparkValues={B.MONTH_DATA.map(m => m.despesa / 30)} sparkColor="var(--red)" tone="red" />
      </div>

      <div className="card">
        <h2 className="card-title">Despesa por mês</h2>
        <SingleBars values={B.MONTH_DATA.map(m => m.despesa)} labels={B.MONTHS_FULL} color="red" height={240}
          onBarClick={handleBarMes} activeIdx={activeMonthIdx} />
      </div>

      <div className="row" style={{ gridTemplateColumns: "minmax(0, 4fr) minmax(0, 5fr) minmax(0, 4fr)" }}>
        <div className="card">
          <h2 className="card-title">Despesas por categoria</h2>
          <BarList items={B.DESPESA_CATEGORIAS} color="red" onItemClick={handleCategoria} activeName={activeCategoria} />
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Extrato de despesas {drilldown ? `· ${drilldown.label}` : ""}</h2>
          </div>
          <ExtratoTabela rows={extratoFiltrado} tone="red" fmt={B.fmt}
            colContraparte="Fornecedor" vazio="Sem despesas no filtro selecionado" altura={550} />
        </div>

        <div className="card">
          <h2 className="card-title">Despesas por fornecedor</h2>
          <BarList items={B.DESPESA_FORNECEDORES} color="red" onItemClick={handleFornecedor} activeName={activeFornecedor} />
        </div>
      </div>
    </div>
  );
};

// ============================================================
// PAGE ORCAMENTO — Budget vs Realizado POR PROJETO
// ============================================================
const PageOrcamento = ({ statusFilter, drilldown, setDrilldown, year, month, semInvestimento, extraFilters }) => {
  const STORAGE_KEY = 'bi.orcamento';

  // Load initial budget from localStorage
  // Structure: { "2026": { "__todos__": { cat: val }, "5620 - 3R Petroleum": { cat: val }, ... } }
  const [allBudget, setAllBudget] = useState(() => {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      // Migrate old format (flat year -> cats) to new format (year -> project -> cats)
      const migrated = {};
      for (const [yr, data] of Object.entries(raw)) {
        if (data && typeof data === 'object') {
          const firstVal = Object.values(data)[0];
          if (typeof firstVal === 'number' || firstVal === undefined) {
            // Old format: { "cat": number } — migrate to { "__todos__": { "cat": number } }
            migrated[yr] = { '__todos__': data };
          } else {
            migrated[yr] = data;
          }
        }
      }
      return migrated;
    } catch (e) { return {}; }
  });

  // Selected project
  const projetos = useMemo(() => window.ALL_PROJETOS || [], []);
  const [selectedProjeto, setSelectedProjeto] = useState('__todos__');

  // Auto-save on changes
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allBudget)); } catch (e) {}
  }, [allBudget]);

  // Budget for the current year + project
  const yearKey = String(year || new Date().getFullYear());
  const budget = (allBudget[yearKey] && allBudget[yearKey][selectedProjeto]) || {};

  const setBudgetForCat = (cat, val) => {
    setAllBudget(prev => {
      const yr = prev[yearKey] || {};
      const proj = yr[selectedProjeto] || {};
      const next = { ...proj, [cat]: val };
      return { ...prev, [yearKey]: { ...yr, [selectedProjeto]: next } };
    });
  };

  // Get realized data from ALL_TX filtered by year + extraFilters + project
  const realized = useMemo(() => {
    const txs = window.ALL_TX || [];
    const emp = extraFilters && extraFilters.empresa && extraFilters.empresa.length > 0 ? extraFilters.empresa : null;
    const filterByProject = selectedProjeto !== '__todos__';
    const recMap = {}, despMap = {};
    for (const tx of txs) {
      const [kind, mes, , categoria, , valor, realizado] = tx;
      const empresa = tx[11];
      const projeto = tx[12] || '';
      if (!mes || !mes.startsWith(yearKey)) continue;
      if (statusFilter === 'realizado' && realizado !== 1) continue;
      if (statusFilter === 'a_pagar_receber' && realizado !== 0) continue;
      if (emp && !emp.includes(empresa)) continue;
      if (filterByProject && projeto !== selectedProjeto) continue;
      if (!categoria) continue;
      if (kind === 'r') recMap[categoria] = (recMap[categoria] || 0) + valor;
      else if (kind === 'd') despMap[categoria] = (despMap[categoria] || 0) + valor;
    }
    return { recMap, despMap };
  }, [yearKey, statusFilter, extraFilters, selectedProjeto]);

  // Monthly data for chart
  const monthlyData = useMemo(() => {
    const txs = window.ALL_TX || [];
    const emp = extraFilters && extraFilters.empresa && extraFilters.empresa.length > 0 ? extraFilters.empresa : null;
    const filterByProject = selectedProjeto !== '__todos__';
    const months = {};
    for (let m = 1; m <= 12; m++) {
      const k = `${yearKey}-${String(m).padStart(2, '0')}`;
      months[k] = { rec: 0, desp: 0 };
    }
    for (const tx of txs) {
      const [kind, mes, , , , valor, realizado] = tx;
      const empresa = tx[11];
      const projeto = tx[12] || '';
      if (!mes || !mes.startsWith(yearKey)) continue;
      if (statusFilter === 'realizado' && realizado !== 1) continue;
      if (statusFilter === 'a_pagar_receber' && realizado !== 0) continue;
      if (emp && !emp.includes(empresa)) continue;
      if (filterByProject && projeto !== selectedProjeto) continue;
      if (!months[mes]) continue;
      if (kind === 'r') months[mes].rec += valor;
      else if (kind === 'd') months[mes].desp += valor;
    }
    return Object.entries(months).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => ({ mes: k, ...v }));
  }, [yearKey, statusFilter, extraFilters, selectedProjeto]);

  const MONTH_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const MONTH_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const fmtShort = (v) => Math.round(v).toLocaleString("pt-BR");

  // Fixed categories — always visible in budget even without movements
  const FIXED_REC = [
    "500103 - Receita Financeira",
  ];
  const FIXED_DESP = [
    "100103 - Impostos ISS",
    "100112 - Imposto PIS e COFINS",
    "200118 - Serviços de Manutenção / Inspeção",
    "200121 - Descarte de Resíduos e Lavanderia",
    "300100 - Compra de Ativo Fixo",
    "300101 - Consórcio",
    "300102 - Títulos de Capitalização",
    "300103 - Imobilizado em Andamento",
    "400100 - Pagamento de Empréstimo",
    "400104 - Despesa Financeira",
    "400106 - Juros s/emprestimos",
    "700100 - Depreciação",
    "700101 - Manutenção e Obras Civis",
  ];

  // All categories that appear in data, budget, or fixed list
  const recCats = useMemo(() => {
    const cats = new Set([...Object.keys(realized.recMap), ...FIXED_REC, ...Object.keys(budget).filter(c => {
      const txs = window.ALL_TX || [];
      return txs.some(t => t[3] === c && t[0] === 'r');
    })]);
    return [...cats].sort((a, b) => (realized.recMap[b] || 0) - (realized.recMap[a] || 0));
  }, [realized.recMap, budget, yearKey]);

  const despCats = useMemo(() => {
    const cats = new Set([...Object.keys(realized.despMap), ...FIXED_DESP, ...Object.keys(budget).filter(c => {
      const txs = window.ALL_TX || [];
      return txs.some(t => t[3] === c && t[0] === 'd');
    })]);
    return [...cats].sort((a, b) => (realized.despMap[b] || 0) - (realized.despMap[a] || 0));
  }, [realized.despMap, budget, yearKey]);

  // Totals
  const totalBudgetRec  = recCats.reduce((s, c) => s + (budget[c] || 0), 0);
  const totalBudgetDesp = despCats.reduce((s, c) => s + (budget[c] || 0), 0);
  const totalRealRec    = recCats.reduce((s, c) => s + (realized.recMap[c] || 0), 0);
  const totalRealDesp   = despCats.reduce((s, c) => s + (realized.despMap[c] || 0), 0);
  const netBudget       = totalBudgetRec - totalBudgetDesp;
  const netReal         = totalRealRec - totalRealDesp;
  const netVar          = netReal - netBudget;
  const netPct          = netBudget !== 0 ? (netReal / netBudget) * 100 : 0;

  const fmt = (v) => {
    if (!window.BIT) return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    return window.BIT.fmt(v);
  };
  const fmtPct = (v) => v.toFixed(1).replace('.', ',') + '%';

  // Export Excel (CSV com BOM para Excel abrir corretamente)
  const handleExportExcel = () => {
    const sep = ';';
    const lines = [];
    const projLabel = selectedProjeto === '__todos__' ? 'Todos os projetos' : selectedProjeto;
    lines.push(['Projeto', 'Tipo', 'Categoria', 'Orçamento Anual', 'Realizado', 'Variação', '% Atingido'].join(sep));
    for (const cat of recCats) {
      const b = budget[cat] || 0;
      const r = realized.recMap[cat] || 0;
      const v = r - b;
      const p = b > 0 ? ((r / b) * 100).toFixed(1) : '0.0';
      lines.push([projLabel, 'Receita', cat, b.toFixed(2), r.toFixed(2), v.toFixed(2), p].join(sep));
    }
    lines.push([projLabel, 'Receita', 'TOTAL', totalBudgetRec.toFixed(2), totalRealRec.toFixed(2), (totalRealRec - totalBudgetRec).toFixed(2), totalBudgetRec > 0 ? ((totalRealRec / totalBudgetRec) * 100).toFixed(1) : '0.0'].join(sep));
    lines.push('');
    for (const cat of despCats) {
      const b = budget[cat] || 0;
      const r = realized.despMap[cat] || 0;
      const v = r - b;
      const p = b > 0 ? ((r / b) * 100).toFixed(1) : '0.0';
      lines.push([projLabel, 'Despesa', cat, b.toFixed(2), r.toFixed(2), v.toFixed(2), p].join(sep));
    }
    lines.push([projLabel, 'Despesa', 'TOTAL', totalBudgetDesp.toFixed(2), totalRealDesp.toFixed(2), (totalRealDesp - totalBudgetDesp).toFixed(2), totalBudgetDesp > 0 ? ((totalRealDesp / totalBudgetDesp) * 100).toFixed(1) : '0.0'].join(sep));
    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `orcamento_${yearKey}_${selectedProjeto === '__todos__' ? 'todos' : selectedProjeto.replace(/\s+/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };
  const handleClear = () => {
    const projLabel = selectedProjeto === '__todos__' ? 'todos os projetos' : selectedProjeto;
    if (!window.confirm(`Limpar orçamento de ${yearKey} para ${projLabel}?`)) return;
    setAllBudget(prev => {
      const yr = { ...(prev[yearKey] || {}) };
      delete yr[selectedProjeto];
      return { ...prev, [yearKey]: yr };
    });
  };

  // Chart: monthly budget vs realizado (separado receita / despesa)
  const budgetRecMonth = totalBudgetRec / 12;
  const budgetDespMonth = totalBudgetDesp / 12;
  const chartMaxRec = Math.max(...monthlyData.map(m => Math.max(m.rec, budgetRecMonth)), 1);
  const chartMaxDesp = Math.max(...monthlyData.map(m => Math.max(m.desp, budgetDespMonth)), 1);

  // BudgetRow component
  const BudgetRow = ({ cat, kind }) => {
    const realVal = kind === 'r' ? (realized.recMap[cat] || 0) : (realized.despMap[cat] || 0);
    const budgetAnnual = budget[cat] || 0;
    const variacao = realVal - budgetAnnual;
    const pct = budgetAnnual > 0 ? (realVal / budgetAnnual) * 100 : (realVal > 0 ? 100 : 0);
    const fillClass = kind === 'r'
      ? (pct >= 100 ? 'over-good' : 'receita')
      : (pct > 70 ? 'desp-high' : (pct > 30 ? 'desp-mid' : 'desp-low'));
    const fillW = Math.min(pct, 100);

    const [inputVal, setInputVal] = useState(budgetAnnual > 0 ? String(budgetAnnual) : '');
    const [focused, setFocused] = useState(false);

    useEffect(() => {
      if (!focused) setInputVal(budgetAnnual > 0 ? String(budgetAnnual) : '');
    }, [budgetAnnual, focused]);

    const handleBlur = () => {
      setFocused(false);
      const parsed = parseFloat(String(inputVal).replace(',', '.'));
      const v = isNaN(parsed) ? 0 : Math.max(0, parsed);
      setBudgetForCat(cat, v);
      setInputVal(v > 0 ? String(v) : '');
    };

    return (
      <tr>
        <td className="cat" title={cat}>{cat.length > 36 ? cat.slice(0, 35) + '…' : cat}</td>
        <td className="num">
          <input
            className="orcamento-input"
            type="number"
            min="0"
            step="1000"
            value={inputVal}
            onChange={e => setInputVal(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={handleBlur}
            placeholder="0"
          />
        </td>
        <td className="num" style={{ color: kind === 'r' ? 'var(--green-2)' : 'var(--red-2)' }}>{fmt(realVal)}</td>
        <td className="num" style={{ color: (kind === 'r' ? variacao >= 0 : variacao <= 0) ? 'var(--green-2)' : 'var(--red-2)' }}>
          {variacao >= 0 ? '+' : ''}{fmt(variacao)}
        </td>
        <td className="num" style={{ color: pct >= 100 ? (kind === 'r' ? 'var(--green)' : 'var(--red)') : 'var(--text-2)' }}>{fmtPct(pct)}</td>
        <td style={{ width: 160 }}>
          <div className="orcamento-bar">
            <div className={`orcamento-bar-fill ${fillClass}`} style={{ width: `${fillW}%` }} />
          </div>
        </td>
      </tr>
    );
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Orçamento</h1>
          <div className="status-line">Planejado vs realizado por projeto e categoria · {yearKey}</div>
        </div>
      </div>

      {/* Project selector — pill buttons */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <label style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>Projeto:</label>
          {selectedProjeto !== '__todos__' && (
            <span style={{ fontSize: 12, color: 'var(--mute)', marginLeft: 4 }}>
              Orçamento e realizado filtrados por projeto
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button
            className={`orc-proj-btn${selectedProjeto === '__todos__' ? ' active' : ''}`}
            onClick={() => setSelectedProjeto('__todos__')}
          >Todos</button>
          {projetos.map(p => (
            <button
              key={p}
              className={`orc-proj-btn${selectedProjeto === p ? ' active' : ''}`}
              onClick={() => setSelectedProjeto(p)}
            >{p}</button>
          ))}
        </div>
      </div>

      {/* Charts row: Receita e Despesa lado a lado */}
      <div className="row row-2">
        <div className="card orcamento-chart">
          <h2 className="card-title">Receita: Orçamento vs Realizado</h2>
          <div className="orc-legend">
            <span className="orc-legend-item"><span className="orc-legend-dot" style={{ background: 'rgba(34,211,238,0.55)' }} />Orçamento</span>
            <span className="orc-legend-item"><span className="orc-legend-dot" style={{ background: 'var(--green)' }} />Realizado</span>
          </div>
          <div className="orc-bars-wrap">
            <div className="orc-bars-plot">
              {monthlyData.map((m, i) => {
                const rH = chartMaxRec > 0 ? (m.rec / chartMaxRec) * 100 : 0;
                const bH = chartMaxRec > 0 ? (budgetRecMonth / chartMaxRec) * 100 : 0;
                return (
                  <div key={i} className="orc-bar-group orc-bar-group-2" title={`${MONTH_FULL[i]}\nOrçamento: ${fmt(budgetRecMonth)}\nRealizado: ${fmt(m.rec)}`}>
                    <div className="orc-bar budget" style={{ height: `${bH}%` }}>
                      {budgetRecMonth > 0 && <span className="orc-bar-label">{fmtShort(budgetRecMonth)}</span>}
                    </div>
                    <div className="orc-bar real-r" style={{ height: `${rH}%` }}>
                      {m.rec > 0 && <span className="orc-bar-label">{fmtShort(m.rec)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="orc-bars-x">
              {monthlyData.map((m, i) => <span key={i}>{MONTH_ABBR[i]}</span>)}
            </div>
          </div>
        </div>
        <div className="card orcamento-chart">
          <h2 className="card-title">Despesa: Orçamento vs Realizado</h2>
          <div className="orc-legend">
            <span className="orc-legend-item"><span className="orc-legend-dot" style={{ background: 'rgba(34,211,238,0.55)' }} />Orçamento</span>
            <span className="orc-legend-item"><span className="orc-legend-dot" style={{ background: 'var(--red)' }} />Realizado</span>
          </div>
          <div className="orc-bars-wrap">
            <div className="orc-bars-plot">
              {monthlyData.map((m, i) => {
                const dH = chartMaxDesp > 0 ? (m.desp / chartMaxDesp) * 100 : 0;
                const bH = chartMaxDesp > 0 ? (budgetDespMonth / chartMaxDesp) * 100 : 0;
                return (
                  <div key={i} className="orc-bar-group orc-bar-group-2" title={`${MONTH_FULL[i]}\nOrçamento: ${fmt(budgetDespMonth)}\nRealizado: ${fmt(m.desp)}`}>
                    <div className="orc-bar budget" style={{ height: `${bH}%` }}>
                      {budgetDespMonth > 0 && <span className="orc-bar-label">{fmtShort(budgetDespMonth)}</span>}
                    </div>
                    <div className="orc-bar real-d" style={{ height: `${dH}%` }}>
                      {m.desp > 0 && <span className="orc-bar-label">{fmtShort(m.desp)}</span>}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="orc-bars-x">
              {monthlyData.map((m, i) => <span key={i}>{MONTH_ABBR[i]}</span>)}
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="orcamento-actions">
        <button className="btn-ghost" onClick={handleExportExcel} title="Exportar orçamento vs realizado para Excel">
          <Icon name="download" style={{ width: 14, height: 14 }} /> Exportar Excel
        </button>
        <button className="btn-ghost btn-danger" onClick={handleClear} title={`Limpar orçamento de ${yearKey}`}>
          Limpar {yearKey}
        </button>
      </div>

      {/* Receita table */}
      <div className="card">
        <div className="orcamento-section receita">Receita</div>
        <div className="t-scroll">
          <table className="orcamento-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="num">Orçamento anual</th>
                <th className="num">Realizado</th>
                <th className="num">Variação</th>
                <th className="num">% Atingido</th>
                <th>Progresso</th>
              </tr>
            </thead>
            <tbody>
              {recCats.length === 0 && (
                <tr><td colSpan="6" style={{ color: 'var(--mute)', textAlign: 'center', padding: 18 }}>Nenhuma categoria de receita encontrada</td></tr>
              )}
              {recCats.map(cat => <BudgetRow key={cat} cat={cat} kind="r" />)}
              {recCats.length > 0 && (
                <tr className="orcamento-total">
                  <td>Total Receita</td>
                  <td className="num">{fmt(totalBudgetRec)}</td>
                  <td className="num" style={{ color: 'var(--green-2)' }}>{fmt(totalRealRec)}</td>
                  <td className="num" style={{ color: totalRealRec - totalBudgetRec >= 0 ? 'var(--green-2)' : 'var(--red-2)' }}>
                    {totalRealRec - totalBudgetRec >= 0 ? '+' : ''}{fmt(totalRealRec - totalBudgetRec)}
                  </td>
                  <td className="num">{totalBudgetRec > 0 ? fmtPct((totalRealRec / totalBudgetRec) * 100) : '—'}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Despesa table */}
      <div className="card">
        <div className="orcamento-section despesa">Despesa</div>
        <div className="t-scroll">
          <table className="orcamento-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="num">Orçamento anual</th>
                <th className="num">Realizado</th>
                <th className="num">Variação</th>
                <th className="num">% Atingido</th>
                <th>Progresso</th>
              </tr>
            </thead>
            <tbody>
              {despCats.length === 0 && (
                <tr><td colSpan="6" style={{ color: 'var(--mute)', textAlign: 'center', padding: 18 }}>Nenhuma categoria de despesa encontrada</td></tr>
              )}
              {despCats.map(cat => <BudgetRow key={cat} cat={cat} kind="d" />)}
              {despCats.length > 0 && (
                <tr className="orcamento-total">
                  <td>Total Despesa</td>
                  <td className="num">{fmt(totalBudgetDesp)}</td>
                  <td className="num" style={{ color: 'var(--red-2)' }}>{fmt(totalRealDesp)}</td>
                  <td className="num" style={{ color: totalRealDesp - totalBudgetDesp <= 0 ? 'var(--green-2)' : 'var(--red-2)' }}>
                    {totalRealDesp - totalBudgetDesp >= 0 ? '+' : ''}{fmt(totalRealDesp - totalBudgetDesp)}
                  </td>
                  <td className="num">{totalBudgetDesp > 0 ? fmtPct((totalRealDesp / totalBudgetDesp) * 100) : '—'}</td>
                  <td />
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

// ============================================================
// PAGE ORCAMENTO MENSAL — Budget mensal vs Realizado POR PROJETO
// ============================================================
const PageOrcamentoMensal = ({ statusFilter, drilldown, setDrilldown, year, month, semInvestimento, extraFilters }) => {
  const STORAGE_KEY = 'bi.orcamento_mensal';
  const MONTH_ABBR = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez'];
  const MONTH_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  // Structure: { "2026": { "projeto": { "cat": [m1,m2,...m12] } } }
  const [allBudget, setAllBudget] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) { return {}; }
  });

  const projetos = useMemo(() => window.ALL_PROJETOS || [], []);
  const [selectedProjeto, setSelectedProjeto] = useState('__todos__');

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(allBudget)); } catch (e) {}
  }, [allBudget]);

  const yearKey = String(year || new Date().getFullYear());
  const budget = (allBudget[yearKey] && allBudget[yearKey][selectedProjeto]) || {};

  const setBudgetForCatMonth = (cat, monthIdx, val) => {
    setAllBudget(prev => {
      const yr = prev[yearKey] || {};
      const proj = yr[selectedProjeto] || {};
      const months = [...(proj[cat] || Array(12).fill(0))];
      months[monthIdx] = val;
      return { ...prev, [yearKey]: { ...yr, [selectedProjeto]: { ...proj, [cat]: months } } };
    });
  };

  // Realized monthly data per category
  const realized = useMemo(() => {
    const txs = window.ALL_TX || [];
    const emp = extraFilters && extraFilters.empresa && extraFilters.empresa.length > 0 ? extraFilters.empresa : null;
    const filterByProject = selectedProjeto !== '__todos__';
    // { cat: [m1, m2, ..., m12] } for rec and desp
    const recMap = {}, despMap = {};
    for (const tx of txs) {
      const [kind, mes, , categoria, , valor, realizado] = tx;
      const empresa = tx[11];
      const projeto = tx[12] || '';
      if (!mes || !mes.startsWith(yearKey)) continue;
      if (statusFilter === 'realizado' && realizado !== 1) continue;
      if (statusFilter === 'a_pagar_receber' && realizado !== 0) continue;
      if (emp && !emp.includes(empresa)) continue;
      if (filterByProject && projeto !== selectedProjeto) continue;
      if (!categoria) continue;
      const mIdx = parseInt(mes.slice(5, 7), 10) - 1;
      if (mIdx < 0 || mIdx > 11) continue;
      if (kind === 'r') {
        if (!recMap[categoria]) recMap[categoria] = Array(12).fill(0);
        recMap[categoria][mIdx] += valor;
      } else if (kind === 'd') {
        if (!despMap[categoria]) despMap[categoria] = Array(12).fill(0);
        despMap[categoria][mIdx] += valor;
      }
    }
    return { recMap, despMap };
  }, [yearKey, statusFilter, extraFilters, selectedProjeto]);

  // Fixed categories — always visible even without movements
  const FIXED_REC_M = [
    "500103 - Receita Financeira",
  ];
  const FIXED_DESP_M = [
    "100103 - Impostos ISS",
    "100112 - Imposto PIS e COFINS",
    "200118 - Serviços de Manutenção / Inspeção",
    "200121 - Descarte de Resíduos e Lavanderia",
    "300100 - Compra de Ativo Fixo",
    "300101 - Consórcio",
    "300102 - Títulos de Capitalização",
    "300103 - Imobilizado em Andamento",
    "400100 - Pagamento de Empréstimo",
    "400104 - Despesa Financeira",
    "400106 - Juros s/emprestimos",
    "700100 - Depreciação",
    "700101 - Manutenção e Obras Civis",
  ];

  const recCats = useMemo(() => {
    const cats = new Set([...Object.keys(realized.recMap), ...FIXED_REC_M, ...Object.keys(budget)]);
    return [...cats].filter(c => realized.recMap[c] || budget[c] || FIXED_REC_M.includes(c)).sort((a, b) => {
      const ra = (realized.recMap[b] || []).reduce((s, v) => s + v, 0);
      const rb = (realized.recMap[a] || []).reduce((s, v) => s + v, 0);
      return ra - rb;
    });
  }, [realized.recMap, budget]);

  const despCats = useMemo(() => {
    const cats = new Set([...Object.keys(realized.despMap), ...FIXED_DESP_M, ...Object.keys(budget)]);
    return [...cats].filter(c => realized.despMap[c] || budget[c] || FIXED_DESP_M.includes(c)).sort((a, b) => {
      const ra = (realized.despMap[b] || []).reduce((s, v) => s + v, 0);
      const rb = (realized.despMap[a] || []).reduce((s, v) => s + v, 0);
      return ra - rb;
    });
  }, [realized.despMap, budget]);

  const fmt = (v) => {
    if (!window.BIT) return 'R$ ' + v.toLocaleString('pt-BR', { minimumFractionDigits: 2 });
    return window.BIT.fmt(v);
  };
  const fmtPct = (v) => v.toFixed(1).replace('.', ',') + '%';
  const fmtShort = (v) => Math.round(v).toLocaleString("pt-BR");

  const handleClear = () => {
    const projLabel = selectedProjeto === '__todos__' ? 'todos os projetos' : selectedProjeto;
    if (!window.confirm(`Limpar orçamento mensal de ${yearKey} para ${projLabel}?`)) return;
    setAllBudget(prev => {
      const yr = { ...(prev[yearKey] || {}) };
      delete yr[selectedProjeto];
      return { ...prev, [yearKey]: yr };
    });
  };

  const handleExportExcel = () => {
    const sep = ';';
    const lines = [];
    const projLabel = selectedProjeto === '__todos__' ? 'Todos os projetos' : selectedProjeto;
    lines.push(['Projeto', 'Tipo', 'Categoria', ...MONTH_ABBR.map(m => `Orç ${m}`), 'Orç Total', ...MONTH_ABBR.map(m => `Real ${m}`), 'Real Total'].join(sep));
    const exportKind = (cats, realMap, tipo) => {
      for (const cat of cats) {
        const budgetMonths = budget[cat] || Array(12).fill(0);
        const realMonths = realMap[cat] || Array(12).fill(0);
        const bTotal = budgetMonths.reduce((s, v) => s + v, 0);
        const rTotal = realMonths.reduce((s, v) => s + v, 0);
        lines.push([projLabel, tipo, cat, ...budgetMonths.map(v => v.toFixed(2)), bTotal.toFixed(2), ...realMonths.map(v => v.toFixed(2)), rTotal.toFixed(2)].join(sep));
      }
    };
    exportKind(recCats, realized.recMap, 'Receita');
    lines.push('');
    exportKind(despCats, realized.despMap, 'Despesa');
    const bom = '\uFEFF';
    const blob = new Blob([bom + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `orcamento_mensal_${yearKey}_${selectedProjeto === '__todos__' ? 'todos' : selectedProjeto.replace(/\s+/g, '_')}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  // Monthly budget input row
  const BudgetMonthRow = ({ cat, kind }) => {
    const realMonths = kind === 'r' ? (realized.recMap[cat] || Array(12).fill(0)) : (realized.despMap[cat] || Array(12).fill(0));
    const budgetMonths = budget[cat] || Array(12).fill(0);
    const realTotal = realMonths.reduce((s, v) => s + v, 0);
    const budgetTotal = budgetMonths.reduce((s, v) => s + v, 0);
    const pct = budgetTotal > 0 ? (realTotal / budgetTotal) * 100 : (realTotal > 0 ? 100 : 0);

    return (
      <Fragment>
        <tr className="orc-mensal-cat-row">
          <td className="cat" title={cat} rowSpan="3">{cat.length > 30 ? cat.slice(0, 29) + '…' : cat}</td>
          <td className="orc-mensal-label">Orçamento</td>
          {budgetMonths.map((val, mi) => (
            <td key={mi} className="num orc-mensal-cell">
              <MonthInput cat={cat} monthIdx={mi} value={val} onChange={setBudgetForCatMonth} />
            </td>
          ))}
          <td className="num" style={{ fontWeight: 600 }}>{fmtShort(budgetTotal)}</td>
        </tr>
        <tr className="orc-mensal-real-row">
          <td className="orc-mensal-label">Realizado</td>
          {realMonths.map((val, mi) => {
            const b = budgetMonths[mi] || 0;
            const over = kind === 'r' ? val >= b && b > 0 : val > b && b > 0;
            const color = kind === 'r'
              ? (over ? 'var(--green)' : 'var(--text-2)')
              : (b > 0 && val > b ? 'var(--red)' : 'var(--text-2)');
            return <td key={mi} className="num orc-mensal-cell" style={{ color }}>{val > 0 ? fmtShort(val) : '—'}</td>;
          })}
          <td className="num" style={{ fontWeight: 600, color: kind === 'r' ? 'var(--green-2)' : 'var(--red-2)' }}>{fmtShort(realTotal)}</td>
        </tr>
        <tr className="orc-mensal-var-row">
          <td className="orc-mensal-label">Variação</td>
          {realMonths.map((val, mi) => {
            const b = budgetMonths[mi] || 0;
            const v = val - b;
            const good = kind === 'r' ? v >= 0 : v <= 0;
            return <td key={mi} className="num orc-mensal-cell" style={{ color: b > 0 ? (good ? 'var(--green-2)' : 'var(--red-2)') : 'var(--mute)', fontSize: 11 }}>
              {b > 0 ? ((v >= 0 ? '+' : '') + fmtShort(v)) : '—'}
            </td>;
          })}
          <td className="num" style={{ fontWeight: 600, color: (kind === 'r' ? realTotal - budgetTotal >= 0 : realTotal - budgetTotal <= 0) ? 'var(--green-2)' : 'var(--red-2)', fontSize: 11 }}>
            {budgetTotal > 0 ? ((realTotal - budgetTotal >= 0 ? '+' : '') + fmtShort(realTotal - budgetTotal)) : '—'}
          </td>
        </tr>
      </Fragment>
    );
  };

  const MonthInput = ({ cat, monthIdx, value, onChange }) => {
    const [inputVal, setInputVal] = useState(value > 0 ? String(value) : '');
    const [focused, setFocused] = useState(false);
    useEffect(() => {
      if (!focused) setInputVal(value > 0 ? String(value) : '');
    }, [value, focused]);
    const handleBlur = () => {
      setFocused(false);
      const parsed = parseFloat(String(inputVal).replace(',', '.'));
      const v = isNaN(parsed) ? 0 : Math.max(0, parsed);
      onChange(cat, monthIdx, v);
      setInputVal(v > 0 ? String(v) : '');
    };
    return (
      <input
        className="orcamento-input orc-mensal-input"
        type="number"
        min="0"
        step="100"
        value={inputVal}
        onChange={e => setInputVal(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={handleBlur}
        placeholder="0"
      />
    );
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Orçamento Mensal</h1>
          <div className="status-line">Planejado vs realizado mês a mês por projeto · {yearKey}</div>
        </div>
      </div>

      {/* Project selector — pill buttons */}
      <div className="card" style={{ padding: '14px 18px', marginBottom: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <label style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>Projeto:</label>
          {selectedProjeto !== '__todos__' && (
            <span style={{ fontSize: 12, color: 'var(--mute)', marginLeft: 4 }}>
              Orçamento e realizado filtrados por projeto
            </span>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button
            className={`orc-proj-btn${selectedProjeto === '__todos__' ? ' active' : ''}`}
            onClick={() => setSelectedProjeto('__todos__')}
          >Todos</button>
          {projetos.map(p => (
            <button
              key={p}
              className={`orc-proj-btn${selectedProjeto === p ? ' active' : ''}`}
              onClick={() => setSelectedProjeto(p)}
            >{p}</button>
          ))}
        </div>
      </div>

      {/* Charts: Receita e Despesa lado a lado (orçamento mensal vs realizado) */}
      {(() => {
        // Monthly budget totals: sum all categories per month
        const budgetRecByMonth = Array(12).fill(0);
        const budgetDespByMonth = Array(12).fill(0);
        for (const cat of recCats) {
          const months = budget[cat] || Array(12).fill(0);
          for (let i = 0; i < 12; i++) budgetRecByMonth[i] += months[i] || 0;
        }
        for (const cat of despCats) {
          const months = budget[cat] || Array(12).fill(0);
          for (let i = 0; i < 12; i++) budgetDespByMonth[i] += months[i] || 0;
        }
        // Monthly realized totals
        const realRecByMonth = Array(12).fill(0);
        const realDespByMonth = Array(12).fill(0);
        for (const cat of recCats) {
          const months = realized.recMap[cat] || Array(12).fill(0);
          for (let i = 0; i < 12; i++) realRecByMonth[i] += months[i] || 0;
        }
        for (const cat of despCats) {
          const months = realized.despMap[cat] || Array(12).fill(0);
          for (let i = 0; i < 12; i++) realDespByMonth[i] += months[i] || 0;
        }
        const cMaxRec = Math.max(...budgetRecByMonth, ...realRecByMonth, 1);
        const cMaxDesp = Math.max(...budgetDespByMonth, ...realDespByMonth, 1);

        return (
          <div className="row row-2">
            <div className="card orcamento-chart">
              <h2 className="card-title">Receita: Orçamento vs Realizado</h2>
              <div className="orc-legend">
                <span className="orc-legend-item"><span className="orc-legend-dot" style={{ background: 'rgba(34,211,238,0.55)' }} />Orçamento</span>
                <span className="orc-legend-item"><span className="orc-legend-dot" style={{ background: 'var(--green)' }} />Realizado</span>
              </div>
              <div className="orc-bars-wrap">
                <div className="orc-bars-plot">
                  {MONTH_ABBR.map((_, i) => {
                    const bH = cMaxRec > 0 ? (budgetRecByMonth[i] / cMaxRec) * 100 : 0;
                    const rH = cMaxRec > 0 ? (realRecByMonth[i] / cMaxRec) * 100 : 0;
                    return (
                      <div key={i} className="orc-bar-group orc-bar-group-2" title={`${MONTH_FULL[i]}\nOrçamento: ${fmt(budgetRecByMonth[i])}\nRealizado: ${fmt(realRecByMonth[i])}`}>
                        <div className="orc-bar budget" style={{ height: `${bH}%` }}>
                          {budgetRecByMonth[i] > 0 && <span className="orc-bar-label">{fmtShort(budgetRecByMonth[i])}</span>}
                        </div>
                        <div className="orc-bar real-r" style={{ height: `${rH}%` }}>
                          {realRecByMonth[i] > 0 && <span className="orc-bar-label">{fmtShort(realRecByMonth[i])}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="orc-bars-x">
                  {MONTH_ABBR.map((m, i) => <span key={i}>{m}</span>)}
                </div>
              </div>
            </div>
            <div className="card orcamento-chart">
              <h2 className="card-title">Despesa: Orçamento vs Realizado</h2>
              <div className="orc-legend">
                <span className="orc-legend-item"><span className="orc-legend-dot" style={{ background: 'rgba(34,211,238,0.55)' }} />Orçamento</span>
                <span className="orc-legend-item"><span className="orc-legend-dot" style={{ background: 'var(--red)' }} />Realizado</span>
              </div>
              <div className="orc-bars-wrap">
                <div className="orc-bars-plot">
                  {MONTH_ABBR.map((_, i) => {
                    const bH = cMaxDesp > 0 ? (budgetDespByMonth[i] / cMaxDesp) * 100 : 0;
                    const dH = cMaxDesp > 0 ? (realDespByMonth[i] / cMaxDesp) * 100 : 0;
                    return (
                      <div key={i} className="orc-bar-group orc-bar-group-2" title={`${MONTH_FULL[i]}\nOrçamento: ${fmt(budgetDespByMonth[i])}\nRealizado: ${fmt(realDespByMonth[i])}`}>
                        <div className="orc-bar budget" style={{ height: `${bH}%` }}>
                          {budgetDespByMonth[i] > 0 && <span className="orc-bar-label">{fmtShort(budgetDespByMonth[i])}</span>}
                        </div>
                        <div className="orc-bar real-d" style={{ height: `${dH}%` }}>
                          {realDespByMonth[i] > 0 && <span className="orc-bar-label">{fmtShort(realDespByMonth[i])}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="orc-bars-x">
                  {MONTH_ABBR.map((m, i) => <span key={i}>{m}</span>)}
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Actions */}
      <div className="orcamento-actions">
        <button className="btn-ghost" onClick={handleExportExcel} title="Exportar orçamento mensal para Excel">
          <Icon name="download" style={{ width: 14, height: 14 }} /> Exportar Excel
        </button>
        <button className="btn-ghost btn-danger" onClick={handleClear} title={`Limpar orçamento mensal de ${yearKey}`}>
          Limpar {yearKey}
        </button>
      </div>

      {/* Receita table */}
      <div className="card">
        <div className="orcamento-section receita">Receita</div>
        <div className="t-scroll">
          <table className="orcamento-table orc-mensal-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="orc-mensal-label-th"></th>
                {MONTH_ABBR.map(m => <th key={m} className="num">{m}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {recCats.length === 0 && (
                <tr><td colSpan={15} style={{ color: 'var(--mute)', textAlign: 'center', padding: 18 }}>Nenhuma categoria de receita encontrada</td></tr>
              )}
              {recCats.map(cat => <BudgetMonthRow key={cat} cat={cat} kind="r" />)}
            </tbody>
          </table>
        </div>
      </div>

      {/* Despesa table */}
      <div className="card">
        <div className="orcamento-section despesa">Despesa</div>
        <div className="t-scroll">
          <table className="orcamento-table orc-mensal-table">
            <thead>
              <tr>
                <th>Categoria</th>
                <th className="orc-mensal-label-th"></th>
                {MONTH_ABBR.map(m => <th key={m} className="num">{m}</th>)}
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {despCats.length === 0 && (
                <tr><td colSpan={15} style={{ color: 'var(--mute)', textAlign: 'center', padding: 18 }}>Nenhuma categoria de despesa encontrada</td></tr>
              )}
              {despCats.map(cat => <BudgetMonthRow key={cat} cat={cat} kind="d" />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

Object.assign(window, { PageOverview, PageIndicators, PageReceita, PageDespesa, PageOrcamento, PageOrcamentoMensal, RangePills });
