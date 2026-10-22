/**
 * Compila as fontes JSON de packs/_source/<pack> nos bancos LevelDB que o Foundry lê (packs/<pack>).
 * Uso: npm run build
 */
import { compilePack } from "@foundryvtt/foundryvtt-cli";
import { readdir, rm } from "node:fs/promises";
import path from "node:path";

const SOURCE = "packs/_source";
const DEST = "packs";

const packs = (await readdir(SOURCE, { withFileTypes: true })).filter(d => d.isDirectory()).map(d => d.name);
for (const pack of packs) {
  const src = path.join(SOURCE, pack);
  const dest = path.join(DEST, pack);
  await rm(dest, { recursive: true, force: true });
  await compilePack(src, dest, { log: false, recursive: false });
  console.log(`✔ ${pack}`);
}
