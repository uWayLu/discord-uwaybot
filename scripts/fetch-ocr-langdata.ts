import { mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, "..", "src", "services", "langdata");
mkdirSync(outDir, { recursive: true });

const BASE = "https://github.com/tesseract-ocr/tessdata_fast/raw/main";
const LANGS = ["eng", "chi_tra", "chi_sim"];

for (const lang of LANGS) {
  const url = `${BASE}/${lang}.traineddata`;
  console.log(`[langdata] downloading ${lang}...`);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`[langdata] FAILED ${lang}: HTTP ${res.status}`);
    process.exitCode = 1;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(join(outDir, `${lang}.traineddata`), buf);
  console.log(`[langdata] ${lang}.traineddata ${(buf.length / 1024 / 1024).toFixed(1)} MB`);
}