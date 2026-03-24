import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import stripJsonComments from "strip-json-comments";
import { readFileSync, existsSync } from "fs";
import { basename, dirname, join } from "path";
import { glob } from "node:fs/promises";

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

let files = process.argv.slice(2);

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
  const schemaPath = join(dir, `${name}.schema.json`);

  if (!existsSync(schemaPath)) {
    console.error(
      `\x1b[31mNo schema found for ${file} (expected ${schemaPath})\x1b[0m`,
    );
    hasErrors = true;
    continue;
  }

  const data = JSON.parse(stripJsonComments(readFileSync(file, "utf-8")));
  const schema = JSON.parse(readFileSync(schemaPath, "utf-8"));

  const validate = ajv.compile(schema);
  if (!validate(data)) {
    console.error(`\x1b[31mValidation failed: ${file}\x1b[0m`);
    for (const err of validate.errors) {
      console.error(
        `\x1b[31m  ${err.instancePath || "/"}: ${err.message}\x1b[0m`,
      );
    }
    hasErrors = true;
  } else {
    console.log(`\x1b[32mValid: ${file}\x1b[0m`);
  }

  // Warn on www. host keys
  if (data.hosts) {
    for (const host of Object.keys(data.hosts)) {
      if (host.startsWith("www.")) {
        console.warn(
          `\x1b[33mWarning: ${file} - host key "${host}" uses a www. prefix. ` +
            `Author under the non-www host as canonical unless hosts differ. ` +
            `See the ${name} Map README for guidance.\x1b[0m`,
        );
      }
    }
  }
}

if (hasErrors) process.exit(1);
