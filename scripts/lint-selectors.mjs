import { lintMapData } from "./lib/lint-selectors.mjs";
import stripJsonComments from "strip-json-comments";
import { readFileSync } from "fs";
import { glob } from "node:fs/promises";

// ---------------------------------------------------------------------------
// Environment configuration
// ---------------------------------------------------------------------------

// Emit GitHub Actions workflow commands (inline PR annotations) only when
// running inside Actions AND the repo variable ENABLE_SELECTOR_LINT_PR_FEEDBACK
// is explicitly set to "true".
const inGitHubActions = process.env.GITHUB_ACTIONS === "true";
const prFeedbackEnabled =
  process.env.ENABLE_SELECTOR_LINT_PR_FEEDBACK === "true";
const emitAnnotations = inGitHubActions && prFeedbackEnabled;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const green = (s) => `\x1b[32m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

/**
 * Best-effort line-number lookup for a lint finding. Progressively narrows
 * the search by walking the logical location (host, optional pathname,
 * kind.key), then returns the line of the first occurrence of the selector
 * within that scope. Returns null when any anchor or the selector can't be
 * located; callers should fall back to the logical location in that case.
 */
function findLineInSource(source, formattedLocation, selector) {
  if (!selector) {
    return null;
  }

  const parts = formattedLocation.split(" > ");
  let position = 0;

  // 1. Host is always the first segment.
  position = source.indexOf(`"${parts[0]}":`);
  if (position === -1) {
    return null;
  }

  // 2. Optional pathname appears as the second segment when it starts with "/".
  if (parts[1] && parts[1].startsWith("/")) {
    const next = source.indexOf(`"${parts[1]}":`, position);
    if (next === -1) {
      return null;
    }
    position = next;
  }

  // 3. kind.key (e.g., "fields.username", "actions.submit", "container.container")
  //    narrows the search to the specific array that holds the selector.
  const kindKey = parts.find((p) => /^(fields|actions|container)\./.test(p));
  if (kindKey) {
    const key = kindKey.split(".")[1];
    const next = source.indexOf(`"${key}":`, position);
    if (next !== -1) {
      position = next;
    }
    // If the key isn't found we fall back to the host-scoped search rather
    // than bailing; the selector anchor below will still point somewhere
    // reasonable.
  }

  // 4. Find the first occurrence of the selector within the scope. For
  //    duplicate-selector errors, either occurrence is in the same cluster
  //    and points the author at the relevant area.
  position = source.indexOf(JSON.stringify(selector), position);
  if (position === -1) {
    return null;
  }

  return source.slice(0, position).split("\n").length;
}

/**
 * Escape a message for a GitHub Actions workflow command.
 * https://docs.github.com/en/actions/reference/workflow-commands-for-github-actions#about-workflow-commands
 */
function ghEscape(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

function ghWorkflowCommand(severity, file, codeLine, title, message) {
  const parts = [`file=${ghEscape(file)}`];
  if (codeLine != null) {
    parts.push(`line=${codeLine}`);
  }
  if (title) {
    parts.push(`title=${ghEscape(title)}`);
  }
  return `::${severity} ${parts.join(",")}::${ghEscape(message)}`;
}

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
  let source;
  try {
    source = readFileSync(file, "utf-8");
  } catch (e) {
    console.error(red(`Failed to read ${file}: ${e.message}`));
    totalErrors++;
    continue;
  }

  // `strip-json-comments` preserves line counts (replaces comments with
  // whitespace), so line numbers from the stripped text match the original
  // file. Search in the stripped version so commented-out selectors don't
  // produce false matches.
  const stripped = stripJsonComments(source);

  let data;
  try {
    data = JSON.parse(stripped);
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
    const codeLine = findLineInSource(stripped, w.location, w.selector);
    const suffix = codeLine != null ? ` (line ${codeLine})` : "";
    console.warn(
      yellow(`Warning: ${file} - ${w.location}${suffix}\n`) +
        dim(`  selector: ${w.selector}\n`) +
        yellow(`  ${w.message}\n`),
    );
    if (emitAnnotations) {
      console.log(
        ghWorkflowCommand(
          "warning",
          file,
          codeLine,
          `Selector lint: ${w.location}`,
          w.message,
        ),
      );
    }
  }

  for (const e of errors) {
    const codeLine = findLineInSource(stripped, e.location, e.selector);
    const suffix = codeLine != null ? ` (line ${codeLine})` : "";
    console.error(
      red(`Error: ${file} - ${e.location}${suffix}\n`) +
        dim(`  selector: ${e.selector}\n`) +
        red(`  ${e.message}\n`),
    );
    if (emitAnnotations) {
      console.log(
        ghWorkflowCommand(
          "error",
          file,
          codeLine,
          `Selector lint: ${e.location}`,
          e.message,
        ),
      );
    }
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
