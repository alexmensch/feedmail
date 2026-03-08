/**
 * Precompile Handlebars templates at build time.
 *
 * This is necessary because Cloudflare Workers disallow `new Function()`,
 * which Handlebars.compile() uses internally. By precompiling to JS modules,
 * the runtime only needs Handlebars.template() — no dynamic code generation.
 *
 * Run: node scripts/precompile-templates.mjs
 */

import Handlebars from "handlebars";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_DIR = path.join(__dirname, "..", "src", "templates");
const OUTPUT_DIR = path.join(TEMPLATES_DIR, "compiled");

const PARTIALS_DIR = path.join(TEMPLATES_DIR, "partials");

// Ensure output directories exist
fs.mkdirSync(OUTPUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUTPUT_DIR, "partials"), { recursive: true });

// Register and precompile partials first (so templates can reference them)
const partialFiles = fs.existsSync(PARTIALS_DIR)
  ? fs.readdirSync(PARTIALS_DIR).filter((f) => f.endsWith(".hbs"))
  : [];

for (const file of partialFiles) {
  const source = fs.readFileSync(path.join(PARTIALS_DIR, file), "utf-8");
  const name = file.replace(/\.hbs$/, "");
  Handlebars.registerPartial(name, source);
}

// Get all .hbs files
const files = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith(".hbs"));

let written = 0;

// Precompile partials
for (const file of partialFiles) {
  const source = fs.readFileSync(path.join(PARTIALS_DIR, file), "utf-8");
  const precompiled = Handlebars.precompile(source);

  const outputName = file.replace(/\.hbs$/, ".js");
  const outputPath = path.join(OUTPUT_DIR, "partials", outputName);

  const content = `// Auto-generated from partials/${file} — do not edit\nexport default ${precompiled};\n`;

  const existing = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf-8")
    : null;

  if (existing !== content) {
    fs.writeFileSync(outputPath, content);
    written++;
  }
}

for (const file of files) {
  const source = fs.readFileSync(path.join(TEMPLATES_DIR, file), "utf-8");
  const precompiled = Handlebars.precompile(source);

  // Convert filename: "newsletter.txt.hbs" → "newsletter.txt.js"
  const outputName = file.replace(/\.hbs$/, ".js");
  const outputPath = path.join(OUTPUT_DIR, outputName);

  const content = `// Auto-generated from ${file} — do not edit\nexport default ${precompiled};\n`;

  // Only write if content changed — prevents wrangler dev infinite rebuild loop
  const existing = fs.existsSync(outputPath)
    ? fs.readFileSync(outputPath, "utf-8")
    : null;

  if (existing !== content) {
    fs.writeFileSync(outputPath, content);
    written++;
  }
}

const totalCount = files.length + partialFiles.length;
console.log(
  `Precompiled ${totalCount} templates (${written} updated) to ${OUTPUT_DIR}`
);
