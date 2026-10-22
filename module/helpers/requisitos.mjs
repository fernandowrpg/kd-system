import { LENDA } from "../config.mjs";

/** Remove acentos e normaliza para comparação. */
export function normalizar(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

const ATRIBUTOS = {
  forca: "forca", razao: "razao", instinto: "instinto", agilidade: "agilidade", presenca: "presenca", vontade: "vontade"
};

/**
 * Verifica se um ator cumpre os requisitos de uma técnica ou trunfo.
 * O texto é o do livro: "Agilidade 3, Shunpo", "Médico 2, Regeneração", "Tocado ou Aceito, Vontade 5"...
 * @param {object} fonte            Ator, ou objeto { atributos, aura, ocupacoes, itens: [nomes] } (assistente).
 * @param {string} texto
 * @param {object} [opcoes]
 * @param {string} [opcoes.ignorar] Nome do próprio item (não conta como requisito de si mesmo).
 * @returns {{ok: boolean, faltando: string[], incertos: string[]}}
 */
export function verificarRequisitos(fonte, texto, { ignorar = "" } = {}) {
  const resultado = { ok: true, faltando: [], incertos: [] };
  if (!texto || !texto.trim()) return resultado;
  const dados = extrairDados(fonte);
  const partes = texto.split(/,|;/).map(p => p.trim()).filter(Boolean);
  for (const parte of partes) {
    const alternativas = parte.split(/\s+ou\s+/i).map(a => a.trim()).filter(Boolean);
    let algum = false;
    let incerto = false;
    for (const alt of alternativas) {
      const r = avaliarRequisito(dados, alt, ignorar);
      if (r === true) { algum = true; break; }
      if (r === null) incerto = true;
    }
    if (!algum) {
      if (incerto) resultado.incertos.push(parte);
      else {
        resultado.ok = false;
        resultado.faltando.push(parte);
      }
    }
  }
  return resultado;
}

function extrairDados(fonte) {
  if (fonte?.documentName === "Actor") {
    const s = fonte.system;
    const itens = fonte.items.map(i => normalizar(i.name));
    for (const i of fonte.items) if (i.system?.origem) itens.push(normalizar(i.system.origem));
    const especializacoes = Object.values(s.ocupacoes ?? {}).map(o => normalizar(o.especializacoes)).join(" ");
    return {
      atributos: s.atributos ?? {},
      aura: s.aura ?? 0,
      ocupacoes: Object.fromEntries(Object.entries(s.ocupacoes ?? {}).map(([k, v]) => [k, v.value])),
      especializacoes,
      itens
    };
  }
  return {
    atributos: fonte.atributos ?? {},
    aura: fonte.aura ?? 0,
    ocupacoes: fonte.ocupacoes ?? {},
    especializacoes: normalizar(fonte.especializacoes ?? ""),
    itens: (fonte.itens ?? []).map(normalizar)
  };
}

/**
 * @returns {true|false|null} null quando não é possível verificar automaticamente.
 */
function avaliarRequisito(dados, texto, ignorar) {
  const t = normalizar(texto).replace(/\.$/, "");
  // "qualquer ocupação 3"
  let m = t.match(/^qualquer ocupacao\s+(\d+)$/);
  if (m) return Object.values(dados.ocupacoes).some(v => v >= Number(m[1]));
  // "valor 5 no atributo" (Prodígio)
  m = t.match(/^valor\s+(\d+)\s+no atributo$/);
  if (m) return Object.values(dados.atributos).some(v => v >= Number(m[1]));
  // "especialização em X"
  m = t.match(/^especializacao em\s+(.+)$/);
  if (m) return dados.especializacoes.includes(m[1]) ? true : null;
  // "16 anos ou menos" e similares
  if (/anos/.test(t)) return null;
  // Atributo/Aura/Ocupação com valor
  m = t.match(/^(.+?)\s+(\d+)$/);
  if (m) {
    const nome = m[1].trim();
    const valor = Number(m[2]);
    if (nome === "aura") return dados.aura >= valor;
    if (ATRIBUTOS[nome]) return (dados.atributos[ATRIBUTOS[nome]] ?? 0) >= valor;
    const oc = LENDA.aliasOcupacao[nome];
    if (oc) return (dados.ocupacoes[oc] ?? 0) >= valor;
    return null;
  }
  // Nome de técnica ou trunfo.
  if (normalizar(ignorar) === t) return true;
  if (dados.itens.includes(t)) return true;
  // "Tocado" / "Aceito" também podem vir de outro trunfo (Síndrome de Lúcifer é um Aceito).
  if (t === "aceito" && dados.itens.includes("sindrome de lucifer")) return true;
  return false;
}
