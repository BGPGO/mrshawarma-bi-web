/* ==========================================================================
 * PageDRE — DRE Gerencial no modelo "Padrão iFinance" (Mr Shawarma)
 * ==========================================================================
 * Pedido da Silmara na reunião de onboarding (12/08/2026):
 *   "mas se eu precisar ter uma visão, por exemplo, um DRE gerencial. Eu
 *    consigo ver?" → "Eu tenho um modelo. Eu vou te passar. Está em Excel."
 *
 * A estrutura é a do arquivo que ela mandou — "DRE GERENCIAL - JULHO26 -
 * REGIME COMPETENCIA - SHAWARMA.xlsx" — reproduzida linha por linha em
 * DRE_ESTRUTURA (components.jsx), nas mesmas 15 linhas e na mesma ordem.
 *
 * A aba "Filtros Escolhidos" do próprio arquivo declara o recorte que ela usou:
 * modelo "Padrão iFinance", Status **Ambos** e Regime **Competência**. Isso
 * importa pra conferência — comparar contra "Realizado" não fecha, porque o
 * relatório dela inclui o que ainda não teve baixa.
 *
 * DECISÕES QUE VALE LER ANTES DE MEXER
 *
 * 1. Esta tela roda SEMPRE em visão Completo, ignorando o toggle
 *    Operacional/Completo do header. Uma DRE é uma demonstração completa: ela
 *    tem linha própria pro resultado financeiro (06) e pra retirada de sócios
 *    (07), então esconder financiamento aqui deixaria a cascata sem fechar.
 *    O rodapé declara isso pra ninguém achar que divergiu da Visão Geral.
 *
 * 2. O empréstimo RECEBIDO não tem linha no modelo dela — ela só tem 06.02 pro
 *    pagamento. Então ele cai na linha "Não mapeadas na DRE", visível e
 *    somável, em vez de eu inventar uma linha que ela não desenhou. Mostrar
 *    que falta uma linha é mais útil que fingir que não falta.
 *
 * 3. O invariante de reconciliação (cascata + não mapeadas == soma assinada de
 *    TODAS as rows do período) é renderizado na tela, não só testado. Sumidouro
 *    silencioso em DRE já engoliu R$ 232 mil em outro BI da frota; aqui, se
 *    sobrar um centavo, aparece em âmbar na cara de quem estiver olhando.
 * ========================================================================== */

const DRE_REGIME_LABEL = { caixa: "Caixa", competencia: "Competência" };

/* A referência que a Silmara mandou, pra tela poder se comparar com ela.
 * Julho/2026, regime competência, sem a conta CONGELADOS — foi assim que os
 * números fecharam quando eu testei emissão contra vencimento. */
const DRE_REFERENCIA = {
  periodo: "2026-07",
  regime: "competencia",
  status: "tudo",   // a aba "Filtros Escolhidos" dela diz Status = Ambos
  fonte: "DRE GERENCIAL - JULHO26 - REGIME COMPETENCIA - SHAWARMA.xlsx — enviado pela Silmara em 12/08/2026",
  linhas: {
    "1": 165828.55,
    "2": -42628.52,
    "3": -3880.62,
    "4": -53595.28,
    "5": 65724.13,
    "6": -21031.92,
    "7": -25245.71,
    "8": 0,
    "9": -4545.06,
    "10": 14901.44,
    "11": 342.68,
    "12": -916.86,
    "13": 14327.26,
    "14": -1100.00,
    "15": 13227.26,
  },
};

/* buildDRE — agrega as rows filtradas na cascata dela.
 *
 * Devolve, por linha do DRE_ESTRUTURA, um array de 12 meses + o total, já com
 * o sinal aplicado. Grupos guardam também as categorias que caíram neles, pro
 * expand. Fora da cascata: `naoMapeadas` (categoria sem linha na DRE dela) e
 * `todas` (soma assinada de tudo, pro invariante). */
const buildDRE = (txList, year) => {
  const zeros = () => Array(12).fill(0);
  // Sinal de cada linha da DRE, pra o invariante somar na MESMA convenção que a
  // cascata. Antes ele somava pelo lado do lançamento (receita +, despesa −), e
  // isso acusa resíduo quando o ERP manda uma dedução como receita — o F360 faz
  // exatamente isso com tarifa de cartão. O invariante existe pra testar
  // COBERTURA, não convenção de sinal.
  const sinalDaLinha = {};
  for (const d of window.DRE_ESTRUTURA) if (!d.tipo && !d.calc) sinalDaLinha[d.id] = d.sinal || 1;
  const grupos = {};       // '01.01' -> { values, cats: Map }
  const naoMapeadas = { values: zeros(), cats: new Map() };
  const todas = zeros();

  for (const row of txList) {
    if (!row[1] || Number(row[1].slice(0, 4)) !== year) continue;
    const mi = parseInt(row[1].slice(5, 7), 10) - 1;
    if (mi < 0 || mi > 11) continue;
    const z = window.dreClassify(row[3]);
    // Soma com o sinal da LINHA quando a categoria tem linha; pro que não tem,
    // usa o lado do lançamento (é o melhor palpite disponível).
    todas[mi] += z.mapeadaDre
      ? row[5] * (sinalDaLinha[z.dre] || 1)
      : (row[0] === "r" ? row[5] : -row[5]);

    const alvo = z.mapeadaDre ? (grupos[z.dre] = grupos[z.dre] || { values: zeros(), cats: new Map() })
                              : naoMapeadas;
    alvo.values[mi] += row[5];
    if (!alvo.cats.has(row[3])) alvo.cats.set(row[3], zeros());
    alvo.cats.get(row[3])[mi] += row[5];
  }

  // Monta as linhas na ordem do modelo dela, em TRÊS PASSADAS.
  //
  // Passada única não serve: no DRE_ESTRUTURA a linha de tipo vem ANTES dos
  // grupos que ela soma ("01" antes de "01.01"), do jeito que aparece no
  // relatório. Somando na ordem do array, todo tipo e todo resultado saía
  // ZERADO — o que de fato aconteceu na primeira versão desta função.
  const linhas = [];
  const porId = {};
  const soma = (ids) => {
    const out = zeros();
    for (const ref of ids) {
      const src = porId[ref];
      if (src) for (let i = 0; i < 12; i++) out[i] += src.values[i];
    }
    return out;
  };
  const novaLinha = (def, values) => {
    const linha = {
      id: def.id, label: def.label, tipo: !!def.tipo, calc: !!def.calc,
      nivel: (def.tipo || def.calc) ? 0 : 1,
      values,
      cats: (!def.tipo && !def.calc && grupos[def.id])
        ? Array.from(grupos[def.id].cats.entries())
            .map(([cat, vals]) => ({ cat, values: vals.map(v => v * (def.sinal || 1)) }))
            .sort((a, b) => Math.abs(b.values.reduce((s, v) => s + v, 0)) - Math.abs(a.values.reduce((s, v) => s + v, 0)))
        : [],
    };
    porId[def.id] = linha;
    return linha;
  };

  // 1) folhas: os grupos onde os lançamentos realmente caem.
  //    sinal -1 nas linhas que subtraem (deduções, custos, despesas, retiradas).
  for (const def of window.DRE_ESTRUTURA) {
    if (def.tipo || def.calc) continue;
    const g = grupos[def.id];
    novaLinha(def, g ? g.values.map(v => v * (def.sinal || 1)) : zeros());
  }
  // 2) tipos: soma dos grupos filhos, agora que existem.
  for (const def of window.DRE_ESTRUTURA) {
    if (!def.tipo) continue;
    novaLinha(def, soma(def.soma));
  }
  // 3) calculadas, na ordem do array — elas referenciam outras calculadas
  //    (05 usa 03; 08 usa 05), então a ordem do relatório é a ordem correta.
  for (const def of window.DRE_ESTRUTURA) {
    if (!def.calc) continue;
    novaLinha(def, soma(def.formula));
  }
  // devolve na ordem de exibição do relatório dela
  for (const def of window.DRE_ESTRUTURA) linhas.push(porId[def.id]);

  return {
    linhas, porId, todas,
    naoMapeadas: {
      values: naoMapeadas.values,
      cats: Array.from(naoMapeadas.cats.entries())
        .map(([cat, vals]) => ({ cat, values: vals }))
        .sort((a, b) => Math.abs(b.values.reduce((s, v) => s + v, 0)) - Math.abs(a.values.reduce((s, v) => s + v, 0))),
    },
  };
};

const PageDRE = ({ statusFilter, drilldown, setDrilldown, year, month, semInvestimento, extraFilters }) => {
  const isMobile = useIsMobile();
  const [range, setRange] = useState("dado");
  const [aberto, setAberto] = useState({});
  const [abertoNM, setAbertoNM] = useState(false);
  const toggle = (id) => setAberto(prev => ({ ...prev, [id]: !prev[id] }));

  // Completo sempre — ver decisão 1 no topo do arquivo.
  const ef = useMemo(
    () => Object.assign({ centroCusto: [], categoria: [], empresa: [], conta: [] }, extraFilters, { visao: "completo" }),
    [extraFilters]
  );
  const B = useMemo(() => window.getBit(statusFilter, drilldown, year, month, semInvestimento, ef),
    [statusFilter, drilldown, year, month, semInvestimento, ef]);
  const refYear = (B.META && B.META.ref_year) || new Date().getFullYear();
  const regime = (extraFilters && extraFilters.regime) === "competencia" ? "competencia" : "caixa";

  // A tabela mensal quer as 12 colunas de contexto, então ignora o recorte de
  // mês; o mês selecionado só destaca a coluna. Mesma escolha do Fluxo.
  const txJanela = useMemo(() => window.txNoContexto(statusFilter, null, semInvestimento, ef),
    [statusFilter, semInvestimento, ef]);
  const ddNaoMes = drilldown && drilldown.type !== "mes" ? drilldown : null;
  const txCtx = useMemo(() => window.txNoContexto(statusFilter, ddNaoMes, semInvestimento, ef),
    [statusFilter, ddNaoMes, semInvestimento, ef]);

  const mesesIdx = useMemo(() => window.janelaMeses(txJanela, refYear, range), [txJanela, refYear, range]);
  const D = useMemo(() => buildDRE(txCtx, refYear), [txCtx, refYear]);

  // Quantos lançamentos do período entraram na competência pela data de caixa
  // por não ter emissão. Declarar isso é o que separa aproximação de mentira.
  const semEmissao = useMemo(() => {
    if (regime !== "competencia") return 0;
    let n = 0;
    for (const r of txCtx) {
      if (!r[18]) continue;
      if (!r[1] || Number(r[1].slice(0, 4)) !== refYear) continue;
      if (!mesesIdx.includes(parseInt(r[1].slice(5, 7), 10) - 1)) continue;
      n++;
    }
    return n;
  }, [txCtx, regime, refYear, mesesIdx]);

  const activeMonthIdx = (drilldown && drilldown.type === "mes")
    ? parseInt(String(drilldown.value).slice(5, 7), 10) - 1
    : (month > 0 ? month - 1 : -1);

  const somaJanela = (vals) => mesesIdx.reduce((s, i) => s + (vals[i] || 0), 0);
  const fmt = (v) => B.fmt(v);

  // Base da análise vertical: as Receitas Operacionais do mês (linha 1), que é
  // a base da coluna "% V" do relatório dela.
  const base01 = D.porId["1"] ? D.porId["1"].values : Array(12).fill(0);
  const pctV = (vals, i) => {
    const b = i === -1 ? somaJanela(base01) : base01[i];
    const v = i === -1 ? somaJanela(vals) : vals[i];
    if (!b) return "—";
    return ((v / b) * 100).toFixed(1).replace(".", ",") + "%";
  };

  // Indicadores do painel da direita do relatório dela.
  const tot = (id) => (D.porId[id] ? somaJanela(D.porId[id].values) : 0);
  const receitaBruta = tot("1");
  const deducoes = tot("2") + tot("3");                          // já vêm negativos
  const receitaLiquida = receitaBruta + deducoes;
  const margemContribuicao = tot("5");
  const ebitda = tot("10");
  const resultadoGerencial = tot("13");
  const superavit = tot("15");
  const despFixas = tot("6") + tot("7") + tot("8") + tot("9");   // já vêm negativos
  const margemContribPct = receitaBruta ? margemContribuicao / receitaBruta : 0;
  const margemEbitda = receitaBruta ? ebitda / receitaBruta : 0;
  // Ponto de equilíbrio: despesa fixa / % de margem de contribuição
  const pontoEquilibrio = margemContribPct ? Math.abs(despFixas) / margemContribPct : 0;
  const pct = (v) => (v * 100).toFixed(2).replace(".", ",") + "%";

  // Invariante: a cascata mais as não mapeadas têm que reproduzir a soma
  // assinada de TODAS as rows do período. Se não, algo está sendo engolido.
  const somaCascata = somaJanela(D.porId["15"] ? D.porId["15"].values : Array(12).fill(0));
  const somaNM = mesesIdx.reduce((s, i) => {
    // não mapeadas guardam valor absoluto; o sinal vem do lado do lançamento,
    // então reconstruímos pelo próprio total assinado
    return s + (D.naoMapeadas.values[i] || 0);
  }, 0);
  const somaTodas = mesesIdx.reduce((s, i) => s + (D.todas[i] || 0), 0);
  // A cascata soma receitas positivas e despesas negativas; as não mapeadas
  // guardam módulo. Pra fechar, comparamos contra o total assinado usando o
  // sinal que cada não-mapeada tem no dado.
  const nmAssinado = useMemo(() => {
    let s = 0;
    for (const row of txCtx) {
      if (!row[1] || Number(row[1].slice(0, 4)) !== refYear) continue;
      const mi = parseInt(row[1].slice(5, 7), 10) - 1;
      if (!mesesIdx.includes(mi)) continue;
      if (window.dreClassify(row[3]).mapeadaDre) continue;
      s += row[0] === "r" ? row[5] : -row[5];
    }
    return s;
  }, [txCtx, refYear, mesesIdx]);
  // Quantas rows o ERP manda com o lado OPOSTO ao que a DRE dela classifica.
  // No Mr Shawarma são as tarifas de cartão, que vêm como receita e são dedução
  // na DRE. Vale declarar: é a explicação de por que a composição da receita no
  // BI não é a mesma da planilha dela.
  const ladoInvertido = useMemo(() => {
    let n = 0, v = 0;
    for (const row of txCtx) {
      if (!row[1] || Number(row[1].slice(0, 4)) !== refYear) continue;
      if (!mesesIdx.includes(parseInt(row[1].slice(5, 7), 10) - 1)) continue;
      const z = window.dreClassify(row[3]);
      if (!z.mapeadaDre) continue;
      const sinal = window.DRE_ESTRUTURA.find(d => d.id === z.dre);
      const sl = (sinal && sinal.sinal) || 1;
      const lado = row[0] === "r" ? 1 : -1;
      if (sl !== lado) { n++; v += row[5]; }
    }
    return { n, v };
  }, [txCtx, refYear, mesesIdx]);
  const residuo = somaTodas - (somaCascata + nmAssinado);

  // Comparação com o relatório que ela mandou, quando o recorte é o mesmo.
  // Exige também o status: o relatório dela é "Ambos" (realizado + a vencer).
  // Comparar contra "Realizado" mostraria delta em TODA linha e pareceria erro
  // do BI, quando é só recorte diferente.
  const podeComparar = regime === DRE_REFERENCIA.regime
    && statusFilter === DRE_REFERENCIA.status
    && mesesIdx.length === 1
    && `${refYear}-${String(mesesIdx[0] + 1).padStart(2, "0")}` === DRE_REFERENCIA.periodo;

  const colSpanTotal = 2 + mesesIdx.length * 2;

  const linhaCls = (l) => l.calc ? "dre-calc" : (l.tipo ? "dre-tipo" : "dre-grupo");

  return (
    <div className="page">
      <div className="page-title">
        <div>
          <h1>DRE Gerencial</h1>
          <div className="status-line">
            Modelo da iFinance · regime <strong>{DRE_REGIME_LABEL[regime]}</strong>
            {" · "}
            {mesesIdx.length === 12 ? "jan–dez" : `${B.MONTHS_FULL[mesesIdx[0]]}–${B.MONTHS_FULL[mesesIdx[mesesIdx.length - 1]]}`}
            {" de "}{refYear}
          </div>
        </div>
        <div className="actions">
          <div className="seg" title="Quais meses aparecem nas colunas">
            <button className={range === "dado" ? "active" : ""} onClick={() => setRange("dado")}>Meses com lançamento</button>
            <button className={range === "ano" ? "active" : ""} onClick={() => setRange("ano")}>Ano inteiro</button>
          </div>
        </div>
      </div>

      <DrilldownBadge drilldown={drilldown} onClear={() => setDrilldown(null)} />

      {/* Avisos que a tela precisa dar sobre si mesma, antes dos números */}
      <div className="dre-avisos">
        <div className="dre-aviso">
          Esta tela reproduz o modelo <strong>Padrão iFinance</strong> linha por linha, incluindo
          resultado financeiro (11 e 12) e investimentos (14) — o modelo tem linha própria pra cada
          um. A cascata fecha na linha 15, Superávit/Déficit de Caixa.
        </div>
        {regime === "caixa" && (
          <div className="dre-aviso dre-aviso-atencao">
            Você está em <strong>Caixa</strong>. O relatório que a Silmara enviou é em
            <strong> Competência</strong> — troque no cabeçalho pra comparar linha a linha.
          </div>
        )}
        {regime === "competencia" && semEmissao > 0 && (
          <div className="dre-aviso">
            {semEmissao} lançamento{semEmissao > 1 ? "s" : ""} do período não tem data de emissão e
            está entrando pela data de caixa: são pernas de movimento bancário (rendimento de
            aplicação, juros, tarifa de boleto, IOF), que não têm título e portanto não têm emissão.
            A competência de uma tarifa é o dia em que ela foi debitada.
          </div>
        )}
      </div>

      <div className="row" style={{ gridTemplateColumns: isMobile ? "1fr" : "minmax(0, 3fr) minmax(260px, 1fr)" }}>
        <div className="card">
          <div className="card-title-row">
            <h2 className="card-title">Demonstração de Resultado</h2>
            <span className="status-line" style={{ fontSize: 11 }}>% da Receita Operacional Líquida</span>
          </div>
          <div className="t-scroll" style={{ maxHeight: 620 }}>
            <table className="t t-dre">
              <thead>
                <tr>
                  <th style={{ minWidth: 260 }}>Conta</th>
                  {mesesIdx.map(i => (
                    <React.Fragment key={i}>
                      <th className={"num" + (i === activeMonthIdx ? " active" : "")}>{B.MONTHS_FULL[i]}</th>
                      <th className="num">% V</th>
                    </React.Fragment>
                  ))}
                  <th className="num">Total</th>
                  <th className="num">% V</th>
                </tr>
              </thead>
              <tbody>
                {D.linhas.map(l => {
                  const temCats = l.cats && l.cats.length > 0;
                  const isOpen = !!aberto[l.id];
                  return (
                    <React.Fragment key={l.id}>
                      <tr className={linhaCls(l)}
                          style={temCats ? { cursor: "pointer" } : undefined}
                          onClick={temCats ? () => toggle(l.id) : undefined}
                          title={temCats ? "Clique pra abrir as categorias desta linha" : undefined}>
                        <td style={{ paddingLeft: l.nivel * 16 + 8 }}>
                          <span className="chev" style={temCats
                            ? { display: "inline-block", transition: "transform .2s", transform: isOpen ? "rotate(90deg)" : "rotate(0)" }
                            : { visibility: "hidden" }}>▶</span>
                          {l.label}
                        </td>
                        {mesesIdx.map(i => (
                          <React.Fragment key={i}>
                            <td className="num" style={{ color: l.values[i] < 0 ? "var(--red)" : (l.values[i] > 0 ? "var(--green)" : "var(--fg-3)") }}>
                              {fmt(l.values[i])}
                            </td>
                            <td className="num" style={{ color: "var(--fg-3)" }}>{pctV(l.values, i)}</td>
                          </React.Fragment>
                        ))}
                        <td className="num" style={{ fontWeight: 700, color: somaJanela(l.values) < 0 ? "var(--red)" : "var(--green)" }}>
                          {fmt(somaJanela(l.values))}
                        </td>
                        <td className="num" style={{ fontWeight: 600, color: "var(--fg-3)" }}>{pctV(l.values, -1)}</td>
                      </tr>
                      {temCats && isOpen && l.cats.map(c => (
                        <tr key={l.id + "|" + c.cat} className="child-row" style={{ opacity: 0.85 }}>
                          <td style={{ paddingLeft: 40, fontSize: 11 }}>{c.cat}</td>
                          {mesesIdx.map(i => (
                            <React.Fragment key={i}>
                              <td className="num" style={{ fontSize: 11 }}>{fmt(c.values[i])}</td>
                              <td className="num" style={{ fontSize: 11, color: "var(--fg-3)" }}>{pctV(c.values, i)}</td>
                            </React.Fragment>
                          ))}
                          <td className="num" style={{ fontSize: 11 }}>{fmt(somaJanela(c.values))}</td>
                          <td className="num" style={{ fontSize: 11, color: "var(--fg-3)" }}>{pctV(c.values, -1)}</td>
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}

                {/* Fora da cascata: o que a DRE dela não classifica. Fica visível
                    e somável em vez de virar diferença fantasma. */}
                {Math.abs(nmAssinado) > 0.005 && (
                  <React.Fragment>
                    <tr className="dre-nao-mapeada"
                        style={{ cursor: "pointer" }}
                        onClick={() => setAbertoNM(o => !o)}
                        title="Categorias que existem no Omie e não têm linha no modelo de DRE do cliente">
                      <td style={{ paddingLeft: 8 }}>
                        <span className="chev" style={{ display: "inline-block", transition: "transform .2s", transform: abertoNM ? "rotate(90deg)" : "rotate(0)" }}>▶</span>
                        Não mapeadas na DRE
                        <span style={{ marginLeft: 6, color: "var(--amber, #f59e0b)", fontWeight: 700 }}>?</span>
                      </td>
                      {mesesIdx.map(i => (
                        <React.Fragment key={i}>
                          <td className="num">{fmt(D.naoMapeadas.values[i])}</td>
                          <td className="num" style={{ color: "var(--fg-3)" }}>{pctV(D.naoMapeadas.values, i)}</td>
                        </React.Fragment>
                      ))}
                      <td className="num" style={{ fontWeight: 700 }}>{fmt(somaJanela(D.naoMapeadas.values))}</td>
                      <td className="num" style={{ color: "var(--fg-3)" }}>{pctV(D.naoMapeadas.values, -1)}</td>
                    </tr>
                    {abertoNM && D.naoMapeadas.cats.map(c => (
                      <tr key={"nm|" + c.cat} className="child-row" style={{ opacity: 0.85 }}>
                        <td style={{ paddingLeft: 40, fontSize: 11 }}>{c.cat}</td>
                        {mesesIdx.map(i => (
                          <React.Fragment key={i}>
                            <td className="num" style={{ fontSize: 11 }}>{fmt(c.values[i])}</td>
                            <td className="num" style={{ fontSize: 11, color: "var(--fg-3)" }}>{pctV(c.values, i)}</td>
                          </React.Fragment>
                        ))}
                        <td className="num" style={{ fontSize: 11 }}>{fmt(somaJanela(c.values))}</td>
                        <td className="num" style={{ fontSize: 11, color: "var(--fg-3)" }}>{pctV(c.values, -1)}</td>
                      </tr>
                    ))}
                  </React.Fragment>
                )}

                <tr className="total">
                  <td>Superávit/Déficit + não mapeadas</td>
                  {mesesIdx.map(i => {
                    return (
                      <React.Fragment key={i}>
                        <td className="num" style={{ color: D.todas[i] < 0 ? "var(--red)" : "var(--green)" }}>{fmt(D.todas[i])}</td>
                        <td className="num" style={{ color: "var(--fg-3)" }}>{pctV(D.todas, i)}</td>
                      </React.Fragment>
                    );
                  })}
                  <td className="num" style={{ fontWeight: 700 }}>{fmt(somaTodas)}</td>
                  <td className="num">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="status-line" style={{ marginTop: 8, fontSize: 11 }}>
            {Math.abs(residuo) < 0.005
              ? <span>
                  ✓ Reconciliação fecha: cascata + não mapeadas = soma de todos os lançamentos do período.
                  {ladoInvertido.n > 0 && (
                    <span style={{ color: "var(--amber, #f59e0b)" }}>
                      {" · "}{ladoInvertido.n} lançamento{ladoInvertido.n > 1 ? "s" : ""} ({fmt(ladoInvertido.v)}) chega
                      {ladoInvertido.n > 1 ? "m" : ""} do ERP no lado oposto ao da linha em que a DRE os classifica —
                      tarifa de cartão vem marcada como receita e é dedução aqui. A cascata usa a classificação da DRE.
                    </span>
                  )}
                </span>
              : <span style={{ color: "var(--amber, #f59e0b)" }}>
                  ⚠ Reconciliação com resíduo de {fmt(residuo)} — algum lançamento não está caindo em nenhuma linha.
                  Isso é bug, não classificação: reportar.
                </span>}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="card">
            <h2 className="card-title">Indicadores</h2>
            <table className="t t-ind">
              <tbody>
                <tr><td>Receitas Operacionais</td><td className="num">{fmt(receitaBruta)}</td></tr>
                <tr><td>Deduções e impostos</td><td className="num">{fmt(deducoes)}</td></tr>
                <tr><td>Receita Líquida</td><td className="num">{fmt(receitaLiquida)}</td></tr>
                <tr><td>Margem de Contribuição</td><td className="num">{fmt(margemContribuicao)}</td></tr>
                <tr><td>% Margem de Contribuição</td><td className="num">{pct(margemContribPct)}</td></tr>
                <tr><td>Despesas fixas</td><td className="num">{fmt(despFixas)}</td></tr>
                <tr><td>EBITDA</td><td className="num">{fmt(ebitda)}</td></tr>
                <tr><td>% EBITDA</td><td className="num">{pct(margemEbitda)}</td></tr>
                <tr className="total"><td>Resultado Líquido Gerencial</td><td className="num">{fmt(resultadoGerencial)}</td></tr>
                <tr><td>Superávit/Déficit de Caixa</td><td className="num">{fmt(superavit)}</td></tr>
                <tr><td>Ponto de Equilíbrio</td><td className="num">{fmt(pontoEquilibrio)}</td></tr>
              </tbody>
            </table>
            <div className="status-line" style={{ marginTop: 6, fontSize: 10.5 }}>
              Margens sobre as Receitas Operacionais (linha 1) — a mesma base da coluna % V
              do relatório dela.
            </div>
          </div>

          {/* Reconciliação contra o arquivo que ela mandou. Só aparece quando o
              recorte é o mesmo (julho/2026 em competência), senão comparar
              números de períodos ou regimes diferentes seria enganoso. */}
          <div className="card">
            <h2 className="card-title">Conferência com o relatório dela</h2>
            {!podeComparar ? (
              <div className="status-line" style={{ fontSize: 11, lineHeight: 1.6 }}>
                A referência que tenho é <strong>julho/2026, regime Competência, status Ambos</strong>
                — o recorte que a aba "Filtros Escolhidos" do arquivo dela declara.
                Pra comparar linha a linha, selecione julho no cabeçalho, troque o regime pra
                Competência e o status pra Tudo.
                <div style={{ marginTop: 6, opacity: 0.8 }}>{DRE_REFERENCIA.fonte}</div>
              </div>
            ) : (
              <React.Fragment>
                <table className="t t-ind">
                  <thead>
                    <tr><th>Linha</th><th className="num">BI</th><th className="num">Dela</th><th className="num">Δ</th></tr>
                  </thead>
                  <tbody>
                    {Object.keys(DRE_REFERENCIA.linhas).map(id => {
                      const meu = D.porId[id] ? somaJanela(D.porId[id].values) : 0;
                      const dela = DRE_REFERENCIA.linhas[id];
                      const d = meu - dela;
                      const ok = Math.abs(d) < 1;
                      return (
                        <tr key={id}>
                          <td style={{ fontSize: 11 }}>{id}</td>
                          <td className="num" style={{ fontSize: 11 }}>{fmt(meu)}</td>
                          <td className="num" style={{ fontSize: 11, color: "var(--fg-3)" }}>{fmt(dela)}</td>
                          <td className="num" style={{ fontSize: 11, color: ok ? "var(--green)" : "var(--amber, #f59e0b)" }}>
                            {ok ? "ok" : fmt(d)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="status-line" style={{ marginTop: 6, fontSize: 10.5, lineHeight: 1.6 }}>
                  Nenhum número foi ajustado pra fechar — o Δ é real. E Δ aqui não quer dizer
                  erro: o relatório dela é uma foto de 12/08 e o F360 continuou andando, então
                  lançamento reclassificado ou incluído depois aparece como diferença.
                </div>
              </React.Fragment>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
