// ---------------------------------------------------------------------------
// Shared types for the selector linter and the map data it operates on.
// ---------------------------------------------------------------------------

/**
 * Identifies where in a map a selector lives. `host` is always known; the
 * remaining fields are filled in as the linter descends into a host's forms,
 * fields, and actions. `formatLocation` renders these into a readable path.
 */
export interface Location {
  host: string;
  pathname?: string;
  category?: string;
  kind?: string;
  key?: string;
  selectorIndex?: number;
  sequenceIndex?: number;
}

/** A single lint error or warning. `selector` is null when none applies. */
export interface Finding {
  location: string;
  selector: string | null;
  message: string;
}

/** Result of linting a selector, segment, or whole map. */
export interface LintResult {
  errors: Finding[];
  warnings: Finding[];
}

// ---------------------------------------------------------------------------
// Map data shapes (the subset the selector linter reads).
//
// Source data is parsed from JSONC, so callers should treat it as `unknown`
// and cast to `FormMapData` at the boundary; only the properties read here are
// modeled. The schema is the source of truth for the full shape.
// ---------------------------------------------------------------------------

/**
 * A field value: either a single selector array, or a sequence of selector
 * arrays (when one logical value is split across multiple inputs).
 */
export type CompositeSelectorArray = (string | string[])[];

export interface Form {
  category?: string;
  container?: string[];
  fields?: Record<string, CompositeSelectorArray>;
  actions?: Record<string, string[]>;
}

export interface HostEntry {
  forms?: Form[];
  pathnames?: Record<string, PathEntry | null>;
}

export interface PathEntry {
  forms?: Form[];
}

export interface FormMapData {
  hosts?: Record<string, HostEntry | null>;
}
