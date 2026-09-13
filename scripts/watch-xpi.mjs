import { watch } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import process from "node:process";

const root = resolve(import.meta.dirname, "..");
const sources = [
  "manifest.json",
  "content.js",
  "background.js",
  "lib",
  "options",
  "icons",
];

let timer;
let building = false;
let rebuildPending = false;

function build() {
  if (building) {
    rebuildPending = true;
    return;
  }

  building = true;
  console.log("[xpi] Gerando youtext.xpi...");
  const child = spawn("npm", ["run", "package"], {
    cwd: root,
    stdio: "inherit",
  });

  child.on("exit", (code) => {
    building = false;
    console.log(code === 0 ? "[xpi] Atualizado." : `[xpi] Falhou (código ${code}).`);
    if (rebuildPending) {
      rebuildPending = false;
      build();
    }
  });
}

function scheduleBuild() {
  clearTimeout(timer);
  timer = setTimeout(build, 150);
}

for (const source of sources) {
  const path = resolve(root, source);
  watch(path, { recursive: true }, (_event, filename) => {
    console.log(`[xpi] Alterado: ${filename ?? source}`);
    scheduleBuild();
  });
}

console.log("[xpi] Monitorando arquivos da extensão. Ctrl+C para encerrar.");
build();
