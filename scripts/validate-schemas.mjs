import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import stripJsonComments from "strip-json-comments";
import { readFileSync, existsSync } from "fs";
import { basename, dirname, join } from "path";
import { glob } from "node:fs/promises";
import { red, yellow, green } from "./utils.mjs";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

let files = process.argv.slice(2).filter((f) => !f.endsWith(".schema.json"));

if (files.length === 0) {
  const matches = glob("maps/**/*.jsonc");
  for await (const match of matches) {
    files.push(match);
  }
}

if (files.length === 0) {
  console.log("No map files to validate.");
  process.exit(0);
}

let hasErrors = false;

for (const file of files) {
  const dir = dirname(file);
  const name = basename(file, ".jsonc");

  // Parse data first to read schemaVersion for schema file lookup
  const data = JSON.parse(stripJsonComments(readFileSync(file, "utf-8")));

  if (!data.schemaVersion) {
    console.error(red(`No schemaVersion found in ${file}`));
    hasErrors = true;
    continue;
  }

  const majorVersion = data.schemaVersion.split(".")[0];
  const schemaPath = join(dir, `${name}.v${majorVersion}.schema.json`);

  if (!existsSync(schemaPath)) {
    console.error(red(`No schema found for ${file} (expected ${schemaPath})`));
    hasErrors = true;
    continue;
  }

  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));

  const validate = ajv.compile(schema);
  if (!validate(data)) {
    console.error(red(`Validation failed: ${file}`));
    for (const err of validate.errors) {
      console.error(red(`  ${err.instancePath || "/"}: ${err.message}`));
    }
    hasErrors = true;
  } else {
    console.log(green(`Valid: ${file}`));
  }

  // Warn on www. host keys
  if (data.hosts) {
    for (const host of Object.keys(data.hosts)) {
      if (host.startsWith("www.")) {
        console.warn(
          yellow(
            `Warning: ${file} - host key "${host}" uses a www. prefix. ` +
              `Prefer adding host entries without the "www." prefix, unless rules differ between the "www." and un-prefixed domains. ` +
              `See the ${name} Map README for guidance.`,
          ),
        );
      }
    }
  }
}

if (hasErrors) process.exit(1);
