/**
 * Empacota o sistema em dist/lenda-dragao-fogo.zip (requer o utilitário `zip`).
 * O workflow de release do GitHub faz o mesmo automaticamente.
 */
import { execSync } from "node:child_process";
import { mkdirSync } from "node:fs";

mkdirSync("dist", { recursive: true });
const incluir = ["system.json", "module", "templates", "styles", "lang", "assets", "packs", "README.md", "LICENSE", "CHANGELOG.md"];
execSync(`zip -r dist/lenda-dragao-fogo.zip ${incluir.join(" ")} -x "packs/_source/*"`, { stdio: "inherit" });
console.log("✔ dist/lenda-dragao-fogo.zip");
