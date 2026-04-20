import { lintMapData } from "./lib/lint-selectors.mjs";
import stripJsonComments from "strip-json-comments";
import { readFileSync } from "fs";
import { glob } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

let files = process.argv.slice(2).filter((f) => !f.endsWith(".schema.json"));

if (files.length === 0) {
  const matches = glob("maps/forms/*.jsonc");
  for await (const match of matches) {
    files.push(match);
  }
}

if (files.length === 0) {
  console.log("No map files to lint.");
  process.exit(0);
}

let totalErrors = 0;
let totalWarnings = 0;

for (const file of files) {
  let data;
  try {
    data = JSON.parse(stripJsonComments(readFileSync(file, "utf-8")));
  } catch (e) {
    console.error(red(`Failed to parse ${file}: ${e.message}`));
    totalErrors++;
    continue;
  }

  const { errors, warnings } = lintMapData(data);

  if (errors.length === 0 && warnings.length === 0) {
    console.log(green(`Selectors OK: ${file}`));
    continue;
  }

  for (const w of warnings) {
    console.warn(
      yellow(`Warning: ${file} - ${w.location}\n`) +
        dim(`  selector: ${w.selector}\n`) +
        yellow(`  ${w.message}`),
    );
  }

  for (const e of errors) {
    console.error(
      red(`Error: ${file} - ${e.location}\n`) +
        dim(`  selector: ${e.selector}\n`) +
        red(`  ${e.message}`),
    );
  }

  totalErrors += errors.length;
  totalWarnings += warnings.length;
}

if (totalWarnings > 0) {
  console.warn(yellow(`\n${totalWarnings} selector warning(s)`));
}

if (totalErrors > 0) {
  console.error(red(`${totalErrors} selector error(s)`));
  process.exit(1);
} else {
  console.log(green("Selector linting passed."));
}
