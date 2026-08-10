/* BIT/BGP Finance — Pages 2: Fluxo, Tesouraria, Comparativo */
const { useState, useMemo, useEffect } = React;

// useIsMobile é declarado em pages-1.jsx e disponibilizado globalmente no bundle
// concatenado (build-jsx.cjs). Reutilizado aqui pra ajustar height/showLabels dos
// TrendCharts em mobile.

const PageFluxo = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month, semInvestimento, extraFilters }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, semInvestimento, extraFilters), [statusFilter, drilldown, year, month, semInvestimento, extraFilters]);
  const isMobile = useIsMobile();
  const [view, setView] = useState("horizontal");
  const [range, setRange] = useState("12M");
  const [expandedRec, setExpandedRec] = useState({});
  const [expandedDesp, setExpandedDesp] = useState({});
  const toggleRec = (cat) => setExpandedRec(prev => ({ ...prev, [cat]: !prev[cat] }));
  const toggleDesp = (cat) => setExpandedDesp(prev => ({ ...prev, [cat]: !prev[cat] }));
  const months6 = B.MONTHS_FULL.slice(0, 6);
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();
  const handleMonthHeader = (i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    const mn = B.MONTHS_FULL[i] || "";
    setDrilldown({ type: "mes", value: ym, label: `${mn.charAt(0).toUpperCase() + mn.slice(1, 3)}/${refYear}` });
  };
  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(drilldown.value.slice(5, 7), 10) - 1 : -1;

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Fluxo de Caixa</h1>
          <div className="status-line">Análise horizontal/vertical e saldos por mês</div>
        </div>
        <div className="actions">
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      <div className="metric-strip">
        <div className="metric">
          <div className="m-label">Receita total</div>
          <div className="m-value">{B.fmt(B.TOTAL_RECEITA)}</div>
          <div className="m-pct">100%</div>
          <div className="m-bar"><div style={{ width: `100%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Despesa total</div>
          <div className="m-value">{B.fmt(B.TOTAL_DESPESA)}</div>
          <div className="m-pct">{B.TOTAL_RECEITA > 0 ? `${((B.TOTAL_DESPESA / B.TOTAL_RECEITA) * 100).toFixed(2).replace(".",",")}%` : "—"}</div>
          <div className="m-bar red"><div style={{ width: `${B.TOTAL_RECEITA > 0 ? Math.min(100, (B.TOTAL_DESPESA / B.TOTAL_RECEITA) * 100) : 0}%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Valor líquido</div>
          <div className="m-value" style={{ color: B.VALOR_LIQUIDO >= 0 ? "var(--green)" : "var(--red)" }}>{B.fmt(B.VALOR_LIQUIDO)}</div>
          <div className="m-pct">{B.MARGEM_LIQUIDA.toFixed(2).replace(".",",")}%</div>
          <div className="m-bar cyan"><div style={{ width: `${Math.min(100, Math.max(0, B.MARGEM_LIQUIDA))}%` }} /></div>
        </div>
        <div className="metric">
          <div className="m-label">Margem líquida</div>
          <div className="m-value">{B.MARGEM_LIQUIDA.toFixed(2).replace(".",",")}%</div>
          <div className="m-pct">média do período</div>
          <div className="m-bar"><div style={{ width: `${Math.min(100, Math.max(0, B.MARGEM_LIQUIDA))}%` }} /></div>
        </div>
      </div>

      <div className="row" style={{ gridTemplateColumns: "minmax(220px, 1fr) minmax(0, 4fr)" }}>
        <div className="card">
          <h2 className="card-title">Valor líquido por mês</h2>
          <DivergingBars values={B.VALOR_LIQ_SERIES} labels={B.MONTHS.map(m => m.charAt(0).toUpperCase() + m.slice(1))} />
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Fluxo de caixa</h2>
            <div className="seg">
              <button className={view === "horizontal" ? "active" : ""} onClick={() => setView("horizontal")}>Análise horizontal</button>
              <button className={view === "vertical" ? "active" : ""} onClick={() => setView("vertical")}>Análise vertical</button>
            </div>
          </div>
          <div className="status-line" style={{ marginBottom: 8, fontSize: 11 }}>
            {view === "vertical"
              ? "Vertical: todas as linhas (receita e despesa) como % da receita do mês"
              : "Horizontal: cada mês como % do total anual da linha"}
          </div>
          <div className="t-scroll" style={{ maxHeight: 320 }}>
            <table className="t">
              <thead>
                <tr>
                  <th style={{ minWidth: 200 }}>Receita / Despesa</th>
                  {months6.map((m, i) => {
                    const isActive = i === activeMonthIdx;
                    return (
                      <React.Fragment key={m}>
                        <th className={`num clickable-th ${isActive ? "active" : ""}`}
                            onClick={() => handleMonthHeader(i)}
                            style={{ cursor: "pointer" }}
                            title="Clique para filtrar este mês">
                          {m}
                        </th>
                        <th className="num">{view === "horizontal" ? "Δ%" : "%"}</th>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {/* Pre-calcula totais usados nas duas análises */}
                {(() => null)()}
                <tr className="section">
                  <td>Receita</td>
                  {months6.map((_, i) => {
                    const total = B.FLUXO_RECEITA.reduce((s, r) => s + (r.values[i] || 0), 0);
                    let pctLabel = "100%";
                    let pctColor = "var(--fg-3)";
                    if (view === "horizontal") {
                      // Total ANUAL da seção Receita (soma todos os meses)
                      const totalAno = B.FLUXO_RECEITA.reduce((s, r) => s + r.values.reduce((a, b) => a + (b || 0), 0), 0);
                      pctLabel = totalAno ? ((total / totalAno) * 100).toFixed(1).replace(".", ",") + "%" : "—";
                    } else {
                      // Vertical: receita do mês = 100% da base
                      pctLabel = "100%";
                    }
                    return (
                      <React.Fragment key={i}>
                        <td className="num green">{B.fmt(total)}</td>
                        <td className="num" style={{ color: pctColor, fontWeight: view === "horizontal" ? 600 : 400 }}>{pctLabel}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
                {B.FLUXO_RECEITA.map(row => {
                  const hasChildren = row.children && row.children.length > 0;
                  const isOpen = expandedRec[row.cat];
                  return (
                    <React.Fragment key={row.cat}>
                      <tr style={hasChildren ? { cursor: "pointer" } : {}} onClick={hasChildren ? () => toggleRec(row.cat) : undefined}>
                        <td>
                          {hasChildren
                            ? <span className="chev" style={{ display: "inline-block", transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                            : <span className="chev" style={{ visibility: "hidden" }}>▶</span>}
                          {row.cat}
                        </td>
                        {months6.map((_, i) => {
                          const v = row.values[i] || 0;
                          let pctLabel = "0,00%";
                          let pctColor = "var(--fg-3)";
                          if (view === "vertical") {
                            const totalReceitaMes = B.FLUXO_RECEITA.reduce((s, r) => s + (r.values[i] || 0), 0);
                            const pct = totalReceitaMes ? (v / totalReceitaMes) * 100 : 0;
                            pctLabel = pct.toFixed(2).replace(".", ",") + "%";
                          } else {
                            const totalAnoLinha = row.values.reduce((s, x) => s + (x || 0), 0);
                            pctLabel = totalAnoLinha ? ((v / totalAnoLinha) * 100).toFixed(1).replace(".", ",") + "%" : "—";
                          }
                          return (
                            <React.Fragment key={i}>
                              <td className="num green">{B.fmt(v)}</td>
                              <td className="num" style={{ color: pctColor }}>{pctLabel}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                      {hasChildren && isOpen && row.children.map(child => (
                        <tr key={child.cat} className="child-row" style={{ opacity: 0.85 }}>
                          <td style={{ paddingLeft: 28 }}>{child.cat}</td>
                          {months6.map((_, i) => {
                            const v = child.values[i] || 0;
                            let pctLabel = "0,00%";
                            let pctColor = "var(--fg-3)";
                            if (view === "vertical") {
                              const totalReceitaMes = B.FLUXO_RECEITA.reduce((s, r) => s + (r.values[i] || 0), 0);
                              const pct = totalReceitaMes ? (v / totalReceitaMes) * 100 : 0;
                              pctLabel = pct.toFixed(2).replace(".", ",") + "%";
                            } else {
                              const totalAnoLinha = child.values.reduce((s, x) => s + (x || 0), 0);
                              pctLabel = totalAnoLinha ? ((v / totalAnoLinha) * 100).toFixed(1).replace(".", ",") + "%" : "—";
                            }
                            return (
                              <React.Fragment key={i}>
                                <td className="num green" style={{ fontSize: 11 }}>{B.fmt(v)}</td>
                                <td className="num" style={{ color: pctColor, fontSize: 11 }}>{pctLabel}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
                <tr className="section">
                  <td>Despesa</td>
                  {months6.map((_, i) => {
                    const totalDespesa = B.FLUXO_DESPESA.reduce((s, r) => s + (r.values[i] || 0), 0);
                    let pctLabel = "—";
                    let pctColor = "var(--fg-3)";
                    if (view === "vertical") {
                      // Despesa total do mês como % da receita do mês
                      const totalReceitaMes = B.FLUXO_RECEITA.reduce((s, r) => s + (r.values[i] || 0), 0);
                      pctLabel = totalReceitaMes ? ((totalDespesa / totalReceitaMes) * 100).toFixed(2).replace(".", ",") + "%" : "—";
                      pctColor = totalDespesa > totalReceitaMes ? "var(--red)" : "var(--fg-3)";
                    } else {
                      // Horizontal: % do total anual da seção Despesa
                      const totalAnoDesp = B.FLUXO_DESPESA.reduce((s, r) => s + r.values.reduce((a, b) => a + (b || 0), 0), 0);
                      pctLabel = totalAnoDesp ? ((totalDespesa / totalAnoDesp) * 100).toFixed(1).replace(".", ",") + "%" : "—";
                    }
                    return (
                      <React.Fragment key={i}>
                        <td className="num red">{B.fmt(totalDespesa)}</td>
                        <td className="num" style={{ color: pctColor, fontWeight: view === "horizontal" ? 600 : 400 }}>{pctLabel}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
                {B.FLUXO_DESPESA.map(row => {
                  const hasChildren = row.children && row.children.length > 0;
                  const isOpen = expandedDesp[row.cat];
                  return (
                    <React.Fragment key={row.cat}>
                      <tr style={hasChildren ? { cursor: "pointer" } : {}} onClick={hasChildren ? () => toggleDesp(row.cat) : undefined}>
                        <td>
                          {hasChildren
                            ? <span className="chev" style={{ display: "inline-block", transition: "transform 0.2s", transform: isOpen ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                            : <span className="chev" style={{ visibility: "hidden" }}>▶</span>}
                          {row.cat}
                        </td>
                        {months6.map((_, i) => {
                          const v = row.values[i] || 0;
                          let pctLabel = "0,00%";
                          let pctColor = "var(--fg-3)";
                          if (view === "vertical") {
                            const totalReceitaMes = B.FLUXO_RECEITA.reduce((s, r) => s + (r.values[i] || 0), 0);
                            const pct = totalReceitaMes ? (v / totalReceitaMes) * 100 : 0;
                            pctLabel = pct.toFixed(2).replace(".", ",") + "%";
                          } else {
                            const totalAnoLinha = row.values.reduce((s, x) => s + (x || 0), 0);
                            pctLabel = totalAnoLinha ? ((v / totalAnoLinha) * 100).toFixed(1).replace(".", ",") + "%" : "—";
                          }
                          return (
                            <React.Fragment key={i}>
                              <td className="num red">{B.fmt(v)}</td>
                              <td className="num" style={{ color: pctColor }}>{pctLabel}</td>
                            </React.Fragment>
                          );
                        })}
                      </tr>
                      {hasChildren && isOpen && row.children.map(child => (
                        <tr key={child.cat} className="child-row" style={{ opacity: 0.85 }}>
                          <td style={{ paddingLeft: 28 }}>{child.cat}</td>
                          {months6.map((_, i) => {
                            const v = child.values[i] || 0;
                            let pctLabel = "0,00%";
                            let pctColor = "var(--fg-3)";
                            if (view === "vertical") {
                              const totalReceitaMes = B.FLUXO_RECEITA.reduce((s, r) => s + (r.values[i] || 0), 0);
                              const pct = totalReceitaMes ? (v / totalReceitaMes) * 100 : 0;
                              pctLabel = pct.toFixed(2).replace(".", ",") + "%";
                            } else {
                              const totalAnoLinha = child.values.reduce((s, x) => s + (x || 0), 0);
                              pctLabel = totalAnoLinha ? ((v / totalAnoLinha) * 100).toFixed(1).replace(".", ",") + "%" : "—";
                            }
                            return (
                              <React.Fragment key={i}>
                                <td className="num red" style={{ fontSize: 11 }}>{B.fmt(v)}</td>
                                <td className="num" style={{ color: pctColor, fontSize: 11 }}>{pctLabel}</td>
                              </React.Fragment>
                            );
                          })}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
                <tr className="total">
                  <td>Total Líquido</td>
                  {months6.map((_, i) => {
                    const r = B.FLUXO_RECEITA.reduce((s, r) => s + (r.values[i] || 0), 0);
                    const d = B.FLUXO_DESPESA.reduce((s, r) => s + (r.values[i] || 0), 0);
                    const liq = r - d;
                    let pctLabel = "—";
                    let pctColor = liq >= 0 ? "var(--green)" : "var(--red)";
                    if (view === "vertical") {
                      // Margem líquida: liq / receita do mês
                      pctLabel = r ? ((liq / r) * 100).toFixed(2).replace(".", ",") + "%" : "—";
                    } else {
                      // Horizontal: cada mês como % do total liquido anual
                      const liqAno = B.FLUXO_RECEITA.reduce((s, rr) => s + rr.values.reduce((a, b) => a + (b || 0), 0), 0)
                                   - B.FLUXO_DESPESA.reduce((s, rr) => s + rr.values.reduce((a, b) => a + (b || 0), 0), 0);
                      pctLabel = liqAno ? ((liq / liqAno) * 100).toFixed(1).replace(".", ",") + "%" : "—";
                    }
                    return (
                      <React.Fragment key={i}>
                        <td className="num" style={{ color: liq >= 0 ? "var(--green)" : "var(--red)" }}>{B.fmt(liq)}</td>
                        <td className="num" style={{ color: pctColor, fontWeight: 600 }}>{pctLabel}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <div className="card">
        <h2 className="card-title">Saldos acumulados por mês</h2>
        <TrendChart
          values={B.SALDOS_MES}
          labels={B.MONTHS.map(m => m.charAt(0).toUpperCase() + m.slice(1) + " " + String((B.META && B.META.ref_year) || "").slice(-2))}
          color="var(--cyan)"
          height={isMobile ? 200 : 300}
          showLabels={!isMobile}
          gradientId="fl-saldos"
        />
      </div>
    </div>
  );
};

const PageTesouraria = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month, semInvestimento, extraFilters }) => {
  // Segmentos separados para KPIs e pulso: respeitam ano/mês mas sem drilldown externo
  // (drilldown externo viria de outro tipo, e.g. 'categoria' — não se aplica aqui)
  const Breal = useMemo(() => window.getBit('realizado', null, year, month, semInvestimento, extraFilters), [year, month, semInvestimento, extraFilters]);
  const Bpend = useMemo(() => window.getBit('a_pagar_receber', null, year, month, semInvestimento, extraFilters), [year, month, semInvestimento, extraFilters]);
  // Saldo acumulado: sempre ano completo (month=0) para mostrar os 12 meses
  const Btudo = useMemo(() => window.getBit('tudo', null, year, 0, semInvestimento, extraFilters), [year, semInvestimento, extraFilters]);
  const B = Breal; // alias para fmt / MONTHS / META
  const isMobile = useIsMobile();

  const recebido      = Breal.TOTAL_RECEITA;
  const aReceber      = Bpend.TOTAL_RECEITA;
  const pago          = Breal.TOTAL_DESPESA;
  const aPagar        = Bpend.TOTAL_DESPESA;
  const recDiaSeg      = Breal.RECEITA_DIA;
  const pagoDiaSeg     = Breal.DESPESA_DIA;
  const aReceberDiaSeg = Bpend.RECEITA_DIA;
  const aPagarDiaSeg   = Bpend.DESPESA_DIA;

  const saldosMes = Btudo.SALDOS_MES;
  const SALDOS_REAIS = (window.BIT_EXTRAS && window.BIT_EXTRAS.saldos) || null;
  const saldoInicial = (function() {
    if (!SALDOS_REAIS || !SALDOS_REAIS.last) return 0;
    const lastDate = new Date(SALDOS_REAIS.last.data);
    const lastMonthIdx = lastDate.getMonth();
    let acumAteAgora = 0;
    for (let i = 0; i <= lastMonthIdx; i++) acumAteAgora += saldosMes[i] || 0;
    return SALDOS_REAIS.last.total - acumAteAgora;
  })();
  const saldosCum = saldosMes.reduce((acc, v, i) => {
    acc.push((acc[i - 1] != null ? acc[i - 1] : saldoInicial) + (v || 0));
    return acc;
  }, []);
  const sMax = Math.max(...saldosCum, 0);
  const sMin = Math.min(...saldosCum, 0);
  const sMed = saldosCum.length ? saldosCum.reduce((s, v) => s + v, 0) / saldosCum.length : 0;

  // Fluxo Projetado (fonte: FLUXO_PROJETADO.totais gerado por fetch-saldos.cjs)
  const fpTotais = (window.FLUXO_PROJETADO || {}).totais || [];
  const fpFmtD = (iso) => { if (!iso) return ''; const [fy,fm,fd] = iso.split('-'); return `${fd}/${fm}/${fy}`; };
  const fpTodayIso   = new Date().toISOString().slice(0, 10);
  const fpLastPast   = fpTotais.length ? [...fpTotais].reverse().find(r => r.data <= fpTodayIso) : null;
  const fpSaldoInicial = fpLastPast ? fpLastPast.saldoFinal : (fpTotais.length ? fpTotais[0].saldoInicial : 0);
  const fpPontos = fpTotais.map(r => ({ data: fpFmtD(r.data), saldo: r.saldoFinal }));
  const fpRisco = (() => {
    if (!fpTotais.length) return null;
    let primeiroNegativo = null;
    let minSaldo = fpSaldoInicial;
    let minSaldoData = null;
    const now = new Date(); now.setHours(0,0,0,0);
    for (const r of fpTotais) {
      if (r.saldoFinal < 0 && primeiroNegativo === null) {
        const [ry,rm,rd] = r.data.split('-').map(Number);
        const diasAte = Math.round((new Date(ry, rm-1, rd) - now) / 86400000);
        primeiroNegativo = { data: fpFmtD(r.data), saldo: r.saldoFinal, diasAte };
      }
      if (r.saldoFinal < minSaldo) { minSaldo = r.saldoFinal; minSaldoData = fpFmtD(r.data); }
    }
    return { primeiroNegativo, minSaldo, minSaldoData, saldoFinal: fpTotais[fpTotais.length - 1]?.saldoFinal || 0 };
  })();

  // Seleção de dia: estado local — não polui drilldown global nem interfere no month filter
  // DailyBars chama onBarClick(i, v): i=índice 0-based, v=valor monetário
  const [selectedDay, setSelectedDay] = useState(null);
  const handleDayClick = (idx, _val) => setSelectedDay(prev => prev === idx + 1 ? null : idx + 1);
  const activeDayIdx = selectedDay != null ? selectedDay - 1 : -1;

  // Lançamentos do dia selecionado (lidos direto de ALL_TX)
  const dayTx = useMemo(() => {
    if (!selectedDay || !window.ALL_TX) return [];
    const yearStr = String(year || window.REF_YEAR);
    return window.ALL_TX.filter(r => {
      if (r[2] !== selectedDay) return false;
      if (!r[1] || !r[1].startsWith(yearStr)) return false;
      if (month) { if (r[1] !== yearStr + '-' + String(month).padStart(2, '0')) return false; }
      if (semInvestimento && r[9]) return false;
      return true;
    }).sort((a, b) => b[5] - a[5]);
  }, [selectedDay, year, month, semInvestimento]);

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Tesouraria</h1>
          <div className="status-line"><span className="live-dot" /> Saldos e pulso · {(B.META && B.META.ref_year) || "—"}</div>
        </div>
        <div className="actions">
        </div>
      </div>

      <div className="row row-4">
        <KpiTile label="Recebido (PAGO)" value={recebido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sparkValues={recDiaSeg} sparkColor="var(--green)" tone="green" />
        <KpiTile label="A receber" value={aReceber.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sparkValues={aReceberDiaSeg} sparkColor="var(--cyan)" tone="cyan" />
        <KpiTile label="Pago" value={pago.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sparkValues={pagoDiaSeg} sparkColor="var(--red)" tone="red" />
        <KpiTile label="A pagar" value={aPagar.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} sparkValues={aPagarDiaSeg} sparkColor="var(--amber)" tone="amber" />
      </div>

      <div className="row row-1-1">
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Pulso de receitas</h2>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="chip green">Recebido · {B.fmt(recebido)}</span>
              <span className="chip cyan">A receber · {B.fmt(aReceber)}</span>
            </div>
          </div>
          <DailyBars values={recDiaSeg} color="green" onBarClick={handleDayClick} activeIdx={activeDayIdx} />
        </div>
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Pulso de despesas</h2>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <span className="chip red">Pago · {B.fmt(pago)}</span>
              <span className="chip" style={{ background: "rgba(245,158,11,0.12)", color: "#fcd34d", borderColor: "rgba(245,158,11,0.28)" }}>A pagar · {B.fmt(aPagar)}</span>
            </div>
          </div>
          <DailyBars values={pagoDiaSeg} color="red" onBarClick={handleDayClick} activeIdx={activeDayIdx} />
        </div>
      </div>

      {selectedDay && (
        <div className="card" style={{ marginBottom: 14 }}>
          <div className="card-title-row">
            <h2 className="card-title">
              Lançamentos · Dia {selectedDay}{month ? '/' + String(month).padStart(2, '0') : ''}/{year || window.REF_YEAR}
            </h2>
            <button onClick={() => setSelectedDay(null)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 10px', cursor: 'pointer', color: 'var(--mute)', fontSize: 12 }}>✕ fechar</button>
          </div>
          {dayTx.length === 0 ? (
            <div className="status-line">Nenhum lançamento encontrado para este dia.</div>
          ) : (
            <div className="t-scroll" style={{ maxHeight: 320 }}>
              <table className="t">
                <thead>
                  <tr><th>Tipo</th><th>Categoria</th><th>Cliente / Fornecedor</th><th className="num">Valor</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {dayTx.map((r, i) => (
                    <tr key={i}>
                      <td><span className={'chip ' + (r[0] === 'r' ? 'green' : 'red')} style={{ fontSize: 10 }}>{r[0] === 'r' ? 'receita' : 'despesa'}</span></td>
                      <td style={{ fontSize: 12 }}>{r[3] || '—'}</td>
                      <td style={{ fontSize: 12 }}>{(r[0] === 'r' ? r[4] : r[7]) || '—'}</td>
                      <td className="num" style={{ fontSize: 12, fontWeight: 600, color: r[0] === 'r' ? 'var(--green)' : 'var(--red)' }}>{B.fmt(r[5])}</td>
                      <td style={{ fontSize: 11, color: r[6] ? 'var(--green)' : 'var(--amber)' }}>{r[6] ? 'realizado' : 'pendente'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Bloco "Fluxo de Caixa Projetado" removido — só Fluxo a Vencer abaixo */}
      {(false) && (function() {
        const fp   = window.FLUXO_PROJETADO || {};
        const rows = fp.totais || [];
        if (!rows.length) return null;
        const fmtV = (n) => {
          const sign = n < 0 ? '-' : '';
          return `${sign}R$ ${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        };
        const fmtD = (iso) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
        const ultimoSaldo   = rows[rows.length - 1].saldoFinal;
        const todayIso      = new Date().toISOString().slice(0, 10);
        const lastPastRow   = [...rows].reverse().find(r => r.data <= todayIso);
        const saldoAtual    = lastPastRow ? lastPastRow.saldoFinal : rows[0].saldoInicial;
        const saldoAtualData = lastPastRow ? lastPastRow.data : rows[0].data;
        const variacaoTotal = ultimoSaldo - saldoAtual;
        const minSaldo      = Math.min(...rows.map(r => r.saldoFinal));
        const minRow        = rows.find(r => r.saldoFinal === minSaldo);

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
                <linearGradient id="fpTesGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
                </linearGradient>
              </defs>
              {mn < 0 && mx > 0 && (
                <line x1={PAD} y1={zeroY.toFixed(1)} x2={W - PAD} y2={zeroY.toFixed(1)}
                  stroke="rgba(239,68,68,0.35)" strokeWidth="1" strokeDasharray="4,3" />
              )}
              <path d={fill} fill="url(#fpTesGrad)" />
              <path d={line} fill="none" stroke="#22d3ee" strokeWidth="1.8" />
            </svg>
          );
        };

        return (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title-row">
              <h2 className="card-title">Fluxo de Caixa Projetado</h2>
              <span className="chip cyan" style={{ fontSize: 11 }}>
                {fmtD(rows[0].data)} → {fmtD(rows[rows.length - 1].data)} · {rows.length} dias
              </span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 14 }}>
              <div className="indicator-card" style={{ padding: 10 }}>
                <div className="kpi-label" style={{ fontSize: 10 }}>Saldo atual</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: saldoAtual >= 0 ? 'var(--cyan)' : 'var(--red)' }}>{fmtV(saldoAtual)}</div>
                <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 2 }}>{fmtD(saldoAtualData)}</div>
              </div>
              <div className="indicator-card" style={{ padding: 10 }}>
                <div className="kpi-label" style={{ fontSize: 10 }}>Saldo final projetado</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: ultimoSaldo >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtV(ultimoSaldo)}</div>
                <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 2 }}>{fmtD(rows[rows.length - 1].data)}</div>
              </div>
              <div className="indicator-card" style={{ padding: 10 }}>
                <div className="kpi-label" style={{ fontSize: 10 }}>Variação total</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: variacaoTotal >= 0 ? 'var(--green)' : 'var(--red)' }}>{variacaoTotal >= 0 ? '+' : ''}{fmtV(variacaoTotal)}</div>
              </div>
              <div className="indicator-card" style={{ padding: 10, background: minSaldo < 0 ? 'rgba(239,68,68,0.07)' : undefined }}>
                <div className="kpi-label" style={{ fontSize: 10 }}>Mínimo projetado</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 15, color: minSaldo >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmtV(minSaldo)}</div>
                {minRow && <div style={{ fontSize: 10, color: 'var(--mute)', marginTop: 2 }}>{fmtD(minRow.data)}</div>}
              </div>
            </div>
            <SparkFP />
            <div className="t-scroll" style={{ maxHeight: 280, marginTop: 10 }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th style={{ textAlign: 'right' }}>Saldo Inicial</th>
                    <th style={{ textAlign: 'right' }}>Líquido do Dia</th>
                    <th style={{ textAlign: 'right' }}>Saldo Final</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12 }}>{fmtD(r.data)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12 }}>{fmtV(r.saldoInicial)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, color: r.valorLiquidoDia >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {r.valorLiquidoDia >= 0 ? '+' : ''}{fmtV(r.valorLiquidoDia)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600, color: r.saldoFinal >= 0 ? 'var(--cyan)' : 'var(--red)' }}>
                        {fmtV(r.saldoFinal)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--mute)' }}>
              Consolidado: CREDCREA + Cresol + Santander + Omie.CASH · Detalhes por conta em <b>Fluxo Projetado</b>
            </div>
          </div>
        );
      })()}

      {/* Bloco "Saldo real + projeção" removido */}
      {(false) && (function() {
        const SALDOS = (window.BIT_EXTRAS && window.BIT_EXTRAS.saldos) || null;
        if (!SALDOS || !SALDOS.last) return null;
        const last = SALDOS.last;
        const contas = Object.entries(last.contas).sort((a, b) => b[1] - a[1]);
        // Projeção: saldo último + ∑(a receber) − ∑(a pagar) acumulado por mês.
        // Usa BIT_SEGMENTS.a_pagar_receber pra somar ainda-pendente por mês futuro.
        const seg = (window.BIT_SEGMENTS || {}).a_pagar_receber || { MONTH_DATA: [] };
        const lastDate = new Date(last.data);
        const lastMonthIdx = lastDate.getMonth();
        const proj = [];
        let saldo = last.total;
        for (let i = lastMonthIdx + 1; i < 12; i++) {
          const md = seg.MONTH_DATA[i] || { receita: 0, despesa: 0 };
          saldo += (md.receita || 0) - (md.despesa || 0);
          proj.push({ m: B.MONTHS_FULL[i] || `M${i+1}`, saldo });
        }
        const series = [last.total, ...proj.map(p => p.saldo)];
        const labels = ['Hoje', ...proj.map(p => p.m.slice(0,3))];
        const minProj = Math.min(...series);
        const maxProj = Math.max(...series);
        return (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card-title-row">
              <h2 className="card-title">Saldo atual e projeção</h2>
              <span className="chip cyan">Última atualização: {last.data.split('-').reverse().join('/')}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 18 }}>
              {contas.map(([nome, v]) => (
                <div key={nome} className="indicator-card" style={{ padding: 12 }}>
                  <div className="kpi-label" style={{ fontSize: 10 }}>{nome}</div>
                  <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 16, color: v >= 0 ? 'var(--green)' : 'var(--red)' }}>{B.fmt(v)}</div>
                </div>
              ))}
              <div className="indicator-card" style={{ padding: 12, background: 'rgba(34,211,238,0.08)' }}>
                <div className="kpi-label" style={{ fontSize: 10 }}>Total</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, fontSize: 18, color: 'var(--cyan)' }}>{B.fmt(last.total)}</div>
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <div className="kpi-label" style={{ marginBottom: 6 }}>Projeção mensal (saldo + a receber − a pagar)</div>
              <TrendChart values={series} labels={labels} color="var(--cyan)" height={isMobile ? 160 : 200} showPoints={true} showLabels={!isMobile} gradientId="ts-proj" />
              <div style={{ display: 'flex', gap: 24, marginTop: 8, fontSize: 11, color: 'var(--mute)' }}>
                <span>Mínima projetada: <b style={{ color: minProj >= 0 ? 'var(--green)' : 'var(--red)' }}>{B.fmt(minProj)}</b></span>
                <span>Máxima projetada: <b style={{ color: 'var(--green)' }}>{B.fmt(maxProj)}</b></span>
                <span>Final do ano: <b style={{ color: series[series.length-1] >= 0 ? 'var(--green)' : 'var(--red)' }}>{B.fmt(series[series.length-1])}</b></span>
              </div>
            </div>
          </div>
        );
      })()}

      <div className="row" style={{ gridTemplateColumns: "minmax(0, 7fr) minmax(0, 5fr)" }}>
        <div className="card">
          <h2 className="card-title">Saldo acumulado por mês</h2>
          <div style={{ display: "flex", gap: 24, marginBottom: 14, flexWrap: "wrap" }}>
            <div><div className="kpi-label">Saldo Máximo</div><div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--green)" }}>{B.fmt(sMax)}</div></div>
            <div><div className="kpi-label">Saldo Mínimo</div><div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--red)" }}>{B.fmt(sMin)}</div></div>
            <div><div className="kpi-label">Saldo Médio</div><div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--cyan)" }}>{B.fmt(sMed)}</div></div>
            {SALDOS_REAIS && SALDOS_REAIS.last && (
              <div><div className="kpi-label">Saldo atual (planilha)</div><div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--cyan)" }}>{B.fmt(SALDOS_REAIS.last.total)}</div></div>
            )}
          </div>
          <TrendChart values={saldosCum} labels={B.MONTHS} color="var(--cyan)" height={isMobile ? 160 : 200} showPoints={true} showLabels={!isMobile} gradientId="ts-saldo" />
          <div className="status-line" style={{ marginTop: 6 }}>
            Saldo cumulativo: parte de R$ {(B.fmt(saldoInicial) || "0").replace("R$ ", "")} no início do ano e acumula receitas − despesas mês a mês.
          </div>
        </div>

        <div className="card">
          <h2 className="card-title">Fluxo a vencer (saldo projetado dia a dia)</h2>
          {fpTotais.length === 0 ? null : (
            <>
              <div className="status-line" style={{ marginBottom: 8 }}>
                {fpTotais.length} dias projetados · saldo inicial <b style={{ color: "var(--cyan)" }}>{B.fmt(fpSaldoInicial)}</b>
              </div>
              {fpRisco && (
                <div className={`tesouraria-risco ${fpRisco.primeiroNegativo ? "risco-critico" : fpRisco.minSaldo < fpSaldoInicial * 0.3 ? "risco-atencao" : "risco-ok"}`}>
                  {fpRisco.primeiroNegativo ? (
                    <>
                      <div className="risco-icon">⚠</div>
                      <div className="risco-body">
                        <div className="risco-titulo">
                          SALDO ENTRA EM VERMELHO EM <b>{fpRisco.primeiroNegativo.data}</b>
                          {fpRisco.primeiroNegativo.diasAte != null && <span className="risco-dias"> (em {fpRisco.primeiroNegativo.diasAte} {fpRisco.primeiroNegativo.diasAte === 1 ? "dia" : "dias"})</span>}
                        </div>
                        <div className="risco-min">
                          Mínimo projetado: <b style={{ color: "var(--red)" }}>{B.fmt(fpRisco.minSaldo)}</b>{fpRisco.minSaldoData && <> em {fpRisco.minSaldoData}</>} · Saldo final: <b style={{ color: fpRisco.saldoFinal >= 0 ? "var(--green)" : "var(--red)" }}>{B.fmt(fpRisco.saldoFinal)}</b>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="risco-icon">{fpRisco.minSaldo < fpSaldoInicial * 0.3 ? "⚠" : "✓"}</div>
                      <div className="risco-body">
                        <div className="risco-titulo">{fpRisco.minSaldo < fpSaldoInicial * 0.3 ? "SALDO MÍNIMO PROJETADO ABAIXO DE 30% DO ATUAL" : "CAIXA SAUDÁVEL NO HORIZONTE"}</div>
                        <div className="risco-detalhe">
                          Mínimo: <b style={{ color: fpRisco.minSaldo < fpSaldoInicial * 0.3 ? "var(--amber)" : "var(--green)" }}>{B.fmt(fpRisco.minSaldo)}</b>{fpRisco.minSaldoData && <> em {fpRisco.minSaldoData}</>} · Final: <b style={{ color: "var(--green)" }}>{B.fmt(fpRisco.saldoFinal)}</b>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
              {fpPontos.length > 1 && (
                <div className="tesouraria-mini-chart">
                  <SaldoProjetadoChart pontos={fpPontos} saldoInicial={fpSaldoInicial} />
                </div>
              )}
              <div className="t-scroll" style={{ maxHeight: 380 }}>
                <table className="t">
                  <thead>
                    <tr><th>Data</th><th className="num">Saldo Inicial</th><th className="num">Líquido</th><th className="num">Saldo Final</th></tr>
                  </thead>
                  <tbody>
                    {fpTotais.map((r, i) => {
                      const prev = i > 0 ? fpTotais[i - 1].saldoFinal : fpSaldoInicial;
                      const cruzouZero = prev >= 0 && r.saldoFinal < 0;
                      return (
                        <tr key={i} className={cruzouZero ? "tesouraria-row-critica" : ""}>
                          <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{fpFmtD(r.data)}</td>
                          <td className="num" style={{ fontSize: 11 }}>{B.fmt(r.saldoInicial)}</td>
                          <td className={`num ${r.valorLiquidoDia >= 0 ? "green" : "red"}`} style={{ fontSize: 11 }}>{r.valorLiquidoDia >= 0 ? '+' : ''}{B.fmt(r.valorLiquidoDia)}</td>
                          <td className="num" style={{ fontSize: 11, fontWeight: 600, color: r.saldoFinal < 0 ? "var(--red)" : r.saldoFinal < fpSaldoInicial * 0.3 ? "var(--amber)" : "var(--cyan)" }}>{B.fmt(r.saldoFinal)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// Mini chart SVG do saldo projetado dia-a-dia, com marcador da data crítica
const SaldoProjetadoChart = ({ pontos, saldoInicial }) => {
  const W = 800, H = 160, padX = 40, padTop = 16, padBottom = 32;
  if (pontos.length < 2) return null;
  const valores = [saldoInicial, ...pontos.map(p => p.saldo)];
  const min = Math.min(0, ...valores);
  const max = Math.max(...valores);
  const range = (max - min) || 1;
  const stepX = (W - padX * 2) / (pontos.length - 0);
  const xOf = (i) => padX + i * stepX;
  const yOf = (v) => padTop + (1 - (v - min) / range) * (H - padTop - padBottom);
  const zeroY = yOf(0);
  // Path da linha
  const points = pontos.map((p, i) => `${xOf(i + 1)},${yOf(p.saldo)}`).join(" ");
  const startPoint = `${xOf(0)},${yOf(saldoInicial)}`;
  // Área pra preenchimento
  const areaPath = `M ${startPoint} L ${points.replace(/ /g, " L ")} L ${xOf(pontos.length)},${yOf(min)} L ${xOf(0)},${yOf(min)} Z`;
  // Detecta primeira data com saldo negativo
  let critIdx = -1;
  for (let i = 0; i < pontos.length; i++) {
    if (pontos[i].saldo < 0) { critIdx = i; break; }
  }
  // Labels de data: a cada N pontos pra não amassar
  const labelStep = Math.max(1, Math.ceil(pontos.length / 8));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: H, marginBottom: 12 }}>
      <defs>
        <linearGradient id="ts-proj-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--cyan)" stopOpacity="0.32" />
          <stop offset="100%" stopColor="var(--cyan)" stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* zero line */}
      {zeroY > padTop && zeroY < H - padBottom && (
        <line x1={padX} y1={zeroY} x2={W - 10} y2={zeroY} stroke="rgba(239, 68, 68, 0.4)" strokeDasharray="4 4" strokeWidth="1" />
      )}
      {zeroY > padTop && zeroY < H - padBottom && (
        <text x={W - 10} y={zeroY - 4} textAnchor="end" fontSize="10" fill="var(--red)" fontFamily="var(--font-mono)">R$ 0</text>
      )}
      {/* área */}
      <path d={areaPath} fill="url(#ts-proj-grad)" />
      {/* linha */}
      <polyline points={`${startPoint} ${points}`} fill="none" stroke="var(--cyan)" strokeWidth="2" />
      {/* marcador inicial */}
      <circle cx={xOf(0)} cy={yOf(saldoInicial)} r="4" fill="var(--cyan)" stroke="#0a141a" strokeWidth="2" />
      <text x={xOf(0)} y={yOf(saldoInicial) - 8} textAnchor="middle" fontSize="10" fill="var(--cyan)" fontFamily="var(--font-mono)">Hoje</text>
      {/* marcador crítico */}
      {critIdx >= 0 && (
        <g>
          <line x1={xOf(critIdx + 1)} y1={padTop} x2={xOf(critIdx + 1)} y2={H - padBottom} stroke="var(--red)" strokeDasharray="3 3" strokeWidth="1.2" />
          <circle cx={xOf(critIdx + 1)} cy={yOf(pontos[critIdx].saldo)} r="5" fill="var(--red)" stroke="#0a141a" strokeWidth="2" />
          <text x={xOf(critIdx + 1)} y={padTop - 2} textAnchor="middle" fontSize="10" fontWeight="700" fill="var(--red)">{pontos[critIdx].data}</text>
        </g>
      )}
      {/* labels de data no eixo x */}
      {pontos.map((p, i) => {
        if (i % labelStep !== 0 && i !== pontos.length - 1) return null;
        return (
          <text key={i} x={xOf(i + 1)} y={H - 12} textAnchor="middle" fontSize="9" fill="var(--mute)">{p.data.slice(0, 5)}</text>
        );
      })}
    </svg>
  );
};

const PageComparativo = ({ statusFilter, drilldown, setDrilldown, year, month, semInvestimento, extraFilters }) => {
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, semInvestimento, extraFilters), [statusFilter, drilldown, year, month, semInvestimento, extraFilters]);
  const refYear = window.REF_YEAR || new Date().getFullYear();
  const fmt = (B && B.fmt) || (n => `R$ ${n.toFixed(2)}`);
  const fmtPct = (B && B.fmtPct) || (n => `${n.toFixed(1)}%`);

  // Estado dos 2 periodos comparados — cada um eh { y, kind: 'mes'|'trim'|'ano', val }
  const [p1, setP1] = useState({ y: refYear, kind: "trim", val: 1 });
  const [p2, setP2] = useState({ y: refYear, kind: "trim", val: 2 });
  const [expanded, setExpanded] = useState({ Receita: true, Despesa: true });

  // Calcula bounds de mes do periodo
  const periodBounds = (p) => {
    if (p.kind === "ano") return { y: p.y, mIni: 1, mFim: 12 };
    if (p.kind === "trim") {
      const tStart = (p.val - 1) * 3 + 1;
      return { y: p.y, mIni: tStart, mFim: tStart + 2 };
    }
    return { y: p.y, mIni: p.val, mFim: p.val }; // mes
  };
  const periodLabel = (p) => {
    if (p.kind === "ano") return `${p.y} · Ano completo`;
    if (p.kind === "trim") {
      const lbl = ["jan-mar", "abr-jun", "jul-set", "out-dez"][p.val - 1];
      return `${p.y} · Trim ${p.val} (${lbl})`;
    }
    const mn = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][p.val - 1];
    return `${mn}/${p.y}`;
  };

  // Filtra ALL_TX por periodo + statusFilter; agrega receitas/despesas por categoria
  const aggregate = (p) => {
    const allTx = window.ALL_TX || [];
    const filterTx = window.filterTx;
    const sf = statusFilter || window.BIT_FILTER || "realizado";
    const txFiltered = filterTx ? filterTx(allTx, sf, null) : allTx;
    const { y, mIni, mFim } = periodBounds(p);
    const mIniStr = `${y}-${String(mIni).padStart(2, "0")}`;
    const mFimStr = `${y}-${String(mFim).padStart(2, "0")}`;
    let totalRec = 0, totalDesp = 0;
    const recCat = new Map(), despCat = new Map();
    for (const row of txFiltered) {
      const [kind, mes, , categoria, , valor] = row;
      if (!mes || mes < mIniStr || mes > mFimStr) continue;
      if (kind === "r") {
        totalRec += valor;
        recCat.set(categoria, (recCat.get(categoria) || 0) + valor);
      } else {
        totalDesp += valor;
        despCat.set(categoria, (despCat.get(categoria) || 0) + valor);
      }
    }
    return { totalRec, totalDesp, liq: totalRec - totalDesp, recCat, despCat };
  };

  const a1 = useMemo(() => aggregate(p1), [p1, statusFilter]);
  const a2 = useMemo(() => aggregate(p2), [p2, statusFilter]);

  const safePct = (a, b) => b !== 0 ? (a / b) * 100 : (a !== 0 ? 100 : 0);
  const diffReceita = a2.totalRec - a1.totalRec;
  const diffReceitaPct = safePct(diffReceita, a1.totalRec);
  const diffDespesa = a2.totalDesp - a1.totalDesp;
  const diffDespesaPct = safePct(diffDespesa, a1.totalDesp);
  const diffLiq = a2.liq - a1.liq;
  const diffLiqPct = safePct(diffLiq, Math.abs(a1.liq) || 1);

  // Top categorias unidas (union de p1 + p2)
  const allRecCats = new Set([...a1.recCat.keys(), ...a2.recCat.keys()]);
  const allDespCats = new Set([...a1.despCat.keys(), ...a2.despCat.keys()]);

  // Selector compacto: ano + tipo + valor
  const PeriodPicker = ({ value, onChange, label }) => {
    const yearsAvail = window.AVAILABLE_YEARS || [refYear];
    const monthOpts = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
    return (
      <div style={{ marginBottom: 12 }}>
        <div className="filter-mini-label">{label}</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginBottom: 6 }}>
          <select className="filter-select" value={value.y} onChange={e => onChange({ ...value, y: Number(e.target.value) })}>
            {yearsAvail.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="filter-select" value={value.kind} onChange={e => onChange({ ...value, kind: e.target.value, val: e.target.value === "mes" ? 1 : (e.target.value === "trim" ? 1 : 1) })}>
            <option value="mes">Mês</option>
            <option value="trim">Trimestre</option>
            <option value="ano">Ano completo</option>
          </select>
        </div>
        {value.kind === "mes" && (
          <select className="filter-select" style={{ width: "100%" }} value={value.val} onChange={e => onChange({ ...value, val: Number(e.target.value) })}>
            {monthOpts.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
          </select>
        )}
        {value.kind === "trim" && (
          <select className="filter-select" style={{ width: "100%" }} value={value.val} onChange={e => onChange({ ...value, val: Number(e.target.value) })}>
            <option value={1}>Trim 1 (jan-mar)</option>
            <option value={2}>Trim 2 (abr-jun)</option>
            <option value={3}>Trim 3 (jul-set)</option>
            <option value={4}>Trim 4 (out-dez)</option>
          </select>
        )}
        <div style={{ marginTop: 4, color: "var(--mute)", fontSize: 11, letterSpacing: "0.04em" }}>{periodLabel(value)}</div>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>Comparativo</h1>
          <div className="status-line">{periodLabel(p1)} vs {periodLabel(p2)}</div>
        </div>
        <div className="actions">
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown && setDrilldown(null)} />

      <div className="row row-3-9">
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card">
            <h2 className="card-title">Filtragem de datas</h2>
            <PeriodPicker value={p1} onChange={setP1} label="Data comparativa 1" />
            <PeriodPicker value={p2} onChange={setP2} label="Data comparativa 2" />
          </div>

          <div className="card">
            <h2 className="card-title">Indicadores principais</h2>
            <div style={{ display: "grid", gap: 12 }}>
              <div className={`indicator-card ${diffReceita >= 0 ? "" : "red"}`}>
                <div className="kpi-label">Diferença na receita</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: diffReceita >= 0 ? "var(--green)" : "var(--red)", letterSpacing: "-0.02em" }}>{fmt(diffReceita)}</div>
                <div className={`kpi-delta ${diffReceita >= 0 ? "up" : "down"}`}>{fmtPct(diffReceitaPct)}</div>
              </div>
              <div className={`indicator-card ${diffDespesa <= 0 ? "" : "red"}`}>
                <div className="kpi-label">Diferença nas despesas</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: diffDespesa <= 0 ? "var(--green)" : "var(--red)", letterSpacing: "-0.02em" }}>{fmt(diffDespesa)}</div>
                <div className={`kpi-delta ${diffDespesa <= 0 ? "up" : "down"}`}>{fmtPct(diffDespesaPct)}</div>
              </div>
              <div className={`indicator-card ${diffLiq >= 0 ? "" : "red"}`}>
                <div className="kpi-label">Diferença do valor líquido</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: diffLiq >= 0 ? "var(--green)" : "var(--red)", letterSpacing: "-0.02em" }}>{fmt(diffLiq)}</div>
                <div className={`kpi-delta ${diffLiq >= 0 ? "up" : "down"}`}>{fmtPct(diffLiqPct)}</div>
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Análise comparativa entre períodos</h2>
          </div>
          <div className="t-scroll" style={{ maxHeight: 540 }}>
            <table className="t">
              <thead>
                <tr>
                  <th>Receita / Despesa</th>
                  <th className="num">{periodLabel(p1)}</th>
                  <th className="num">{periodLabel(p2)}</th>
                  <th className="num">Δ Comparativo</th>
                  <th className="num">%</th>
                </tr>
              </thead>
              <tbody>
                {/* Header Receita */}
                <tr className="section">
                  <td>
                    <button onClick={() => setExpanded(s => ({ ...s, Receita: !s.Receita }))} style={{ background: "transparent", border: 0, color: "inherit", padding: 0, fontWeight: 700, fontFamily: "inherit", fontSize: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span className="chev">{expanded.Receita ? "−" : "+"}</span>Receita
                    </button>
                  </td>
                  <td className="num bold green">{fmt(a1.totalRec)}</td>
                  <td className="num bold green">{fmt(a2.totalRec)}</td>
                  <td className={`num bold ${diffReceita >= 0 ? "green" : "red"}`}>{fmt(diffReceita)}</td>
                  <td className={`num bold ${diffReceita >= 0 ? "green" : "red"}`}>{fmtPct(diffReceitaPct)}</td>
                </tr>
                {expanded.Receita && [...allRecCats].sort((x, y) => (a2.recCat.get(y) || 0) + (a1.recCat.get(y) || 0) - ((a2.recCat.get(x) || 0) + (a1.recCat.get(x) || 0))).map((cat, i) => {
                  const v1 = a1.recCat.get(cat) || 0;
                  const v2 = a2.recCat.get(cat) || 0;
                  const diff = v2 - v1;
                  const pct = safePct(diff, v1);
                  return (
                    <tr key={`r${i}`}>
                      <td style={{ paddingLeft: 24 }}><span className="chev">+</span>{cat}</td>
                      <td className="num green">{v1 !== 0 ? fmt(v1) : "—"}</td>
                      <td className="num green">{v2 !== 0 ? fmt(v2) : "—"}</td>
                      <td className={`num ${diff >= 0 ? "green" : "red"}`}>{fmt(diff)}</td>
                      <td className={`num ${diff >= 0 ? "green" : "red"}`}>{fmtPct(pct)}</td>
                    </tr>
                  );
                })}
                {/* Header Despesa */}
                <tr className="section">
                  <td>
                    <button onClick={() => setExpanded(s => ({ ...s, Despesa: !s.Despesa }))} style={{ background: "transparent", border: 0, color: "inherit", padding: 0, fontWeight: 700, fontFamily: "inherit", fontSize: "inherit", display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <span className="chev">{expanded.Despesa ? "−" : "+"}</span>Despesa
                    </button>
                  </td>
                  <td className="num bold red">{fmt(a1.totalDesp)}</td>
                  <td className="num bold red">{fmt(a2.totalDesp)}</td>
                  <td className={`num bold ${diffDespesa <= 0 ? "green" : "red"}`}>{fmt(diffDespesa)}</td>
                  <td className={`num bold ${diffDespesa <= 0 ? "green" : "red"}`}>{fmtPct(diffDespesaPct)}</td>
                </tr>
                {expanded.Despesa && [...allDespCats].sort((x, y) => (a2.despCat.get(y) || 0) + (a1.despCat.get(y) || 0) - ((a2.despCat.get(x) || 0) + (a1.despCat.get(x) || 0))).map((cat, i) => {
                  const v1 = a1.despCat.get(cat) || 0;
                  const v2 = a2.despCat.get(cat) || 0;
                  const diff = v2 - v1;
                  const pct = safePct(diff, v1);
                  return (
                    <tr key={`d${i}`}>
                      <td style={{ paddingLeft: 24 }}><span className="chev">+</span>{cat}</td>
                      <td className="num red">{v1 !== 0 ? fmt(v1) : "—"}</td>
                      <td className="num red">{v2 !== 0 ? fmt(v2) : "—"}</td>
                      <td className={`num ${diff <= 0 ? "green" : "red"}`}>{fmt(diff)}</td>
                      <td className={`num ${diff <= 0 ? "green" : "red"}`}>{fmtPct(pct)}</td>
                    </tr>
                  );
                })}
                <tr className="total">
                  <td>Total líquido</td>
                  <td className="num">{fmt(a1.liq)}</td>
                  <td className="num">{fmt(a2.liq)}</td>
                  <td className={`num ${diffLiq >= 0 ? "green" : "red"}`}>{fmt(diffLiq)}</td>
                  <td className={`num ${diffLiq >= 0 ? "green" : "red"}`}>{fmtPct(diffLiqPct)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ===== PageRelatorio =====
// Carrega report.json (gerado offline por generate-report.cjs) e renderiza
// um relatorio executivo imprimivel (Ctrl+P -> Save as PDF).
const PageRelatorio = ({ year, statusFilter }) => {
  const refYear = window.REF_YEAR || new Date().getFullYear();
  // Hooks de dados — DEVEM ficar antes de qualquer early return pra não violar
  // a ordem dos hooks. Os useMemo dependem de periodYear/periodMonth declarados abaixo
  // mas useMemo aceita refs do escopo via closure.
  // Estado do periodo a renderizar (defaults: ano corrente YTD)
  const [periodYear, setPeriodYear] = useState(() => {
    try { var p = JSON.parse(localStorage.getItem('bi.report.period') || 'null'); return (p && p.year) || (year || refYear); } catch (e) { return year || refYear; }
  });
  const [periodMonth, setPeriodMonth] = useState(() => {
    try { var p = JSON.parse(localStorage.getItem('bi.report.period') || 'null'); return (p && p.month) || 0; } catch (e) { return 0; } // 0 = ano completo
  });
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Cards reativos ao período (year + month) — antes usavam window.BIT global YTD
  // Mantidos no topo (regra dos hooks) — não chamar dentro de early returns
  const B = useMemo(
    () => window.getBit('realizado', null, periodYear, periodMonth),
    [periodYear, periodMonth]
  );
  const Bprev = useMemo(
    () => window.getBit('a_pagar_receber', null, periodYear, periodMonth),
    [periodYear, periodMonth]
  );

  // resolve o nome do arquivo conforme periodo
  const reportFileName = (y, m) => {
    if (m && m > 0) return `report-${y}-${String(m).padStart(2,'0')}.json`;
    if (y === refYear) return 'report.json'; // default mantem nome principal
    return `report-${y}.json`;
  };

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setGenerating(false);
    setError(null);
    setReport(null);
    try { localStorage.setItem('bi.report.period', JSON.stringify({ year: periodYear, month: periodMonth })); } catch (e) {}
    const file = reportFileName(periodYear, periodMonth);

    // 1) tenta o JSON embutido em window.BI_REPORTS (injetado pelo build-data.cjs)
    //    Fallback: fetch HTTP (funciona no Coolify, nao no file://)
    const embedded = window.BI_REPORTS && window.BI_REPORTS[file];
    const dataPromise = embedded
      ? Promise.resolve(embedded)
      : fetch(file, { cache: 'no-store' }).then(r => r.ok ? r.json() : null).catch(() => null);

    dataPromise.then(data => {
        if (cancelled) return;
        if (data) {
          setReport(data);
          setLoading(false);
          return null;
        }
        // 2) Fallback: chama a API publica de geracao on-demand
        const apiUrl = window.BI_REPORT_API;
        if (!apiUrl) {
          throw new Error('API de geracao nao configurada');
        }
        setLoading(false);
        setGenerating(true);
        return fetch(`${apiUrl}/generate-report`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            year: periodYear,
            month: periodMonth > 0 ? periodMonth : null,
          }),
        }).then(async (resp) => {
          if (cancelled) return;
          if (resp.status === 429) {
            const retry = resp.headers.get('Retry-After') || '3600';
            throw new Error(`Limite de geracao atingido. Tente novamente em ~${Math.ceil(Number(retry) / 60)} minutos.`);
          }
          if (!resp.ok) {
            const t = await resp.text().catch(() => '');
            throw new Error(`Falha ao gerar (HTTP ${resp.status}). Verifique conexao com Anthropic. ${t.slice(0,200)}`);
          }
          const generated = await resp.json();
          if (cancelled) return;
          setReport(generated);
          setGenerating(false);
        });
      })
      .catch(e => {
        if (cancelled) return;
        setError(e.message);
        setLoading(false);
        setGenerating(false);
      });
    return () => { cancelled = true; };
  }, [periodYear, periodMonth]);

  const MONTH_OPTIONS = [
    { v: 0, label: "Ano completo" },
    { v: 1, label: "Janeiro" }, { v: 2, label: "Fevereiro" }, { v: 3, label: "Março" },
    { v: 4, label: "Abril" }, { v: 5, label: "Maio" }, { v: 6, label: "Junho" },
    { v: 7, label: "Julho" }, { v: 8, label: "Agosto" }, { v: 9, label: "Setembro" },
    { v: 10, label: "Outubro" }, { v: 11, label: "Novembro" }, { v: 12, label: "Dezembro" },
  ];
  const availableYears = [2026];

  const PeriodToolbar = (
    <div className="report-period-toolbar" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, color: 'var(--mute)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>Período:</span>
      <select className="header-year" value={periodYear} onChange={e => setPeriodYear(Number(e.target.value))}>
        {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
      </select>
      <select className="header-year" value={periodMonth} onChange={e => setPeriodMonth(Number(e.target.value))}>
        {MONTH_OPTIONS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
      </select>
    </div>
  );

  if (loading) {
    return (
      <div className="page">
        <div className="page-title">
          <div><h1>Relatório IA</h1><div className="status-line">Carregando…</div></div>
          <div className="actions">{PeriodToolbar}</div>
        </div>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="page">
        <div className="page-title">
          <div>
            <h1>Relatório IA</h1>
            <div className="status-line">Gerando relatório com IA…</div>
          </div>
          <div className="actions">{PeriodToolbar}</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⚙️</div>
          <h2 className="card-title" style={{ textAlign: 'center' }}>Gerando análise…</h2>
          <p style={{ color: 'var(--fg-2)', lineHeight: 1.6, marginTop: 12 }}>
            Estamos disparando 7 chamadas à IA da Anthropic em paralelo para construir o relatório executivo deste período.
          </p>
          <p style={{ color: 'var(--fg-3)', fontSize: 13, marginTop: 8 }}>
            Geralmente leva ~30 segundos. Não feche esta página.
          </p>
          <div style={{ marginTop: 24, display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--cyan)', animation: 'pulse 1.4s ease-in-out infinite' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--cyan)', animation: 'pulse 1.4s ease-in-out 0.2s infinite' }} />
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: 'var(--cyan)', animation: 'pulse 1.4s ease-in-out 0.4s infinite' }} />
          </div>
        </div>
      </div>
    );
  }

  if (error || !report) {
    const monthLabel = periodMonth > 0 ? MONTH_OPTIONS[periodMonth].label + ' de ' : '';
    const cmd = periodMonth > 0
      ? `node generate-report.cjs --force --year=${periodYear} --month=${periodMonth}`
      : (periodYear === refYear ? `node generate-report.cjs --force` : `node generate-report.cjs --force --year=${periodYear}`);
    return (
      <div className="page">
        <div className="page-title">
          <div>
            <h1>Relatório IA</h1>
            <div className="status-line">Relatório de {monthLabel}{periodYear} ainda não foi gerado</div>
          </div>
          <div className="actions">{PeriodToolbar}</div>
        </div>
        <div className="card">
          <h2 className="card-title">Gerar agora</h2>
          <p style={{ color: "var(--fg-2)", lineHeight: 1.6, marginTop: 12 }}>
            Abra o terminal na pasta <code style={{ background: "var(--surface-2)", padding: "2px 6px", borderRadius: 4 }}>{"<cliente>"}-bi-web</code> e rode:
          </p>
          <pre style={{ background: "var(--surface-2)", padding: 12, borderRadius: 8, marginTop: 12, fontSize: 13, color: "var(--cyan)" }}>
            {cmd}
          </pre>
          <p style={{ color: "var(--fg-3)", fontSize: 12, marginTop: 12 }}>
            ~30s + 1 chamada Anthropic. Depois de pronto, recarregue esta página (mantém o período selecionado).
          </p>
          {error && <p style={{ color: "var(--red)", fontSize: 12, marginTop: 8 }}>Detalhe: {error}</p>}
        </div>
      </div>
    );
  }

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const k = B.KPIS || B;
  const recebido = k.TOTAL_RECEITA || 0;
  const pago = k.TOTAL_DESPESA || 0;
  const liquido = k.VALOR_LIQUIDO != null ? k.VALOR_LIQUIDO : (recebido - pago);
  const margem = k.MARGEM_LIQUIDA != null ? k.MARGEM_LIQUIDA : (recebido > 0 ? (liquido / recebido) * 100 : 0);
  const aReceber = (Bprev.KPIS && Bprev.KPIS.TOTAL_RECEITA) || 0;
  const aPagar = (Bprev.KPIS && Bprev.KPIS.TOTAL_DESPESA) || 0;

  const sec = (id) => (report.secoes && report.secoes[id]) || { title: id, analysis: '' };

  const renderAnalysis = (text) => {
    if (!text) return <p className="report-analysis muted">(análise indisponível — verifique se a chamada à API foi bem-sucedida)</p>;
    return text.split(/\n\s*\n/).map((p, i) => (
      <p key={i} className="report-analysis">{p.trim()}</p>
    ));
  };

  return (
    <div className="page">
      {/* Toolbar — escondida no print */}
      <div className="report-toolbar no-print">
        <div>
          <h1 style={{ margin: 0 }}>Relatório IA</h1>
          <div className="status-line">Gerado em {fmtDate(report.generated_at)} · {report.periodo}</div>
        </div>
        <div className="actions" style={{ gap: 12, alignItems: 'center' }}>
          {PeriodToolbar}
          <button className="btn-primary" onClick={() => window.print()}>
            <Icon name="download" /> Exportar PDF
          </button>
        </div>
      </div>

      {/* Modal de ajuda */}
      {showHelp && (
        <div className="drawer-overlay no-print" onClick={() => setShowHelp(false)}>
          <div className="card" style={{ maxWidth: 520, margin: "auto", padding: 24 }} onClick={e => e.stopPropagation()}>
            <h2 className="card-title">Como regenerar o relatório</h2>
            <p style={{ color: "var(--fg-2)", lineHeight: 1.6, marginTop: 8 }}>
              O relatório é gerado offline por um script Node que chama a API da Anthropic.
              Não pode ser disparado pelo browser (a chave da API ficaria exposta).
            </p>
            <p style={{ color: "var(--fg-2)", lineHeight: 1.6, marginTop: 12 }}>No terminal, dentro da pasta do projeto:</p>
            <pre style={{ background: "var(--surface-2)", padding: 12, borderRadius: 8, marginTop: 8, fontSize: 13, color: "var(--cyan)" }}>
node generate-report.cjs --force
            </pre>
            <p style={{ color: "var(--fg-3)", fontSize: 12, marginTop: 12 }}>
              Depois recarregue esta página. Sem <code>--force</code>, o script pula se o relatório foi gerado há menos de 1h.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 16 }}>
              <button className="btn-primary" onClick={() => setShowHelp(false)}>Entendi</button>
            </div>
          </div>
        </div>
      )}

      {/* Relatorio imprimivel */}
      <article className="report">
        <header className="report-cover">
          <img src="assets/bgp-logo-white.png" alt="BGP" className="report-logo" />
          <h1 className="report-title">BGP GO BI — Relatório Executivo</h1>
          <p className="report-subtitle">{report.empresa}</p>
          <p className="report-meta">Período: {report.periodo} — Realizado</p>
          <p className="report-meta">Gerado em {fmtDate(report.generated_at)}</p>
        </header>

        <section className="report-section">
          <h2>1. Visão Geral</h2>
          <div className="report-kpis">
            <div className="report-kpi"><span className="lbl">Receita realizada</span><span className="val green">{B.fmt(recebido)}</span></div>
            <div className="report-kpi"><span className="lbl">Despesa realizada</span><span className="val red">{B.fmt(pago)}</span></div>
            <div className="report-kpi"><span className="lbl">Resultado líquido</span><span className="val" style={{ color: liquido >= 0 ? "var(--green)" : "var(--red)" }}>{B.fmt(liquido)}</span></div>
            <div className="report-kpi"><span className="lbl">Margem líquida</span><span className="val">{B.fmtPct ? B.fmtPct(margem) : margem.toFixed(2) + "%"}</span></div>
          </div>
          {renderAnalysis(sec('visao_geral').analysis)}
        </section>

        <section className="report-section">
          <h2>2. Receita</h2>
          <div className="report-kpis">
            <div className="report-kpi"><span className="lbl">Receita recebida</span><span className="val green">{B.fmt(recebido)}</span></div>
            <div className="report-kpi"><span className="lbl">Receita a receber</span><span className="val">{B.fmt(aReceber)}</span></div>
          </div>
          <h3 className="report-sub">Top 5 categorias</h3>
          <ul className="report-list">
            {(B.RECEITA_CATEGORIAS || []).slice(0, 5).map((c, i) => (
              <li key={i}><span>{c.name}</span><b>{B.fmt(c.value)}</b></li>
            ))}
          </ul>
          {renderAnalysis(sec('receita').analysis)}
        </section>

        <section className="report-section">
          <h2>3. Despesa</h2>
          <div className="report-kpis">
            <div className="report-kpi"><span className="lbl">Despesa paga</span><span className="val red">{B.fmt(pago)}</span></div>
            <div className="report-kpi"><span className="lbl">Despesa a pagar</span><span className="val">{B.fmt(aPagar)}</span></div>
          </div>
          <h3 className="report-sub">Top 5 categorias</h3>
          <ul className="report-list">
            {(B.DESPESA_CATEGORIAS || []).slice(0, 5).map((c, i) => (
              <li key={i}><span>{c.name}</span><b>{B.fmt(c.value)}</b></li>
            ))}
          </ul>
          {renderAnalysis(sec('despesa').analysis)}
        </section>

        <section className="report-section">
          <h2>4. Fluxo de Caixa</h2>
          <div className="report-kpis">
            <div className="report-kpi"><span className="lbl">Receita total</span><span className="val green">{B.fmt(recebido)}</span></div>
            <div className="report-kpi"><span className="lbl">Despesa total</span><span className="val red">{B.fmt(pago)}</span></div>
            <div className="report-kpi"><span className="lbl">Líquido</span><span className="val" style={{ color: liquido >= 0 ? "var(--green)" : "var(--red)" }}>{B.fmt(liquido)}</span></div>
          </div>
          <h3 className="report-sub">Líquido mês a mês</h3>
          <ul className="report-list">
            {(B.MONTH_DATA || []).map((m, i) => {
              const v = m.receita - m.despesa;
              return <li key={i}><span style={{ textTransform: "capitalize" }}>{m.m}</span><b style={{ color: v >= 0 ? "var(--green)" : "var(--red)" }}>{B.fmt(v)}</b></li>;
            })}
          </ul>
          {renderAnalysis(sec('fluxo_caixa').analysis)}
        </section>

        <section className="report-section">
          <h2>5. Tesouraria</h2>
          <div className="report-kpis">
            <div className="report-kpi"><span className="lbl">Recebido</span><span className="val green">{B.fmt(recebido)}</span></div>
            <div className="report-kpi"><span className="lbl">A receber</span><span className="val">{B.fmt(aReceber)}</span></div>
            <div className="report-kpi"><span className="lbl">Pago</span><span className="val red">{B.fmt(pago)}</span></div>
            <div className="report-kpi"><span className="lbl">A pagar</span><span className="val">{B.fmt(aPagar)}</span></div>
          </div>
          {renderAnalysis(sec('tesouraria').analysis)}
        </section>

        <section className="report-section">
          <h2>6. Comparativo</h2>
          {renderAnalysis(sec('comparativo').analysis)}
        </section>

        <section className="report-section report-conclusion">
          <h2>Conclusão e Recomendações</h2>
          {renderAnalysis(report.conclusao || sec('conclusao').analysis)}
        </section>

        <footer className="report-footer">
          BGP GO BI · {report.empresa} · {report.periodo} · Gerado em {fmtDate(report.generated_at)}
        </footer>
      </article>
    </div>
  );
};

Object.assign(window, { PageFluxo, PageTesouraria, PageComparativo, PageRelatorio });

// ============================================================
// PageFluxoProjetado — Fluxo de Caixa Projetado por Conta Corrente
// Fonte: window.FLUXO_PROJETADO (gerado por fetch-saldos.cjs + build-data.cjs)
// Contas: CREDCREA, Cresol, Santander, Omie.CASH
// Vistas: Consolidado (tudo) | Sem Investimento (exclui grupo 2.07)
// ============================================================
const PageFluxoProjetado = () => {
  const fp        = window.FLUXO_PROJETADO || {};
  const totais    = fp.totais || fp.rows || [];
  const contas    = fp.contas || [];
  const updatedAt = fp.updatedAt || null;
  const hasError  = fp.error && !totais.length && !contas.length;

  const [contaSel, setContaSel] = useState('todas');
  const [vista, setVista]       = useState('consolidado');

  const fmt = window.BIT && window.BIT.fmt ? window.BIT.fmt : (n) => {
    const sign = n < 0 ? '-' : '';
    return `${sign}R$${Math.abs(n).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };
  const fmtD  = (iso) => { if (!iso) return ''; const [y,m,d] = iso.split('-'); return `${d}/${m}/${y}`; };
  const fmtDM = (iso) => { if (!iso) return ''; const [,m,d] = iso.split('-');  return `${d}/${m}`; };

  // Recalcula rows excluindo movimentos de investimento (grupo 2.07).
  // fórmula: saldoSemInv[d] = saldoConsol[d] - cumulo dos investimentos até d.
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
      const vl = r.valorLiquidoDia - dayInv;
      cum += dayInv;
      return { data: r.data, saldoInicial: si, valorLiquidoDia: vl, saldoFinal: sf };
    });
  };

  const contaAtual = contaSel === 'todas' ? null : contas.find(c => String(c.nCodCC) === contaSel);
  const movsBase   = contaAtual
    ? (contaAtual.movimentos || [])
    : contas.flatMap(c => c.movimentos || []);
  const rowsConsol = contaAtual ? (contaAtual.rows || []) : totais;
  const rows       = vista === 'sem_inv' ? calcSemInv(rowsConsol, movsBase) : rowsConsol;
  const movimentos = vista === 'sem_inv'
    ? movsBase.filter(m => !m.isInvestimento)
    : movsBase;

  const invCount   = movsBase.filter(m => m.isInvestimento).length;
  const ultimoSaldo   = rows.length ? rows[rows.length - 1].saldoFinal : 0;
  const todayIsoFP    = new Date().toISOString().slice(0, 10);
  // saldoAtual sempre das rows consolidadas (saldo real do dia, sem ajuste de investimento)
  const lastPastFP    = rowsConsol.length ? [...rowsConsol].reverse().find(r => r.data <= todayIsoFP) : null;
  const saldoAtualFP  = lastPastFP ? lastPastFP.saldoFinal : (rowsConsol.length ? rowsConsol[0].saldoInicial : 0);
  const saldoAtualFPData = lastPastFP ? lastPastFP.data : (rowsConsol.length ? rowsConsol[0].data : null);
  const variacaoTotal = rows.length ? ultimoSaldo - saldoAtualFP : 0;

  const Sparkline = ({ data }) => {
    if (!data.length) return null;
    const W = 340, H = 60, PAD = 4;
    const vals = data.map(r => r.saldoFinal || 0);
    const mn = Math.min(...vals), mx = Math.max(...vals);
    const rng = mx - mn || 1;
    const xs = vals.map((_, i) => PAD + (i / Math.max(vals.length - 1, 1)) * (W - PAD * 2));
    const ys = vals.map(v => H - PAD - ((v - mn) / rng) * (H - PAD * 2));
    const linePath = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
    const fillPath = `${linePath} L${xs[xs.length-1].toFixed(1)},${H} L${xs[0].toFixed(1)},${H} Z`;
    return (
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 60, display: 'block' }}>
        <defs>
          <linearGradient id="fpGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#22d3ee" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#22d3ee" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={fillPath} fill="url(#fpGrad)" />
        <path d={linePath} fill="none" stroke="#22d3ee" strokeWidth="1.8" />
      </svg>
    );
  };

  const BtnToggle = ({ value, label }) => (
    <button
      onClick={() => setVista(value)}
      style={{
        padding: '4px 12px', fontSize: 12, cursor: 'pointer', border: 'none',
        background: vista === value ? 'var(--cyan)' : 'transparent',
        color: vista === value ? '#000' : 'var(--text)',
        fontWeight: vista === value ? 600 : 400,
      }}
    >
      {label}
    </button>
  );

  return (
    <div className="page">
      {/* Cabeçalho */}
      <div className="page-header-row" style={{ flexWrap: 'wrap', gap: 8 }}>
        <h2 className="page-title">Fluxo de Caixa Projetado</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {updatedAt && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              Atualizado: {new Date(updatedAt).toLocaleString('pt-BR')}
            </span>
          )}
          {/* Toggle Consolidado / Sem Investimento */}
          <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <BtnToggle value="consolidado" label="Consolidado" />
            <BtnToggle value="sem_inv"     label="Sem Investimento" />
          </div>
          {/* Seletor de conta */}
          {contas.length > 0 && (
            <select
              value={contaSel}
              onChange={e => setContaSel(e.target.value)}
              style={{
                background: 'var(--surface-2)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 6,
                padding: '4px 10px', fontSize: 13, cursor: 'pointer',
              }}
            >
              <option value="todas">Todas as contas</option>
              {contas.map(c => (
                <option key={c.nCodCC} value={String(c.nCodCC)}>{c.descricao}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Badge de investimentos excluídos */}
      {vista === 'sem_inv' && invCount > 0 && (
        <div style={{ marginBottom: 8, padding: '6px 12px', background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.2)', borderRadius: 6, fontSize: 12, color: 'var(--amber)' }}>
          {invCount} lançamentos de Investimento/Imobilizado excluídos da projeção
        </div>
      )}

      {hasError && (
        <div className="card" style={{ color: 'var(--amber)', padding: 20 }}>{fp.error}</div>
      )}

      {!hasError && (
        <>
          {/* KPIs */}
          <div className="kpi-row">
            <div className="kpi-tile">
              <span className="kpi-label">Saldo projetado final</span>
              <span className={`kpi-value ${ultimoSaldo >= 0 ? 'tone-green' : 'tone-red'}`}>{fmt(ultimoSaldo)}</span>
              <span className="kpi-hint">{rows.length ? fmtD(rows[rows.length - 1].data) : '—'}</span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Variação total no período</span>
              <span className={`kpi-value ${variacaoTotal >= 0 ? 'tone-green' : 'tone-red'}`}>{fmt(variacaoTotal)}</span>
              <span className="kpi-hint">{rows.length ? `${rows.length} dias` : '—'}</span>
            </div>
            <div className="kpi-tile">
              <span className="kpi-label">Saldo atual</span>
              <span className="kpi-value tone-cyan">{rows.length ? fmt(saldoAtualFP) : '—'}</span>
              <span className="kpi-hint">{saldoAtualFPData ? fmtD(saldoAtualFPData) : '—'}</span>
            </div>
          </div>

          {/* Sparkline */}
          <div className="card" style={{ marginTop: 16, padding: '12px 16px 8px' }}>
            <div className="card-title">
              {contaAtual ? contaAtual.descricao : 'Consolidado (CREDCREA + Cresol + Santander + Omie.CASH)'}
              {vista === 'sem_inv' && ' — Sem Investimento'}
            </div>
            <Sparkline data={rows} />
          </div>

          {/* Tabela de projeção diária */}
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-title">Projeção dia a dia</div>
            <div className="t-scroll">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th style={{ textAlign: 'right' }}>Saldo Inicial</th>
                    <th style={{ textAlign: 'right' }}>Valor Líquido do Dia</th>
                    <th style={{ textAlign: 'right' }}>Saldo Final</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i}>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtD(r.data)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)' }}>{fmt(r.saldoInicial)}</td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', color: r.valorLiquidoDia >= 0 ? 'var(--green)' : 'var(--red)' }}>
                        {r.valorLiquidoDia >= 0 ? '+' : ''}{fmt(r.valorLiquidoDia)}
                      </td>
                      <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', fontWeight: 600, color: r.saldoFinal >= 0 ? 'var(--cyan)' : 'var(--red)' }}>
                        {fmt(r.saldoFinal)}
                      </td>
                    </tr>
                  ))}
                  {!rows.length && (
                    <tr><td colSpan={4} style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 24 }}>
                      {contaSel !== 'todas' ? 'Sem projeção para esta conta' : 'Sem dados de projeção disponíveis'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Lançamentos — só quando conta específica selecionada */}
          {contaAtual && (
            <div className="card" style={{ marginTop: 16 }}>
              <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>Lançamentos futuros — {contaAtual.descricao}</span>
                <span style={{ fontWeight: 400, fontSize: 12, color: 'var(--text-muted)' }}>
                  {movimentos.length} lançamentos
                  {vista === 'sem_inv' && invCount > 0 && ` (${invCount} de investimento excluídos)`}
                </span>
              </div>
              {movimentos.length > 0 ? (
                <div className="t-scroll">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ whiteSpace: 'nowrap' }}>Data</th>
                        <th>Descrição</th>
                        <th>Categoria</th>
                        <th style={{ textAlign: 'right' }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {movimentos.map((m, i) => (
                        <tr key={i} style={m.isInvestimento ? { opacity: 0.6 } : {}}>
                          <td style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)', fontSize: 12 }}>{fmtDM(m.data)}</td>
                          <td title={m.descricao} style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {m.descricao}
                          </td>
                          <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                            <span style={{ color: m.isInvestimento ? 'var(--amber)' : 'var(--text-muted)' }}>
                              {m.desCateg || m.categoria}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right', fontFamily: 'var(--mono)', whiteSpace: 'nowrap', color: m.valor >= 0 ? 'var(--green)' : 'var(--red)' }}>
                            {m.valor >= 0 ? '+' : ''}{fmt(m.valor)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ padding: '16px 20px', color: 'var(--text-muted)', fontSize: 13 }}>
                  Nenhum lançamento futuro para esta conta.
                </div>
              )}
            </div>
          )}

          {!contaAtual && contas.length > 0 && (
            <p style={{ marginTop: 10, color: 'var(--text-muted)', fontSize: 12, textAlign: 'center' }}>
              Selecione uma conta no filtro acima para ver os lançamentos detalhados.
            </p>
          )}
        </>
      )}
    </div>
  );
};

Object.assign(window, { PageFluxoProjetado });
