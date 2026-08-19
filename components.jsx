/* BIT/BGP Finance — shared components v2 */
const { useState, useEffect, useMemo, useRef } = React;

/* ==========================================================================
 * CLASSIFICAÇÃO DE CATEGORIAS — modelo "Padrão iFinance" (Mr Shawarma)
 * ==========================================================================
 * Extraído de "DRE GERENCIAL - JULHO26 - REGIME COMPETENCIA - SHAWARMA.xlsx",
 * enviado pela Silmara/iFinance em 12/08/2026. A aba "Filtros Escolhidos" do
 * próprio arquivo diz o modelo: **Padrão iFinance**, com Status "Ambos" e
 * Regime "Competência" — é esse recorte que reproduz os números dela.
 *
 * Diferente do BI da MedConsulting, aqui NÃO existem dois mapas: o F360 não
 * entrega um agrupamento próprio (o centro de custo vem com o nome da empresa
 * em todas as rows). Então o grupo do Fluxo de Caixa É a linha da DRE dela —
 * o que é melhor, porque as duas telas passam a falar a mesma língua.
 * ========================================================================== */
const DRE_MAP = {
  // linha 1 — RECEITAS OPERACIONAIS
  "102-1 - Vendas de Produtos - Delivery":                                      { grupo: "RECEITAS OPERACIONAIS",             dre: "1" },
  "102-1 - Vendas de Produtos - Débito e Crédito":                              { grupo: "RECEITAS OPERACIONAIS",             dre: "1" },
  "102-1 - Vendas de Produtos - Transferência / PIX":                           { grupo: "RECEITAS OPERACIONAIS",             dre: "1" },
  "102-1 - Vendas de Produtos - Vouchers":                                      { grupo: "RECEITAS OPERACIONAIS",             dre: "1" },
  "Ajustes a Crédito de Cartão":                                                { grupo: "RECEITAS OPERACIONAIS",             dre: "1" },
  "Outras Receitas Ifood":                                                      { grupo: "RECEITAS OPERACIONAIS",             dre: "1" },
  "Vendas de Mercadorias":                                                      { grupo: "RECEITAS OPERACIONAIS",             dre: "1" },
  // Definido pela Silmara em 16/08/2026: "acredito que esse valor seja
  // positivo, vamos colocar dentro de receitas operacionais - são vendas
  // delivery". Ja vinha como receita no F360, entao o sinal nao muda — o que
  // muda e sair da linha "Nao mapeadas" pra dentro da cascata.
  // ATENCAO ao mes: o rateio do F360 diz competencia 2026-06 (emissao 30/06,
  // pagamento 14/07). O "julho" de R$ 6.172,05 que ela citou e o mes de CAIXA.
  "Repasse de cupom Ifood":                                                     { grupo: "RECEITAS OPERACIONAIS",             dre: "1" },
  // linha 2 — Deduções de Receitas
  "431-9 - Tarifa de Cartao / Meios de Pagamento - Aluguel de POS / Outras Taxas":{ grupo: "Deduções de Receitas",              dre: "2" },
  "431-9 - Tarifa de Cartao / Meios de Pagamento - Antecipação":                { grupo: "Deduções de Receitas",              dre: "2" },
  "431-9 - Tarifa de Cartao / Meios de Pagamento - Delivery":                   { grupo: "Deduções de Receitas",              dre: "2" },
  "431-9 - Tarifa de Cartao / Meios de Pagamento - Padrão":                     { grupo: "Deduções de Receitas",              dre: "2" },
  "431-9 - Tarifa de Cartao / Meios de Pagamento - Voucher":                    { grupo: "Deduções de Receitas",              dre: "2" },
  "Ajustes a Débito de Cartão":                                                 { grupo: "Deduções de Receitas",              dre: "2" },
  "Desconto complementar da operadora Ifood":                                   { grupo: "Deduções de Receitas",              dre: "2" },
  "Taxa Administrativa de Cartões":                                             { grupo: "Deduções de Receitas",              dre: "2" },
  "Taxa de entrega Ifood (Despesa)":                                            { grupo: "Deduções de Receitas",              dre: "2" },
  // linha 3 — Impostos Sobre o Faturamento
  "205-2 - Simples Nacional":                                                   { grupo: "Impostos Sobre o Faturamento",      dre: "3" },
  // linha 4 — Despesas Operacionais
  "112-9 - Moveis e Utensilios":                                                { grupo: "Despesas Operacionais",             dre: "4" },
  "201-6 - OP Freelancer":                                                      { grupo: "Despesas Operacionais",             dre: "4" },
  "201-6 - OP Salarios":                                                        { grupo: "Despesas Operacionais",             dre: "4" },
  "400-0 - Custo de Embalagens":                                                { grupo: "Despesas Operacionais",             dre: "4" },
  "400-0 - Custo de Mercadorias Vendidas":                                      { grupo: "Despesas Operacionais",             dre: "4" },
  "403-9 - OP Vale Transporte":                                                 { grupo: "Despesas Operacionais",             dre: "4" },
  "410-5 - OP Servicos Tecnicos":                                               { grupo: "Despesas Operacionais",             dre: "4" },
  "410-9 - OP Outros Servicos Prestados":                                       { grupo: "Despesas Operacionais",             dre: "4" },
  "421-8 - OP Fretes e carretos":                                               { grupo: "Despesas Operacionais",             dre: "4" },
  // linha 6 — Despesas Com Pessoal
  "201-5 - Pro-Labore":                                                         { grupo: "Despesas Com Pessoal",              dre: "6" },
  "201-6 - Salarios e Ordenados":                                               { grupo: "Despesas Com Pessoal",              dre: "6" },
  "202-0 - Rescisoes":                                                          { grupo: "Despesas Com Pessoal",              dre: "6" },   // via código irmão; não estava na planilha de julho
  "203-0 - INSS":                                                               { grupo: "Despesas Com Pessoal",              dre: "6" },
  "203-1 - FGTS":                                                               { grupo: "Despesas Com Pessoal",              dre: "6" },
  "415-8 - Outras Despesas Com Funcionarios":                                   { grupo: "Despesas Com Pessoal",              dre: "6" },
  "418-0 - Farmacia":                                                           { grupo: "Despesas Com Pessoal",              dre: "6" },
  "418-3 - Curso e Treinamento":                                                { grupo: "Despesas Com Pessoal",              dre: "6" },   // via código irmão; não estava na planilha de julho
  // linha 7 — Despesas Administrativas
  "420-5 - Aluguel":                                                            { grupo: "Despesas Administrativas",          dre: "7" },
  "420-6 - Manut e Conservacao Predial":                                        { grupo: "Despesas Administrativas",          dre: "7" },
  "421-2 - Manutencao e Reparos":                                               { grupo: "Despesas Administrativas",          dre: "7" },
  "422-0 - Uber e Taxi":                                                        { grupo: "Despesas Administrativas",          dre: "7" },
  "422-9 - Material de Escritorio":                                             { grupo: "Despesas Administrativas",          dre: "7" },
  // Estas tres so ficaram visiveis depois do conserto do Rateio: antes eram
  // engolidas junto com as outras linhas do rateio. Mapeadas por codigo irmao
  // (422-9 Material de Escritorio, 423-5 Estacionamento e 420-5 Aluguel estao
  // todas na linha 7), o que e inequivoco pra material de limpeza, uniforme e
  // copa. ATENCAO: o relatorio de julho dela nao tem linha de Material de
  // Limpeza, e mapea-la aqui faz a linha 7 sair de match exato pra +R$ 189,13.
  // Preferi mostrar o delta a deixar despesa administrativa fora da cascata.
  "420-9 - Uniformes":                                                       { grupo: "Despesas Administrativas",       dre: "7" },
  "422-2 - Copa e Cozinha":                                                   { grupo: "Despesas Administrativas",       dre: "7" },
  "423-6 - Material de Limpeza":                                              { grupo: "Despesas Administrativas",       dre: "7" },
  "423-5 - Estacionamento":                                                     { grupo: "Despesas Administrativas",          dre: "7" },
  "425-5 - Consultoria":                                                        { grupo: "Despesas Administrativas",          dre: "7" },
  "425-6 - Contabilidade":                                                      { grupo: "Despesas Administrativas",          dre: "7" },
  "431-3 - Taxas e Emolumentos":                                                { grupo: "Despesas Administrativas",          dre: "7" },
  // linha 8 — Despesas Com TI
  "427-0 - Sistema de Gestao":                                                  { grupo: "Despesas Com TI",                   dre: "8" },   // via código irmão; não estava na planilha de julho
  // linha 9 — Despesas Comerciais e Marketing
  "434-4 - Marketing Digital":                                                  { grupo: "Despesas Comerciais e Marketing",   dre: "9" },
  "Aluguel de POS / Outras Taxas":                                              { grupo: "Despesas Comerciais e Marketing",   dre: "9" },
  "Taxa de manutenção mensal Ifood":                                            { grupo: "Despesas Comerciais e Marketing",   dre: "9" },
  // linha 11 — Receitas Financeiras
  "303-2 - Rendimento de Aplic Financeira":                                     { grupo: "Receitas Financeiras",              dre: "11" },
  "Estorno de Valores - Entradas":                                              { grupo: "Receitas Financeiras",              dre: "11" },
  "Sobra de Caixa":                                                             { grupo: "Receitas Financeiras",              dre: "11" },
  // linha 12 — Despesas Financeiras
  "430-7 - IOF":                                                                { grupo: "Despesas Financeiras",              dre: "12" },   // via código irmão; não estava na planilha de julho
  "431-5 - Despesas Bancarias":                                                 { grupo: "Despesas Financeiras",              dre: "12" },
  "432-0 - Juros Passivos":                                                     { grupo: "Despesas Financeiras",              dre: "12" },
  "Falta de Caixa":                                                             { grupo: "Despesas Financeiras",              dre: "12" },
  // Via codigo irmao (431-5 Despesas Bancarias ja esta aqui) e por natureza:
  // Multa e juros de conta paga em atraso e despesa financeira.
  // CONFIRMADO pela Silmara em 19/08/2026: "431-8, Multa e Juros sobre Contas
  // Pagas em Atraso - OK despesas financeiras". Era a ultima categoria fora da
  // cascata; com ela a DRE fica com ZERO nao mapeadas.
  // 1 lancamento, R$ 164,19 em mai/2026.
  "431-8 - Multa e Juros Sobre Contas Pg em Atraso":                            { grupo: "Despesas Financeiras",              dre: "12" },
  // linha 14 — Investimentos e Outros
  "112-5 - Maquinas e Equipamentos":                                            { grupo: "Investimentos e Outros",            dre: "14" },
};

/* Sem fallback por prefixo de código aqui. No F360 o "código" é parte da
 * descrição da categoria e ela reaproveita prefixo em linhas diferentes
 * (431-9 aparece em Deduções e em Comerciais; 201-6 em Despesas Operacionais
 * e em Despesas Com Pessoal, dependendo de ser "OP Salarios" ou "Salarios e
 * Ordenados"). Prefixo aqui erraria mais do que acertaria. Categoria nova cai
 * como não mapeada de propósito, pra ela classificar. */
const DRE_PREFIXO = {};

/* A cascata do modelo dela, na ordem e com os sinais do relatório.
 * `calc` = linha calculada (soma as anteriores, não recebe lançamento).
 * Não há nível intermediário de "tipo" como no MedConsulting: aqui as linhas
 * de 1 a 14 recebem categoria direto. */
const DRE_ESTRUTURA = [
  { id: "1",   label: "1 - RECEITAS OPERACIONAIS",               sinal: +1 },
  { id: "2",   label: "2 - Deduções de Receitas",                sinal: -1 },
  { id: "3",   label: "3 - Impostos Sobre o Faturamento",        sinal: -1 },
  { id: "4",   label: "4 - Despesas Operacionais",               sinal: -1 },
  { id: "5",   label: "5 - = Margem de Contribuição",            calc: true, formula: ["1","2","3","4"] },
  { id: "6",   label: "6 - Despesas Com Pessoal",                sinal: -1 },
  { id: "7",   label: "7 - Despesas Administrativas",            sinal: -1 },
  { id: "8",   label: "8 - Despesas Com TI",                     sinal: -1 },
  { id: "9",   label: "9 - Despesas Comerciais e Marketing",     sinal: -1 },
  { id: "10",  label: "10 - = EBITDA / Resultado Operacional",   calc: true, formula: ["5","6","7","8","9"] },
  { id: "11",  label: "11 - Receitas Financeiras",               sinal: +1 },
  { id: "12",  label: "12 - Despesas Financeiras",               sinal: -1 },
  { id: "13",  label: "13 - = Resultado Líquido Gerencial",      calc: true, formula: ["10","11","12"] },
  { id: "14",  label: "14 - Investimentos e Outros",             sinal: -1 },
  { id: "15",  label: "15 - = Superávit/Déficit de Caixa",       calc: true, formula: ["13","14"] },
];

/* Ordem de exibição dos grupos no Fluxo de Caixa = a ordem da própria DRE. */
const GRUPO_OMIE_ORDEM = [
  "RECEITAS OPERACIONAIS",
  "Deduções de Receitas",
  "Impostos Sobre o Faturamento",
  "Despesas Operacionais",
  "Despesas Com Pessoal",
  "Despesas Administrativas",
  "Despesas Com TI",
  "Despesas Comerciais e Marketing",
  "Receitas Financeiras",
  "Despesas Financeiras",
  "Investimentos e Outros",
  "NÃO MAPEADAS",
];

/* Classifica uma categoria nas DUAS hierarquias, com dois flags separados:
 *
 *   mapeada     — o grupo da fonte é conhecido (usado pelo Fluxo de Caixa)
 *   mapeadaDre  — a categoria tem linha na DRE gerencial dela
 *
 * São coisas diferentes: empréstimo recebido tem grupo no Omie e NÃO tem linha
 * na DRE dela. Tratar como um flag só forçaria a escolha entre mentir no Fluxo
 * ou mentir na DRE.
 *
 * Quem consome DEVE mostrar o não mapeado numa linha própria em vez de
 * descartar em silêncio — o `continue` calado já engoliu R$ 232k num outro BI
 * da frota, e virou ticket que custou horas pra reproduzir. */
const dreClassify = (categoria) => {
  const cat = String(categoria || "").trim();
  const exato = DRE_MAP[cat];
  if (exato) {
    // `omie` no retorno e o nome herdado do BI da MedConsulting, onde o grupo
    // vinha do Omie. Aqui ele carrega a linha da DRE dela — o consumidor
    // (buildFluxoOmie) nao precisa saber a diferenca.
    return {
      omie: exato.grupo,
      dre: exato.dre || "99",
      mapeada: true,
      mapeadaDre: !!exato.dre,
    };
  }
  const pref = cat.match(/^(\d{3}-\d)/);
  const viaPrefixo = pref && DRE_PREFIXO[pref[1]];
  if (viaPrefixo) {
    return { omie: viaPrefixo.omie, dre: viaPrefixo.dre, mapeada: true, mapeadaDre: true, viaPrefixo: true };
  }
  return { omie: "NÃO MAPEADAS", dre: "99", mapeada: false, mapeadaDre: false };
};
window.dreClassify = dreClassify;
window.DRE_ESTRUTURA = DRE_ESTRUTURA;
window.GRUPO_OMIE_ORDEM = GRUPO_OMIE_ORDEM;

/* ==========================================================================
 * FIXO x VARIÁVEL — o que alimenta o Ponto de Equilíbrio
 * ==========================================================================
 * Definido pela Silmara em 16/08/2026, respondendo à pergunta do ponto de
 * equilíbrio:
 *
 *   "Deduções e Impostos = variáveis; Pessoal, Administrativas, TI e
 *    Financeiras = fixas; Investimentos fora do cálculo."
 *   Despesas Operacionais (linha 4): "se conseguir separar, pode separar"
 *   Comerciais e Marketing (linha 9): "Comercial é variável, Marketing é fixo"
 *
 * Mora AQUI, e não no bi.config.js, porque a classificação é função da LINHA
 * DA DRE — e a linha só existe neste arquivo, no DRE_MAP. Em config viraria uma
 * segunda verdade sobre a mesma categoria, livre pra divergir em silêncio.
 *
 * Também não vem do `categoria_superior` como no Omie: o F360 grava esse campo
 * vazio em 201 de 201 categorias, e era exatamente por isso que o Ponto de
 * Equilíbrio estava desligado (BIT_HAS_PE=false) desde a criação deste BI.
 *
 * Quatro valores: 'F' fixo · 'V' variável · '-' fora do cálculo, de propósito
 * · '' não classificada (é DEFEITO, e a tela declara a contagem).
 * ========================================================================== */
const PE_POR_LINHA = {
  "1":  "-",   // Receitas Operacionais — é a receita, não custo
  "2":  "V",   // Deduções de Receitas
  "3":  "V",   // Impostos Sobre o Faturamento
  "4":  "F",   // Despesas Operacionais — default fixo; CMV e embalagem são exceção abaixo
  "6":  "F",   // Despesas Com Pessoal
  "7":  "F",   // Despesas Administrativas
  "8":  "F",   // Despesas Com TI
  "9":  "F",   // Comerciais e Marketing — default Marketing (fixo); comercial é exceção
  "11": "-",   // Receitas Financeiras — receita, não custo (ela disse "Financeiras = fixas"
               //   falando das DESPESAS; classificar receita como custo fixo seria absurdo)
  "12": "F",   // Despesas Financeiras
  "14": "-",   // Investimentos e Outros — ela pediu fora do cálculo
};

/* Exceções por categoria. Vencem a linha. São só estas quatro — cada uma é uma
 * frase dela, não uma inferência minha. */
const PE_POR_CATEGORIA = {
  // linha 4: "mistura CMV e embalagens, que variam com o faturamento, com
  // salários da operação, que são fixos" — o que varia vira V, o resto da
  // linha fica no default F (OP Salarios, OP Freelancer, OP Vale Transporte,
  // e mais Serviços Técnicos, Móveis e Utensílios, Fretes e Outros Serviços,
  // que ela NÃO citou — confirmar).
  "400-0 - Custo de Mercadorias Vendidas": "V",
  "400-0 - Custo de Embalagens":           "V",
  // linha 9: "Comercial é variável, Marketing é fixo". Marketing Digital fica
  // no default F; as duas taxas de canal de venda vão pra V.
  // A "Taxa de manutenção mensal Ifood" é mensal e fixa em valor, mas é custo
  // de canal comercial — classifiquei pela regra dela e listei no painel de
  // cobertura pra ela ver e corrigir se discordar (jul: R$ 237,43).
  "Aluguel de POS / Outras Taxas":         "V",
  "Taxa de manutenção mensal Ifood":       "V",
};

const peClassOf = (categoria) => {
  const cat = String(categoria || "").trim();
  const exc = PE_POR_CATEGORIA[cat];
  if (exc) return exc;
  const z = dreClassify(cat);
  if (!z.mapeadaDre) return "";
  return PE_POR_LINHA[z.dre] || "";
};
window.peClassOf = peClassOf;

/* Base da receita do PE = linha 1 (Receitas Operacionais), a mesma base da
 * coluna "% V" do relatório dela e a mesma que a tela da DRE usa. O computePE
 * somava TODA receita, o que puxava a financeira pra dentro e fazia o card da
 * Visão Geral discordar da DRE no mesmo dia. */
const peEhReceitaBase = (row) => row[0] === "r" && dreClassify(row[3]).dre === "1";
window.peEhReceitaBase = peEhReceitaBase;

/* BIT_HAS_PE é recalculado aqui, sobrescrevendo o do data.js. O data.js decide
 * pelo row[10] (que vem de categoria_superior e é vazio em toda a base do
 * F360); a partir de agora quem manda é a classificação acima. Ordem de carga:
 * data.js roda antes do bundle, então este arquivo é o último a falar. */
window.BIT_HAS_PE = Array.isArray(window.ALL_TX)
  && window.ALL_TX.some(r => r[0] === "d" && (peClassOf(r[3]) === "F" || peClassOf(r[3]) === "V"));

/* O que classificamos SEM frase dela. A linha 4 e a unica com residuo: ela
 * falou de CMV, embalagens e "salarios da operacao", e sobrou o resto. Nao da
 * pra derivar isso da linha (a linha 4 inteira seria suposicao, incluindo o
 * que ela respondeu) nem da ausencia de classe (cobertura da 100%, porque nos
 * classificamos). Entao a lista do que ela CONFIRMOU e explicita — e tudo que
 * cair na linha 4 fora dela e suposicao nossa, declarada na tela. */
const PE_LINHA_RESIDUO = "4";
const PE_CONFIRMADAS = new Set([
  "400-0 - Custo de Mercadorias Vendidas",  // "variam com o faturamento"
  "400-0 - Custo de Embalagens",            // idem
  "201-6 - OP Salarios",                    // "salarios da operacao, que sao fixos"
  "201-6 - OP Freelancer",                  // idem
  "403-9 - OP Vale Transporte",             // idem
  // Confirmadas por ela em 19/08/2026, respondendo a pergunta 3 do relatorio:
  // "Quatro categorias que classificamos por conta propria - OK". Saem da lista
  // de suposicao -- o painel tem que parar de pedir confirmacao que ja veio,
  // senao o aviso vira ruido e ela para de ler os avisos que importam.
  "410-5 - OP Servicos Tecnicos",
  "112-9 - Moveis e Utensilios",
  "421-8 - OP Fretes e carretos",
  "410-9 - OP Outros Servicos Prestados",
]);
const peSuposto = (categoria) => {
  const cat = String(categoria || "").trim();
  return dreClassify(cat).dre === PE_LINHA_RESIDUO && !PE_CONFIRMADAS.has(cat);
};
window.peSuposto = peSuposto;

/* Cobertura da classificação, pra tela declarar em vez de mostrar saúde por
 * omissão. Devolve os totais por classe e a lista do que ficou de fora. */
const peCobertura = (rows) => {
  const out = { F: 0, V: 0, fora: 0, semClasse: 0, suposto: 0, receita: 0,
                categorias: { F: {}, V: {}, fora: {}, semClasse: {}, suposto: {} } };
  for (const r of rows || []) {
    if (r[0] === "r") { out.receita += r[5]; continue; }
    const c = peClassOf(r[3]);
    const bucket = c === "F" ? "F" : c === "V" ? "V" : c === "-" ? "fora" : "semClasse";
    out[bucket] += r[5];
    out.categorias[bucket][r[3]] = (out.categorias[bucket][r[3]] || 0) + r[5];
    // Suposicao NOSSA, nao instrucao dela: a linha 4 (Outras Despesas
    // Operacionais) nao foi respondida e esta entrando como FIXA. Cobertura
    // 100% esconde isso — a categoria some da lista de "sem classificacao"
    // exatamente porque nos a classificamos. Entao ela sai por fora, pra tela
    // poder dizer o que foi assumido em vez de mostrar saude por omissao.
    if (peSuposto(r[3])) {
      out.suposto += r[5];
      out.categorias.suposto[r[3]] = (out.categorias.suposto[r[3]] || 0) + r[5];
    }
  }
  return out;
};
window.peCobertura = peCobertura;

/* ==========================================================================
 * SALDO — uma definição só, para as telas não divergirem
 * ==========================================================================
 * Em 17/08/2026 este BI tinha o card do Ponto de Equilíbrio, a curva mensal da
 * Tesouraria e o Fluxo a vencer dando respostas diferentes sobre o mesmo caixa.
 * Cada tela que precisar de "quanto tem em banco" ou "quanto terei no fim do
 * mês N" chama daqui, e não refaz a conta.
 *
 * `saldoRealContas()`  — os saldos de hoje por conta, do fetch-saldos.
 * `serieSaldoMensal()` — os 12 pontos de saldo no FIM de cada mês, ancorados no
 *                        fechamento do mês anterior (ver o porquê na Tesouraria).
 * ========================================================================== */
const saldoRealContas = () => {
  const contas = (window.FLUXO_PROJETADO || {}).contas || [];
  const finalidades = window.BI_CONTAS_FINALIDADE || {};
  const finalidadeDe = (desc) => {
    // o fetch-saldos sufixa a conta com " (Principal)"; o mapa do config é sem sufixo
    const limpo = String(desc || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
    return finalidades[limpo] || finalidades[desc] || null;
  };
  return contas.map(c => {
    const r = (c.rows || [])[0];
    return { descricao: c.descricao, saldo: r ? r.saldoFinal : 0, fin: finalidadeDe(c.descricao) };
  }).sort((a, b) => b.saldo - a.saldo);
};
window.saldoRealContas = saldoRealContas;

const serieSaldoMensal = (year, semInv, extraFilters) => {
  const contas = saldoRealContas();
  const saldoRealTotal = contas.reduce((s, c) => s + c.saldo, 0);
  const temSaldoReal = contas.length > 0;

  // O acumulado do ano precisa de TUDO (realizado + a vencer): é o que faz os
  // meses à frente serem projeção em vez de linha reta.
  const Btudo = window.getBit("tudo", null, year, 0, semInv, extraFilters);
  const md = Btudo.MONTH_DATA || [];
  let s = 0;
  const cum = md.map(m => { s += (m.receita || 0) - (m.despesa || 0); return s; });

  const mesAncora = Math.min(new Date().getMonth(), Math.max(0, cum.length - 1));
  const Breal = window.getBit("realizado", null, year, 0, semInv, extraFilters);
  const mdR = (Breal.MONTH_DATA || [])[mesAncora];
  const netRealizadoMesCorrente = mdR ? (mdR.receita || 0) - (mdR.despesa || 0) : 0;
  const saldoFimMesAnterior = saldoRealTotal - netRealizadoMesCorrente;
  const offset = temSaldoReal
    ? saldoFimMesAnterior - (mesAncora > 0 ? (cum[mesAncora - 1] || 0) : 0)
    : 0;

  return {
    contas, saldoRealTotal, temSaldoReal, mesAncora, netRealizadoMesCorrente,
    saldoFimMesAnterior, offset,
    curva: cum.map(v => (v || 0) + offset),
    // saldo no fim do mês mesIdx; mesIdx -1 devolve o fechamento de dezembro anterior
    fimDoMes: (mesIdx) => (mesIdx < 0 ? offset : (cum[mesIdx] || 0) + offset),
  };
};
window.serieSaldoMensal = serieSaldoMensal;

/* ==========================================================================
 * EIXO DO GRÁFICO: mês ou dia
 * ==========================================================================
 * Com um mês escolhido no cabeçalho, os gráficos "por mês" viravam 11 colunas
 * zeradas e uma cheia — inútil, e parece defeito. Aqui, com mês selecionado o
 * eixo passa a ser os DIAS daquele mês (respeitando o intervalo, se houver).
 * Mesmo raciocínio que já vale na tabela do Fluxo de Caixa.
 *
 * A série diária é calculada do `txNoContexto`, e NÃO do `B.RECEITA_DIA`: esse
 * campo não é emitido pelo `aggregateTx`, então sobrevive do segmento
 * pré-computado e não reage a regime, conta, categoria nem visão. É o mesmo
 * defeito do SALDOS_MES e do FLUXO_*.
 * ========================================================================== */
const eixoDoRecorte = (year, month, drilldown, mesesFull) => {
  if (!month || month < 1 || month > 12) {
    return { tipo: "mes", n: 12, labels: mesesFull, ym: null, de: 1, ate: 12 };
  }
  const mm = String(month).padStart(2, "0");
  const ultimo = new Date(year, month, 0).getDate();
  let de = 1, ate = ultimo;
  if (drilldown && drilldown.type === "dia_range") { de = drilldown.from; ate = Math.min(drilldown.to, ultimo); }
  else if (drilldown && drilldown.type === "dia") { de = drilldown.value; ate = drilldown.value; }
  const labels = [];
  for (let d = de; d <= ate; d++) labels.push(String(d).padStart(2, "0"));
  return { tipo: "dia", n: labels.length, labels, ym: year + "-" + mm, de, ate, mesNome: mesesFull[month - 1] || "" };
};
window.eixoDoRecorte = eixoDoRecorte;

/* Soma receita e despesa por coluna do eixo, a partir das rows já no contexto. */
const serieDoEixo = (rows, eixo, year) => {
  const rec = Array(eixo.n).fill(0);
  const desp = Array(eixo.n).fill(0);
  for (const r of rows || []) {
    if (!r[1]) continue;
    let i;
    if (eixo.tipo === "dia") {
      if (r[1] !== eixo.ym || r[2] < eixo.de || r[2] > eixo.ate) continue;
      i = r[2] - eixo.de;
    } else {
      if (Number(r[1].slice(0, 4)) !== year) continue;
      i = parseInt(r[1].slice(5, 7), 10) - 1;
    }
    if (i < 0 || i >= eixo.n) continue;
    if (r[0] === "r") rec[i] += r[5]; else desp[i] += r[5];
  }
  return { rec, desp };
};
window.serieDoEixo = serieDoEixo;

/* txNoContexto — devolve as rows do ALL_TX sob o MESMO contexto de filtro que
 * o `recomputeBit` aplica (status + drilldown + semInvestimento + extraFilters).
 *
 * Existe porque `aggregateTx` não emite FLUXO_RECEITA/FLUXO_DESPESA/COMP_DATA:
 * o `recomputeBit` faz `Object.assign({}, base, agg, …)` e, sem esses campos no
 * `agg`, sobrevive o `base` — que é o segmento 'realizado' pré-computado em
 * build-time. Resultado: a tabela do Fluxo e o Comparativo ficavam CONGELADOS
 * (idênticos byte-a-byte em realizado / a pagar-receber / tudo) enquanto o KPI
 * logo acima, na mesma tela, se movia. Quem precisa reagir a filtro recalcula
 * daqui, do ALL_TX, em vez de ler B.FLUXO_*.
 *
 * Índices do ALL_TX: 0 kind · 1 'YYYY-MM' · 2 dia · 3 categoria · 4 cliente
 * 5 valor · 6 realizado · 7 fornecedor · 8 centroCusto · 9 investimento
 * 10 peClass · 11 empresa · 12 projeto */
const txNoContexto = (statusFilter, drilldown, semInv, extraFilters) => {
  // REGIME — espelha o recomputeBit. Em competencia remapeia mes/dia pra data de
  // competencia ANTES de filtrar; sem isso o recorte de mes e o drilldown seguem
  // usando a data de caixa e a TABELA mostra caixa enquanto o KPI acima dela
  // mostra competencia, com o cabecalho afirmando "Competencia". Row sem
  // competencia sai, igual ao recomputeBit — se ficasse, a soma da tabela nao
  // fecharia com o KPI.
  let fonte = window.ALL_TX || [];
  if (extraFilters && extraFilters.regime === "competencia") {
    const remap = [];
    for (const r of fonte) {
      if (!r[15]) continue;
      const c = r.slice();
      c[1] = r[15]; c[2] = r[16];
      remap.push(c);
    }
    fonte = remap;
  }
  let out = window.filterTx(fonte, statusFilter, drilldown);
  if (semInv) out = out.filter(r => !r[9]);
  if (extraFilters) {
    const cc = extraFilters.centroCusto, cat = extraFilters.categoria, emp = extraFilters.empresa;
    const cta = extraFilters.conta;
    if (cc && cc.length) { const s = new Set(cc); out = out.filter(r => s.has(r[8] || "")); }
    if (cat && cat.length) { const s = new Set(cat); out = out.filter(r => s.has(r[3])); }
    if (emp && emp.length) { const s = new Set(emp); out = out.filter(r => s.has(r[11] || "")); }
    if (cta && cta.length) { const s = new Set(cta); out = out.filter(r => s.has(r[17] || "")); }
  }
  // Espelha o recomputeBit: visao Operacional (default) tira o nao-operacional.
  // Quem quer o caixa cheio (Fluxo, Tesouraria) passa visao: 'completo'.
  if (!extraFilters || extraFilters.visao !== "completo") out = out.filter(r => !r[14]);
  return out;
};
window.txNoContexto = txNoContexto;

/* Ultimo mes (0-based) que pode ser apresentado como "atual" / "ultimo com
 * movimento".
 *
 * Existe porque baixa com data futura conta como realizado: cartao antecipado
 * chega com data_efetiva la na frente. Sao 1.023 rows em setembro/2026 aqui, e
 * o Overview anunciava "setembro de 2026 — ultimo mes com movimento" com os KPIs
 * de setembro em destaque, sendo agosto. O lancamento nao e invencao, mas
 * apresentar mes futuro como o mes corrente e. */
const mesLimiteIdx = (refYear) => {
  const hoje = new Date();
  return refYear === hoje.getFullYear() ? hoje.getMonth() : 11;
};
window.mesLimiteIdx = mesLimiteIdx;

/* Assimetria previsto/realizado — mede, nao afirma.
 *
 * Despesa recorrente e cadastrada com meses de antecedencia (aluguel, INSS,
 * Simples chegam lancados ate dezembro). Receita futura nao existe: venda nao se
 * pre-lanca. Nas visoes "Tudo" e "A pagar/receber" isso soma despesa que vai
 * acontecer contra receita que ainda nao foi lancada, e o resultado fica
 * fortemente negativo — aritmeticamente correto, e lido como prejuizo iminente.
 *
 * Devolve os dois lados do futuro pra tela poder declarar. `relevante` so liga
 * quando a assimetria e grande de verdade, pra nao poluir BI onde a fonte
 * pre-lanca receita tambem. */
const assimetriaFutura = (refYear) => {
  const tx = window.ALL_TX || [];
  const lim = mesLimiteIdx(refYear);
  let receita = 0, despesa = 0;
  for (const t of tx) {
    if (t[6] !== 0) continue;                                   // so pendente
    if (!t[1] || Number(t[1].slice(0, 4)) !== refYear) continue;
    if (parseInt(t[1].slice(5, 7), 10) - 1 <= lim) continue;    // so o que e futuro
    if (String(t[0]).toLowerCase().startsWith("r")) receita += Math.abs(t[5] || 0);
    else despesa += Math.abs(t[5] || 0);
  }
  return { receita, despesa, relevante: despesa > 0 && despesa >= 3 * Math.max(receita, 1) };
};
window.assimetriaFutura = assimetriaFutura;

/* Nota que explica a assimetria. Se auto-esconde: no status "realizado" nao ha
 * futuro no recorte, e onde a fonte pre-lanca receita o `relevante` da false. */
const NotaAssimetria = ({ refYear, statusFilter, fmt }) => {
  if (statusFilter === "realizado") return null;
  const a = assimetriaFutura(refYear);
  if (!a.relevante) return null;
  const f = fmt || (n => "R$ " + n.toFixed(2));
  return (
    <div className="status-line" style={{ fontSize: 10.5, lineHeight: 1.6, marginTop: 8 }}>
      <strong>Por que o resultado fica tão negativo neste recorte:</strong> este status inclui o
      que ainda não aconteceu, e os dois lados do futuro não estão lançados no mesmo ritmo.
      Depois deste mês já há <strong>{f(a.despesa)}</strong> de despesa cadastrada
      {a.receita > 0 ? <> contra <strong>{f(a.receita)}</strong> de receita</> : <> e <strong>nenhuma receita</strong></>}
      {" "}— aluguel, impostos e folha entram com meses de antecedência, e venda não se pré-lança.
      A diferença é de cadastro, não de desempenho. Pra ver o resultado do que de fato
      aconteceu, troque o status para <strong>Realizado</strong>.
    </div>
  );
};
window.NotaAssimetria = NotaAssimetria;

/* Janela de meses a exibir. O bug original era `MONTHS_FULL.slice(0, 6)`:
 * janela FIXA em jan–jun, independente de onde o dado estava. Aqui a janela
 * segue o dado. */
const mesesComDado = (txList, year) => {
  const has = new Set();
  for (const r of txList) {
    if (!r[1] || Number(r[1].slice(0, 4)) !== year) continue;
    has.add(parseInt(r[1].slice(5, 7), 10) - 1);
  }
  return has;
};
/* Duas janelas, as duas honestas:
 *   'dado' (default) — do primeiro ao último mês que TEM lançamento, somando
 *                      realizados e a vencer. É o que conserta o bug original.
 *   'ano'            — jan–dez, pra quem quer ver o ano fechado com os zeros.
 *
 * Deliberadamente NÃO existe janela rolante de 6 meses pra frente cruzando o
 * ano: o `aggregateTx` do data.js filtra `Number(ymonth) !== year` e descarta
 * tudo fora do ano selecionado, então uma janela ago/26–jan/27 mostraria
 * janeiro zerado mesmo tendo dado. Enquanto esse filtro existir, a janela
 * rolante seria uma mentira na tela. */
const janelaMeses = (txList, year, range) => {
  const has = mesesComDado(txList, year);
  if (range === "ano" || has.size === 0) return Array.from({ length: 12 }, (_, i) => i);
  const idx = Array.from(has).sort((a, b) => a - b);
  const out = [];
  for (let i = idx[0]; i <= idx[idx.length - 1]; i++) out.push(i);
  return out;
};
window.janelaMeses = janelaMeses;

/* ==========================================================================
 * TEMA CLARO / ESCURO
 * ==========================================================================
 * Pedido da Silmara na reunião de 12/08: "tá, e como que eu tiro do escuro?
 * (...) aqui é tudo quase 40, os clientes é 40 a mais, então tem que ser
 * clarinho". Por isso o DEFAULT deste BI é claro, não escuro — o toggle existe
 * pra quem preferir o escuro, e a escolha fica no localStorage.
 *
 * O atributo é aplicado no carregamento do módulo, não num useEffect: o
 * components.jsx vem antes do App no bundle concatenado, então isso roda antes
 * do primeiro paint. Num useEffect a tela piscaria escura antes de clarear.
 * ========================================================================== */
const TEMA_DEFAULT = "light";
const temaSalvo = () => {
  try { return localStorage.getItem("bi.theme") || TEMA_DEFAULT; } catch (e) { return TEMA_DEFAULT; }
};
const aplicaTema = (tema) => {
  try {
    if (tema === "light") document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
  } catch (e) {}
};
aplicaTema(temaSalvo());

const ThemeToggle = () => {
  const [tema, setTema] = useState(temaSalvo);
  useEffect(() => {
    aplicaTema(tema);
    try { localStorage.setItem("bi.theme", tema); } catch (e) {}
  }, [tema]);
  const claro = tema === "light";
  return (
    <button className="hd-icon-btn" title={claro ? "Mudar para o modo escuro" : "Mudar para o modo claro"}
      aria-label={claro ? "Mudar para o modo escuro" : "Mudar para o modo claro"}
      onClick={() => setTema(claro ? "dark" : "light")}
      style={{ fontSize: 17, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center" }}>
      {claro ? "🌙" : "☀"}
    </button>
  );
};

const Icon = ({ name, ...props }) => {
  const paths = {
    home: <><path d="M3 10l9-7 9 7v10a2 2 0 01-2 2h-4v-7H9v7H5a2 2 0 01-2-2V10z"/></>,
    chart: <><path d="M3 21h18M6 17V9m6 8V5m6 12v-7"/></>,
    money: <><circle cx="12" cy="12" r="9"/><path d="M9 9.5c0-1.1.9-2 2-2h2.5a2 2 0 010 4H11a2 2 0 000 4h2.5a2 2 0 002-2M12 6v12"/></>,
    expense: <><rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M7 15h4"/></>,
    flow: <><path d="M3 12h7l3-7 3 14 3-7h2"/></>,
    treasury: <><path d="M5 21V8l7-4 7 4v13M9 21v-7h6v7M3 21h18"/></>,
    compare: <><path d="M7 4v16M17 4v16M4 8h6M14 16h6"/></>,
    diary: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M4 7h16M9 3v18"/></>,
    report: <><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6M9 13h6M9 17h4"/></>,
    fileText: <><path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h6M8 9h2"/></>,
    invest: <><path d="M3 17l6-6 4 4 8-8"/><path d="M21 7v6h-6"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06A1.65 1.65 0 004.6 15a1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z"/></>,
    menu: <><path d="M4 6h16M4 12h10M4 18h16"/></>,
    chevronRight: <><path d="M9 6l6 6-6 6"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></>,
    bell: <><path d="M6 8a6 6 0 1112 0c0 7 3 9 3 9H3s3-2 3-9zM10 21a2 2 0 004 0"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0116 0"/></>,
    download: <><path d="M12 4v12m0 0l-4-4m4 4l4-4M4 20h16"/></>,
    sliders: <><path d="M4 6h11M4 12h7M4 18h13"/><circle cx="18" cy="6" r="2"/><circle cx="14" cy="12" r="2"/><circle cx="20" cy="18" r="2"/></>,
    plus: <><path d="M12 5v14M5 12h14"/></>,
    arrowUp: <><path d="M7 14l5-5 5 5"/></>,
    arrowDown: <><path d="M7 10l5 5 5-5"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></>,
    cash: <><rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="3"/></>,
    accrual: <><path d="M4 4h12l4 4v12H4z"/><path d="M4 12h16M12 4v16"/></>,
    filter: <><path d="M3 5h18l-7 9v6l-4-2v-4z"/></>,
  };
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" {...props}>
      {paths[name]}
    </svg>
  );
};

const Sidebar = ({ active, onSelect, open }) => {
  const general = [
    { id: "overview", icon: "home", label: "Visão Geral" },
    { id: "receita", icon: "money", label: "Receita" },
    { id: "despesa", icon: "expense", label: "Despesa" },
    { id: "fluxo", icon: "flow", label: "Fluxo de Caixa" },
    { id: "tesouraria", icon: "treasury", label: "Tesouraria" },
    { id: "comparativo", icon: "compare", label: "Comparativo" },
    { id: "dre", icon: "report", label: "DRE Gerencial" },
    { id: "orcamento", icon: "accrual", label: "Orçamento Anual" },
    { id: "orcamento_mensal", icon: "accrual", label: "Orçamento Mensal" },
    { id: "relatorio", icon: "fileText", label: "Relatório IA" },
    { id: "valuation", icon: "invest", label: "Valuation" },
    { id: "diary", icon: "diary", label: "Diário", badge: "EM BREVE" },
  ];
  const others = [
    { id: "fluxo_projetado", icon: "flow", label: "Fluxo Projetado" },
    { id: "indicators", icon: "chart", label: "Indicadores" },
    { id: "faturamento_produto", icon: "money", label: "Faturamento" },
    { id: "cmv", icon: "cash", label: "CMV" },
    { id: "curva_abc", icon: "chart", label: "Curva ABC" },
    { id: "marketing", icon: "invest", label: "Marketing ADS" },
    { id: "hierarquia", icon: "chart", label: "Hierarquia ADS" },
    { id: "detalhado", icon: "report", label: "Detalhado" },
    { id: "profunda_cliente", icon: "user", label: "Profunda Cliente" },
    { id: "crm", icon: "money", label: "CRM" },
    { id: "settings", icon: "settings", label: "Configurações", badge: "EM BREVE" },
  ];
  // Modo da page (active/upsell/hidden) injetado pelo build-jsx.cjs a partir do bi.config.js
  const pageMode = (id) => (window.BI_PAGE_MODE && window.BI_PAGE_MODE[id]) || 'active';
  const isUpsell = (id) => pageMode(id) === 'upsell';
  const isHidden = (id) => pageMode(id) === 'hidden';

  const renderItem = (it) => {
    if (isHidden(it.id)) return null;
    const upsell = isUpsell(it.id);
    return (
      <button
        key={it.id}
        className={`sb-item ${active === it.id ? "active" : ""} ${upsell ? "sb-item-upsell" : ""}`}
        onClick={() => !it.badge && onSelect(it.id)}
        disabled={!!it.badge}
        style={it.badge ? { opacity: 0.55, cursor: "default" } : {}}
        title={upsell ? "Funcionalidade PRO — clique pra ver detalhes" : it.label}
      >
        <Icon name={it.icon} />
        <span className="label">{it.label}</span>
        {upsell && <span className="sb-item-badge-pro">PRO</span>}
        {it.badge && <span className="badge">{it.badge}</span>}
      </button>
    );
  };
  return (
    <aside className={`sidebar ${open ? "open" : ""}`}>
      <div className="sb-brand">
        {/* dois <img>, o CSS mostra o do tema ativo — ver ".logo-light" no styles.css */}
        <img src="assets/bgp-logo-white.png" alt="BGP" className="sb-logo-img logo-dark" />
        <img src="assets/bgp-logo.png" alt="BGP" className="sb-logo-img logo-light" />
      </div>
      <div className="sb-section">Geral</div>
      {general.map(renderItem)}
      <div className="sb-section">Outros</div>
      {others.map(renderItem)}
      <div className="sb-spacer" />
      <div className="sb-user">
        <div className="avatar">RK</div>
        <div className="who">
          <b>{(window.BIT_META && window.BIT_META.empresa && window.BIT_META.empresa.nome_fantasia) || "Cliente"}</b>
          <span>{(window.BIT_META && window.BIT_META.empresa && window.BIT_META.empresa.cidade) || "Cliente · BGP GO"}</span>
        </div>
      </div>
    </aside>
  );
};

const PAGE_TITLES = {
  overview: "Visão Geral",
  indicators: "Indicadores",
  receita: "Receita",
  despesa: "Despesa",
  fluxo: "Fluxo de Caixa",
  tesouraria: "Tesouraria",
  comparativo: "Comparativo",
  dre: "DRE Gerencial",
  orcamento: "Orçamento Anual",
  orcamento_mensal: "Orçamento Mensal",
  relatorio: "Relatório IA",
  fluxo_projetado: "Fluxo Projetado",
  faturamento_produto: "Faturamento por Produto",
  cmv: "CMV · Pedidos de Venda",
  curva_abc: "Curva ABC de Produtos",
  marketing: "Marketing ADS",
  valuation: "Valuation",
  hierarquia: "Hierarquia ADS",
  detalhado: "Detalhado",
  profunda_cliente: "Profunda Cliente",
  crm: "CRM",
};

const DATE_RANGES = [
  { id: "hoje",   label: "Hoje" },
  { id: "semana", label: "Semana" },
  { id: "mes",    label: "Mês" },
  { id: "ano",    label: "Ano" },
];

const DateRangeSeg = ({ value, onChange }) => (
  <div className="seg date-range-seg">
    {DATE_RANGES.map(r => (
      <button key={r.id} className={value === r.id ? "active" : ""} onClick={() => onChange(r.id)}>{r.label}</button>
    ))}
  </div>
);

/* `requer` = flag que o data.js precisa expor pro filtro aparecer. 'Atrasado'
 * depende do índice 13 do ALL_TX, que só existe em data.js gerado pela versão
 * nova do build-data.cjs. Sem a guarda, num data.js antigo o botão apareceria
 * e se comportaria como "Tudo" — filtro decorativo é anti-pattern (A20). */
const STATUS_FILTERS = [
  { id: "realizado", label: "Realizado", dica: "Já entrou ou saiu do caixa (tem data de baixa)" },
  { id: "a_pagar_receber", label: "A pagar/receber", dica: "Lançado e ainda sem baixa — inclui o que já venceu" },
  { id: "atrasado", label: "Atrasado", dica: "Venceu e não tem baixa. É um subconjunto de A pagar/receber, não some dele", requer: "BIT_HAS_ATRASADO" },
  { id: "tudo", label: "Tudo", dica: "Realizado + a pagar/receber" },
];

const StatusFilterSeg = ({ value, onChange }) => {
  const opcoes = STATUS_FILTERS.filter(s => !s.requer || window[s.requer]);
  // Se o filtro salvo no localStorage deixou de existir (data.js revertido pra
  // uma versão sem o campo), volta pro default em vez de filtrar errado calado.
  useEffect(() => {
    if (!opcoes.some(s => s.id === value)) onChange("realizado");
  }, [value, opcoes.length]);
  return (
    <div className="seg status-filter-seg" title="Filtro de status do lançamento">
      {opcoes.map(s => (
        <button key={s.id} className={value === s.id ? "active" : ""} title={s.dica} onClick={() => onChange(s.id)}>{s.label}</button>
      ))}
    </div>
  );
};

const InvestimentoToggle = ({ value, onChange }) => (
  <div className="seg status-filter-seg" title="Filtro de investimento">
    <button className={!value ? "active" : ""} onClick={() => onChange(false)}>Com Invest.</button>
    <button className={value ? "active" : ""} onClick={() => onChange(true)}>Sem Invest.</button>
  </div>
);

// Filtro de empresa (Matriz/Filial) — segmented toggle, vazio = todas
const EmpresaFilter = ({ options, selected, onChange }) => {
  const isAll = !selected || selected.length === 0;
  const toggle = (opt) => {
    if (selected && selected.length === 1 && selected[0] === opt) {
      onChange([]); // deselect = mostra todas
    } else {
      onChange([opt]);
    }
  };
  return (
    <div className="seg status-filter-seg" title="Filtrar por empresa/conta">
      <button className={isAll ? "active" : ""} onClick={() => onChange([])}>Todas</button>
      {options.map(opt => (
        <button key={opt} className={!isAll && selected.includes(opt) ? "active" : ""} onClick={() => toggle(opt)}>{opt}</button>
      ))}
    </div>
  );
};

const YearSelect = ({ value, onChange, available }) => {
  const years = available && available.length ? available : [value];
  return (
    <select
      className="header-year"
      value={value}
      onChange={e => onChange(Number(e.target.value))}
      title="Ano de referência"
    >
      {years.map(y => <option key={y} value={y}>{y}</option>)}
    </select>
  );
};

const MONTH_OPTS = [
  { v: 0, label: "Ano completo" },
  { v: 1, label: "Janeiro" }, { v: 2, label: "Fevereiro" }, { v: 3, label: "Março" },
  { v: 4, label: "Abril" }, { v: 5, label: "Maio" }, { v: 6, label: "Junho" },
  { v: 7, label: "Julho" }, { v: 8, label: "Agosto" }, { v: 9, label: "Setembro" },
  { v: 10, label: "Outubro" }, { v: 11, label: "Novembro" }, { v: 12, label: "Dezembro" },
];

const MonthSelect = ({ value, onChange }) => (
  <select
    className="header-year"
    value={value || 0}
    onChange={e => onChange(Number(e.target.value))}
    title="Mês de referência (Ano completo = todos)"
  >
    {MONTH_OPTS.map(o => <option key={o.v} value={o.v}>{o.label}</option>)}
  </select>
);

const WEEK_RANGES = [
  { v: 1, label: 'Sem. 1 (1–7)' },
  { v: 2, label: 'Sem. 2 (8–14)' },
  { v: 3, label: 'Sem. 3 (15–21)' },
  { v: 4, label: 'Sem. 4 (22–28)' },
  { v: 5, label: 'Sem. 5 (29–31)' },
];

/* DayFilterGroup — o recorte de dia dentro do mês.
 *
 * Três coisas estavam erradas aqui, e as três apareciam na tela do cliente:
 *
 * 1. CORES CHUMBADAS. Era `#4f86c6` no ativo e `#222` no inativo, com borda
 *    `#444`. No tema escuro passava; no CLARO — que é o que a controladora usa
 *    ("aqui é tudo quase 40, os clientes é 40 a mais") — virava um bloco preto
 *    no meio do branco. Agora usa a classe `.seg` do design system, que já
 *    existe e é temática.
 *
 * 2. FILTRO MUDO. Escolher "Intervalo" deixava De e Até em zero, e zero não
 *    filtra: a pessoa clicava e não acontecia nada. Agora entrar num modo já
 *    preenche um recorte válido (o mês inteiro), que a pessoa então estreita.
 *
 * 3. 31 DIAS SEMPRE. Fevereiro oferecia 30 e 31. A lista agora vem do mês.
 */
const DayFilterGroup = ({ year, month, dayMode, setDayMode, day, setDay, dayFrom, setDayFrom, dayTo, setDayTo, week, setWeek }) => {
  const ultimoDia = new Date(year || new Date().getFullYear(), month || 1, 0).getDate();
  const dayNums = Array.from({ length: ultimoDia }, (_, i) => i + 1);
  const modes = [["dia", "Dia"], ["intervalo", "Intervalo"], ["semana", "Semana"]];

  // Trocar de modo já deixa um recorte que funciona, em vez de esperar dois
  // cliques pra sair do zero.
  const trocarModo = (m) => {
    setDayMode(m);
    if (m === "intervalo" && !(dayFrom > 0 && dayTo > 0)) { setDayFrom(1); setDayTo(ultimoDia); }
    if (m === "semana" && !(week > 0)) setWeek(1);
  };
  // De maior que Até é recorte vazio silencioso: o Até acompanha.
  const mudarDe = (v) => { setDayFrom(v); if (dayTo && v > dayTo) setDayTo(v); };
  const mudarAte = (v) => { setDayTo(v); if (dayFrom && v < dayFrom) setDayFrom(v); };

  return (
    <div className="fb-dia">
      <div className="seg seg-mini">
        {modes.map(([m, rot]) => (
          <button key={m} className={dayMode === m ? "active" : ""} onClick={() => trocarModo(m)}>{rot}</button>
        ))}
      </div>
      {dayMode === "dia" && (
        <select className="header-year" value={day || 0} onChange={e => setDay(Number(e.target.value))}>
          <option value={0}>todo o mês</option>
          {dayNums.map(d => <option key={d} value={d}>dia {d}</option>)}
        </select>
      )}
      {dayMode === "intervalo" && (
        <React.Fragment>
          <select className="header-year" value={dayFrom || 1} onChange={e => mudarDe(Number(e.target.value))}>
            {dayNums.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
          <span className="fb-ate">até</span>
          <select className="header-year" value={dayTo || ultimoDia} onChange={e => mudarAte(Number(e.target.value))}>
            {dayNums.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </React.Fragment>
      )}
      {dayMode === "semana" && (
        <select className="header-year" value={week || 0} onChange={e => setWeek(Number(e.target.value))}>
          <option value={0}>todo o mês</option>
          {WEEK_RANGES.map(w => <option key={w.v} value={w.v}>{w.label}</option>)}
        </select>
      )}
    </div>
  );
};

// BiExportButton: modal com checkboxes pra exportar telas selecionadas como PDF
// Filtra automaticamente para mostrar apenas telas ativas (não hidden/upsell)
const BI_EXPORT_ALL_PAGES = [
  { id: "overview", label: "Visão Geral" },
  { id: "receita", label: "Receita" },
  { id: "despesa", label: "Despesa" },
  { id: "fluxo", label: "Fluxo de Caixa" },
  { id: "tesouraria", label: "Tesouraria" },
  { id: "comparativo", label: "Comparativo" },
  { id: "dre", label: "DRE Gerencial" },
  { id: "relatorio", label: "Relatório IA" },
  { id: "valuation", label: "Valuation" },
  { id: "indicators", label: "Indicadores" },
  { id: "faturamento_produto", label: "Faturamento por Produto" },
  { id: "cmv", label: "CMV" },
  { id: "curva_abc", label: "Curva ABC" },
  { id: "marketing", label: "Marketing ADS" },
  { id: "hierarquia", label: "Hierarquia ADS" },
  { id: "detalhado", label: "Detalhado" },
  { id: "profunda_cliente", label: "Profunda Cliente" },
  { id: "crm", label: "CRM" },
];
const getActiveExportPages = () => {
  const mode = window.BI_PAGE_MODE || {};
  const active = BI_EXPORT_ALL_PAGES.filter(p => {
    const m = mode[p.id];
    return !m || m === 'active';
  });
  return active.map((p, i) => ({ ...p, label: `${String(i + 1).padStart(2, '0')} ${p.label}` }));
};

const BiExportButton = () => {
  const [open, setOpen] = useState(false);
  const pages = useMemo(() => getActiveExportPages(), []);
  const [selected, setSelected] = useState(() => new Set(pages.map(p => p.id)));
  const toggle = (id) => {
    setSelected(s => {
      const ns = new Set(s);
      if (ns.has(id)) ns.delete(id); else ns.add(id);
      return ns;
    });
  };
  const submit = () => {
    if (selected.size === 0) return;
    const ordered = pages.filter(p => selected.has(p.id)).map(p => p.id);
    if (window.startBiExport) window.startBiExport(ordered);
    setOpen(false);
  };
  return (
    <>
      <button className="btn-ghost hd-export-bi" onClick={() => setOpen(true)} title="Exportar BI inteiro como PDF">
        <Icon name="download" /> <span>Exportar BI</span>
      </button>
      {open && (
        <div className="drawer-overlay no-print" onClick={() => setOpen(false)}>
          <div className="card bi-export-modal" onClick={e => e.stopPropagation()}>
            <h2 className="card-title">Exportar BI como PDF</h2>
            <p style={{ color: "var(--fg-2)", marginTop: 8, fontSize: 13 }}>
              Selecione as telas para incluir no PDF. Cada tela vira uma página A4 com o tema escuro mantido.
            </p>
            <div className="bi-export-grid">
              {pages.map(p => (
                <label key={p.id} className="bi-export-row">
                  <input
                    type="checkbox"
                    checked={selected.has(p.id)}
                    onChange={() => toggle(p.id)}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>
            <div className="bi-export-actions">
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-ghost" onClick={() => setSelected(new Set(pages.map(p => p.id)))}>Todas</button>
                <button className="btn-ghost" onClick={() => setSelected(new Set())}>Nenhuma</button>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button>
                <button className="btn-primary" onClick={submit} disabled={selected.size === 0}>
                  Exportar ({selected.size})
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

// MultiSelectFilter: dropdown com checkboxes para filtro multiseleção + pesquisa
const MultiSelectFilter = ({ label, options, selected, onChange }) => {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const ref = useRef(null);
  const searchRef = useRef(null);
  const count = selected.length;
  const allSelected = count === 0;

  useEffect(() => {
    if (!open) return;
    const onClickOut = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", onClickOut);
    return () => document.removeEventListener("mousedown", onClickOut);
  }, [open]);

  useEffect(() => {
    if (open && searchRef.current) searchRef.current.focus();
    if (!open) setSearch("");
  }, [open]);

  const toggle = (val) => {
    if (selected.includes(val)) onChange(selected.filter(v => v !== val));
    else onChange([...selected, val]);
  };

  const q = search.toLowerCase();
  const filtered = q ? options.filter(o => o.toLowerCase().includes(q)) : options;

  return (
    <div className="multi-select-filter" ref={ref} style={{ position: "relative" }}>
      <button
        className={`btn-ghost hd-filter-btn ${count > 0 ? "active" : ""}`}
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 12, padding: "4px 10px", whiteSpace: "nowrap" }}
      >
        <Icon name="filter" style={{ width: 14, height: 14 }} />
        <span>{label}</span>
        {count > 0 && <span className="multi-select-badge">{count}</span>}
      </button>
      {open && (
        <div className="multi-select-dropdown" style={{
          position: "absolute", top: "100%", right: 0, zIndex: 999,
          background: "var(--surface)", border: "1px solid var(--border)",
          borderRadius: 8, padding: "8px 0", marginTop: 4, minWidth: 280, maxHeight: 400,
          display: "flex", flexDirection: "column", boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}>
          <div style={{ padding: "6px 10px", borderBottom: "1px solid var(--border)" }}>
            <input
              ref={searchRef}
              type="text"
              placeholder={`Pesquisar ${label.toLowerCase()}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: "100%", background: "var(--bg)", border: "1px solid var(--border)",
                borderRadius: 6, padding: "6px 10px", fontSize: 12, color: "var(--text)",
                outline: "none",
              }}
            />
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 14px", cursor: "pointer", fontSize: 12, fontWeight: 600, color: "var(--cyan)", borderBottom: "1px solid var(--border)" }}>
              <input type="checkbox" checked={allSelected} onChange={() => onChange([])} />
              <span>Todos ({options.length})</span>
            </label>
            {filtered.map(opt => (
              <label key={opt} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 14px", cursor: "pointer", fontSize: 12, color: "var(--text)" }}>
                <input type="checkbox" checked={selected.includes(opt)} onChange={() => toggle(opt)} />
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt}</span>
              </label>
            ))}
            {filtered.length === 0 && <div style={{ padding: "8px 14px", fontSize: 12, color: "var(--mute)" }}>Nenhum resultado</div>}
          </div>
        </div>
      )}
    </div>
  );
};

/* RegimeToggle — Caixa | Competência.
 *
 * Pedido dela na reunião: "eu vou adicionar para você também um botão para você
 * conseguir trocar da visão de caixa para a visão de competência", e ela
 * fechou com "às vezes a gente vê os dois".
 *
 * Caixa (default) = data de pagamento/recebimento; sem baixa, cai na data de
 * vencimento. Competência = data de EMISSÃO do título.
 *
 * Que a competência é a emissão não foi chute: testei emissão contra
 * vencimento na Receita Bruta de julho/2026 do relatório dela (R$ 88.936,46).
 * Emissão, fora a conta CONGELADOS, deu R$ 88.959,55 — delta de R$ 23,09
 * (0,026%). Vencimento deu R$ 93.209,55, delta de R$ 4.273. */
const RegimeToggle = ({ value, onChange }) => {
  if (!window.BIT_HAS_COMPETENCIA) return null;
  const comp = value === "competencia";
  return (
    <div className="seg" title={comp
      ? "Competência: pela data de emissão do título — quando o fato aconteceu"
      : "Caixa: pela data de pagamento/recebimento. Sem baixa, usa o vencimento"}>
      <button className={!comp ? "active" : ""} onClick={() => onChange("caixa")}>Caixa</button>
      <button className={comp ? "active" : ""} onClick={() => onChange("competencia")}>Competência</button>
    </div>
  );
};

/* VisaoSeg — Operacional | Completo.
 *
 * Operacional (default) tira do resultado o dinheiro que passa pelo caixa mas
 * não é resultado do negócio: financiamento e sócios. Completo devolve tudo.
 *
 * Neste BI a lista `categorias_nao_operacionais` do bi.config está VAZIA: o
 * modelo de DRE da iFinance pro Shawarma já tem linha própria pra investimento
 * (14) e trata pró-labore como despesa de pessoal (6), então não há nada a
 * separar. Com a lista vazia nenhuma row recebe o flag e o botão se esconde
 * sozinho — é pra isso que a guarda existe.
 *
 * Quando houver algo, o botão DECLARA quanto está sendo separado. Toggle que
 * muda número sem dizer o que mudou é como o cliente perde confiança no BI. */
const VisaoSeg = ({ value, onChange }) => {
  if (!window.BIT_HAS_NAOOP) return null;   // data.js sem o campo: nada a separar
  const t = window.BIT_NAOOP_TOTAL || { receita: 0, despesa: 0, lancamentos: 0 };
  const fmtBR = (v) => "R$ " + Number(v || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const cats = Object.keys(t.porCategoria || {}).join(" · ");
  const dica = `Operacional deixa de fora ${t.lancamentos} lançamentos não-operacionais `
    + `(${fmtBR(t.receita)} de entrada e ${fmtBR(t.despesa)} de saída): ${cats}. `
    + `Eles continuam no Fluxo de Caixa — o dinheiro passou pelo caixa de verdade.`;
  return (
    <div className="seg" title={dica}>
      <button className={value !== "completo" ? "active" : ""} onClick={() => onChange("operacional")}>Operacional</button>
      <button className={value === "completo" ? "active" : ""} onClick={() => onChange("completo")}>Completo</button>
    </div>
  );
};

/* ExtratoTabela — extrato com busca, ordenação e contagem declarada.
 *
 * Pedido dela na reunião: "essa telinha do extrato ela tem alguma ordem? dá
 * para ordenar de alguma forma?".
 *
 * Cada row é a tupla do extrato: [data, conta, categoria, contraparte, valor, status].
 *
 * Por que a contagem aparece no cabeçalho: havia DOIS caps empilhados aqui — 200
 * no aggregateTx e mais um de 30 no render (quando não havia mês filtrado). O
 * cliente via 30 de 376 linhas e nada na tela dizia isso. Corte que não se
 * declara vira ticket caro de reproduzir; corte declarado vira pedido honesto.
 */
const ExtratoTabela = ({ rows, tone, fmt, colContraparte, vazio, altura }) => {
  const [busca, setBusca] = useState("");
  const [ord, setOrd] = useState({ col: 0, dir: -1 });   // data desc, como antes
  // Janela de RENDER. Não é cap de dado: a contagem, o total e o denominador do
  // Ticket médio continuam sobre o conjunto inteiro. É só quantas linhas vão pro
  // DOM — com 6.500 <tr> o browser engasga e a tela parece travada.
  const JANELA = 300;
  const [tudoAberto, setTudoAberto] = useState(false);

  const filtradas = useMemo(() => {
    const termos = busca.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!termos.length) return rows;
    // AND entre termos; casa data, categoria, contraparte e o valor nos dois
    // formatos (1.234,56 e 1234.56), pra busca por valor funcionar como a
    // pessoa digita.
    return rows.filter(r => {
      const v = Math.abs(r[4]);
      const alvo = [r[0], r[2], r[3], v.toFixed(2), v.toLocaleString("pt-BR", { minimumFractionDigits: 2 })]
        .join(" ").toLowerCase();
      return termos.every(t => alvo.includes(t));
    });
  }, [rows, busca]);

  const ordenadas = useMemo(() => {
    const out = filtradas.slice();
    const { col, dir } = ord;
    const dataNum = (s) => { const [d, m, y] = String(s).split("/"); return (y || "") + (m || "") + (d || ""); };
    out.sort((a, b) => {
      let x, y;
      if (col === 4) { x = Math.abs(a[4]); y = Math.abs(b[4]); }
      else if (col === 0) { x = dataNum(a[0]); y = dataNum(b[0]); }
      else { x = String(a[col] || "").toLowerCase(); y = String(b[col] || "").toLowerCase(); }
      return x < y ? -dir : (x > y ? dir : 0);
    });
    return out;
  }, [filtradas, ord]);

  // O total soma o conjunto INTEIRO filtrado, nunca a janela — somar a lista
  // truncada faz o rodapé divergir do KPI de cima na mesma tela.
  const total = useMemo(() => ordenadas.reduce((s, r) => s + Math.abs(r[4]), 0), [ordenadas]);
  const visiveis = (tudoAberto || ordenadas.length <= JANELA) ? ordenadas : ordenadas.slice(0, JANELA);
  const cortou = visiveis.length < ordenadas.length;
  const clicar = (col) => setOrd(o => (o.col === col ? { col, dir: -o.dir } : { col, dir: col === 4 ? -1 : 1 }));
  const seta = (col) => (ord.col === col ? (ord.dir === 1 ? " ▲" : " ▼") : "");
  const th = (col, label, cls) => (
    <th className={(cls || "") + " clickable-th"} onClick={() => clicar(col)}
        style={{ cursor: "pointer" }} title="Clique pra ordenar por esta coluna">
      {label}{seta(col)}
    </th>
  );

  return (
    <React.Fragment>
      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, flexWrap: "wrap" }}>
        <input className="ext-busca" value={busca} onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por cliente, categoria, data ou valor…"
          title="Vários termos funcionam juntos: 'ortopedico 7.000' acha o lançamento de R$ 7.000 desse cliente" />
        {busca && <button className="btn-ghost" onClick={() => setBusca("")}>limpar</button>}
        <span className="status-line" style={{ fontSize: 11, marginLeft: "auto" }}>
          {busca
            ? <span><strong>{ordenadas.length}</strong> de {rows.length} lançamentos</span>
            : <span><strong>{rows.length}</strong> lançamento{rows.length === 1 ? "" : "s"}</span>}
          {cortou && <span> · mostrando {visiveis.length}</span>}
        </span>
        {cortou && (
          <button className="btn-ghost" onClick={() => setTudoAberto(true)}
            title={"Renderiza as " + ordenadas.length + " linhas. Em tabela grande isso deixa a rolagem pesada."}>
            mostrar todas
          </button>
        )}
        {tudoAberto && ordenadas.length > JANELA && (
          <button className="btn-ghost" onClick={() => setTudoAberto(false)}>voltar pras primeiras {JANELA}</button>
        )}
      </div>
      <div className="t-scroll t-scroll-extrato" style={altura ? { maxHeight: altura } : undefined}>
        <table className="t">
          <thead>
            <tr>
              {th(0, "Data")}
              {th(2, "Categoria")}
              {th(3, colContraparte || "Contraparte")}
              {th(4, "Valor", "num")}
            </tr>
          </thead>
          <tbody>
            {visiveis.map((e, i) => (
              <tr key={i}>
                <td style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>{e[0]}</td>
                <td>{e[2]}</td>
                <td>{e[3]}</td>
                <td className={"num " + tone}>{fmt(Math.abs(e[4]))}</td>
              </tr>
            ))}
            {ordenadas.length === 0 && (
              <tr><td colSpan="4" style={{ color: "var(--mute)", textAlign: "center", padding: 18 }}>
                {busca ? `Nada casou com "${busca}"` : (vazio || "Sem lançamentos no filtro selecionado")}
              </td></tr>
            )}
            <tr className="total">
              <td colSpan="3">
                Total{busca ? " (busca)" : ""} · {ordenadas.length} lançamentos
                {cortou && <span style={{ fontWeight: 400, color: "var(--fg-3)" }}>
                  {" — a tabela mostra as primeiras "}{visiveis.length}{", o total acima soma todas"}
                </span>}
              </td>
              <td className={"num " + tone}>{fmt(total)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </React.Fragment>
  );
};

/* FbGroup — uma pílula rotulada da faixa de filtros. O rótulo vive DENTRO da
 * pílula: com "Natureza", "Categoria", "Mês", "Dia do mês" soltos entre os
 * campos ninguém sabe qual label pertence a qual controle. `on` acende a borda
 * quando o grupo tem recorte ativo (princípio 2 do design system: toda
 * interação e todo estado precisam de pista visual). */
const FbGroup = ({ label, on, children, dica }) => (
  <div className={"fb-group" + (on ? " fb-on" : "")} title={dica}>
    <span className="fb-label">{label}</span>
    {children}
  </div>
);

/* Header — DUAS faixas.
 *
 * Antes era uma linha só de 70px com `nowrap`. Com Natureza + Categoria + Ano
 * + Mês + Dia do mês + Status + Tema + Exportar, o último controle saía
 * cortado da tela (pegadinha já catalogada na frota, latente em 5 repos).
 * Adicionar o botão de tema e o status "Atrasado" empurrava de vez.
 *
 * Divisão: faixa 1 = identidade e contexto global (quem sou, que tela, que
 * ano, que status, tema, exportar). Faixa 2 = RECORTE do período e do plano de
 * contas. O ano fica na faixa 1 de propósito — é contexto, não recorte.
 *
 * Nada foi escondido pra "organizar": o FiltersDrawer seria a tentação óbvia,
 * mas tirar filtro da tela contraria o princípio 1 (informação máxima). */
const Header = ({ page, onToggleSidebar, statusFilter, setStatusFilter, year, setYear, month, setMonth, dayMode, setDayMode, day, setDay, dayFrom, setDayFrom, dayTo, setDayTo, week, setWeek, visao, setVisao, regime, setRegime, semInvestimento, setSemInvestimento, filterCentroCusto, setFilterCentroCusto, filterCategoria, setFilterCategoria, filterEmpresa, setFilterEmpresa, filterConta, setFilterConta }) => {
  const naturezas = useMemo(() => window.ALL_NATUREZAS || [], []);
  const categorias = useMemo(() => window.ALL_CATEGORIAS || [], []);
  const empresas = useMemo(() => window.ALL_EMPRESAS || [], []);
  const contas = useMemo(() => window.ALL_CONTAS || [], []);
  const temEmpresa = setFilterEmpresa && empresas.length > 1;
  const temConta = setFilterConta && contas.length > 1;
  // > 1 e nao > 0: no F360 o centro de custo vem com o nome da empresa em todas
  // as rows, entao a lista tem UM item e o filtro nao filtra nada. Controle que
  // existe e nao muda nada e pior que controle ausente.
  const temNatureza = setFilterCentroCusto && naturezas.length > 1;
  const temCategoria = setFilterCategoria && categorias.length > 0;
  /* RESUMO DO RECORTE — o que está filtrado, em português, com × por item.
   *
   * Antes era só "limpar recorte (3)". O número não dizia QUAIS três, e o
   * recorte de dia nem entrava na conta: dava pra estar vendo 18–31 de agosto
   * e o contador marcar 1. Pra tirar um filtro só, tinha que caçar o controle.
   *
   * Agora cada recorte vira uma pílula que se nomeia e se remove sozinha. É o
   * mesmo princípio do resto do BI: estado precisa de pista visual, e número
   * sem rótulo não é pista. */
  const mesNome = (m) => (window.BIT && window.BIT.MONTHS_FULL ? window.BIT.MONTHS_FULL[m - 1] : "") || ("mês " + m);
  const limparDia = () => {
    if (setDay) setDay(0);
    if (setDayFrom) setDayFrom(0);
    if (setDayTo) setDayTo(0);
    if (setWeek) setWeek(0);
    if (setDayMode) setDayMode("dia");
  };
  const chips = [];
  if (month > 0) {
    chips.push({ k: "mes", txt: mesNome(month).replace(/^./, c => c.toUpperCase()), limpa: () => { setMonth(0); limparDia(); } });
    if (dayMode === "dia" && day > 0) chips.push({ k: "dia", txt: "dia " + day, limpa: limparDia });
    if (dayMode === "intervalo" && dayFrom > 0 && dayTo > 0) chips.push({ k: "int", txt: "dias " + dayFrom + "–" + dayTo, limpa: limparDia });
    if (dayMode === "semana" && week > 0) {
      const w = WEEK_RANGES.find(x => x.v === week);
      chips.push({ k: "sem", txt: w ? w.label : "semana " + week, limpa: limparDia });
    }
  }
  const listaChip = (arr, rotulo, setter) => {
    const a = arr || [];
    if (!a.length) return;
    chips.push({
      k: rotulo, limpa: () => setter([]),
      txt: a.length === 1 ? a[0] : a.length + " " + rotulo + (rotulo.endsWith("a") ? "s" : "s"),
      dica: a.length > 1 ? a.join(" · ") : undefined,
    });
  };
  listaChip(filterEmpresa, "empresa", setFilterEmpresa);
  listaChip(filterConta, "conta", setFilterConta);
  listaChip(filterCentroCusto, "natureza", setFilterCentroCusto);
  listaChip(filterCategoria, "categoria", setFilterCategoria);

  const limpar = () => {
    if (setFilterCentroCusto) setFilterCentroCusto([]);
    if (setFilterCategoria) setFilterCategoria([]);
    if (setFilterEmpresa) setFilterEmpresa([]);
    if (setFilterConta) setFilterConta([]);
    if (setMonth) setMonth(0);
    limparDia();
  };
  return (
    <React.Fragment>
      <header className="header">
        <button className="hd-icon-btn hd-menu-btn" title="Menu" onClick={onToggleSidebar}><Icon name="menu" /></button>
        <div className="breadcrumb">
          {/* Era "SubSea" — nome de outro cliente, herdado do repo de onde este
              foi clonado. O breadcrumb diz em qual dos dois BIs da iFinance
              (este e o da MedConsulting) ela está. */}
          <span>Mr Shawarma</span>
          <Icon name="chevronRight" />
          <span>BI Financeiro</span>
          <Icon name="chevronRight" />
          <b>{PAGE_TITLES[page] || "Visão Geral"}</b>
        </div>
        <div style={{ flex: 1 }} />
        {setYear && <YearSelect value={year} onChange={setYear} available={window.AVAILABLE_YEARS} />}
        {setRegime && <RegimeToggle value={regime} onChange={setRegime} />}
        {setVisao && <VisaoSeg value={visao} onChange={setVisao} />}
        {setStatusFilter && <StatusFilterSeg value={statusFilter} onChange={setStatusFilter} />}
        <ThemeToggle />
        <BiExportButton />
      </header>
      <div className="filterbar no-print">
        {temEmpresa && (
          <FbGroup label="Empresa" on={(filterEmpresa || []).length > 0} dica="Qual empresa do grupo entra na conta">
            <EmpresaFilter options={empresas} selected={filterEmpresa || []} onChange={setFilterEmpresa} />
          </FbGroup>
        )}
        {setMonth && (
          <FbGroup label="Mês" on={month > 0} dica="Recorta o período. Sem mês, mostra o ano inteiro">
            <MonthSelect value={month} onChange={setMonth} />
            {month > 0 && setDayMode && (
              <DayFilterGroup year={year} month={month} dayMode={dayMode} setDayMode={setDayMode} day={day} setDay={setDay}
                dayFrom={dayFrom} setDayFrom={setDayFrom} dayTo={dayTo} setDayTo={setDayTo} week={week} setWeek={setWeek} />
            )}
          </FbGroup>
        )}
        {temConta && (
          <FbGroup label="Conta" on={(filterConta || []).length > 0}
            dica="Vazio = consolidado (todas as contas). A conta de clientes congelados vive aqui — selecione as outras pra deixá-la de fora.">
            <MultiSelectFilter label="Conta" options={contas} selected={filterConta || []} onChange={setFilterConta} />
          </FbGroup>
        )}
        {temNatureza && (
          <FbGroup label="Natureza" on={(filterCentroCusto || []).length > 0} dica="Grupo do plano de contas (Receita Bruta, Despesas com Pessoal…)">
            <MultiSelectFilter label="Natureza" options={naturezas} selected={filterCentroCusto || []} onChange={setFilterCentroCusto} />
          </FbGroup>
        )}
        {temCategoria && (
          <FbGroup label="Categoria" on={(filterCategoria || []).length > 0} dica={"Categoria" + (window.BI_FONTE ? " do " + window.BI_FONTE : "") + ", dentro da natureza"}>
            <MultiSelectFilter label="Categoria" options={categorias} selected={filterCategoria || []} onChange={setFilterCategoria} />
          </FbGroup>
        )}
        <div style={{ flex: 1 }} />
        {chips.length > 0 ? (
          <div className="fb-resumo">
            <span className="fb-resumo-lbl">vendo</span>
            {chips.map(c => (
              <button key={c.k} className="fb-chip" title={c.dica ? c.dica + " — clique pra tirar" : "clique pra tirar este recorte"}
                onClick={c.limpa}>
                {c.txt}<span className="x">✕</span>
              </button>
            ))}
            <button className="fb-clear" onClick={limpar} title="Volta pro ano inteiro, sem recorte nenhum">limpar tudo</button>
          </div>
        ) : (
          <span className="fb-hint">sem recorte — mostrando {year} inteiro</span>
        )}
      </div>
    </React.Fragment>
  );
};

// vertical bars (kept)
// Click handlers: onBarClick(monthData, idx). activeIdx adds .active class; outros ficam .dimmed
const MonthlyBars = ({ data, height = 230, type = "both", showLabels = true, onBarClick, activeIdx }) => {
  const max = Math.max(...data.map(d => Math.max(d.receita || 0, d.despesa || 0)));
  const grids = [0, 0.25, 0.5, 0.75, 1].map(p => p * max);
  const hasActive = activeIdx != null && activeIdx >= 0;
  return (
    <div style={{ position: "relative" }}>
      <div className="vbar-axis" style={{ height: height - 24 }}>
        {grids.map((g, i) => (<div key={i} className="grid" style={{ bottom: `${(g / max) * 100}%` }} />))}
        {grids.map((g, i) => {
          const abs = Math.abs(g);
          const lbl = abs.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
          return <div key={"l"+i} className="glabel" style={{ bottom: `${(g / max) * 100}%` }}>{lbl}</div>;
        })}
      </div>
      <div className="vbar-chart" style={{ height }}>
        {data.map((d, i) => {
          const rH = ((d.receita || 0) / max) * 100;
          const dH = ((d.despesa || 0) / max) * 100;
          const cls = "vbar-col" + (onBarClick ? " clickable" : "") +
            (hasActive && i === activeIdx ? " active" : "") +
            (hasActive && i !== activeIdx ? " dimmed" : "");
          return (
            <div key={i} className={cls}
              onClick={onBarClick ? () => onBarClick(d, i) : undefined}
              style={onBarClick ? { cursor: "pointer" } : undefined}
            >
              <div className="stack">
                {(type === "both" || type === "receita") && (
                  <div className="bar" style={{ height: `${rH}%` }} title={`Receita: ${window.BIT.fmt(d.receita)}`}>
                    {showLabels && <span className="v">{window.BIT.fmtK(d.receita)}</span>}
                  </div>
                )}
                {(type === "both" || type === "despesa") && (
                  <div className="bar red" style={{ height: `${dH}%` }} title={`Despesa: ${window.BIT.fmt(d.despesa)}`}>
                    {showLabels && type === "despesa" && <span className="v">{window.BIT.fmtK(d.despesa)}</span>}
                  </div>
                )}
              </div>
              <span className="x">{d.m.slice(0, 3)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

const SingleBars = ({ values, labels, color = "green", height = 200, onBarClick, activeIdx }) => {
  const max = Math.max(...values);
  const hasActive = activeIdx != null && activeIdx >= 0;
  return (
    <div className="vbar-chart" style={{ height }}>
      {values.map((v, i) => {
        const h = (v / max) * 100;
        const cls = "vbar-col" + (onBarClick ? " clickable" : "") +
          (hasActive && i === activeIdx ? " active" : "") +
          (hasActive && i !== activeIdx ? " dimmed" : "");
        return (
          <div key={i} className={cls}
            onClick={onBarClick ? () => onBarClick(v, i, labels[i]) : undefined}
            style={onBarClick ? { cursor: "pointer" } : undefined}
          >
            <div className="stack">
              <div className={`bar ${color === "red" ? "red" : ""}`} style={{ height: `${h}%`, width: 22, background: color === "cyan" ? "var(--cyan)" : (color === "red" ? "var(--red)" : "var(--green)") }} title={window.BIT.fmt(v)}>
                <span className="v">{window.BIT.fmtK(v)}</span>
              </div>
            </div>
            <span className="x">{labels[i].slice(0, 3)}</span>
          </div>
        );
      })}
    </div>
  );
};

const DailyBars = ({ values, color = "green", onBarClick, activeIdx }) => {
  const max = Math.max(...values);
  const subPeaks = values.map((v, i) => ({ v, i })).sort((a, b) => b.v - a.v).slice(0, 3).map(o => o.i);
  const hasActive = activeIdx != null && activeIdx >= 0;
  return (
    <div className="daily">
      <div className="daily-bars">
        {values.map((v, i) => {
          const h = (v / max) * 100;
          const cls = `b ${color === "red" ? "red" : ""} ${subPeaks.includes(i) ? "peak" : ""}` +
            (hasActive && i === activeIdx ? " active" : "") +
            (hasActive && i !== activeIdx ? " dimmed" : "");
          return (
            <div key={i} className={cls}
              style={{ height: `${Math.max(h, 1)}%`, cursor: onBarClick ? "pointer" : undefined }}
              data-v={window.BIT.fmtK(v)}
              title={`Dia ${i + 1}: ${window.BIT.fmt(v)}`}
              onClick={onBarClick ? () => onBarClick(i, v) : undefined}
            />
          );
        })}
      </div>
      <div className="daily-x">
        <span>1</span><span>5</span><span>10</span><span>15</span><span>20</span><span>25</span><span>31</span>
      </div>
    </div>
  );
};

// Stacked area chart — receita (verde) sobre despesa (vermelho)
const StackedArea = ({ data, height = 320, showAxis = true }) => {
  const w = 1000, h = height;
  const padX = 50, padTop = 16, padBottom = 30;
  const all = data.flatMap(d => [d.receita, d.despesa]);
  const min = 0;
  const max = Math.max(...all) * 1.1;
  const range = max - min;
  const stepX = (w - padX * 2) / (data.length - 1);

  const pts = (key) => data.map((d, i) => {
    const x = padX + i * stepX;
    const y = padTop + (1 - (d[key] - min) / range) * (h - padTop - padBottom);
    return [x, y];
  });
  const curve = (points) => {
    if (points.length < 2) return "";
    let p = `M ${points[0][0]} ${points[0][1]}`;
    for (let i = 1; i < points.length; i++) {
      const [x0, y0] = points[i - 1];
      const [x1, y1] = points[i];
      const cx = (x0 + x1) / 2;
      p += ` C ${cx} ${y0}, ${cx} ${y1}, ${x1} ${y1}`;
    }
    return p;
  };

  const ptsR = pts("receita");
  const ptsD = pts("despesa");
  const baseY = padTop + (h - padTop - padBottom);

  const areaR = curve(ptsR) + ` L ${ptsR[ptsR.length - 1][0]} ${baseY} L ${ptsR[0][0]} ${baseY} Z`;
  const areaD = curve(ptsD) + ` L ${ptsD[ptsD.length - 1][0]} ${baseY} L ${ptsD[0][0]} ${baseY} Z`;

  // y axis ticks
  const ticks = 5;
  const tickVals = Array.from({ length: ticks }, (_, i) => (max / (ticks - 1)) * i);

  return (
    <svg className="trend" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id="ga-green" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#22c55e" stopOpacity="0.03"/>
        </linearGradient>
        <linearGradient id="ga-red" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ef4444" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.03"/>
        </linearGradient>
      </defs>
      {showAxis && tickVals.map((tv, i) => {
        const y = padTop + (1 - tv / max) * (h - padTop - padBottom);
        return (
          <g key={i}>
            <line x1={padX} y1={y} x2={w - 10} y2={y} stroke="oklch(1 0 0 / 0.04)" strokeDasharray="3 4"/>
            <text x={padX - 8} y={y + 3} textAnchor="end" className="axis-text">R$ {tv.toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ".")}</text>
          </g>
        );
      })}
      <path d={areaR} fill="url(#ga-green)" />
      <path d={areaD} fill="url(#ga-red)" />
      <path d={curve(ptsR)} fill="none" stroke="#22c55e" strokeWidth="2"/>
      <path d={curve(ptsD)} fill="none" stroke="#ef4444" strokeWidth="2"/>
      {showAxis && data.map((d, i) => {
        const x = padX + i * stepX;
        return <text key={i} x={x} y={h - 10} textAnchor="middle" className="axis-text" style={{ textTransform: "capitalize" }}>{d.m.slice(0,3)}</text>;
      })}
    </svg>
  );
};

// Trend (line + area)
const TrendChart = ({ values, labels, height = 160, color = "var(--cyan)", showPoints = true, showLabels = true, gradientId = "tg" }) => {
  const w = 1000, h = height;
  const padX = 40, padY = 32;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const stepX = (w - padX * 2) / (values.length - 1);
  const points = values.map((v, i) => {
    const x = padX + i * stepX;
    const y = padY + (1 - (v - min) / range) * (h - padY * 2);
    return [x, y];
  });
  const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = path + ` L ${points[points.length - 1][0]} ${h - padY} L ${points[0][0]} ${h - padY} Z`;
  return (
    <svg className="trend" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.30"/>
          <stop offset="100%" stopColor={color} stopOpacity="0"/>
        </linearGradient>
      </defs>
      {[0, 1, 2, 3].map(i => {
        const y = padY + (i / 3) * (h - padY * 2);
        return <line key={i} className="grid" x1={padX} y1={y} x2={w - padX} y2={y} />;
      })}
      <path d={area} fill={`url(#${gradientId})`} />
      <path d={path} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
      {showPoints && points.map((p, i) => (
        <g key={i}>
          <circle cx={p[0]} cy={p[1]} r="3" fill={color}/>
          {showLabels && (
            <text className="point-label" x={p[0]} y={p[1] - 8} textAnchor="middle">{window.BIT.fmtK(values[i])}</text>
          )}
        </g>
      ))}
      {labels && labels.map((l, i) => (
        <text key={"x"+i} className="axis-text" x={padX + i * stepX} y={h - 6} textAnchor="middle">{l}</text>
      ))}
    </svg>
  );
};

const MultiLine = ({ series, labels, height = 180 }) => {
  const w = 1000, h = height;
  const padX = 30, padY = 24;
  const all = series.flatMap(s => s.values);
  const min = Math.min(...all);
  const max = Math.max(...all);
  const range = max - min || 1;
  const stepX = (w - padX * 2) / (series[0].values.length - 1);
  return (
    <svg className="trend" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height }}>
      {[0, 1, 2, 3].map(i => {
        const y = padY + (i / 3) * (h - padY * 2);
        return <line key={i} className="grid" x1={padX} y1={y} x2={w - padX} y2={y} />;
      })}
      {series.map((s, si) => {
        const points = s.values.map((v, i) => {
          const x = padX + i * stepX;
          const y = padY + (1 - (v - min) / range) * (h - padY * 2);
          return [x, y];
        });
        const path = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
        return (
          <g key={si}>
            <path d={path} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round"/>
            {points.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.5" fill={s.color}/>)}
          </g>
        );
      })}
      {labels && labels.map((l, i) => (
        <text key={"x"+i} className="axis-text" x={padX + i * stepX} y={h - 6} textAnchor="middle">{l}</text>
      ))}
    </svg>
  );
};

// Sparkline (used in KPI tile)
const Spark = ({ values, color = "var(--cyan)", filled = true, height = 38 }) => {
  const w = 100, h = height;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const step = w / (values.length - 1);
  const pts = values.map((v, i) => [i * step, (1 - (v - min) / range) * (h - 6) + 3]);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${p[0]} ${p[1]}`).join(" ");
  const id = `sp-${Math.random().toString(36).slice(2, 7)}`;
  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      {filled && (
        <>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.4"/>
              <stop offset="100%" stopColor={color} stopOpacity="0"/>
            </linearGradient>
          </defs>
          <path d={`${path} L ${w} ${h} L 0 ${h} Z`} fill={`url(#${id})`} />
        </>
      )}
      <path d={path} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
};

// Composition donut
const Donut = ({ segments, size = 180, thickness = 22 }) => {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="oklch(0.20 0.012 240)" strokeWidth={thickness}/>
      {segments.map((seg, i) => {
        const len = (seg.value / total) * c;
        const off = c - acc;
        acc += len;
        return (
          <circle
            key={i}
            cx={size/2} cy={size/2} r={r}
            fill="none" stroke={seg.color} strokeWidth={thickness}
            strokeDasharray={`${len} ${c - len}`}
            strokeDashoffset={off}
            transform={`rotate(-90 ${size/2} ${size/2})`}
            strokeLinecap="butt"
          />
        );
      })}
    </svg>
  );
};

// Horizontal bar list (with thin track) — used for bank balances/category
// onItemClick(item, idx) torna a linha clicavel; activeName destaca a linha ativa.
const BarListLine = ({ items, color = "cyan", onItemClick, activeName }) => {
  const max = Math.max(...items.map(it => it.value));
  const hasActive = activeName != null;
  return (
    <div className="bar-list with-bars">
      {items.map((it, i) => {
        const w = (it.value / max) * 100;
        const isActive = hasActive && it.name === activeName;
        const cls = "bar-row" + (onItemClick ? " clickable" : "") +
          (isActive ? " active" : "") +
          (hasActive && !isActive ? " dimmed" : "");
        return (
          <div key={i} className={cls}
            onClick={onItemClick ? () => onItemClick(it, i) : undefined}
            style={onItemClick ? { cursor: "pointer" } : undefined}
          >
            <div className="row-meta">
              <span className="label">{it.name}</span>
              <span className="val">{window.BIT.fmt(it.value)}</span>
            </div>
            <div className="track"><div className={`fill ${color}`} style={{ width: `${w}%` }} /></div>
          </div>
        );
      })}
    </div>
  );
};

const BarListLegend = ({ items, total }) => {
  return (
    <div className="bar-list">
      {items.map((it, i) => {
        const pct = (it.value / total) * 100;
        return (
          <div key={i} className="bar-row">
            <div className="top">
              <span className="dot" style={{ background: it.color }} />
              <span className="label">{it.name}</span>
            </div>
            <div>
              <span className="val">{window.BIT.fmt(it.value)}</span>
              <span className="pct">{pct.toFixed(2).replace(".",",")}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const BarList = ({ items, color = "green", valueKey = "value", labelKey = "name", onItemClick, activeName }) => {
  const mapped = items.map(it => ({ name: it[labelKey], value: it[valueKey] }));
  // se vier onItemClick, propaga o item ORIGINAL (nao o mapeado) pra page poder usar campos extras
  const handler = onItemClick
    ? (mappedIt, idx) => onItemClick(items[idx], idx)
    : undefined;
  return <BarListLine items={mapped} color={color} onItemClick={handler} activeName={activeName} />;
};

const DivergingBars = ({ values, labels }) => {
  const maxAbs = Math.max(...values.map(v => Math.abs(v)));
  return (
    <div className="bar-list">
      {values.map((v, i) => {
        const w = (Math.abs(v) / maxAbs) * 50;
        const positive = v >= 0;
        return (
          <div key={i} className="div-row">
            <div className="label">{labels[i]}</div>
            <div style={{ display: "flex", height: 12, position: "relative" }}>
              <div style={{ flex: 1, position: "relative", borderRight: "1px solid oklch(1 0 0 / 0.08)" }}>
                {!positive && (<div style={{ position: "absolute", right: 0, top: 0, height: "100%", width: `${w * 2}%`, background: "var(--red)", borderRadius: "3px 0 0 3px" }} />)}
              </div>
              <div style={{ flex: 1, position: "relative" }}>
                {positive && (<div style={{ position: "absolute", left: 0, top: 0, height: "100%", width: `${w * 2}%`, background: "var(--green)", borderRadius: "0 3px 3px 0" }} />)}
              </div>
            </div>
            <div className="val" style={{ color: positive ? "var(--green)" : "var(--red)" }}>{window.BIT.fmtK(v)}</div>
          </div>
        );
      })}
    </div>
  );
};

// KPI Tile (big numbers + sparkline). `tone` selects gradient: green / red / cyan / amber.
// `nonMonetary` hides the R$ prefix (for counts: clients, suppliers, etc).
const KpiTile = ({ label, value, unit, deltaPct, deltaDir, sparkValues, sparkColor, tone, nonMonetary }) => {
  return (
    <div className={`kpi-tile ${tone || ""}`}>
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">
          {!nonMonetary && <span className="currency">R$</span>}
          {value}
          {unit && <span className="unit">{unit}</span>}
        </div>
        {deltaPct != null && (
          <div className={`kpi-delta ${deltaDir}`}>
            <Icon name={deltaDir === "up" ? "arrowUp" : "arrowDown"} style={{ width: 12, height: 12 }} />
            {Math.abs(deltaPct).toFixed(1).replace(".", ",")}%
          </div>
        )}
      </div>
      {sparkValues && (
        <div className="spark-wrap">
          <Spark values={sparkValues} color={sparkColor || "var(--cyan)"} />
        </div>
      )}
    </div>
  );
};

// Default filter state — used for active-count + clear-all
const DEFAULT_FILTERS = {
  regime: "caixa",
  status: "Todos status",
  categoria: "Todas categorias",
  cc: "Todos centros de custo",
  dateFrom: "",
  dateTo: "",
};

const countActiveFilters = (f) => {
  let n = 0;
  if (f.regime !== DEFAULT_FILTERS.regime) n++;
  if (f.status !== DEFAULT_FILTERS.status) n++;
  if (f.categoria !== DEFAULT_FILTERS.categoria) n++;
  if (f.cc !== DEFAULT_FILTERS.cc) n++;
  if (f.dateFrom || f.dateTo) n++;
  return n;
};

// Toolbar de filtros inline (substitui o modal removido).
// Lê categorias únicas de window.ALL_TX e seta drilldown global.
const InlineFilterBar = ({ kindHint, drilldown, setDrilldown }) => {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [searchTerm, setSearchTerm] = React.useState("");
  const [grupo, setGrupo] = React.useState(() => {
    if (kindHint === "r") return "Receita";
    if (kindHint === "d") return "Despesa";
    return drilldown && drilldown.type === "kind"
      ? (drilldown.value === "r" ? "Receita" : "Despesa")
      : "Todos";
  });
  React.useEffect(() => {
    if (kindHint === "r") setGrupo("Receita");
    else if (kindHint === "d") setGrupo("Despesa");
  }, [kindHint]);

  // Lê categorias únicas filtradas pelo grupo
  const categorias = React.useMemo(() => {
    const all = window.ALL_TX || [];
    const set = new Set();
    for (const row of all) {
      const [kind, , , categoria] = row;
      if (!categoria) continue;
      if (grupo === "Receita" && kind !== "r") continue;
      if (grupo === "Despesa" && kind !== "d") continue;
      set.add(categoria);
    }
    return [...set].sort();
  }, [grupo]);

  const filtered = React.useMemo(() => {
    if (!searchTerm) return categorias.slice(0, 50);
    const q = searchTerm.toLowerCase();
    return categorias.filter(c => c.toLowerCase().includes(q)).slice(0, 50);
  }, [categorias, searchTerm]);

  const activeCategoria = drilldown && drilldown.type === "categoria" ? drilldown.value : null;

  const setGrupoAndClearCat = (v) => {
    setGrupo(v);
    if (drilldown && drilldown.type === "categoria") setDrilldown(null);
  };
  const handleCatSelect = (c) => {
    setDrilldown({ type: "categoria", value: c, label: c });
    setSearchOpen(false);
    setSearchTerm("");
  };

  return (
    <div className="inline-filterbar">
      {!kindHint && (
        <label className="ifb-item">
          <span>Grupo</span>
          <select className="filter-select" value={grupo} onChange={e => setGrupoAndClearCat(e.target.value)}>
            <option>Todos</option>
            <option>Receita</option>
            <option>Despesa</option>
          </select>
        </label>
      )}
      <label className="ifb-item ifb-search-wrap">
        <span>Categoria</span>
        <div className="ifb-search-trigger" onClick={() => setSearchOpen(o => !o)}>
          <span style={{ flex: 1 }}>
            {activeCategoria
              ? <span style={{ color: "var(--cyan)", fontWeight: 600 }}>{activeCategoria.length > 28 ? activeCategoria.slice(0, 28) + "…" : activeCategoria}</span>
              : <span style={{ color: "var(--mute)" }}>Todas categorias</span>}
          </span>
          <Icon name="chevronRight" />
        </div>
        {searchOpen && (
          <div className="ifb-popover">
            <input
              autoFocus
              type="text"
              placeholder={`Pesquisar (${categorias.length} categorias)`}
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="ifb-search-input"
            />
            <div className="ifb-popover-list">
              <div className="ifb-popover-item" onClick={() => { setDrilldown(null); setSearchOpen(false); setSearchTerm(""); }}>
                <i>Todas categorias</i>
              </div>
              {filtered.map(c => (
                <div key={c}
                  className={`ifb-popover-item ${activeCategoria === c ? "active" : ""}`}
                  onClick={() => handleCatSelect(c)}>
                  {c}
                </div>
              ))}
              {filtered.length === 0 && <div className="ifb-popover-item" style={{ color: "var(--mute)" }}>Nada encontrado</div>}
            </div>
          </div>
        )}
      </label>
      {(activeCategoria || (drilldown && drilldown.type !== "categoria")) && (
        <button className="btn-ghost" onClick={() => setDrilldown(null)} title="Limpar filtros">
          Limpar
        </button>
      )}
    </div>
  );
};

// Compact button that opens the side drawer
const Filters = ({ filters, onOpen, page }) => {
  if (page === "comparativo") return null;
  const active = countActiveFilters(filters);
  return (
    <button className="btn-ghost filters-btn" onClick={onOpen}>
      <Icon name="sliders" /> Filtros
      {active > 0 && <span className="filters-badge">{active}</span>}
    </button>
  );
};

// Export current view (window.print → Save as PDF)
const ExportButton = () => (
  <button className="btn-ghost" onClick={() => window.print()}>
    <Icon name="download" /> Exportar
  </button>
);

const FiltersDrawer = ({ open, onClose, filters, setFilters }) => {
  if (!open) return null;
  const update = (patch) => setFilters({ ...filters, ...patch });
  return (
    <div className="drawer-overlay" onClick={onClose}>
      <aside className="drawer" onClick={(e) => e.stopPropagation()}>
        <header className="drawer-header">
          <h2>Filtros</h2>
          <button className="drawer-close" onClick={onClose} aria-label="Fechar">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </header>
        <div className="drawer-body">
          <div className="drawer-group">
            <label>Regime</label>
            <div className="seg full">
              <button className={filters.regime === "caixa" ? "active" : ""} onClick={() => update({ regime: "caixa" })}>
                <Icon name="cash" /> Caixa
              </button>
              <button className={filters.regime === "competencia" ? "active" : ""} onClick={() => update({ regime: "competencia" })}>
                <Icon name="accrual" /> Competência
              </button>
            </div>
          </div>
          <div className="drawer-group">
            <label>Status</label>
            <select className="filter-select" value={filters.status} onChange={(e) => update({ status: e.target.value })}>
              <option>Todos status</option><option>Pago</option><option>A pagar</option><option>Atrasado</option>
            </select>
          </div>
          <div className="drawer-group">
            <label>Categoria</label>
            <select className="filter-select" value={filters.categoria} onChange={(e) => update({ categoria: e.target.value })}>
              <option>Todas categorias</option><option>Folha</option><option>Marketing</option><option>Impostos</option>
              <option>Infra & Cloud</option><option>Software & SaaS</option><option>Comissões</option>
            </select>
          </div>
          <div className="drawer-group">
            <label>Centro de custo</label>
            <select className="filter-select" value={filters.cc} onChange={(e) => update({ cc: e.target.value })}>
              <option>Todos centros de custo</option><option>Comercial</option><option>Operações</option><option>Financeiro</option>
            </select>
          </div>
          <div className="drawer-group">
            <label>Período personalizado</label>
            <div className="date-range-pair">
              <input type="date" className="filter-select" value={filters.dateFrom} onChange={(e) => update({ dateFrom: e.target.value })} />
              <span className="date-range-sep">→</span>
              <input type="date" className="filter-select" value={filters.dateTo} onChange={(e) => update({ dateTo: e.target.value })} />
            </div>
          </div>
        </div>
        <footer className="drawer-footer">
          <button className="btn-ghost" onClick={() => setFilters({ ...DEFAULT_FILTERS })}>Limpar</button>
          <button className="btn-primary" onClick={onClose}>Aplicar</button>
        </footer>
      </aside>
    </div>
  );
};

// Chip que indica que o usuario filtrou um pedaco da tela clicando num grafico.
// drilldown shape: { type: 'mes'|'categoria'|'cliente'|'fornecedor'|'dia', value, label }
const DrilldownBadge = ({ drilldown, onClear }) => {
  if (!drilldown) return null;
  return (
    <div className="drilldown-badge">
      <span className="dd-label">Filtrando: <b>{drilldown.label}</b></span>
      <button className="dd-clear" onClick={onClear} aria-label="Limpar filtro">× Limpar</button>
    </div>
  );
};

// Helpers usados nas Pages para filtrar o EXTRATO conforme o drilldown ativo.
// EXTRATO row layout: [data DD/MM/YYYY, ccusto, categoria, cliente/fornecedor, valor, status]
function extratoMonthKey(dateStr) {
  // "04/05/2026" -> "2026-05"
  if (!dateStr || typeof dateStr !== "string") return "";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return "";
  return `${parts[2]}-${parts[1]}`;
}
function applyDrilldown(extrato, dd) {
  if (!dd || !Array.isArray(extrato)) return extrato;
  if (dd.type === "mes") {
    return extrato.filter(e => extratoMonthKey(e[0]) === dd.value);
  }
  if (dd.type === "categoria") {
    return extrato.filter(e => e[2] === dd.value);
  }
  if (dd.type === "cliente" || dd.type === "fornecedor") {
    return extrato.filter(e => e[3] === dd.value);
  }
  return extrato;
}

Object.assign(window, {
  Icon, Sidebar, Header, Filters, FiltersDrawer, InlineFilterBar, ExportButton, DEFAULT_FILTERS,
  MonthlyBars, SingleBars, DailyBars, StackedArea, TrendChart, MultiLine,
  BarList, BarListLine, BarListLegend, DivergingBars, Donut, Spark, KpiTile,
  PAGE_TITLES, StatusFilterSeg, STATUS_FILTERS, InvestimentoToggle, EmpresaFilter,
  DrilldownBadge, applyDrilldown, extratoMonthKey,
});
