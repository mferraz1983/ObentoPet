// Uso: node scripts/extract-logo.mjs caminho/do/index.html-antigo
// Extrai o logo das etiquetas (base64 embutido no app antigo) para public/label-logo.png
import fs from "node:fs";
const src = process.argv[2];
if (!src) { console.error("Informe o caminho do index.html antigo."); process.exit(1); }
const html = fs.readFileSync(src, "utf8");
const m = html.match(/LABEL_LOGO\s*=\s*"data:image\/png;base64,([A-Za-z0-9+/=]+)"/);
if (!m) { console.error("Logo não encontrado nesse arquivo."); process.exit(1); }
fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/label-logo.png", Buffer.from(m[1], "base64"));
console.log("OK: public/label-logo.png (" + fs.statSync("public/label-logo.png").size + " bytes)");
