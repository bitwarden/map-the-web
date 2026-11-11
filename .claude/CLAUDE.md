# Map the Web

Map the Web publishes curated, human-verified "Maps": JSON documents that
describe real websites lacking rich semantics or adopted standards. The only Map
today is the Forms Map (`maps/forms/`), which uses CSS selectors to locate form
fields on specific hosts. The TypeScript in `scripts/` validates, lints and
builds the Maps into GitHub Release artifacts.

The project is experimental. Schemas, data shapes and tag conventions can still
change, but the build enforces the current versioning contract, so follow it.

## Authoritative docs

Read these before editing; this file only highlights what is easy to break.

- `README.md`: mapping philosophies, schema versioning, release tags,
  backwards compatibility and the major version bump procedure.
- `maps/forms/README.md`: Forms Map structure, entry hierarchy, selector
  philosophy, null semantics, authoring guidelines and what counts as a
  patch, minor or major schema change.

## Layout

- `maps/<name>/<name>.jsonc`: source data (JSONC, comments allowed).
- `maps/<name>/<name>.v<N>.schema.json`: JSON Schema per major version.
- `scripts/build.mts`: builds `dist/` (minified Maps, schemas, `manifest.json`,
  checksums) and holds the `MIGRATIONS` table.
- `scripts/validate-schemas.mts`: validates Map data against its schema.
- `scripts/lint-selectors.mts` and `scripts/lib/`: the Forms Map selector
  linter and its tests.
- `scripts/manifest.schema.json`: contract for the release `manifest.json`.

## Commands

Node and npm versions come from `.nvmrc` and `package.json` `engines`. Scripts
run as `.mts` files directly in Node; there is no compile step.

```bash
npm ci
npm run check          # everything CI runs: prettier, typecheck, lint:md, validate, lint:selectors, test
npm run build          # rm -rf dist, then build release artifacts into dist/
npm test               # node --test scripts/**/*.test.mts
npm run validate       # schema validation of Map data
npm run lint:selectors # Forms Map selector linter
npm run lint:md        # remark
npm run prettier:fix   # format everything
npm run serve          # serve built artifacts locally (PORT env var, default 8000)
npm run serve:watch
```

The Husky pre-commit hook runs `lint-staged`: prettier on JSON/JSONC, schema
validation on `maps/**/*.jsonc`, the selector linter on `maps/forms/*.jsonc`,
and remark on Markdown.

## Schema versioning and migrations

This is the part of the repo that is easiest to break. Do not change a
published schema's shape in place.

- Each Map's `schemaVersion` must match the `properties.schemaVersion.const` of
  exactly one schema file, and that file's name must carry the same major.
- A schema's `$id` must end with its filename.
- Use the bump rules in `maps/forms/README.md` (Schema Version Bumps) to decide
  patch, minor or major. A minor or patch bump edits the current schema and the
  data's `schemaVersion`.
- A major bump adds a new `<name>.v<N+1>.schema.json` next to the old one,
  updates the source data, registers a downward migration in
  `MIGRATIONS["<name>"][N]` in `scripts/build.mts`, and marks the old schema
  `"deprecated": true`. Follow the full checklist in `README.md` (Major Version
  Bumps).
- Migrations project the latest source shape directly to each older target
  major; they do not chain.
- Prerelease Maps (major `0`) skip this workflow and are dropped when they
  graduate to `v1`.

After any schema or migration change, run `npm run check && npm run build` and
confirm `dist/manifest.json` lists the expected versions.

## Release tags

Releases use date-based tags `v<YYYYMMDD>.<run>` (for example `v20260324.1`).
`.github/workflows/release.yml` runs on a pushed tag or a manual dispatch (which
creates the next tag for the day) and rejects any other tag format. Tags track
data changes and are independent of schema versions.

## Editing the Forms Map

Follow `maps/forms/README.md`. The rules that are most often missed:

- Maps describe the page, never how a consumer should behave.
- A URL resolves to only the most specific entry. A pathname entry with
  `forms`, a matching fragment, or `null` hides all host-level entries for that
  page.
- `null` means "evaluated, no relevant forms"; omitting a key means "no
  information". They are not interchangeable.
- Host, pathname and fragment keys are exact matches. No wildcards; subdomains
  and non-default ports are separate hosts. Author under the non-`www` host.
- Selectors are brittle on purpose so that page changes trigger review. Avoid
  user-facing values such as `placeholder`, `aria-label` and `title`.
- Never map CAPTCHAs, honeypots or other anti-automation fields.
- Verify every selector in a browser against the rendered page.

## When to stop and ask

- Before any major schema bump, edit to a published schema's shape, or new Map.
- When you cannot verify a selector against the live, rendered page. The README
  requires Map content to be vetted by humans, so report the selector as
  unverified instead of committing it as fact.

## Selector linter in CI

CI checks out full history because `lint-selectors.mts` diffs against
`origin/<base-ref>` to scope PR annotations to changed lines. Inline PR
annotations are gated on the `ENABLE_SELECTOR_LINT_PR_FEEDBACK` repo variable.

## Contributing

See `CONTRIBUTING.md` and <https://contributing.bitwarden.com/>. Commit
messages use the Jira key prefix, for example `[PM-12345] Add forms map entry
for example.com`.
