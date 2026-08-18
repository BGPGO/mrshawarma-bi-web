/* BIT/BGP Finance — Pages 2: Fluxo, Tesouraria, Comparativo */
const { useState, useMemo, useEffect } = React;

// useIsMobile é declarado em pages-1.jsx e disponibilizado globalmente no bundle
// concatenado (build-jsx.cjs). Reutilizado aqui pra ajustar height/showLabels dos
// TrendCharts em mobile.

/* Grupos que são entrada de caixa. O resto (deduções, impostos,
 * despesas, retiradas) é saída. Usado só pra ordenar as seções — o lado de
 * cada lançamento vem do próprio kind da row, não daqui, pra estorno e
 * ajuste de cartão não caírem na seção errada. */
const FLUXO_GRUPOS_RECEITA = new Set(["RECEITAS OPERACIONAIS", "RECEITAS FINANCEIRAS", "OUTRAS RECEITAS"]);

/* buildFluxoOmie — reconstrói a hierarquia Grupo → Categoria × mês a partir das
 * rows JÁ FILTRADAS pelo contexto da tela.
 *
 * Antes esta tabela lia `B.FLUXO_RECEITA` / `B.FLUXO_DESPESA`, que vêm do
 * segmento pré-computado em build-time e NÃO são recalculados pelo
 * `recomputeBit` — a tabela ficava idêntica em realizado / a pagar-receber /
 * tudo, enquanto o KPI acima dela mudava. Ver txNoContexto em components.jsx.
 *
 * A seção (Receita/Despesa) vem do kind da row; o rótulo do grupo vem do mapa
 * da planilha do cliente. Um grupo com rows dos dois lados aparece nas duas
 * seções, cada uma com as suas — é o que o Omie mostra. */
const buildFluxoOmie = (txList, year, eixo) => {
  const secoes = { r: new Map(), d: new Map() };
  let naoMapeado = 0;
  const N = eixo.n;
  for (const row of txList) {
    if (!row[1]) continue;
    const mi = eixo.idx(row);
    if (mi < 0 || mi >= N) continue;
    const z = window.dreClassify(row[3]);
    if (!z.mapeada) naoMapeado += row[5];
    const bucket = secoes[row[0] === "r" ? "r" : "d"];
    if (!bucket.has(z.omie)) bucket.set(z.omie, { cat: z.omie, values: Array(N).fill(0), kids: new Map(), mapeada: z.mapeada });
    const g = bucket.get(z.omie);
    g.values[mi] += row[5];
    if (!g.kids.has(row[3])) g.kids.set(row[3], Array(N).fill(0));
    g.kids.get(row[3])[mi] += row[5];
  }
  const ordem = window.GRUPO_OMIE_ORDEM || [];
  const finish = (bucket) => Array.from(bucket.values())
    .map(g => ({
      cat: g.cat, values: g.values, mapeada: g.mapeada,
      children: Array.from(g.kids.entries())
        .map(([cat, values]) => ({ cat, values }))
        .sort((a, b) => b.values.reduce((s, v) => s + v, 0) - a.values.reduce((s, v) => s + v, 0)),
    }))
    // grupo com um filho só de mesmo nome não ganha hierarquia
    .map(g => (g.children.length === 1 && g.children[0].cat === g.cat ? { ...g, children: [] } : g))
    .sort((a, b) => {
      const ia = ordem.indexOf(a.cat), ib = ordem.indexOf(b.cat);
      return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
    });
  return { rec: finish(secoes.r), desp: finish(secoes.d), naoMapeado };
};

/* FluxoRows — uma linha de grupo + as categorias dentro dela. A lógica de %
 * vive no `pctDe` do pai (era duplicada 6× na versão anterior desta tabela). */
const FluxoRows = ({ row, mesesIdx, open, onToggle, tone, fmt, pctDe, mostrarPct = true }) => {
  const hasKids = row.children && row.children.length > 0;
  return (
    <React.Fragment>
      <tr style={hasKids ? { cursor: "pointer" } : undefined}
          onClick={hasKids ? onToggle : undefined}
          title={hasKids ? "Clique pra abrir as categorias deste grupo" : undefined}>
        <td>
          <span className="chev" style={hasKids
            ? { display: "inline-block", transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }
            : { visibility: "hidden" }}>▶</span>
          {row.cat}
          {row.mapeada === false && (
            <span style={{ marginLeft: 6, color: "var(--amber, #f59e0b)", fontWeight: 700 }}
                  title="Categoria que o mapa de DRE do cliente ainda não classifica — o valor está aqui, só falta o cliente dizer onde ela entra">?</span>
          )}
        </td>
        {mesesIdx.map(i => (
          <React.Fragment key={i}>
            <td className={"num " + tone}>{fmt(row.values[i] || 0)}</td>
            {mostrarPct && <td className="num" style={{ color: "var(--fg-3)" }}>{pctDe(row.values, i)}</td>}
          </React.Fragment>
        ))}
      </tr>
      {hasKids && open && row.children.map(kid => (
        <tr key={kid.cat} className="child-row" style={{ opacity: 0.85 }}>
          <td style={{ paddingLeft: 28 }}>{kid.cat}</td>
          {mesesIdx.map(i => (
            <React.Fragment key={i}>
              <td className={"num " + tone} style={{ fontSize: 11 }}>{fmt(kid.values[i] || 0)}</td>
              {mostrarPct && <td className="num" style={{ color: "var(--fg-3)", fontSize: 11 }}>{pctDe(kid.values, i)}</td>}
            </React.Fragment>
          ))}
        </tr>
      ))}
    </React.Fragment>
  );
};

/* ==========================================================================
 * FLUXO DE CAIXA DIÁRIO — receita acumulada × despesa acumulada × saldo
 * ==========================================================================
 * Portado do BI da Griffe (page-gestao.jsx), a pedido da cliente em 17/08/2026:
 * "ela gostaria que tivesse um gráfico tipo esse do Griffe". Griffe também é
 * Omie, então a lógica de agregação é a mesma.
 *
 * TRÊS ADAPTAÇÕES em relação ao original, nenhuma cosmética:
 *
 * 1. O Griffe filtra o ALL_TX na mão (`row[9] !== rg` pro regime, `row[6]` pro
 *    status). Aqui a fonte é o `txNoContexto`, que já aplica regime, status,
 *    conta, categoria e visão — copiar o filtro manual faria o gráfico ignorar
 *    metade do cabeçalho deste BI, que tem mais controles que o de lá.
 *
 * 2. O Griffe tem um SELETOR DE MÊS próprio dentro do card. Aqui não: o mês (e o
 *    intervalo de dias) vêm do cabeçalho. Dois seletores de período concorrendo
 *    na mesma tela é o defeito que passei o dia consertando neste BI.
 *
 * 3. O Griffe é dark-only e pinta grid e textos com `oklch(1 0 0 / …)` — branco
 *    translúcido, que SOME no tema claro. A Silmara usa o claro ("aqui é tudo
 *    quase 40, os clientes é 40 a mais"). Aqui tudo sai de token.
 *
 * O saldo inicial vem de `window.serieSaldoMensal`, o mesmo helper da curva
 * mensal da Tesouraria — é o "capital de giro" do rótulo do Griffe.
 * ========================================================================== */
const FluxoDiarioAcumulado = ({ txCtx, mesIdx, year, saldoInicial, diaDe, diaAte, B, mesNome, mesAbrev }) => {
  const [tip, setTip] = useState(null);

  const dados = useMemo(() => {
    const ym = year + "-" + String(mesIdx + 1).padStart(2, "0");
    const entradas = Array(32).fill(0);
    const saidas = Array(32).fill(0);
    for (const r of txCtx) {
      if (r[1] !== ym) continue;
      const d = r[2];
      if (d < 1 || d > 31) continue;
      if (r[0] === "r") entradas[d] += r[5]; else saidas[d] += r[5];
    }
    // Sem intervalo no cabeçalho: do dia 1 até o último com movimento (mínimo
    // 28, pra a linha não terminar no meio e parecer que o mês acabou ali).
    let ultimo = 0;
    for (let d = 1; d <= 31; d++) if (entradas[d] || saidas[d]) ultimo = d;
    const de = diaDe || 1;
    const ate = diaAte || Math.max(ultimo, Math.min(28, new Date(year, mesIdx + 1, 0).getDate()));

    /* SALDO tem que partir da posição REAL do primeiro dia da janela.
     *
     * Receita e despesa acumuladas são do recorte — é o que "acumulada no
     * período" quer dizer. O SALDO não: ele é a posição da conta, e a conta não
     * esquece os dias 1 a 17 porque ela filtrou 18–31. Sem somar o que veio
     * antes, o recorte 18–31 fechava agosto em R$ 349.604,74 quando a posição
     * real é R$ 479.905,88 — R$ 130 mil a menos, e a curva mensal ao lado
     * mostrando o número certo. */
    let netAntes = 0;
    for (let d = 1; d < de; d++) netAntes += entradas[d] - saidas[d];
    const saldoNaAbertura = saldoInicial + netAntes;

    const dias = [];
    const recAcum = [], despAcum = [], saldos = [];
    let rA = 0, dA = 0, sd = saldoNaAbertura;
    for (let d = de; d <= ate; d++) {
      rA += entradas[d]; dA += saidas[d]; sd += entradas[d] - saidas[d];
      dias.push(d); recAcum.push(rA); despAcum.push(dA); saldos.push(sd);
    }
    return { dias, recAcum, despAcum, saldos, entradas, saidas, de, ate, saldoNaAbertura, netAntes };
  }, [txCtx, mesIdx, year, saldoInicial, diaDe, diaAte]);

  const { dias, recAcum, despAcum, saldos, saldoNaAbertura, netAntes } = dados;
  // Há âncora bancária? No Omie sim; no F360 não existe endpoint de saldo.
  const temAncoraBanco = ((window.FLUXO_PROJETADO || {}).contas || []).length > 0;
  const n = dias.length;
  if (!n) return <div className="status-line" style={{ padding: 18 }}>Sem lançamento neste mês.</div>;

  const todos = recAcum.concat(despAcum, saldos, [0]);
  const minY = Math.min(...todos);
  const maxY = Math.max(...todos, 1);
  const rangeY = (maxY - minY) || 1;

  // padT menor agora que a legenda saiu do SVG — aquele espaço era só dela.
  const W = 1200, H = 330;
  const padL = 78, padR = 28, padT = 22, padB = 44;
  const cW = W - padL - padR, cH = H - padT - padB;
  const stepX = n > 1 ? cW / (n - 1) : cW;
  const toX = (i) => padL + i * stepX;
  const toY = (v) => padT + cH - ((v - minY) / rangeY) * cH;
  const pts = (arr) => arr.map((v, i) => toX(i) + "," + toY(v)).join(" ");

  const hover = (e, i) => {
    const svg = e.currentTarget.closest("svg");
    const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY;
    const q = p.matrixTransform(svg.getScreenCTM().inverse());
    setTip({ x: q.x, y: q.y, i });
  };
  const ticks = Array.from({ length: 6 }, (_, i) => minY + (rangeY * i) / 5);

  const baixarCsv = () => {
    const linhas = [["Dia", "Receita acumulada", "Despesa acumulada", "Saldo"].join(";")];
    const nb = (v) => Number(v).toFixed(2).replace(".", ",");
    dias.forEach((d, i) => linhas.push([
      String(d).padStart(2, "0") + "/" + String(mesIdx + 1).padStart(2, "0") + "/" + year,
      nb(recAcum[i]), nb(despAcum[i]), nb(saldos[i]),
    ].join(";")));
    // BOM: sem ele o Excel em pt-BR lê o arquivo como ANSI e come os acentos.
    const blob = new Blob(["﻿" + linhas.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "fluxo-diario-" + year + "-" + String(mesIdx + 1).padStart(2, "0") + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  return (
    <div className="card" style={{ marginTop: 16 }}>
      <div className="card-title-row">
        <h2 className="card-title">Fluxo de caixa — {mesNome} {year} (dia a dia)</h2>
        <button className="btn-ghost no-print" style={{ fontSize: 11 }} onClick={baixarCsv}>Baixar CSV</button>
      </div>
      <div className="status-line" style={{ marginBottom: 10, fontSize: 11 }}>
        {/* O F360 não expõe saldo bancário — não há endpoint de saldo utilizável,
            está catalogado na nota do adapter. Então a terceira linha aqui NÃO é
            posição de conta: é a variação acumulada partindo de zero. Chamar de
            "saldo" sem dizer isso seria o gráfico mentindo com cara de exato. */}
        {!temAncoraBanco && (
          <><strong>Sem saldo bancário do F360</strong> — a linha verde é a variação acumulada
            partindo de zero, não o saldo da conta. Ela mostra o movimento do período, não a posição.
            {" · "}</>
        )}
        Receita e despesa acumulam <strong>dentro do período</strong>.
        {temAncoraBanco && <> O saldo é a posição da conta.</>}
        {" "}{temAncoraBanco ? "Saldo na abertura: " : "Ponto de partida: "}
        <b style={{ color: "var(--cyan)" }}>{B.fmt(saldoNaAbertura)}</b>
        {diaDe
          ? <> — fechamento do mês anterior ({B.fmt(saldoInicial)}) mais os dias 1 a {diaDe - 1} deste mês
              ({netAntes >= 0 ? "+" : ""}{B.fmt(netAntes)}), que continuam contando mesmo fora do recorte
              <b> {diaDe}–{diaAte}</b>.</>
          : <> (fechamento do mês anterior).</>}
        {" "}Dia com saldo negativo aparece em vermelho.
      </div>

      {/* A legenda carrega o VALOR, igual à do gráfico de Receitas e despesas da
          Visão Geral. Sem isso o número só existia no hover — e o uso desta tela
          é printar e colar no e-mail, onde hover não existe: quem recebe o print
          ficava com três linhas coloridas e nenhum número. */}
      <div className="legend-pills" style={{ marginBottom: 10 }}>
        {/* Azul não é cor do design system (o padrão só tem verde/vermelho/cyan),
            mas é a cor que a receita acumulada tem no gráfico da Griffe, que é a
            referência que a cliente apontou. Fica inline, sem criar variante. */}
        <span className="legend-pill">
          <span className="dot" style={{ background: "#3b82f6", boxShadow: "0 0 8px -1px rgba(59,130,246,0.65)" }} />
          <span className="lbl">Receita acumulada</span>
          <span className="val">{B.fmt(recAcum[n - 1])}</span>
        </span>
        <span className="legend-pill red">
          <span className="dot" />
          <span className="lbl">Despesa acumulada</span>
          <span className="val">{B.fmt(despAcum[n - 1])}</span>
        </span>
        <span className={"legend-pill " + (saldos[n - 1] < 0 ? "red" : "green")}>
          <span className="dot" />
          <span className="lbl">{temAncoraBanco ? "Saldo" : "Acumulado"} no fim de {String(dias[n - 1]).padStart(2, "0")}/{mesAbrev}</span>
          <span className="val">{B.fmt(saldos[n - 1])}</span>
        </span>
        <span className={"legend-pill " + (Math.min(...saldos) < 0 ? "red" : "cyan")}>
          <span className="dot" />
          <span className="lbl">Menor saldo · {String(dias[saldos.indexOf(Math.min(...saldos))]).padStart(2, "0")}/{mesAbrev}</span>
          <span className="val">{B.fmt(Math.min(...saldos))}</span>
        </span>
      </div>
      <div style={{ position: "relative" }}>
        <svg viewBox={"0 0 " + W + " " + H} style={{ width: "100%", height: "auto", display: "block" }}
             preserveAspectRatio="xMidYMid meet" onMouseLeave={() => setTip(null)}>
          {ticks.map((v, i) => (
            <g key={"g" + i}>
              <line x1={padL} y1={toY(v)} x2={W - padR} y2={toY(v)} stroke="var(--border)" strokeDasharray="3 5" />
              <text x={padL - 8} y={toY(v) + 4} textAnchor="end" fill="var(--fg-3)" fontSize="10"
                    fontFamily="var(--font-mono)">{B.fmtK(v)}</text>
            </g>
          ))}
          {minY < 0 && maxY > 0 && (
            <line x1={padL} y1={toY(0)} x2={W - padR} y2={toY(0)} stroke="var(--fg-3)" strokeWidth="1" opacity="0.5" />
          )}
          {dias.map((d, i) => (
            <rect key={"h" + i} x={toX(i) - stepX / 2} y={padT} width={stepX} height={cH} fill="transparent"
                  onMouseEnter={(e) => hover(e, i)} />
          ))}
          {tip && <rect x={toX(tip.i) - stepX / 2} y={padT} width={stepX} height={cH} fill="var(--cyan)" opacity="0.07" />}

          {/* Marcadores em cada ponto, como no gráfico da Griffe: quadrado nas
              duas acumuladas, círculo no saldo. Não é enfeite — com a linha
              nua não dá pra saber onde cai cada dia, e nos trechos horizontais
              (dia sem movimento) some a informação de que o dia existe. */}
          <polyline points={pts(recAcum)} fill="none" stroke="#3b82f6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          {recAcum.map((v, i) => (
            <rect key={"rm" + i} x={toX(i) - 4} y={toY(v) - 4} width={8} height={8} rx="1"
                  fill="#3b82f6" stroke="#1e3a5f" strokeWidth="1" />
          ))}
          <polyline points={pts(despAcum)} fill="none" stroke="var(--red)" strokeWidth="2.5" strokeDasharray="8 4" strokeLinejoin="round" strokeLinecap="round" />
          {despAcum.map((v, i) => (
            <rect key={"dm" + i} x={toX(i) - 4} y={toY(v) - 4} width={8} height={8} rx="1"
                  fill="var(--red)" stroke="#7f1d1d" strokeWidth="1" />
          ))}
          <polyline points={pts(saldos)} fill="none" stroke="var(--green)" strokeWidth="2" strokeDasharray="4 4" strokeLinejoin="round" strokeLinecap="round" />
          {saldos.map((v, i) => (
            <circle key={"s" + i} cx={toX(i)} cy={toY(v)} r={3.5}
                    fill={v < 0 ? "var(--red)" : "var(--green)"}
                    stroke={v < 0 ? "#7f1d1d" : "#14532d"} strokeWidth="1" />
          ))}

          {dias.map((d, i) => {
            if (!(n <= 16 || i % Math.ceil(n / 12) === 0 || i === n - 1)) return null;
            return (
              <text key={"x" + i} x={toX(i)} y={H - padB + 18} textAnchor="middle" fill="var(--fg-3)"
                    fontSize="10" fontFamily="var(--font-mono)">{String(d).padStart(2, "0")}/{mesAbrev}</text>
            );
          })}

          {/* A legenda saiu do SVG e virou pílula em HTML acima do gráfico, com
              o valor junto — ver o comentário lá. Dentro do SVG ela repetiria a
              informação e roubaria altura útil do desenho. */}

          {tip && (() => {
            const tw = 232, th = 78;
            let tx = Math.min(Math.max(toX(tip.i) - tw / 2, padL), W - padR - tw);
            const ty = padT + 6;
            return (
              <g pointerEvents="none">
                <rect x={tx} y={ty} width={tw} height={th} rx={8} fill="var(--surface)" stroke="var(--border-2)" />
                <text x={tx + tw / 2} y={ty + 17} textAnchor="middle" fill="var(--fg)" fontSize="11" fontWeight="700"
                      fontFamily="var(--font-mono)">{String(dias[tip.i]).padStart(2, "0")}/{mesAbrev}</text>
                <text x={tx + 12} y={ty + 36} fill="#3b82f6" fontSize="10.5" fontFamily="var(--font-mono)">Receita acum. {B.fmt(recAcum[tip.i])}</text>
                <text x={tx + 12} y={ty + 52} fill="var(--red)" fontSize="10.5" fontFamily="var(--font-mono)">Despesa acum. {B.fmt(despAcum[tip.i])}</text>
                <text x={tx + 12} y={ty + 68} fill={saldos[tip.i] < 0 ? "var(--red)" : "var(--green)"} fontSize="10.5"
                      fontFamily="var(--font-mono)">Saldo {B.fmt(saldos[tip.i])}</text>
              </g>
            );
          })()}
        </svg>
      </div>
    </div>
  );
};

const PageFluxo = ({ filters, setFilters, onOpenFilters, statusFilter, drilldown, setDrilldown, year, month, semInvestimento, extraFilters }) => {
  // O Fluxo de Caixa é a tela do CAIXA, então roda sempre na visão Completo,
  // independente do toggle do header: financiamento e retirada de sócios
  // passaram pela conta de verdade, e tirá-los daqui seria esconder caixa.
  // Eles aparecem em grupo próprio (INVESTIMENTOS E OUTROS, DESPESAS COM
  // SOCIOS, OUTRAS RECEITAS), separados do resto — é o que o Omie mostra.
  // A tela declara isso no rodapé pra ninguém achar que divergiu da Visão Geral.
  const efCompleto = useMemo(
    () => Object.assign({ centroCusto: [], categoria: [], empresa: [] }, extraFilters, { visao: "completo" }),
    [extraFilters]
  );
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, semInvestimento, efCompleto), [statusFilter, drilldown, year, month, semInvestimento, efCompleto]);
  const isMobile = useIsMobile();
  const [view, setView] = useState("horizontal");
  const [range, setRange] = useState("dado");
  const [expandedRec, setExpandedRec] = useState({});
  const [expandedDesp, setExpandedDesp] = useState({});
  const toggleRec = (cat) => setExpandedRec(prev => ({ ...prev, [cat]: !prev[cat] }));
  const toggleDesp = (cat) => setExpandedDesp(prev => ({ ...prev, [cat]: !prev[cat] }));
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();

  // Rows sob o MESMO contexto de filtro dos KPIs — é isto que faz a tabela
  // deixar de ser estática. `month` entra via drilldown montado pelo getBit,
  // então aqui reproduzimos o mesmo: se há mês selecionado sem drilldown
  // explícito, o drilldown de mês é o efetivo.
  const ddEfetivo = useMemo(() => {
    if (drilldown) return drilldown;
    if (month && month >= 1 && month <= 12) {
      const ym = `${refYear}-${String(month).padStart(2, "0")}`;
      return { type: "mes", value: ym, label: ym };
    }
    return null;
  }, [drilldown, month, refYear]);
  // A tabela mensal precisa das 12 colunas pra ter contexto, então a janela de
  // meses ignora o recorte de mês — mas os VALORES respeitam todo o resto.
  const txJanela = useMemo(
    () => window.txNoContexto(statusFilter, null, semInvestimento, efCompleto),
    [statusFilter, semInvestimento, efCompleto]
  );
  const txCtx = useMemo(
    () => window.txNoContexto(statusFilter, ddEfetivo && ddEfetivo.type !== "mes" ? ddEfetivo : null, semInvestimento, efCompleto),
    [statusFilter, ddEfetivo, semInvestimento, efCompleto]
  );
  /* EIXO DAS COLUNAS. Com recorte de dias no cabeçalho a tabela passa a ser
     por DIA; sem ele continua mensal. Pedido dela em 17/08: o relatório de
     fechamento que ela manda pro cliente é do período que ela escolhe, aberto
     dia a dia. */
  const eixo = useMemo(() => {
    const dd = ddEfetivo;
    if (dd && dd.ym && (dd.type === "dia_range" || dd.type === "dia")) {
      const de = dd.type === "dia" ? dd.value : dd.from;
      const ate = dd.type === "dia" ? dd.value : dd.to;
      return {
        tipo: "dia", de, ate, ym: dd.ym, n: Math.max(1, ate - de + 1),
        idx: (row) => (row[1] === dd.ym && row[2] >= de && row[2] <= ate ? row[2] - de : -1),
        label: (i) => String(de + i),
      };
    }
    return {
      tipo: "mes", n: 12,
      idx: (row) => {
        if (Number(row[1].slice(0, 4)) !== refYear) return -1;
        const m = parseInt(row[1].slice(5, 7), 10) - 1;
        return m >= 0 && m <= 11 ? m : -1;
      },
      label: (i) => B.MONTHS_FULL[i] || "",
    };
  }, [ddEfetivo, refYear, B]);
  const porDia = eixo.tipo === "dia";
  // No eixo diário a coluna de % sai: uma coluna de dia como % do total da
  // linha diz pouco, e são 2 colunas por dia num período de 14 dias — a tabela
  // fica larga demais pra ela printar, que é justamente o uso.
  const mostrarPct = !porDia;

  const mesesIdx = useMemo(
    () => (porDia ? Array.from({ length: eixo.n }, (_, i) => i) : window.janelaMeses(txJanela, refYear, range)),
    [porDia, eixo, txJanela, refYear, range]
  );
  const FX = useMemo(() => buildFluxoOmie(txCtx, refYear, eixo), [txCtx, refYear, eixo]);
  const FLUXO_RECEITA = FX.rec;
  const FLUXO_DESPESA = FX.desp;
  const totalMesRec = (i) => FLUXO_RECEITA.reduce((s, r) => s + (r.values[i] || 0), 0);
  const totalMesDesp = (i) => FLUXO_DESPESA.reduce((s, r) => s + (r.values[i] || 0), 0);
  const somaLinha = (vals) => mesesIdx.reduce((s, i) => s + (vals[i] || 0), 0);
  // % exibido: horizontal = o mês como % do total da própria linha na janela;
  // vertical = a linha como % da receita daquele mês.
  const pctDe = (vals, i) => {
    if (view === "vertical") {
      const base = totalMesRec(i);
      return base ? ((vals[i] || 0) / base * 100).toFixed(2).replace(".", ",") + "%" : "—";
    }
    const tot = somaLinha(vals);
    return tot ? ((vals[i] || 0) / tot * 100).toFixed(1).replace(".", ",") + "%" : "—";
  };
  const handleMonthHeader = (i) => {
    const mm = String(i + 1).padStart(2, "0");
    const ym = `${refYear}-${mm}`;
    const mn = B.MONTHS_FULL[i] || "";
    setDrilldown({ type: "mes", value: ym, label: `${mn.charAt(0).toUpperCase() + mn.slice(1, 3)}/${refYear}` });
  };
  // Destaque da coluna: vale tanto pro clique no cabeçalho (drilldown) quanto
  // pro seletor de mês do header (month). Sem o segundo, filtrar julho no
  // header não destacava nada e a tela parecia ignorar o filtro.
  /* Gráfico diário acumulado (portado da Griffe). Precisa de UM mês: usa o do
     cabeçalho e, se estiver em "Ano completo", o último com movimento — assim o
     card nunca fica vazio só porque ela não escolheu mês. */
  const mesGrafico = useMemo(() => {
    if (month && month >= 1 && month <= 12) return month - 1;
    const md = (B.MONTH_DATA || []);
    for (let i = md.length - 1; i >= 0; i--) if (md[i].receita > 0 || md[i].despesa > 0) return i;
    return new Date().getMonth();
  }, [month, B]);
  // Saldo inicial = fechamento do mês anterior, do MESMO helper que a Tesouraria
  // usa na curva mensal. É o "capital de giro" do gráfico da Griffe.
  const SSfluxo = useMemo(() => window.serieSaldoMensal(refYear, semInvestimento, efCompleto),
    [refYear, semInvestimento, efCompleto]);
  // O gráfico é do mês inteiro (ou do recorte de dias); o txCtx já vem filtrado
  // por status/regime/conta, mas com o recorte de dia aplicado. Pro gráfico
  // queremos o mês todo quando NÃO há intervalo, então lemos sem o drilldown de
  // dia e deixamos o próprio componente recortar.
  const txMes = useMemo(
    () => window.txNoContexto(statusFilter, null, semInvestimento, efCompleto),
    [statusFilter, semInvestimento, efCompleto]
  );

  const activeMonthIdx = (ddEfetivo && ddEfetivo.type === "mes")
    ? parseInt(String(ddEfetivo.value).slice(5, 7), 10) - 1 : -1;

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
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {/* Os dois seletores só valem no eixo mensal: com recorte de dias
                  as colunas são os dias do intervalo, e não há % pra alternar. */}
              {!porDia && (
                <div className="seg" title="Quais meses aparecem nas colunas">
                  <button className={range === "dado" ? "active" : ""} onClick={() => setRange("dado")}>Meses com lançamento</button>
                  <button className={range === "ano" ? "active" : ""} onClick={() => setRange("ano")}>Ano inteiro</button>
                </div>
              )}
              {!porDia && (
                <div className="seg">
                  <button className={view === "horizontal" ? "active" : ""} onClick={() => setView("horizontal")}>Análise horizontal</button>
                  <button className={view === "vertical" ? "active" : ""} onClick={() => setView("vertical")}>Análise vertical</button>
                </div>
              )}
            </div>
          </div>
          <div className="status-line" style={{ marginBottom: 8, fontSize: 11 }}>
            {porDia
              ? <><strong>Aberto por dia</strong>, {eixo.de} a {eixo.ate} de {B.MONTHS_FULL[parseInt(eixo.ym.slice(5, 7), 10) - 1]} de {eixo.ym.slice(0, 4)} — o recorte do cabeçalho. Tire o intervalo pra voltar à visão mensal.</>
              : <>{view === "vertical"
                    ? "Vertical: cada linha como % da receita do próprio mês"
                    : "Horizontal: cada mês como % do total da linha na janela exibida"}
                 {" · "}
                 {mesesIdx.length === 12
                   ? "jan–dez"
                   : `${B.MONTHS_FULL[mesesIdx[0]]}–${B.MONTHS_FULL[mesesIdx[mesesIdx.length - 1]]}`}
                 {" de "}{refYear}</>}
            {window.BI_FONTE ? " · grupos do " + window.BI_FONTE : " · grupos do plano de contas"}
            {!porDia && activeMonthIdx >= 0 && (
              <span>
                {" · "}<strong>{B.MONTHS_FULL[activeMonthIdx]}</strong> está selecionado no filtro
                {" (coluna destacada) — a tabela mantém os outros meses pra comparação; os KPIs acima são só do mês"}
              </span>
            )}
            {window.BIT_HAS_NAOOP && (window.BIT_NAOOP_TOTAL || {}).lancamentos > 0 && (
              <span>
                {" · inclui financiamento e retirada de sócios"}
                {" (a Visão Geral, no modo Operacional, deixa isso de fora)"}
              </span>
            )}
            {FX.naoMapeado > 0 && (
              <span style={{ color: "var(--amber, #f59e0b)" }}>
                {" · "}{B.fmt(FX.naoMapeado)} em categoria fora do mapa de DRE do cliente (marcada com ?)
              </span>
            )}
          </div>
          <div className="t-scroll" style={{ maxHeight: 560 }}>
            <table className="t">
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Receita / Despesa</th>
                  {mesesIdx.map((i) => {
                    const isActive = !porDia && i === activeMonthIdx;
                    return (
                      <React.Fragment key={i}>
                        <th className={`num ${porDia ? "" : "clickable-th"} ${isActive ? "active" : ""}`}
                            onClick={porDia ? undefined : () => handleMonthHeader(i)}
                            style={porDia ? { whiteSpace: "nowrap" } : { cursor: "pointer" }}
                            title={porDia ? undefined : "Clique para filtrar este mês"}>
                          {eixo.label(i)}
                        </th>
                        {mostrarPct && <th className="num">{view === "horizontal" ? "Δ%" : "%"}</th>}
                      </React.Fragment>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                <tr className="section">
                  <td>Receita</td>
                  {mesesIdx.map((i) => {
                    const total = totalMesRec(i);
                    const totJanela = FLUXO_RECEITA.reduce((s, r) => s + somaLinha(r.values), 0);
                    const pctLabel = view === "vertical"
                      ? "100%"
                      : (totJanela ? ((total / totJanela) * 100).toFixed(1).replace(".", ",") + "%" : "—");
                    return (
                      <React.Fragment key={i}>
                        <td className="num green">{B.fmt(total)}</td>
                        {mostrarPct && <td className="num" style={{ color: "var(--fg-3)", fontWeight: view === "horizontal" ? 600 : 400 }}>{pctLabel}</td>}
                      </React.Fragment>
                    );
                  })}
                </tr>
                {FLUXO_RECEITA.map(row => (
                  <FluxoRows key={"r-" + row.cat} row={row} mesesIdx={mesesIdx} open={!!expandedRec[row.cat]}
                             onToggle={() => toggleRec(row.cat)} tone="green" fmt={B.fmt} pctDe={pctDe} />
                ))}
                <tr className="section">
                  <td>Despesa</td>
                  {mesesIdx.map((i) => {
                    const total = totalMesDesp(i);
                    let pctLabel = "—";
                    let pctColor = "var(--fg-3)";
                    if (view === "vertical") {
                      const base = totalMesRec(i);
                      pctLabel = base ? ((total / base) * 100).toFixed(2).replace(".", ",") + "%" : "—";
                      pctColor = total > base ? "var(--red)" : "var(--fg-3)";
                    } else {
                      const totJanela = FLUXO_DESPESA.reduce((s, r) => s + somaLinha(r.values), 0);
                      pctLabel = totJanela ? ((total / totJanela) * 100).toFixed(1).replace(".", ",") + "%" : "—";
                    }
                    return (
                      <React.Fragment key={i}>
                        <td className="num red">{B.fmt(total)}</td>
                        {mostrarPct && <td className="num" style={{ color: pctColor, fontWeight: view === "horizontal" ? 600 : 400 }}>{pctLabel}</td>}
                      </React.Fragment>
                    );
                  })}
                </tr>
                {FLUXO_DESPESA.map(row => (
                  <FluxoRows key={"d-" + row.cat} row={row} mesesIdx={mesesIdx} open={!!expandedDesp[row.cat]}
                             onToggle={() => toggleDesp(row.cat)} tone="red" fmt={B.fmt} pctDe={pctDe} />
                ))}
                <tr className="total">
                  <td>Total Líquido</td>
                  {mesesIdx.map((i) => {
                    const liq = totalMesRec(i) - totalMesDesp(i);
                    let pctLabel = "—";
                    if (view === "vertical") {
                      const base = totalMesRec(i);
                      pctLabel = base ? ((liq / base) * 100).toFixed(2).replace(".", ",") + "%" : "—";
                    } else {
                      const liqJanela = mesesIdx.reduce((s, k) => s + totalMesRec(k) - totalMesDesp(k), 0);
                      pctLabel = liqJanela ? ((liq / liqJanela) * 100).toFixed(1).replace(".", ",") + "%" : "—";
                    }
                    return (
                      <React.Fragment key={i}>
                        <td className="num" style={{ color: liq >= 0 ? "var(--green)" : "var(--red)" }}>{B.fmt(liq)}</td>
                        <td className="num" style={{ color: liq >= 0 ? "var(--green)" : "var(--red)", fontWeight: 600 }}>{pctLabel}</td>
                      </React.Fragment>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <FluxoDiarioAcumulado
        txCtx={txMes}
        mesIdx={mesGrafico}
        year={refYear}
        saldoInicial={SSfluxo.fimDoMes(mesGrafico - 1)}
        diaDe={porDia ? eixo.de : null}
        diaAte={porDia ? eixo.ate : null}
        B={B}
        mesNome={(B.MONTHS_FULL[mesGrafico] || "").replace(/^./, c => c.toUpperCase())}
        mesAbrev={(B.MONTHS[mesGrafico] || "").replace(/^./, c => c.toUpperCase())}
      />

      <div className="card">
        <h2 className="card-title">Saldos acumulados por mês</h2>
        {/* Era `B.SALDOS_MES` cru: o campo que o aggregateTx não emite (logo não
            reage a filtro nenhum) e que aqui saía SEM âncora — plotava 0 … 119k
            enquanto a Tesouraria, com o mesmo título, plotava 372k … 522k. Dois
            gráficos de mesmo nome e números diferentes. Agora os dois leem de
            window.serieSaldoMensal. */}
        <TrendChart
          values={SSfluxo.curva}
          labels={B.MONTHS.map(m => m.charAt(0).toUpperCase() + m.slice(1) + " " + String((B.META && B.META.ref_year) || "").slice(-2))}
          color="var(--cyan)"
          height={isMobile ? 200 : 300}
          showLabels={!isMobile}
          gradientId="fl-saldos"
        />
        <div className="status-line" style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.6 }}>
          Saldo no fim de cada mês, ancorado no fechamento do mês anterior. Mesmo cálculo da curva
          da Tesouraria, mas <strong>esta tela roda sempre na visão Completo</strong> — então inclui
          empréstimo e retirada de sócios, e o número fica acima do de lá quando a Tesouraria está
          em Operacional. Meses à frente de hoje são projeção.
        </div>
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

  /* SALDO ACUMULADO POR MÊS — vem do helper compartilhado em components.jsx.
   *
   * `B.SALDOS_MES` tinha dois problemas: não reagia ao contexto (o aggregateTx
   * não o emitia, então o valor pré-computado sobrevivia ao Object.assign do
   * recomputeBit) e JÁ É cumulativo, enquanto a curva abaixo o acumulava de
   * novo — dupla acumulação, que inflava os meses à frente.
   *
   * Aqui o F360 não expõe saldo bancário, então `temSaldoReal` é falso e a
   * curva mostra a VARIAÇÃO acumulada partindo de zero. O rodapé já declara
   * isso; o que muda é que agora ela reage a filtro e não acumula duas vezes. */
  const SS = useMemo(() => window.serieSaldoMensal(year, semInvestimento, extraFilters),
    [year, semInvestimento, extraFilters]);

  /* SALDO REAL DO OMIE.
   *
   * Na reunião de 12/08 isto ficou pendente: "ele não está puxando ainda lá de
   * dentro do OMIE do saldo do OMIE principalmente porque a gente precisa ter
   * essa conversa de o que cada um dos bancos é referente a o que".
   *
   * O código já tentava se ancorar em window.BIT_EXTRAS.saldos — só que
   * BIT_EXTRAS é UNDEFINED neste BI (o data-extras.js nunca é gerado), então
   * saldoInicial caía em 0 e a curva era pura variação do valor líquido,
   * começando do zero. Agora a âncora vem do FLUXO_PROJETADO, que o
   * fetch-saldos.cjs gera com o saldo bancário de verdade. */
  const contasReais = (window.FLUXO_PROJETADO || {}).contas || [];
  const finalidades = window.BI_CONTAS_FINALIDADE || {};
  const finalidadeDe = (desc) => {
    // o fetch-saldos sufixa a conta com " (Principal)" — o mapa é sem sufixo
    const limpo = String(desc || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    return finalidades[limpo] || finalidades[desc] || null;
  };
  const saldoRealPorConta = contasReais.map(c => {
    const r = (c.rows || [])[0];
    return { descricao: c.descricao, saldo: r ? r.saldoFinal : 0, fin: finalidadeDe(c.descricao) };
  }).sort((a, b) => b.saldo - a.saldo);
  const saldoRealTotal = saldoRealPorConta.reduce((s, c) => s + c.saldo, 0);
  const saldoRealOperacional = saldoRealPorConta
    .filter(c => !c.fin || c.fin.operacional !== false)
    .reduce((s, c) => s + c.saldo, 0);
  const temSaldoReal = saldoRealPorConta.length > 0;

  /* ÂNCORA — no fim do MÊS ANTERIOR, não no mês corrente.
   *
   * Cada ponto da curva é o saldo no FIM daquele mês. Ancorar o mês corrente no
   * saldo de HOJE mistura as duas coisas, e tudo que ainda vai acontecer no
   * resto do mês desaparece junto com o deslocamento nos meses à frente. */
  const mesAncora = SS.mesAncora;
  const saldoFimMesAnterior = SS.saldoFimMesAnterior;
  const saldoInicial = SS.offset;
  const saldosCum = SS.curva;
  // O `, 0` que existia aqui como proteção pra array vazio corrompia o
  // resultado: Math.min(...curva, 0) nunca passa de zero, então "Saldo Mínimo"
  // exibia R$ 0,00 mesmo com a curva inteira acima de R$ 340 mil. Max tinha o
  // espelho do problema. A proteção agora é o guard de length.
  const sMax = saldosCum.length ? Math.max(...saldosCum) : 0;
  const sMin = saldosCum.length ? Math.min(...saldosCum) : 0;
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

      {/* Havia aqui um bloco "Fluxo de Caixa Projetado" de 109 linhas atrás de
          `{(false) && ...}` — desativado com o comentário "removido — só Fluxo a
          Vencer abaixo", mas deixado no arquivo. Não renderizava, e carregava um
          rótulo com as contas bancárias de OUTRO cliente chumbadas no texto.
          Removido: código morto com nome de cliente é armadilha pro próximo que
          abrir o arquivo e achar que aquilo está no ar. O Fluxo a Vencer abaixo é
          o que ficou. */}

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

      {temSaldoReal && (
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Saldos bancários por conta</h2>
            <span className="status-line" style={{ fontSize: 11 }}>
              lido do {window.BI_FONTE || "ERP"} em {new Date(((window.FLUXO_PROJETADO || {}).updatedAt) || Date.now()).toLocaleDateString("pt-BR")}
            </span>
          </div>
          <table className="t">
            <thead>
              <tr><th>Conta</th><th>Finalidade</th><th className="num">Saldo</th></tr>
            </thead>
            <tbody>
              {saldoRealPorConta.map(c => {
                const naoOp = c.fin && c.fin.operacional === false;
                return (
                  <tr key={c.descricao} style={naoOp ? { opacity: 0.7 } : undefined}>
                    <td>{c.descricao}</td>
                    <td style={{ color: "var(--fg-3)", fontSize: 11.5 }}>
                      {c.fin ? c.fin.finalidade : <span style={{ color: "var(--amber, #f59e0b)" }}>não mapeada — diga o que é essa conta</span>}
                      {naoOp && <span style={{ color: "var(--amber, #f59e0b)" }}> · fora do caixa operacional</span>}
                    </td>
                    <td className="num" style={{ fontWeight: 600 }}>{B.fmt(c.saldo)}</td>
                  </tr>
                );
              })}
              <tr className="total">
                <td>Consolidado</td>
                <td style={{ color: "var(--fg-3)", fontSize: 11.5 }}>
                  {Math.abs(saldoRealOperacional - saldoRealTotal) > 0.005
                    ? <span>operacional: <strong>{B.fmt(saldoRealOperacional)}</strong></span>
                    : "todas as contas são operacionais"}
                </td>
                <td className="num">{B.fmt(saldoRealTotal)}</td>
              </tr>
            </tbody>
          </table>
          <div className="status-line" style={{ marginTop: 8, fontSize: 11, lineHeight: 1.6 }}>
            Conta que o fetch não trouxe saldo não aparece aqui, mesmo tendo lançamento — o {window.BI_FONTE || "ERP"} só
            devolve extrato de conta com movimento no período. Use o filtro de Conta no cabeçalho pra
            recortar o resto do BI por conta.
          </div>
        </div>
      )}

      <div className="row" style={{ gridTemplateColumns: "minmax(0, 7fr) minmax(0, 5fr)" }}>
        <div className="card">
          <h2 className="card-title">Saldo acumulado por mês</h2>
          <div style={{ display: "flex", gap: 24, marginBottom: 14, flexWrap: "wrap" }}>
            <div><div className="kpi-label">Saldo Máximo</div><div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--green)" }}>{B.fmt(sMax)}</div></div>
            <div><div className="kpi-label">Saldo Mínimo</div><div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--red)" }}>{B.fmt(sMin)}</div></div>
            <div><div className="kpi-label">Saldo Médio</div><div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--cyan)" }}>{B.fmt(sMed)}</div></div>
            {temSaldoReal && (
              <div title={"Saldo bancário lido do " + (window.BI_FONTE || "ERP") + ", não derivado de receita menos despesa"}>
                <div className="kpi-label">Saldo real hoje{window.BI_FONTE ? " (" + window.BI_FONTE + ")" : ""}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontWeight: 700, color: "var(--cyan)" }}>{B.fmt(saldoRealTotal)}</div>
              </div>
            )}
          </div>
          <TrendChart values={saldosCum} labels={B.MONTHS} color="var(--cyan)" height={isMobile ? 160 : 200} showPoints={true} showLabels={!isMobile} gradientId="ts-saldo" />
          <div className="status-line" style={{ marginTop: 6 }}>
            {temSaldoReal
              ? <span>Ancorado no <strong>saldo bancário real do {window.BI_FONTE || "ERP"}</strong> ({B.fmt(saldoRealTotal)} hoje): a curva
                  parte de {B.fmt(saldoInicial)} em janeiro e acumula receitas − despesas até chegar nele.
                  {" "}Os meses <strong>à frente de hoje são projeção</strong> — incluem o que está lançado
                  a pagar e a receber e ainda não tem baixa.</span>
              : <span>Sem saldo bancário do {window.BI_FONTE || "ERP"} disponível — a curva parte de zero e mostra apenas a
                  <strong> variação</strong> acumulada de receitas − despesas, não o saldo da conta.</span>}
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

  /* Default derivado do DADO, nao chumbado.
   *
   * Era `trim 1` vs `trim 2` (jan-mar vs abr-jun). Este cliente so tem dado de
   * julho em diante, entao a tela abria 100% zerada — "Diferenca na receita
   * R$ 0,00", tabela inteira R$ 0,00 — sem dizer por que. Parede de zeros na
   * primeira coisa que o cliente ve nao le como "recorte vazio", le como BI
   * quebrado.
   *
   * Agora: os dois ultimos meses COM movimento, ignorando mes futuro (baixa
   * antecipada de cartao chega com data la na frente). Se so houver um mes de
   * dado, compara ele contra o anterior — que fica vazio, mas de proposito e com
   * o rotulo dizendo qual mes e. Se nao houver dado nenhum, cai no trimestre. */
  const defaults = useMemo(() => {
    const tx = window.txNoContexto("tudo", null, false, { visao: "completo" });
    const lim = window.mesLimiteIdx ? window.mesLimiteIdx(refYear) : 11;
    const meses = new Set();
    for (const r of tx) {
      if (!r[1] || Number(r[1].slice(0, 4)) !== refYear) continue;
      const mi = parseInt(r[1].slice(5, 7), 10) - 1;
      if (mi <= lim) meses.add(mi);
    }
    const ord = [...meses].sort((a, b) => a - b);
    if (!ord.length) return { p1: { y: refYear, kind: "trim", val: 1 }, p2: { y: refYear, kind: "trim", val: 2 } };
    const ultimo = ord[ord.length - 1];
    const penultimo = ord.length > 1 ? ord[ord.length - 2] : Math.max(0, ultimo - 1);
    return {
      p1: { y: refYear, kind: "mes", val: penultimo + 1 },
      p2: { y: refYear, kind: "mes", val: ultimo + 1 },
    };
  }, [refYear]);

  // Estado dos 2 periodos comparados — cada um eh { y, kind: 'mes'|'trim'|'ano', val }
  const [p1, setP1] = useState(defaults.p1);
  const [p2, setP2] = useState(defaults.p2);
  const [expanded, setExpanded] = useState({ Receita: true, Despesa: true });
  // 3o nivel da hierarquia: quais categorias estao abertas mostrando as
  // contrapartes. Pedido da reuniao: "normalmente eu coloco aqui a opcao de
  // poder expandir e ver quais sao os clientes que geraram essa comparacao".
  const [catAberta, setCatAberta] = useState({});
  const toggleCat = (lado, cat) => setCatAberta(s => ({ ...s, [lado + "|" + cat]: !s[lado + "|" + cat] }));

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
    // txNoContexto, nao filterTx cru: esta tela ignorava o extraFilters inteiro,
    // entao o toggle Operacional/Completo, o regime Caixa/Competencia, o filtro
    // de conta e os de natureza/categoria nao chegavam aqui. O emprestimo de
    // R$ 199.627,92 aparecia como receita no Comparativo mesmo com a Visao Geral
    // no modo Operacional — duas telas contando historias diferentes.
    const sf = statusFilter || window.BIT_FILTER || "realizado";
    const txFiltered = window.txNoContexto(sf, null, semInvestimento, extraFilters);
    const { y, mIni, mFim } = periodBounds(p);
    const mIniStr = `${y}-${String(mIni).padStart(2, "0")}`;
    const mFimStr = `${y}-${String(mFim).padStart(2, "0")}`;
    let totalRec = 0, totalDesp = 0;
    const recCat = new Map(), despCat = new Map();
    // contraparte por categoria: cliente na receita, fornecedor na despesa
    const recCli = new Map(), despForn = new Map();
    const põe = (mapa, cat, quem, valor) => {
      if (!mapa.has(cat)) mapa.set(cat, new Map());
      const m = mapa.get(cat);
      const k = quem || "(sem identificação)";
      m.set(k, (m.get(k) || 0) + valor);
    };
    for (const row of txFiltered) {
      const kind = row[0], mes = row[1], categoria = row[3], valor = row[5];
      if (!mes || mes < mIniStr || mes > mFimStr) continue;
      if (kind === "r") {
        totalRec += valor;
        recCat.set(categoria, (recCat.get(categoria) || 0) + valor);
        põe(recCli, categoria, row[4], valor);
      } else {
        totalDesp += valor;
        despCat.set(categoria, (despCat.get(categoria) || 0) + valor);
        põe(despForn, categoria, row[7], valor);
      }
    }
    return { totalRec, totalDesp, liq: totalRec - totalDesp, recCat, despCat, recCli, despForn };
  };

  const a1 = useMemo(() => aggregate(p1), [p1, statusFilter, semInvestimento, extraFilters]);
  const a2 = useMemo(() => aggregate(p2), [p2, statusFilter, semInvestimento, extraFilters]);

  /* Linhas de contraparte de uma categoria, comparando os dois periodos.
   * Ordena pela maior diferenca em modulo — o que se quer ver primeiro num
   * comparativo e quem mais mudou, nao quem e maior. */
  const contrapartes = (lado, cat) => {
    const m1 = (lado === "r" ? a1.recCli : a1.despForn).get(cat) || new Map();
    const m2 = (lado === "r" ? a2.recCli : a2.despForn).get(cat) || new Map();
    const nomes = new Set([...m1.keys(), ...m2.keys()]);
    return [...nomes]
      .map(n => ({ nome: n, v1: m1.get(n) || 0, v2: m2.get(n) || 0 }))
      .sort((x, y) => Math.abs(y.v2 - y.v1) - Math.abs(x.v2 - x.v1));
  };
  const LinhasContraparte = ({ lado, cat }) => contrapartes(lado, cat).map((c, j) => {
    const d = c.v2 - c.v1;
    return (
      <tr key={lado + cat + j} className="child-row" style={{ opacity: 0.85 }}>
        <td style={{ paddingLeft: 46, fontSize: 11 }}>{c.nome}</td>
        <td className="num" style={{ fontSize: 11 }}>{c.v1 !== 0 ? fmt(c.v1) : "—"}</td>
        <td className="num" style={{ fontSize: 11 }}>{c.v2 !== 0 ? fmt(c.v2) : "—"}</td>
        <td className={`num ${d >= 0 ? "green" : "red"}`} style={{ fontSize: 11 }}>{fmt(d)}</td>
        <td className={`num ${d >= 0 ? "green" : "red"}`} style={{ fontSize: 11 }}>
          {c.v1 !== 0 ? fmtPct(safePct(d, c.v1)) : (c.v2 !== 0 ? "novo" : "—")}
        </td>
      </tr>
    );
  });

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
                  const aberta = !!catAberta["r|" + cat];
                  return (
                    <React.Fragment key={`r${i}`}>
                      <tr style={{ cursor: "pointer" }} onClick={() => toggleCat("r", cat)}
                          title="Clique pra ver quais clientes explicam essa diferença">
                        <td style={{ paddingLeft: 24 }}><span className="chev">{aberta ? "−" : "+"}</span>{cat}</td>
                        <td className="num green">{v1 !== 0 ? fmt(v1) : "—"}</td>
                        <td className="num green">{v2 !== 0 ? fmt(v2) : "—"}</td>
                        <td className={`num ${diff >= 0 ? "green" : "red"}`}>{fmt(diff)}</td>
                        <td className={`num ${diff >= 0 ? "green" : "red"}`}>{fmtPct(pct)}</td>
                      </tr>
                      {aberta && <LinhasContraparte lado="r" cat={cat} />}
                    </React.Fragment>
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
                  const aberta = !!catAberta["d|" + cat];
                  return (
                    <React.Fragment key={`d${i}`}>
                      <tr style={{ cursor: "pointer" }} onClick={() => toggleCat("d", cat)}
                          title="Clique pra ver quais fornecedores explicam essa diferença">
                        <td style={{ paddingLeft: 24 }}><span className="chev">{aberta ? "−" : "+"}</span>{cat}</td>
                        <td className="num red">{v1 !== 0 ? fmt(v1) : "—"}</td>
                        <td className="num red">{v2 !== 0 ? fmt(v2) : "—"}</td>
                        <td className={`num ${diff <= 0 ? "green" : "red"}`}>{fmt(diff)}</td>
                        <td className={`num ${diff <= 0 ? "green" : "red"}`}>{fmtPct(pct)}</td>
                      </tr>
                      {aberta && <LinhasContraparte lado="d" cat={cat} />}
                    </React.Fragment>
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

    /* O estado vazio precisa distinguir DUAS situações, porque a resposta é
     * diferente em cada uma — e antes ele tratava as duas como "relatório não
     * gerado", mostrando instrução de terminal pro cliente:
     *
     *   mês SEM LANÇAMENTO  -> não há o que analisar; o certo é dizer isso e
     *                          apontar quais períodos têm relatório
     *   mês COM dado e sem relatório -> o relatório está pendente de escrita
     *
     * Quais períodos existem sai do window.BI_REPORTS (embutido pelo
     * build-data.cjs), então a tela oferece o que de fato dá pra abrir em vez de
     * deixar o cliente caçando no seletor. */
    const txAno = (window.ALL_TX || []).filter(r => r[1] && Number(r[1].slice(0, 4)) === periodYear);
    const temDadoNoPeriodo = periodMonth > 0
      ? txAno.some(r => parseInt(r[1].slice(5, 7), 10) === periodMonth)
      : txAno.length > 0;
    const disponiveis = Object.keys(window.BI_REPORTS || {})
      .map(f => {
        const m = f.match(/^report-(\d{4})-(\d{2})\.json$/);
        if (m) return { y: Number(m[1]), mes: Number(m[2]) };
        const y = f.match(/^report-(\d{4})\.json$/);
        if (y) return { y: Number(y[1]), mes: 0 };
        return { y: refYear, mes: 0 };
      })
      .filter(p => p.y === periodYear)
      .sort((a, b) => a.mes - b.mes);
    const labelDe = (p) => (p.mes === 0 ? 'Ano completo' : MONTH_OPTIONS[p.mes].label);

    return (
      <div className="page">
        <div className="page-title">
          <div>
            <h1>Relatório IA</h1>
            <div className="status-line">
              {temDadoNoPeriodo
                ? `Relatório de ${monthLabel}${periodYear} em preparação`
                : `${monthLabel || ''}${periodYear} não tem lançamento`}
            </div>
          </div>
          <div className="actions">{PeriodToolbar}</div>
        </div>
        <div className="card">
          {temDadoNoPeriodo ? (
            <React.Fragment>
              <h2 className="card-title">Relatório em preparação</h2>
              <p style={{ color: "var(--fg-2)", lineHeight: 1.7, marginTop: 10 }}>
                Este período tem lançamento, mas a análise ainda não foi escrita. Os relatórios são
                produzidos por período e revisados antes de publicar — não são gerados na hora.
              </p>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <h2 className="card-title">Sem lançamento no período</h2>
              <p style={{ color: "var(--fg-2)", lineHeight: 1.7, marginTop: 10 }}>
                Não há nenhum lançamento em <strong>{monthLabel}{periodYear}</strong>, então não há
                o que analisar. Isso não é falha do relatório: as outras telas também aparecem
                zeradas neste período.
              </p>
            </React.Fragment>
          )}
          {disponiveis.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div className="kpi-label" style={{ marginBottom: 8 }}>Períodos com relatório disponível</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {disponiveis.map(p => (
                  <button key={p.mes} className="btn-ghost" onClick={() => setPeriodMonth(p.mes)}
                          title={`Abrir o relatório de ${labelDe(p)}`}>
                    {labelDe(p)}
                  </button>
                ))}
              </div>
            </div>
          )}
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

      {/* Havia aqui um modal "Como regenerar o relatorio" com o comando
          `node generate-report.cjs --force` num <pre>. Era CODIGO MORTO —
          setShowHelp(true) nunca era chamado, entao o modal nao tinha como
          aparecer — mas deixava instrucao de terminal no bundle servido ao
          cliente. Removido junto com o estado showHelp. */}

      {/* Relatorio imprimivel */}
      <article className="report">
        <header className="report-cover">
          <img src="assets/bgp-logo-white.png" alt="BGP" className="report-logo logo-dark" />
          <img src="assets/bgp-logo.png" alt="BGP" className="report-logo logo-light" />
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
// Contas: as que o fetch-saldos trouxer (window.FLUXO_PROJETADO.contas)
// Vistas: Consolidado (tudo) | Sem Investimento (exclui grupo 2.07)
// ============================================================
const PageFluxoProjetado = () => {
  const fp        = window.FLUXO_PROJETADO || {};
  const totais    = fp.totais || fp.rows || [];
  const contas    = fp.contas || [];
  /* Rótulo do consolidado montado a partir das contas que o fetch trouxe, não de
   * uma lista chumbada — antes vinham quatro contas de outro cliente escritas no
   * texto. Até 3 contas lista os nomes; acima disso vira contagem, senão o rótulo
   * estoura a linha. O sufixo " (Principal)" que o fetch-saldos acrescenta sai,
   * pra não repetir em toda conta. */
  const rotuloConsolidado = (function () {
    const nomes = contas
      .map(c => String(c.descricao || c.nCodCC || '').replace(/\s*\([^)]*\)\s*$/, '').trim())
      .filter(Boolean);
    if (!nomes.length) return 'Consolidado';
    if (nomes.length <= 3) return 'Consolidado (' + nomes.join(' + ') + ')';
    return 'Consolidado (' + nomes.length + ' contas)';
  })();
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
              {contaAtual ? contaAtual.descricao : rotuloConsolidado}
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
