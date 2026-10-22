/**
 * Verificações rápidas sem precisar abrir o Foundry:
 *  - sintaxe dos módulos JavaScript;
 *  - compilação dos templates Handlebars;
 *  - consistência das fontes JSON dos compêndios (ids, chaves, tipos);
 *  - chaves de tradução usadas no código e presentes em lang/pt-BR.json.
 * Uso: npm run lint
 */
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import Handlebars from "handlebars";

let erros = 0;
const falha = msg => { erros++; console.error(`✘ ${msg}`); };

function arquivos(dir, ext) {
  const out = [];
  for (const nome of readdirSync(dir)) {
    const p = path.join(dir, nome);
    if (statSync(p).isDirectory()) out.push(...arquivos(p, ext));
    else if (p.endsWith(ext)) out.push(p);
  }
  return out;
}

// 1. JavaScript
const js = [...arquivos("module", ".mjs"), ...arquivos("tools", ".mjs")];
for (const f of js) {
  try { execFileSync(process.execPath, ["--check", f], { stdio: "pipe" }); }
  catch(err) { falha(`${f}: ${err.stderr?.toString().split("\n").slice(0, 5).join(" ")}`); }
}
console.log(`JS: ${js.length} arquivos verificados`);

// 2. Templates
const hbs = arquivos("templates", ".hbs");
for (const f of hbs) {
  try { Handlebars.precompile(readFileSync(f, "utf8")); }
  catch(err) { falha(`${f}: ${err.message.split("\n")[0]}`); }
}
console.log(`Templates: ${hbs.length} arquivos verificados`);

// 3. Compêndios
const sistema = JSON.parse(readFileSync("system.json", "utf8"));
const tipos = { Actor: Object.keys(sistema.documentTypes.Actor), Item: Object.keys(sistema.documentTypes.Item) };
const ids = new Set();
for (const pack of sistema.packs) {
  const dir = path.join("packs/_source", pack.name);
  let n = 0;
  for (const f of arquivos(dir, ".json")) {
    const doc = JSON.parse(readFileSync(f, "utf8"));
    n++;
    if (!doc._id || !/^[A-Za-z0-9]{16}$/.test(doc._id)) falha(`${f}: _id inválido`);
    if (ids.has(doc._id)) falha(`${f}: _id duplicado ${doc._id}`);
    ids.add(doc._id);
    if (!doc._key) falha(`${f}: sem _key`);
    if (doc._key.startsWith("!folders")) continue;
    if (pack.type !== "JournalEntry" && !tipos[pack.type].includes(doc.type)) falha(`${f}: tipo ${doc.type} desconhecido`);
    for (const it of doc.items ?? []) {
      if (!it._key?.startsWith(`!actors.items!${doc._id}.`)) falha(`${f}: item embutido ${it.name} com _key incorreta`);
      if (!tipos.Item.includes(it.type)) falha(`${f}: item embutido com tipo ${it.type}`);
    }
    for (const pg of doc.pages ?? []) {
      if (!pg._key?.startsWith(`!journal.pages!${doc._id}.`)) falha(`${f}: página ${pg.name} com _key incorreta`);
    }
  }
  console.log(`Pack ${pack.name}: ${n} documentos`);
}

// 4. Traduções
const lang = JSON.parse(readFileSync("lang/pt-BR.json", "utf8"));
const tem = k => k.split(".").reduce((d, p) => (d && typeof d === "object" ? d[p] : undefined), lang);
const usadas = new Set();
for (const f of [...js, ...hbs]) {
  for (const m of readFileSync(f, "utf8").matchAll(/["'`](LENDA\.[A-Za-z0-9_.]+)["'`]/g)) usadas.add(m[1]);
}
for (const k of usadas) if (typeof tem(k) !== "string") falha(`Tradução ausente: ${k}`);
console.log(`Traduções: ${usadas.size} chaves verificadas`);

if (erros) {
  console.error(`\n${erros} problema(s) encontrado(s).`);
  process.exit(1);
}
console.log("\nTudo certo!");
