# Let's Map the Web!

Map the Web offers curated guidance for interacting with websites lacking rich
semantics or fully-adopted standards.

> [!IMPORTANT]
> This project is in a non-stable, experimental state.
>
> Schemas, data shapes,
> release cadence, and tag conventions may change without notice and without
> backwards-compatibility guarantees. Individual Maps may be added, restructured,
> or removed between releases. Consumers should be prepared for breaking changes.
> See [Versioning](#versioning) for the current scheme.

- [Let's Map the Web!](#lets-map-the-web)
  - [Goals and Intent](#goals-and-intent)
    - [Mapping Philosophies](#mapping-philosophies)
  - [Limitations](#limitations)
  - [Using Maps](#using-maps)
    - [Versioning](#versioning)
      - [Schema Versions](#schema-versions)
      - [Release Tags](#release-tags)
      - [Prerelease Maps](#prerelease-maps)
      - [Backwards Compatibility](#backwards-compatibility)
    - [Releases](#releases)
  - [Authoring Maps](#authoring-maps)
    - [Major Version Bumps](#major-version-bumps)
  - [Glossary](#glossary)

## Goals and Intent

Map the Web offers guidance on website content via a collection of living
website "Maps". These Maps describe various categorical concerns of real
websites. While semantics, standards, and specifications can help software
developers navigate data concerns on the web, such conventions are sometimes
incomplete, not widely implemented, or even leave a particular concern
completely unaddressed. The primary goal of this project is to map out live
websites that lack the implementation details that would otherwise enable
software to interact with them as intended.

### Mapping Philosophies

With the aforementioned goals and intent in mind, Maps should:

- only describe a website or website page, not how a particular consumer of Maps
  should behave
- only describe websites where a given concern is not otherwise accessible
- only capture shared web concerns; local network configurations are out of
  scope
- be as specific as possible while avoiding unrelated concerns
- be removed from a given Map if a site becomes navigable by other standard
  means for those concerns
- avoid staleness and be kept up-to-date

Because this project strives to deliver accountable curated guidance, the above
concerns must ultimately and necessarily be vetted/validated by humans.

Maps are not intended to replace standard functionalities of the web, only to
serve as a stopgap pending broader consensus and adoption of accepted standards.

## Limitations

While this project aspires to map all discovered gaps of the web, this is
largely expected to be unachievable, given the size and ever-changing nature of
the web. Consequently Maps should not be consumed as an absolute guarantee;
websites can and will change.

Map-specific limitations can be found in their respective README documents.

## Using Maps

Each Map lives in its own subdirectory under `maps/`, named after its core
concern (e.g. `maps/forms/`). A Map directory contains the JSON data file
(`forms.jsonc`), its versioned schema (e.g. `forms.v0.schema.json`), and a `README.md` documenting
the Map's structure and usage.

### Versioning

This project has two distinct versioning schemes for independent concerns:
schema versions and release tags.

#### Schema Versions

Each Map file includes a required top-level `schemaVersion` field that identifies
which revision of its schema the file conforms to. Schema versions use
[semantic versioning](https://semver.org/):

- **Major**: Breaking changes to the data structure or semantics (e.g.
  removing/renaming required properties, adding required properties)
- **Minor**: Backwards-compatible additions (e.g. new optional properties, new
  enum values)
- **Patch**: Documentation or schema clarifications with no data-level impact

Consumers who wish to validate their Map data should check the
`schemaVersion` field before processing a Map and reject or warn on unrecognized
major versions. Build filenames include the
schema major version (e.g. `forms.v1.json`), so a breaking schema change can
ship alongside the previous version (`forms.v1.json` and `forms.v2.json` in the
same release), allowing legacy consumers to continue fetching the version they
support.

The major/minor/patch rules above apply once a Map has reached a stable major
version (`1.0.0` or later). Maps still under initial development use a separate
prerelease scheme; see [Prerelease Maps](#prerelease-maps).

Map-specific versioning guidance can be found in their respective README
documents.

#### Release Tags

Release tags use a date-based format: `v<YYYYMMDD>.<run>` (e.g. `v20260324.1`).
The date indicates when the build was produced; the run number disambiguates
multiple releases on the same day. Release tags reflect changes to Map _data_
(new or updated host entries) and are independent of schema versions.

#### Prerelease Maps

A Map is considered **prerelease** when its `schemaVersion` major component is
`0` (e.g. `0.1.0`, `0.7.2`). This follows the [semantic versioning](https://semver.org/#spec-item-4)
convention that `0.y.z` versions are reserved for initial development, where
"anything MAY change at any time" and "the public API SHOULD NOT be considered
stable".

Prerelease Maps carry no compatibility, stability, or longevity promises:

- The schema, key sets, value semantics, and overall structure may change in
  any way between releases. The major/minor/patch bump rules described in
  [Schema Versions](#schema-versions) do not apply within `0.y.z`; version
  bumps are at the Map author's discretion.
- A prerelease Map may be removed from a release entirely without prior
  deprecation, notice, or transition period.
- The [Backwards Compatibility](#backwards-compatibility) commitment does not
  apply to prerelease Maps.
- Consumers should treat each release as effectively independent and re-verify
  their integration when updating.

Build filenames follow the same major-version convention as stable Maps. A Map
at `schemaVersion: "0.3.0"` builds to `<map name>.v0.json` and ships alongside
its schema as `<map name>.v0.schema.json`.

When a prerelease Map reaches stability, its `schemaVersion` bumps to `1.0.0`
and subsequent releases produce `<map name>.v1.json`. The corresponding
`<map name>.v0.json` artifacts may continue to ship for a transition window or
may be dropped from the very next release; consumers must not rely on `v0`
artifacts remaining available once a `v1` exists.

#### Backwards Compatibility

For Maps at a stable major version (`1.0.0` or later), this project commits
to supporting the schema **one major version back** from the current major
version for a **minimum of six months** after the current major version first
releases. During this window, each release contains both
`<map name>.v<N>.json` and `<map name>.v<N-1>.json` artifacts (and their
corresponding schemas), so consumers can upgrade on their own timeline.

After the six-month window, support for `v<N-1>` may be extended or dropped
from subsequent releases without warning. Consumers depending on `v<N-1>`
should plan to upgrade within that window, or pin to a specific release tag
that still includes the artifact.

A stable Map's schema may be marked **deprecated** at any time to signal
that it has entered its end-of-life support window. Deprecation is authored
by setting the standard
[JSON Schema 2020-12 `"deprecated"`](https://json-schema.org/draft/2020-12/json-schema-validation#name-deprecated)
keyword at the root of the schema file; the release manifest mirrors this
with `"deprecated": true` on the matching version entry. The flag does not
indicate how long the support window will be, nor does it imply that a
newer major necessarily exists; it tells consumers to expect the schema to
be removed in a future release once the window closes. Consumers are
encouraged to read the manifest and surface a warning to their maintainers
prompting a migration; consumers that run a JSON Schema validator that
surfaces annotations against the shipped schema will also see the
deprecation.

This commitment does not apply to [Prerelease Maps](#prerelease-maps),
which are dropped in their entirety upon graduation to a stable major.

### Releases

Map data is published as optimized builds via
[GitHub Releases](https://github.com/bitwarden/map-the-web/releases). Each
release contains minified Map JSON files, their schemas, a build manifest, and
SHA-256 checksums.

```text
Latest build (always points to the newest release):
https://<project URL>/releases/latest/download/<map name>.v<N>.json

Pinned build (locked to a specific release tag):
https://<project URL>/releases/download/<tag>/<map name>.v<N>.json
```

`<N>` is the schema major version (e.g. `0` for prerelease Maps, `1` for the
first stable major).

Example: <https://github.com/bitwarden/map-the-web/releases/latest/download/forms.v0.json>

Each release includes a `manifest.json` with build metadata (timestamp, git SHA,
and per-map schema versions) that consumers can use to check staleness or verify
compatibility. A `manifest.schema.json` is shipped alongside so consumers can
validate the manifest's shape against the same contract the build enforces.

Each release also includes the corresponding schema file for each Map (e.g.
`forms.v0.schema.json` alongside `forms.v0.json`). Consumers that validate Map
data should validate against the schema included in the same release, as minor
version bumps may introduce new fields or values that would not pass validation
against a stale schema copy. Consumers that do not validate should be prepared
to gracefully handle unrecognized fields or values introduced by minor or patch
schema changes.

## Authoring Maps

Project-wide mapping principles are described under
[Mapping Philosophies](#mapping-philosophies). Map-specific authoring
guidance (e.g. how to choose selectors for the Forms Map) lives in each
Map's own `README.md`. This section captures cross-Map authoring workflows
that affect the project's build and release contract.

### Major Version Bumps

When a Map's schema needs a breaking change (see [Schema Versions](#schema-versions)
and the Map's own README for what qualifies as breaking for that Map), the
maintainer ships the new major alongside the previous one by following these
steps:

1. **Create the new schema file.** Copy
   `maps/<name>/<name>.v<N>.schema.json` to `<name>.v<N+1>.schema.json`. In
   the new file:
   - Update `$id` so its last path segment is the new filename.
   - Update `properties.schemaVersion.const` to the new version (e.g. `"2.0.0"`).
   - Update `title` and `description` if they embed version-specific language.
2. **Apply the breaking changes** in the new schema only. The old schema
   continues to ship unchanged so existing consumers aren't broken.
3. **Update the source data file** (`maps/<name>/<name>.jsonc`) to set
   `schemaVersion` to the new value and adjust the data shape to satisfy the
   new schema.
4. **Register a downward migration** in
   [`scripts/build.mjs`](scripts/build.mjs). Add an entry under
   `MIGRATIONS["<name>"]` keyed by the previous major (`N`); the function
   projects new-source-shape data into old-schema-shape data.
5. **Mark the previous schema deprecated** by adding `"deprecated": true` at
   the root of `<name>.v<N>.schema.json`. The flag flows through to the
   release manifest and the auto-generated release-notes "Deprecations"
   section. See [Backwards Compatibility](#backwards-compatibility) for the
   support semantics.
6. **Update the Map's own README** if the schema introduces or changes
   fields, key sets, categories, or other documented behavior.
7. **Verify with `npm run check && npm run build`.** A green build emits
   both `<name>.v<N>.json` and `<name>.v<N+1>.json` (with their schemas)
   and records `"deprecated": true` against the older entry in
   `dist/manifest.json`.

The build enforces these author invariants:

- The schema filename's major and `properties.schemaVersion.const` major must
  agree.
- The schema's `$id` must end with its filename.
- The source's `schemaVersion` must match exactly one schema's `const`.
- A migration must be registered for every target major below the source's.
- A warning is emitted when a Map has more than one non-deprecated schema
  (the typical healthy state is exactly one current schema; a draft schema
  above source is the expected exception).

Per-Map rules for what counts as a major change live in each Map's own
README, since the criteria depend on the Map's shape and consumer
expectations.

> [!NOTE]
> Prerelease Maps (`v0`) don't follow this workflow; they are dropped in
> their entirety upon graduation to a stable `v1`. See
> [Prerelease Maps](#prerelease-maps).

## Glossary

- **Map**: A JSON structure describing a categorical concern of real websites.
  Each Map focuses on a single concern (e.g. forms) and lives in a named
  subdirectory under `maps/` alongside its documentation and schema.

- **Consumer**: Any application or tool that reads and acts on a Map. The Map
  describes what exists on a page; the consumer decides what to do with that
  information.

- **Author**: Any maintainer of source Maps that get built to release channels.

- **Heuristic detection**: Automated inference of page element purposes based on
  attributes, labels, or surrounding markup.

- **Prerelease Map**: A Map whose `schemaVersion` major component is `0`. Its
  shape, contents, and continued availability carry no compatibility or
  longevity guarantees. See [Prerelease Maps](#prerelease-maps).

- **Deprecated schema**: A Map schema major version that has entered its
  end-of-life support window. Indicated by `"deprecated": true` at the
  schema root and on the matching entry in the release manifest. Consumers
  should plan migration before the schema is removed in a future release.
  See [Backwards Compatibility](#backwards-compatibility).
