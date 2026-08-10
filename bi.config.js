module.exports = {
  cliente: {
    nome: "MR Shawarma",
    subdomain: "mrshawarma-bi",
    coolify_app_uuid: "",
    cor_primaria: "#ff6b18",
  },

  fontes: {
    adapters: ["f360"],
    f360: {
      api_token_env: "F360_API_TOKEN",
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
