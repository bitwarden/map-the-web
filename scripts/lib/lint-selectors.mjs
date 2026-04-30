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

/**
 * Pseudo-classes whose match depends on element state at query time,
 * which may not be consistent with state at authoring time.
 */
const STATE_PSEUDOS = new Set([
  // User interaction
  "hover",
  "focus",
  "focus-within",
  "focus-visible",
  "active",
  // Link / navigation
  "link",
  "visited",
  "any-link",
  "local-link",
  "target",
  "target-within",
  // Form state
  "checked",
  "indeterminate",
  "default",
  "disabled",
  "enabled",
  "required",
  "optional",
  "valid",
  "invalid",
  "user-valid",
  "user-invalid",
  "in-range",
  "out-of-range",
  "read-only",
  "read-write",
  "placeholder-shown",
  "blank",
  // Dialog / popover / details state
  "modal",
  "open",
  "closed",
  "popover-open",
  // Media / viewport state
  "fullscreen",
  "picture-in-picture",
  // Tree content state
  "empty",
]);

/**
 * Pseudo-classes that reference a root or shadow-root context rather than a
 * form field. We cross shadow boundaries with ">>>", so these are redundant
 * or point at elements that cannot be form fields.
 */
const ROOT_PSEUDOS = new Set(["host", "host-context", "root"]);

/**
 * Pseudo-classes whose behavior depends on the query-time context
 * (caller's scope, document language/direction, custom element registration).
 * Their outcomes are not controlled by the map and make selectors less
 * portable across consumers.
 */
const CONTEXT_DEPENDENT_PSEUDOS = new Set(["scope", "lang", "dir", "defined"]);

/**
 * Element tags that are unlikely to be the target of a `container` selector
 * (leaf form controls, void elements, head-only elements). Hitting one of
 * these in a container usually indicates a field selector placed in the
 * wrong key.
 */
const NON_CONTAINER_TAGS = new Set([
  "input",
  "select",
  "textarea",
  "button",
  "option",
  "optgroup",
  "a",
  "img",
  "br",
  "hr",
  "script",
  "style",
  "meta",
  "link",
  "title",
]);

/**
 * Attribute-matcher actions (css-what names) that, with an empty value, are
 * equivalent to the existence check `[attr]`. Authors who write these almost
 * always mean something else.
 */
const EXISTENCE_EQUIVALENT_ACTIONS = new Map([
  ["any", "*="],
  ["start", "^="],
  ["end", "$="],
]);

/**
 * Attribute-matcher actions (css-what names) that, with an empty value, match
 * no elements at all. `~=` requires a non-empty whitespace-separated word.
 */
const ALWAYS_FALSE_EMPTY_ACTIONS = new Map([["element", "~="]]);

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

  // `selectorIndex`: position in the outer alternatives array
  // `sequenceIndex`: position within a selector sequence (when applicable)
  // Output reads outside-in: the outer container first, then the inner item.
  if (location.sequenceIndex != null) {
    parts.push(`sequence[${location.selectorIndex}]`);
    parts.push(`[${location.sequenceIndex}]`);
  } else {
    parts.push(`[${location.selectorIndex}]`);
  }

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
 * Walk a token list, yielding every token including those nested inside
 * functional pseudo-classes (e.g., :not(...), :is(...), :has(...)).
 * Pseudos with string .data (e.g., :lang("en")) are not descended into.
 */
function* walkTokens(tokens) {
  for (const t of tokens) {
    yield t;
    if (t.type === "pseudo" && Array.isArray(t.data)) {
      for (const subGroup of t.data) {
        yield* walkTokens(subGroup);
      }
    }
  }
}

/**
 * Return a flat array of every token, descending into functional pseudos.
 */
function collectAllTokens(tokens) {
  return [...walkTokens(tokens)];
}

/**
 * Find positional pseudo-classes in a token list.
 */
function findPositionalPseudos(tokens) {
  return tokens
    .filter((t) => t.type === "pseudo" && POSITIONAL_PSEUDOS.has(t.name))
    .map((t) => `:${t.name}`);
}

/**
 * Find state-dependent pseudo-classes in a token list.
 */
function findStatePseudos(tokens) {
  return tokens
    .filter((t) => t.type === "pseudo" && STATE_PSEUDOS.has(t.name))
    .map((t) => `:${t.name}`);
}

/**
 * Find root / shadow-root pseudo-classes in a token list.
 */
function findRootPseudos(tokens) {
  return tokens
    .filter((t) => t.type === "pseudo" && ROOT_PSEUDOS.has(t.name))
    .map((t) => `:${t.name}`);
}

/**
 * Find context-dependent pseudo-classes in a token list.
 */
function findContextDependentPseudos(tokens) {
  return tokens
    .filter((t) => t.type === "pseudo" && CONTEXT_DEPENDENT_PSEUDOS.has(t.name))
    .map((t) => `:${t.name}`);
}

/**
 * Find pseudo-elements in a token list.
 */
function findPseudoElements(tokens) {
  return tokens
    .filter((t) => t.type === "pseudo-element")
    .map((t) => `::${t.name}`);
}

/**
 * Find tag tokens whose name starts with "@" (at-rules mis-parsed as tags).
 */
function findAtRuleTags(tokens) {
  return tokens
    .filter((t) => t.type === "tag" && t.name.startsWith("@"))
    .map((t) => t.name);
}

/**
 * Find namespace-qualified tokens and return readable renderings of each
 * (e.g., "svg|rect", "*|foo", "[html|lang]").
 */
function findNamespacedTokens(tokens) {
  return tokens
    .filter((t) => t.namespace != null)
    .map((t) => {
      const name = t.name ?? "*";
      const prefix = t.namespace;
      const rendering = `${prefix}|${name}`;
      return t.type === "attribute" ? `[${rendering}]` : rendering;
    });
}

/**
 * If the target compound's tag is in NON_CONTAINER_TAGS, return that tag
 * name; otherwise return null. Used only when linting `container` entries.
 */
function findNonContainerTarget(tokens) {
  const compound = getLastCompound(tokens);
  const tag = compound.find((t) => t.type === "tag");
  if (tag && NON_CONTAINER_TAGS.has(tag.name)) {
    return tag.name;
  }
  return null;
}

/**
 * Find attribute matchers that use an operator equivalent to existence check
 * when the value is empty (*=, ^=, $= with empty value).
 */
function findExistenceEquivalentEmpty(tokens) {
  return tokens
    .filter(
      (t) =>
        t.type === "attribute" &&
        EXISTENCE_EQUIVALENT_ACTIONS.has(t.action) &&
        t.value === "",
    )
    .map((t) => `[${t.name}${EXISTENCE_EQUIVALENT_ACTIONS.get(t.action)}'']`);
}

/**
 * Find attribute matchers that match no elements when the value is empty
 * (~= with empty value).
 */
function findAlwaysFalseEmpty(tokens) {
  return tokens
    .filter(
      (t) =>
        t.type === "attribute" &&
        ALWAYS_FALSE_EMPTY_ACTIONS.has(t.action) &&
        t.value === "",
    )
    .map((t) => `[${t.name}${ALWAYS_FALSE_EMPTY_ACTIONS.get(t.action)}'']`);
}

/**
 * Return which sibling combinators (if any) appear in a token list.
 */
function findSiblingCombinators(tokens) {
  const found = [];
  for (const t of tokens) {
    if (t.type === "adjacent") {
      found.push("+");
    } else if (t.type === "sibling") {
      found.push("~");
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// Full-selector checks (operate on the raw selector string)
// ---------------------------------------------------------------------------

/**
 * Validate boundary combinator (>>>) usage at the edges of the raw selector.
 *
 * Returns an object carrying:
 *   - messages: zero, one, or two error messages (start and/or end misuse).
 *     A selector like ">>> x >>>" can misuse the combinator at both ends.
 *   - sanitized: the selector with any leading/trailing ">>>" stripped, so
 *     the caller can keep aggregating other errors against the remainder
 *     rather than bailing at the first boundary violation.
 */
function checkBoundaryCombinator(raw) {
  let sanitized = raw.trim();
  const messages = [];

  if (!sanitized.includes(BOUNDARY_COMBINATOR)) {
    return { messages, sanitized };
  }

  if (sanitized.startsWith(BOUNDARY_COMBINATOR)) {
    messages.push(
      `Selector starts with "${BOUNDARY_COMBINATOR}" - a boundary crossing requires a host element reference on the left side`,
    );
    sanitized = sanitized.slice(BOUNDARY_COMBINATOR.length).trim();
  }
  if (sanitized.endsWith(BOUNDARY_COMBINATOR)) {
    messages.push(
      `Selector ends with "${BOUNDARY_COMBINATOR}" - a boundary crossing requires a target selector on the right side`,
    );
    sanitized = sanitized.slice(0, -BOUNDARY_COMBINATOR.length).trim();
  }

  return { messages, sanitized };
}

/**
 * Split a selector string on the >>> boundary combinator, returning the
 * individual CSS segments to parse independently.
 *
 * Known limitation: this is a naive string split and will misinterpret ">>>"
 * if it appears literally inside an attribute value (e.g., `[data-x=">>>"]`).
 * This has not come up in practice for form selectors; if it does, this
 * should be replaced with a tokenizing split that respects bracket/quote
 * regions.
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

  // Empty-or-whitespace-only selector: schema's minLength:1 allows these
  // through (e.g. "   "), but they describe nothing.
  if (raw.trim() === "") {
    errors.push({
      location: formattedLocation,
      selector: raw,
      message:
        `Selector is empty or contains only whitespace. ` +
        `Remove the entry or provide a valid selector.`,
    });
    return { errors, warnings };
  }

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

  // Boundary combinator structural check. Collect any edge-misuse errors
  // and continue processing against the sanitized remainder so the author
  // gets all applicable errors (e.g., boundary misuse *and* a bare-element
  // target) in one pass rather than having to fix them serially.
  const { messages: boundaryMessages, sanitized } =
    checkBoundaryCombinator(raw);
  for (const message of boundaryMessages) {
    errors.push({ location: formattedLocation, selector: raw, message });
  }

  // If stripping the edge-misuse tokens left nothing to lint, stop here;
  // further checks would either throw or emit a redundant empty-segment
  // error for what is really the same problem.
  if (sanitized === "") {
    return { errors, warnings };
  }

  // Walk each `>>>`-separated segment: (1) reject empties explicitly, then
  // (2) parse what's left. Keeping the empty-segment check separate from
  // `parseCss` avoids relying on parser behavior for `""` (which returns `[]`
  // rather than throwing) and makes the remediation message specific to
  // the `">>>"` chain case.
  const segments = splitBoundarySegments(sanitized);
  for (let segIndex = 0; segIndex < segments.length; segIndex++) {
    const segment = segments[segIndex];
    const isFinalSegment = segIndex === segments.length - 1;

    if (segment === "") {
      errors.push({
        location: formattedLocation,
        selector: raw,
        message:
          `Segment between ">>>" combinators is empty or contains only whitespace. ` +
          `Remove the extra ">>>" or provide a selector for the boundary crossing.`,
      });
      continue;
    }

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

    // Selector list (comma) check — fires once per segment
    if (parsedSelectors.length > 1) {
      errors.push({
        location: formattedLocation,
        selector: raw,
        message:
          `Comma-separated selector list in "${segment}" is not allowed. ` +
          `List each alternative as its own entry in the selector array instead.`,
      });
    }

    // css-what returns an array of selector lists (comma-separated groups).
    // Each group is an array of tokens.
    for (const tokens of parsedSelectors) {
      // Token-level checks that should also apply inside functional pseudos
      // (e.g., :not(:nth-child(2)) still carries positional fragility).
      const allTokens = collectAllTokens(tokens);

      const atRuleTags = findAtRuleTags(allTokens);
      if (atRuleTags.length > 0) {
        errors.push({
          location: formattedLocation,
          selector: raw,
          message:
            `At-rule token "${atRuleTags[0]}" is not a valid selector. ` +
            `Remove it; at-rules (\`@media\`, \`@keyframes\`, etc.) only apply to CSS stylesheets, not DOM queries.`,
        });
      }

      const pseudoElements = findPseudoElements(allTokens);
      if (pseudoElements.length > 0) {
        errors.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Pseudo-element ${pseudoElements.join(", ")} does not represent a real DOM element. ` +
            `Target the underlying element directly (e.g., the \`input\` whose placeholder is styled, not \`::placeholder\`).`,
        });
      }

      const namespaced = findNamespacedTokens(allTokens);
      if (namespaced.length > 0) {
        errors.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Namespace-qualified token ${namespaced.join(", ")} is not supported. ` +
            `Forms are matched against HTML elements in the default namespace; remove the namespace prefix.`,
        });
      }

      const rootPseudos = findRootPseudos(allTokens);
      if (rootPseudos.length > 0) {
        errors.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Root-context pseudo-class ${rootPseudos.join(", ")} does not represent a form field. ` +
            `Target the field element directly; use ">>>" to cross shadow boundaries when needed.`,
        });
      }

      // Target-identity checks apply to the top-level compound only;
      // :not(input) means "not an input", which is not the same as "target an input".
      if (hasUniversal(tokens)) {
        errors.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Universal selector "*" is not allowed. ` +
            `Replace with a specific element type, ID, or attribute selector.`,
        });
      } else if (isBareElement(tokens)) {
        warnings.push({
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

      // Deep nesting warning — top-level structural concern only.
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
      const positionals = findPositionalPseudos(allTokens);
      if (positionals.length > 0) {
        warnings.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Positional pseudo-class ${positionals.join(", ")} is fragile; it depends on node order which may not be guaranteed. ` +
            `Prefer targeting by ID, name, or other stable attributes when possible.`,
        });
      }

      // State-dependent pseudo-class warning
      const statePseudos = findStatePseudos(allTokens);
      if (statePseudos.length > 0) {
        warnings.push({
          location: formattedLocation,
          selector: raw,
          message:
            `State-dependent pseudo-class ${statePseudos.join(", ")} matches only when the element is in a specific state; ` +
            `the field may not be in that state when the selector is consumed. ` +
            `Prefer targeting by stable attributes when possible.`,
        });
      }

      // Context-dependent pseudo-class warning
      const contextPseudos = findContextDependentPseudos(allTokens);
      if (contextPseudos.length > 0) {
        warnings.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Context-dependent pseudo-class ${contextPseudos.join(", ")} depends on how the consumer queries the page ` +
            `(scope, document language/direction, custom element registration). ` +
            `Prefer targeting by stable attributes when possible.`,
        });
      }

      // Sibling combinator warning
      const siblingCombinators = findSiblingCombinators(allTokens);
      if (siblingCombinators.length > 0) {
        warnings.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Sibling combinator ${siblingCombinators.join(", ")} depends on document order, which may not be guaranteed. ` +
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

      // Empty-value attribute matcher errors (top-level only; nested
      // inside :not() may be intentional — e.g., "has no class attr").
      const existenceEq = findExistenceEquivalentEmpty(tokens);
      if (existenceEq.length > 0) {
        const firstAttr = existenceEq[0].match(/\[(\w+)/)?.[1] ?? "attr";
        errors.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Attribute matcher ${existenceEq.join(", ")} uses a substring/prefix/suffix operator with an empty value, ` +
            `which is equivalent to the existence check \`[${firstAttr}]\`. ` +
            `Either drop the operator and value, or provide a non-empty value to match against.`,
        });
      }

      const alwaysFalse = findAlwaysFalseEmpty(tokens);
      if (alwaysFalse.length > 0) {
        errors.push({
          location: formattedLocation,
          selector: raw,
          message:
            `Attribute matcher ${alwaysFalse.join(", ")} uses \`~=\` with an empty value, ` +
            `which requires a non-empty whitespace-separated word and so matches no elements. ` +
            `Either drop the operator and value, or provide a non-empty word to match against.`,
        });
      }

      // Container-misuse warning: only when linting a `container` entry,
      // and only on the final segment (the actual target after any >>>).
      if (location.kind === "container" && isFinalSegment) {
        const badTag = findNonContainerTarget(tokens);
        if (badTag) {
          warnings.push({
            location: formattedLocation,
            selector: raw,
            message:
              `Container selector targets <${badTag}>, which is not typically a wrapping element. ` +
              `If this selector identifies a form field, move it under \`fields\`; if it identifies an action, move it under \`actions\`.`,
          });
        }
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
  checkDuplicates(selectors, context, errors);

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
  // Duplicate check on top-level string entries. Pass the original array so
  // the reported selectorIndex reflects the author's file position; nested
  // sequence arrays are skipped by `checkDuplicates`'s non-string guard.
  checkDuplicates(selectors, context, errors);

  for (let i = 0; i < selectors.length; i++) {
    const item = selectors[i];
    if (typeof item === "string") {
      const result = lintSelector(item, { ...context, selectorIndex: i });
      errors.push(...result.errors);
      warnings.push(...result.warnings);
    } else if (Array.isArray(item)) {
      // Selector sequence - lint each entry in order.
      //
      // Intentionally do NOT dedupe within a sequence. The outer composite
      // array conveys distinct locations where a single value/concept is
      // represented; duplicates there are always invalid and caught above.
      // An inner sequence describes how a single value is split across
      // inputs at one location, and we expect additional authoring guidance to
      // use duplicate entries; flagging duplicates here would preclude that.
      for (let j = 0; j < item.length; j++) {
        const result = lintSelector(item[j], {
          ...context,
          selectorIndex: i,
          sequenceIndex: j,
        });
        errors.push(...result.errors);
        warnings.push(...result.warnings);
      }
    }
  }
}

/**
 * Check for duplicate selector strings within a top-level alternatives array
 * (`selectorArray` or `compositeSelectorArray`). Non-string items (e.g., nested
 * selector sequences) are skipped; duplicates inside a sequence are allowed
 * and handled by the caller.
 */
function checkDuplicates(selectors, context, errors) {
  const seen = new Set();
  for (let i = 0; i < selectors.length; i++) {
    const s = typeof selectors[i] === "string" ? selectors[i] : null;

    if (s == null) {
      continue;
    }

    if (seen.has(s)) {
      errors.push({
        location: formatLocation({ ...context, selectorIndex: i }),
        selector: s,
        message: `Duplicate selector "${s}" in the same array. This is likely a copy-paste error.`,
      });
    }
    seen.add(s);
  }
}
