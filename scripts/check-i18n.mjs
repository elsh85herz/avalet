// Fails (exit 1) when the UI copy breaks the rules:
// - a key present in one language and missing in the other, or an empty string;
// - a string left in one language (RU without Cyrillic, EN with Cyrillic, or
//   the same text in both), unless it is on the allowlist below;
// - banned wording ("invisible", "undetectable", "cheat" and Russian
//   equivalents) in UI strings, READMEs or code comments;
// - long dashes or arrow characters in UI strings or JSX text;
// - user-visible text written straight into a component instead of i18n.ts.
// Run: node scripts/check-i18n.mjs (part of `npm run check` and CI).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const problems = [];

// --- load the strings ---
const source = fs.readFileSync(path.join(root, "src/renderer/lib/i18n.ts"), "utf8");
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "avalet-i18n-")), "i18n.mjs");
fs.writeFileSync(tmp, js);
const { UI_STRINGS } = await import(pathToFileURL(tmp).href);

/** Same text in both languages on purpose: product names, codes, placeholders, endonyms. */
const SAME_ALLOWED = new Set([
  "settings.baseUrl", // "Base URL" is the term providers use in their own docs, both languages
  "settings.speechLanguages.en", // "English" is the name of the language in itself
  "modes.demo", // only if a translation is ever identical by accident; checked below
]);
/** RU values allowed without Cyrillic (Latin technical terms). */
const LATIN_OK = /^(Base URL|English|API|Pro|Auto|OK|RU|EN|GB)$/;
const CYRILLIC = /[А-Яа-яЁё]/;
const BANNED = /\b(invisible|undetectable|cheat\w*)\b|невидим|незаметн|читер|обман/i;
const LONG_DASH = /[‒–—―⸺⸻]/;
const ARROWS = /[←-⇿⟰-⟿⤀-⥿⬀-⬯▶▸►◀◂◄➜-➿]/;

function leaves(value, prefix = "") {
  if (typeof value === "string") return [[prefix, value]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
  }
  return [[prefix, value]];
}

const en = new Map(leaves(UI_STRINGS.en));
const ru = new Map(leaves(UI_STRINGS.ru));

for (const [key] of en) if (!ru.has(key)) problems.push(`missing in RU: ${key}`);
for (const [key] of ru) if (!en.has(key)) problems.push(`missing in EN: ${key}`);

for (const [lang, map] of [["en", en], ["ru", ru]]) {
  for (const [key, value] of map) {
    if (typeof value !== "string" || !value.trim()) {
      problems.push(`${lang}.${key}: empty or not a string`);
      continue;
    }
    if (BANNED.test(value)) problems.push(`${lang}.${key}: banned wording: ${value}`);
    if (LONG_DASH.test(value)) problems.push(`${lang}.${key}: long dash: ${value}`);
    if (ARROWS.test(value)) problems.push(`${lang}.${key}: arrow character: ${value}`);
  }
}

for (const [key, value] of en) {
  if (typeof value === "string" && CYRILLIC.test(value)) problems.push(`en.${key}: Russian text in the English strings: ${value}`);
}
for (const [key, value] of ru) {
  if (typeof value !== "string") continue;
  if (!CYRILLIC.test(value) && !LATIN_OK.test(value) && !SAME_ALLOWED.has(key)) {
    problems.push(`ru.${key}: not translated (no Cyrillic): ${value}`);
  }
  if (en.get(key) === value && !SAME_ALLOWED.has(key) && !LATIN_OK.test(value)) {
    problems.push(`${key}: identical in RU and EN: ${value}`);
  }
}

// --- components: hard-coded text, arrows, long dashes ---
function files(dir, pattern) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full, pattern);
    return pattern.test(entry.name) ? [full] : [];
  });
}

/** JSX text that may appear as is: brand, language codes and endonyms, glyph-only content. */
const JSX_TEXT_OK = new Set(["Avalet", "RU", "EN", "Auto", "Русский", "English"]);
const JSX_TEXT = /(?<![=-])>([^<>{}]*[A-Za-zА-Яа-яЁё][^<>{}]*)</g;

for (const file of files(path.join(root, "src/renderer"), /\.tsx$/)) {
  const rel = path.relative(root, file);
  const lines = fs.readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const where = `${rel}:${index + 1}`;
    if (line.includes("i18n-ignore")) return;
    const trimmed = line.trim();
    const isComment = trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*");
    if (!isComment && (LONG_DASH.test(line) || ARROWS.test(line))) problems.push(`${where}: long dash or arrow in a component`);
    if (isComment) return;
    for (const match of line.matchAll(JSX_TEXT)) {
      const text = match[1].trim();
      if (!text || JSX_TEXT_OK.has(text)) continue;
      // Skip TypeScript generics and comparisons that look like tags.
      if (/^[\w.,\s|&()[\]=:?"'!-]+$/.test(text) && /[=&|(]|\b(string|number|boolean|void|null)\b/.test(text)) continue;
      problems.push(`${where}: text written in the component instead of i18n.ts: "${text}"`);
    }
  });
}

// --- banned wording anywhere user-facing: READMEs, UI and main-process code (comments included) ---
const wordingFiles = [
  path.join(root, "README.md"),
  path.join(root, "README.ru.md"),
  ...files(path.join(root, "src/renderer"), /\.(tsx?|css|html)$/),
  ...files(path.join(root, "electron"), /\.(ts|cts)$/).filter((f) => !f.endsWith(".test.ts")),
];
for (const file of wordingFiles) {
  if (!fs.existsSync(file)) continue;
  fs.readFileSync(file, "utf8")
    .split("\n")
    .forEach((line, index) => {
      if (BANNED.test(line)) problems.push(`${path.relative(root, file)}:${index + 1}: banned wording`);
    });
}

if (problems.length > 0) {
  console.error(`check-i18n: ${problems.length} problem(s)`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}
console.log(`check-i18n: ok (${en.size} strings per language)`);
