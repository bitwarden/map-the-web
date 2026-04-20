import { parse as parseCss } from "css-what";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BOUNDARY_COMBINATOR = ">>>";
const MAX_COMBINATOR_DEPTH = 4;
const MAX_SELECTOR_LENGTH = 200;

const COMBINATOR_TYPES = new Set([
  "child",
  "descendant",
  "sibling",
  "adjacent",
]);

const POSITIONAL_PSEUDOS = new Set([
  "nth-child",
  "nth-of-type",
  "nth-last-child",
  "nth-last-of-type",
  "first-child",
  "last-child",
  "first-of-type",
  "last-of-type",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Format a location object into a readable path string.
 */
export function formatLocation(location) {
  const parts = [location.host];

  if (location.pathname) {
    parts.push(location.pathname);
  }

  parts.push(`[${location.category}]`);
  parts.push(`${location.kind}.${location.key}`);

  if (location.seqIndex != null) {
    parts.push(`sequence[${location.seqIndex}]`);
  }

  parts.push(`[${location.selectorIndex}]`);

  return parts.join(" > ");
}

// ---------------------------------------------------------------------------
// Segment-level checks (operate on a single CSS segment between >>> tokens)
// ---------------------------------------------------------------------------

/**
 * Check whether a parsed selector segment is "bare"; only an element tag
 * with no qualifying ID, class, attribute, or pseudo-class.
 */
function isBareElement(tokens) {
  const compound = getLastCompound(tokens);
  return compound.length === 1 && compound[0].type === "tag";
}

/**
 * Check whether a parsed selector segment is class-only; one or more class
 * selectors with no element, ID, attribute, or pseudo-class qualifier.
 */
function isClassOnly(tokens) {
  const compound = getLastCompound(tokens);
  return (
    compound.length > 0 &&
    compound.every(
      (t) =>
        t.type === "attribute" && t.name === "class" && t.action === "element",
    )
  );
}

/**
 * Check whether a parsed selector segment contains a universal selector.
 */
function hasUniversal(tokens) {
  return tokens.some((t) => t.type === "universal");
}

/**
 * Check whether a parsed selector segment is ID-only; a single ID selector
 * with no element type or other qualifier on the target compound.
 */
function isIdOnly(tokens) {
  const compound = getLastCompound(tokens);
  return (
    compound.length === 1 &&
    compound[0].type === "attribute" &&
    compound[0].name === "id" &&
    compound[0].action === "equals"
  );
}

/**
 * Return the last compound selector (tokens after the final combinator).
 */
function getLastCompound(tokens) {
  let start = 0;
  for (let i = 0; i < tokens.length; i++) {
    if (COMBINATOR_TYPES.has(tokens[i].type)) {
      start = i + 1;
    }
  }
  return tokens.slice(start);
}

/**
 * Count the number of combinators (nesting depth) in a token list.
 */
function combinatorDepth(tokens) {
  return tokens.filter((t) => COMBINATOR_TYPES.has(t.type)).length;
}

/**
 * Find positional pseudo-classes in a token list.
 */
function findPositionalPseudos(tokens) {
  return tokens
    .filter((t) => t.type === "pseudo" && POSITIONAL_PSEUDOS.has(t.name))
    .map((t) => `:${t.name}`);
}

// ---------------------------------------------------------------------------
// Full-selector checks (operate on the raw selector string)
// ---------------------------------------------------------------------------

/**
 * Validate boundary combinator (>>>) usage. Returns an error message if
 * the combinator appears at the start or end of the selector.
 */
function checkBoundaryCombinator(raw) {
  const trimmed = raw.trim();
  if (!trimmed.includes(BOUNDARY_COMBINATOR)) {
    return null;
  }

  if (trimmed.startsWith(BOUNDARY_COMBINATOR)) {
    return `Selector starts with "${BOUNDARY_COMBINATOR}" - a boundary crossing requires a host element reference on the left side`;
  }
  if (trimmed.endsWith(BOUNDARY_COMBINATOR)) {
    return `Selector ends with "${BOUNDARY_COMBINATOR}" - a boundary crossing requires a target selector on the right side`;
  }
  return null;
}

/**
 * Split a selector string on the >>> boundary combinator, returning the
 * individual CSS segments to parse independently.
 */
function splitBoundarySegments(raw) {
  return raw.split(BOUNDARY_COMBINATOR).map((s) => s.trim());
}

// ---------------------------------------------------------------------------
// Core lint logic
// ---------------------------------------------------------------------------

/**
 * Lint a single selector string. Returns { errors: [], warnings: [] }.
 */
export function lintSelector(raw, location) {
  const errors = [];
  const warnings = [];
  const formattedLocation = formatLocation(location);

  // Length warning
  if (raw.length > MAX_SELECTOR_LENGTH) {
    warnings.push({
      location: formattedLocation,
      selector: raw,
      message:
        `Selector is ${raw.length} characters long (>${MAX_SELECTOR_LENGTH}). ` +
        `Consider scoping with a "container" or simplifying the selector chain.`,
    });
  }

  // Boundary combinator structural check
  const boundaryError = checkBoundaryCombinator(raw);
  if (boundaryError) {
    errors.push({
      location: formattedLocation,
      selector: raw,
      message: boundaryError,
    });
    return { errors, warnings };
  }

  // Parse and check each segment between >>> boundaries
  const segments = splitBoundarySegments(raw);
  for (const segment of segments) {
    let parsedSelectors;
    try {
      parsedSelectors = parseCss(segment);
    } catch (e) {
      errors.push({
        location: formattedLocation,
        selector: raw,
        message: `Invalid CSS syntax in segment "${segment}" - ${e.message}`,
      });
      continue;
    }

    // css-what returns an array of selector lists (comma-separated groups).
    // Each group is an array of tokens.
    for (const tokens of parsedSelectors) {
      if (hasUniversal(tokens)) {
        errors.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Universal selector "*" is not allowed. ` +
            `Replace with a specific element type, ID, or attribute selector.`,
        });
      } else if (isBareElement(tokens)) {
        errors.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Bare element selector "${segment}" has no qualifying ID, attribute, or class. ` +
            `Add a qualifier (e.g., \`input#id\`, \`input[name='x']\`, \`input.class\`) to avoid mis-targeting.`,
        });
      } else if (isClassOnly(tokens)) {
        errors.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Class-only selector "${segment}" is not specific enough. ` +
            `Add an element type or attribute qualifier (e.g., \`button.submit\`, \`.submit[type='submit']\`).`,
        });
      }

      // Deep nesting warning
      const depth = combinatorDepth(tokens);
      if (depth > MAX_COMBINATOR_DEPTH) {
        warnings.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Selector has ${depth} levels of nesting (>${MAX_COMBINATOR_DEPTH}). ` +
            `Deeply nested selectors are brittle; they break when distant ancestors change. ` +
            `Consider scoping with a "container" to reduce nesting depth.`,
        });
      }

      // Positional pseudo-class warning
      const positionals = findPositionalPseudos(tokens);
      if (positionals.length > 0) {
        warnings.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Positional pseudo-class ${positionals.join(", ")} is fragile; it depends on node order which may not be guaranteed. ` +
            `Prefer targeting by ID, name, or other stable attributes when possible.`,
        });
      }

      // ID-only target warning
      if (isIdOnly(tokens)) {
        warnings.push({
          location: formattedLocation,
          selector: raw,
          message:
            `ID-only selector "${segment}" omits the element type. ` +
            `Prefer including the element type (e.g., \`input#email\`) for added specificity and in cases where ids are (inappropriately) duplicated.`,
        });
      }
    }
  }

  return { errors, warnings };
}

/**
 * Extract and lint all selectors from a parsed map data object.
 */
export function lintMapData(data) {
  const allErrors = [];
  const allWarnings = [];

  if (!data.hosts) {
    return { errors: allErrors, warnings: allWarnings };
  }

  for (const [host, hostEntry] of Object.entries(data.hosts)) {
    if (hostEntry == null) {
      continue;
    }

    // Host-level forms
    if (hostEntry.forms) {
      lintForms(hostEntry.forms, { host }, allErrors, allWarnings);
    }

    // Pathname-level forms
    if (hostEntry.pathnames) {
      for (const [pathname, pathEntry] of Object.entries(hostEntry.pathnames)) {
        if (pathEntry == null) {
          continue;
        }
        if (pathEntry.forms) {
          lintForms(
            pathEntry.forms,
            { host, pathname },
            allErrors,
            allWarnings,
          );
        }
      }
    }
  }

  return { errors: allErrors, warnings: allWarnings };
}

/**
 * Lint all selectors within a forms array.
 */
function lintForms(forms, context, errors, warnings) {
  for (const form of forms) {
    const category = form.category || "unknown";

    // Container selectors
    if (form.container) {
      lintSelectorArray(
        form.container,
        { ...context, category, kind: "container", key: "container" },
        errors,
        warnings,
      );
    }

    // Field selectors
    if (form.fields) {
      for (const [fieldKey, selectors] of Object.entries(form.fields)) {
        lintCompositeSelectorArray(
          selectors,
          { ...context, category, kind: "fields", key: fieldKey },
          errors,
          warnings,
        );
      }
    }

    // Action selectors
    if (form.actions) {
      for (const [actionKey, selectors] of Object.entries(form.actions)) {
        lintSelectorArray(
          selectors,
          { ...context, category, kind: "actions", key: actionKey },
          errors,
          warnings,
        );
      }
    }
  }
}

/**
 * Lint a selectorArray (array of selector strings).
 */
function lintSelectorArray(selectors, context, errors, warnings) {
  checkDuplicates(selectors, context, warnings);

  for (let i = 0; i < selectors.length; i++) {
    const result = lintSelector(selectors[i], { ...context, selectorIndex: i });
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }
}

/**
 * Lint a compositeSelectorArray (items can be strings or arrays of strings).
 */
function lintCompositeSelectorArray(selectors, context, errors, warnings) {
  // Duplicate check on top-level string entries only
  const topLevelStrings = selectors.filter((s) => typeof s === "string");
  checkDuplicates(topLevelStrings, context, warnings);

  for (let i = 0; i < selectors.length; i++) {
    const item = selectors[i];
    if (typeof item === "string") {
      const result = lintSelector(item, { ...context, selectorIndex: i });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    } else if (Array.isArray(item)) {
      // Selector sequence - lint each entry in the sequence
      checkDuplicates(item, { ...context, selectorIndex: i }, warnings);
      for (let j = 0; j < item.length; j++) {
        const result = lintSelector(item[j], {
          ...context,
          selectorIndex: i,
          seqIndex: j,
        });
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }
  }
}

/**
 * Check for duplicate selector strings within an array.
 */
function checkDuplicates(selectors, context, warnings) {
  const seen = new Set();
  for (let i = 0; i < selectors.length; i++) {
    const s = typeof selectors[i] === "string" ? selectors[i] : null;
    if (s == null) {
      continue;
    }
    if (seen.has(s)) {
      const formattedLocation = formatLocation({
        ...context,
        selectorIndex: i,
      });
      warnings.push({
        location: formattedLocation,
        selector: s,
        message: `Duplicate selector "${s}" in the same array. This is likely a copy-paste error.`,
      });
    }
    seen.add(s);
  }
}
