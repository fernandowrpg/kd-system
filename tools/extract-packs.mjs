/**
 * Extrai os bancos LevelDB (packs/<pack>) de volta para JSON em packs/_source/<pack>.
 * Útil para editar o conteúdo dentro do Foundry e depois versionar as mudanças.
 * Feche o Foundry antes de rodar (o LevelDB fica travado enquanto o mundo está aberto).
 * Uso: npm run extract
 */
import { extractPack } from "@foundryvtt/foundryvtt-cli";
import { readdir } from "node:fs/promises";
import path from "node:path";

const SOURCE = "packs/_source";
const DEST = "packs";

const slug = s => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").toLowerCase();

const packs = (await readdir(DEST, { withFileTypes: true })).filter(d => d.isDirectory() && d.name !== "_source").map(d => d.name);
for (const pack of packs) {
  await extractPack(path.join(DEST, pack), path.join(SOURCE, pack), {
    log: false,
    clean: true,
    transformName: doc => {
      const prefix = doc._key?.startsWith("!folders") ? "_folder_" : "";
      return `${prefix}${slug(doc.name ?? "doc")}_${doc._id}.json`;
    }
  });
  console.log(`✔ ${pack}`);
}
