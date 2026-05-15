import { execSync } from "child_process";
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync } from "fs";
import { createHash } from "crypto";
import { basename, dirname, join, relative } from "path";
import { glob } from "node:fs/promises";
import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import stripJsonComments from "strip-json-comments";
import { red, yellow, green, cyan } from "./utils.mjs";

const DIST = "dist";

// ---------------------------------------------------------------------------
// Per-Map backwards-compatibility migrations
//
// Source data (`<name>.jsonc`) is authored against each Map's latest schema,
// i.e. the `<name>.v<N>.schema.json` whose `properties.schemaVersion.const`
// matches the source's `schemaVersion`. To keep emitting artifacts for older
// majors that still ship in the release, register a direct migration here
// for each older target major.
//
// MIGRATIONS["<name>"][T] takes the source data (in the latest schema's
// shape, already host-normalized) and must return data shaped for major T.
// Migrations are NOT chained — emitting v0 when the source is at v3 uses
// MIGRATIONS["<name>"][0] directly, not a v3→v2→v1→v0 walk. This avoids
// losing data for fields that exist at the target shape but not at any
// intermediate major.
//
// Cost of the direct model: every time the source's major is bumped, every
// existing migration entry must be updated so its function interprets the
// new source shape. A new entry is also added for the previous source's
// major.
//
// The build sets the resulting payload's `schemaVersion` field to the
// target schema's `const` automatically; migrations only need to handle
// structural changes. Migrations must not mutate their input.
//
// To drop support for an older schema major, either remove its migration
// entry below or delete the corresponding `<name>.v<N>.schema.json` file.
// ---------------------------------------------------------------------------
const MIGRATIONS = {
  forms: {
    // 0: (data) => data, // example: latest source projecting to v0
    // 1: (data) => data, // example: latest source projecting to v1
    // 2: (data) => data, // example: latest source projecting to v2
  },
};

// Clean previous build output
rmSync(DIST, { recursive: true, force: true });

// Step 1: Discover Maps and their schemas

const mapsByName = new Map();

// Each Map lives one level deep under maps/ (e.g. maps/forms/).
// Schema files are versioned: <name>.v<major>.schema.json.
for await (const schemaFile of glob("maps/*/*.v*.schema.json")) {
  const dir = dirname(schemaFile);
  const name = basename(dir);
  const dataFile = join(dir, `${name}.jsonc`);

  const majorMatch = basename(schemaFile).match(/\.v(\d+)\.schema\.json$/);

  if (!majorMatch) {
    continue;
  }

  const major = parseInt(majorMatch[1], 10);

  const schemaJson = JSON.parse(readFileSync(schemaFile, "utf-8"));
  const expectedVersion = schemaJson?.properties?.schemaVersion?.const;

  if (typeof expectedVersion !== "string") {
    console.error(
      red(
        `${schemaFile} has no properties.schemaVersion.const string; cannot determine its schema version.`,
      ),
    );
    process.exit(1);
  }

  if (!mapsByName.has(name)) {
    mapsByName.set(name, { name, dir, dataFile, schemas: [] });
  }

  mapsByName.get(name).schemas.push({
    file: schemaFile,
    schema: schemaJson,
    major,
    expectedVersion,
  });
}

if (mapsByName.size === 0) {
  console.error(red("No maps found."));
  process.exit(1);
}

const maps = [...mapsByName.values()];

console.log(
  `Found ${maps.length} map(s) to build:\n${maps
    .map((m) => {
      const versions = [...m.schemas]
        .sort((a, b) => b.major - a.major)
        .map((s) => `v${s.major}`)
        .join(", ");
      return `  ${m.name} (schemas: ${versions})`;
    })
    .join("\n")}`,
);

// Step 2: Load each Map's source, identify its latest schema, run migrations
// for older majors, and validate every per-schema payload.

const ajv = new Ajv2020({ allErrors: true });
addFormats(ajv);

let hasErrors = false;

for (const map of maps) {
  const sourceData = JSON.parse(
    stripJsonComments(readFileSync(map.dataFile, "utf-8")),
  );

  // Normalize unicode host keys to punycode (once) and warn on www. prefixes.
  if (sourceData.hosts) {
    for (const host of Object.keys(sourceData.hosts)) {
      const normalizedHost = new URL(`http://${host}`).host;
      if (normalizedHost !== host) {
        sourceData.hosts[normalizedHost] = sourceData.hosts[host];
        delete sourceData.hosts[host];
        console.log(cyan(`Normalized: "${host}" → "${normalizedHost}"`));
      }

      if (normalizedHost.startsWith("www.")) {
        console.warn(
          yellow(
            `Warning: ${map.dataFile} - host key "${normalizedHost}" uses a www. prefix. ` +
              `Prefer adding host entries without the "www." prefix, unless rules differ between the "www." and un-prefixed domains.`,
          ),
        );
      }
    }
  }

  // The source's schema is the one whose `const` matches the source's
  // `schemaVersion`. Schemas with majors above the source's may exist on
  // disk as drafts but are not built until the source is promoted to match.
  const sourceSchema = map.schemas.find(
    (s) => s.expectedVersion === sourceData.schemaVersion,
  );
  if (!sourceSchema) {
    console.error(
      red(
        `${map.dataFile} schemaVersion "${sourceData.schemaVersion}" does not match any schema in ${map.dir}. ` +
          `Source data must reference an existing schema's expected version.`,
      ),
    );
    hasErrors = true;
    continue;
  }

  const draftSchemas = map.schemas.filter((s) => s.major > sourceSchema.major);
  if (draftSchemas.length > 0) {
    console.log(
      cyan(
        `${map.name}: skipping ${draftSchemas.map((s) => `v${s.major}`).join(", ")} ` +
          `(above source v${sourceSchema.major}); promote ${map.dataFile} to emit them.`,
      ),
    );
  }
  const targets = map.schemas.filter((s) => s.major <= sourceSchema.major);

  // Produce a payload for each target schema. The source's own schema gets
  // the source data directly; every older target gets a direct projection
  // via its registered migration (no chaining, to avoid intermediate data loss).
  map.builds = [];

  for (const target of targets) {
    let projectedData;
    if (target.major === sourceSchema.major) {
      projectedData = sourceData;
    } else {
      const migrate = MIGRATIONS[map.name]?.[target.major];
      if (typeof migrate !== "function") {
        console.error(
          red(
            `${map.name}: no migration registered for source v${sourceSchema.major} → v${target.major}. ` +
              `Register MIGRATIONS["${map.name}"][${target.major}] in scripts/build.mjs, ` +
              `or delete ${map.dir}/${map.name}.v${target.major}.schema.json to drop support for v${target.major}.`,
          ),
        );
        hasErrors = true;
        continue;
      }
      projectedData = migrate(structuredClone(sourceData));
    }

    // Pin schemaVersion to the target schema's expected const, so migrations
    // never have to handle the version-string update themselves.
    const payload = { ...projectedData, schemaVersion: target.expectedVersion };

    const validate = ajv.compile(target.schema);

    if (!validate(payload)) {
      console.error(red(`Validation failed: ${map.dataFile} → ${target.file}`));

      for (const err of validate.errors) {
        console.error(`  ${err.instancePath || "/"}: ${err.message}`);
      }

      hasErrors = true;
    } else {
      console.log(green(`Validated: ${map.dataFile} → ${target.file}`));
    }

    map.builds.push({ target, payload });
  }
}

if (hasErrors) {
  console.error(red("Build aborted due to validation errors."));
  process.exit(1);
}

// Step 3: Optimize and write artifacts

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
  manifest.maps[map.name] = {};
  for (const { target, payload } of map.builds) {
    const versionedName = `${map.name}.v${target.major}`;

    const minified = JSON.stringify(payload);
    const outDataFile = join(DIST, `${versionedName}.json`);
    writeFileSync(outDataFile, minified);
    console.log(`Minified: ${outDataFile} (${minified.length} bytes)`);

    const outSchemaFile = join(DIST, `${versionedName}.schema.json`);
    cpSync(target.file, outSchemaFile);

    const dataHash = createHash("sha256")
      .update(readFileSync(outDataFile))
      .digest("hex");

    manifest.maps[map.name][`v${target.major}`] = {
      filename: basename(outDataFile),
      cid: `sha256:${dataHash}`,
      schema: basename(outSchemaFile),
    };

    for (const f of [outDataFile, outSchemaFile]) {
      const hash = createHash("sha256").update(readFileSync(f)).digest("hex");
      checksums.push(`${hash}  ${relative(DIST, f)}`);
    }
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
