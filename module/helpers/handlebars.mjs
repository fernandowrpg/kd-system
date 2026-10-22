import { SYSTEM_ID } from "../config.mjs";

export function registrarHelpers() {
  const H = Handlebars;
  H.registerHelper("lenda-eq", (a, b) => a === b);
  H.registerHelper("lenda-ne", (a, b) => a !== b);
  H.registerHelper("lenda-gt", (a, b) => Number(a) > Number(b));
  H.registerHelper("lenda-or", (...args) => args.slice(0, -1).some(Boolean));
  H.registerHelper("lenda-and", (...args) => args.slice(0, -1).every(Boolean));
  H.registerHelper("lenda-sinal", n => {
    const v = Number(n) || 0;
    return v > 0 ? `+${v}` : `${v}`;
  });
  H.registerHelper("lenda-includes", (lista, valor) => Array.isArray(lista) && lista.includes(valor));
  H.registerHelper("lenda-json", v => JSON.stringify(v));
  H.registerHelper("lenda-range", (n) => Array.from({ length: Math.max(0, Number(n) || 0) }, (_, i) => i));
}

export function precarregarTemplates() {
  const base = `systems/${SYSTEM_ID}/templates`;
  const caminhos = [
    `${base}/actor/parts/cabecalho.hbs`,
    `${base}/actor/parts/atributos.hbs`,
    `${base}/actor/parts/ocupacoes.hbs`,
    `${base}/actor/parts/estilo.hbs`,
    `${base}/actor/parts/limiares.hbs`,
    `${base}/actor/parts/tecnicas.hbs`,
    `${base}/actor/parts/combate.hbs`,
    `${base}/actor/parts/trunfos.hbs`,
    `${base}/actor/parts/equipamentos.hbs`,
    `${base}/actor/parts/biografia.hbs`,
    `${base}/actor/parts/abas.hbs`,
    `${base}/item/tecnica.hbs`,
    `${base}/item/trunfo.hbs`,
    `${base}/item/caminho.hbs`,
    `${base}/item/estilo.hbs`,
    `${base}/item/equipamento.hbs`,
    `${base}/item/upgrade.hbs`
  ];
  return foundry.applications.handlebars.loadTemplates(caminhos);
}
