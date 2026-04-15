import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "fs";
import { createHash } from "crypto";
import { basename, dirname, join, relative } from "path";
import { glob } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import stripJsonComments from "strip-json-comments";

const DIST = "dist";

// Clean previous build output
rmSync(DIST, { recursive: true, force: true });

// Step 1: Find Maps

const maps = [];

// Each map lives one level deep under maps/ (e.g. maps/forms/).
// Schema files are versioned: <name>.v<major>.schema.json
for await (const schemaFile of glob("maps/*/*.v*.schema.json")) {
  const dir = dirname(schemaFile);
  const name = basename(dir);
  const dataFile = join(dir, `${name}.jsonc`);
  maps.push({ name, dir, dataFile, schemaFile });
}

if (maps.length === 0) {
  console.error("No maps found.");
  process.exit(1);
}

console.log(
  `Found ${maps.length} map(s): ${maps.map((m) => m.name).join(", ")}`,
);

// Step 2: Validate Maps

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

let hasErrors = false;

for (const map of maps) {
  const schema = JSON.parse(readFileSync(map.schemaFile, "utf-8"));
  const data = JSON.parse(
    stripJsonComments(readFileSync(map.dataFile, "utf-8")),
  );

  const validate = ajv.compile(schema);
  if (!validate(data)) {
    console.error(`Validation failed: ${map.dataFile}`);
    for (const err of validate.errors) {
      console.error(`  ${err.instancePath || "/"}: ${err.message}`);
    }
    hasErrors = true;
  } else {
    console.log(`Validated: ${map.dataFile}`);
  }

  // Normalize unicode host keys to punycode and warn on www. prefixes
  if (data.hosts) {
    for (const host of Object.keys(data.hosts)) {
      // Normalize unicode to punycode via URL API
      const normalizedHost = new URL(`http://${host}`).host;
      if (normalizedHost !== host) {
        data.hosts[normalizedHost] = data.hosts[host];
        delete data.hosts[host];
        console.log(
          `\x1b[36mNormalized: "${host}" → "${normalizedHost}"\x1b[0m`,
        );
      }

      if (normalizedHost.startsWith("www.")) {
        console.warn(
          `\x1b[33mWarning: ${map.dataFile} - host key "${normalizedHost}" uses a www. prefix. ` +
            `Prefer adding host entries without the "www." prefix, unless rules differ between the "www." and un-prefixed domains.\x1b[0m`,
        );
      }
    }
  }

  map.data = data;
  map.schema = schema;
}

if (hasErrors) {
  console.error("Build aborted due to validation errors.");
  process.exit(1);
}

// Step 3: Optimize and Build Maps

const buildId = process.env.BUILD_ID || `local-${Date.now()}`;
const gitSha =
  process.env.GITHUB_SHA ||
  (() => {
    try {
      const sha = execSync("git rev-parse HEAD", { encoding: "utf-8" }).trim();
      const dirty = execSync("git status --porcelain", {
        encoding: "utf-8",
      }).trim();
      return dirty ? `${sha}-dirty` : sha;
    } catch {
      return "unknown";
    }
  })();

const manifest = {
  buildId,
  timestamp: new Date().toISOString(),
  gitSha,
  maps: {},
};

const checksums = [];

mkdirSync(DIST, { recursive: true });

for (const map of maps) {
  // Extract major version for filename suffix
  const majorVersion = map.data.schemaVersion.split(".")[0];
  const versionedName = `${map.name}.v${majorVersion}`;

  // Minify data JSON
  const minified = JSON.stringify(map.data);
  const outDataFile = join(DIST, `${versionedName}.json`);
  writeFileSync(outDataFile, minified);
  console.log(`Minified: ${outDataFile} (${minified.length} bytes)`);

  // Copy schema as-is
  const outSchemaFile = join(DIST, `${versionedName}.schema.json`);
  cpSync(map.schemaFile, outSchemaFile);

  // Compute content hash for data file
  const dataHash = createHash("sha256")
    .update(readFileSync(outDataFile))
    .digest("hex");

  // Record in manifest (object keyed by version)
  if (!manifest.maps[map.name]) {
    manifest.maps[map.name] = {};
  }
  manifest.maps[map.name][`v${majorVersion}`] = {
    filename: basename(outDataFile),
    cid: `sha256:${dataHash}`,
    schema: basename(outSchemaFile),
  };

  // Compute checksums
  for (const f of [outDataFile, outSchemaFile]) {
    const hash = createHash("sha256").update(readFileSync(f)).digest("hex");
    checksums.push(`${hash}  ${relative(DIST, f)}`);
  }
}

const manifestPath = join(DIST, "manifest.json");
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n");

const checksumsPath = join(DIST, "checksums.sha256");
writeFileSync(checksumsPath, checksums.join("\n") + "\n");

// Checksum the manifest itself
const manifestHash = createHash("sha256")
  .update(readFileSync(manifestPath))
  .digest("hex");
writeFileSync(
  checksumsPath,
  readFileSync(checksumsPath, "utf-8") + `${manifestHash}  manifest.json\n`,
);

console.log(`\nBuild complete: ${buildId}`);
console.log(`  Manifest: ${manifestPath}`);
console.log(`  Checksums: ${checksumsPath}`);
