module.exports = {
  cliente: {
    nome: "MR Shawarma",
    subdomain: "mrshawarma-bi",
    coolify_app_uuid: "x13q56kx7e2rty2obslymcc5",
    cor_primaria: "#ff6b18",
  },

  fontes: {
    adapters: ["f360"],
    f360: {
      api_token_env: "F360_API_TOKEN",

      // NAO-OPERACIONAIS: vazio de proposito. O modelo de DRE da iFinance pro
      // Shawarma ja tem linha propria pra investimento (14 - Investimentos e
      // Outros) e trata pro-labore como despesa de pessoal (6), entao nao ha
      // nada a separar do resultado. Com a lista vazia nenhuma row recebe o
      // flag e o toggle Operacional/Completo se esconde sozinho.
      // (No BI da MedConsulting essa lista tem 5 codigos, por causa do
      // refinanciamento e das retiradas de socios.)
      categorias_nao_operacionais: [],

      // Finalidade das contas. A DESCRICAO abaixo vem do campo tipo_conta do
      // proprio F360 (dado, nao suposicao). O que NAO temos e a leitura de
      // negocio de cada uma: no BI da MedConsulting a Silmara descreveu as
      // contas na reuniao ("uma que esta um dinheiro aplicado", "a de
      // movimentacao", "uma que a gente baixa os clientes congelados"), e aqui
      // ela nao falou do Shawarma. Por isso nenhuma esta marcada como
      // `operacional: false` — marcar por conta propria seria tirar dinheiro do
      // caixa operacional baseado em chute meu.
      // >>> Confirmar com ela quais destas ficam fora da leitura operacional.
      contas_finalidade: {
        "MR SHAWARMA - SANTANDER - C.C.-130059365": { finalidade: "Conta corrente — banco 33 (Santander), 3.267 lançamentos" },
        "MR SHAWARMA - ZOOP - C.C. - 531419148-0":  { finalidade: "Conta corrente — Zoop, adquirente de cartão (873 lançamentos)" },
        "MR SHAWARMA - ITAU - CC 99177-6":          { finalidade: "Conta corrente — banco 341 (Itaú), 548 lançamentos" },
        "CAIXA LOJA MR SHAWARMA FOOD LTDA":         { finalidade: "Conta dinheiro — caixa da loja (122 lançamentos)" },
      },
    },
    drive: {
      base_path: "G:/Meu Drive/BGP/CLIENTES/BI/MR Shawarma",
    },
  },

  pages: {
    geral: {
      overview: "active",
      receita: "active",
      despesa: "active",
      fluxo: "active",
      tesouraria: "active",
      comparativo: "active",
      // DRE OCULTA DE PROPOSITO, aguardando decisao sobre a base da receita.
      //
      // A tela esta pronta e a cascata reconcilia (residuo R$ 0,00 nos 7 meses),
      // mas o dado de entrada usa uma base diferente da do relatorio dela:
      //
      //   linha 1 RECEITAS OPERACIONAIS   BI R$  65.487,20   dela R$ 165.828,55
      //
      // Causa (conferida no movimentos.json de 13/08): o F360 quebra cada venda
      // de cartao em DUAS rows — a venda e a tarifa — e manda as DUAS com
      // cNatureza='R'. O normalizeF360 usa nValorPago (ValorLiquido) na venda,
      // entao a venda entra liquida de taxa, e a tarifa entra como RECEITA.
      // Em julho: vendas liquidas R$ 87.853,90 + tarifas R$ 76.191,01 =
      // R$ 164.044,91, que e a linha 1 dela (R$ 163.624,08) com 0,26% de
      // diferenca. Ou seja: o dado existe inteiro, o que difere e onde cada
      // metade entra.
      //
      // Ativar isto sem resolver a base mostraria pra cliente uma DRE com 40%
      // menos receita que o relatorio que ela mesma mandou.
      dre: "hidden",
      orcamento: "hidden",
      orcamento_mensal: "hidden",
      relatorio_ia: "active",
      valuation: "hidden",
    },
    outros: {
      fluxo_projetado: "hidden",
      indicators: "hidden",
      faturamento_produto: "hidden",
      cmv: "hidden",
      curva_abc: "hidden",
      marketing: "hidden",
      hierarquia: "hidden",
      detalhado: "hidden",
      profunda_cliente: "hidden",
      crm: "hidden",
    },
  },

  meta: {
    ano_corrente: 2026,
    metas_crm: { mes: 1_000_000, ano: 12_000_000 },
    valuation_premissas: { wacc: 25, growth_year2: 20, growth_year3: 20, ipca: 4.5, perpetuity_growth: 10 },
  },

  template: {
    version_when_created: "1.1.0",
    version_last_synced: "1.1.0",
  },
};
