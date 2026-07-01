import { lintMapData } from "./lib/lint-selectors.mts";
import stripJsonComments from "strip-json-comments";
import { readFileSync } from "fs";
import { glob } from "node:fs/promises";
import { red, yellow, green, dim } from "./utils.mts";
import { execFileSync } from "node:child_process";
import type { FormMapData } from "./lib/types.mts";

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

// On pull_request runs, scope inline annotations to lines this PR actually
// changes. Findings on untouched lines still log to the console so nothing is
// silently dropped, but they don't add inline noise to files reviewers
// aren't looking at.
const isPullRequest = process.env.GITHUB_EVENT_NAME === "pull_request";
const baseRef = process.env.GITHUB_BASE_REF;
const scopeAnnotationsToDiff = emitAnnotations && isPullRequest && !!baseRef;

/**
 * Return the set of post-image line numbers the current branch changes in
 * `file` relative to the PR base ref. Returns null when the diff can't be
 * computed (e.g., base ref not fetched), signaling callers to fall back to
 * emitting every annotation.
 */
function getChangedLinesForFile(file: string): Set<number> | null {
  let output: string;
  try {
    output = execFileSync(
      "git",
      ["diff", "--unified=0", `origin/${baseRef}...`, "--", file],
      { encoding: "utf-8", stdio: ["ignore", "pipe", "pipe"] },
    );
  } catch {
    return null;
  }

  const changed = new Set<number>();
  for (const line of output.split("\n")) {
    // Hunk header: "@@ -<old-start>[,<old-count>] +<new-start>[,<new-count>] @@"
    const match = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/.exec(line);
    if (!match) {
      continue;
    }
    const start = parseInt(match[1], 10);
    // A count of 0 means deletion-only at that position; no added lines to annotate.
    const count = match[2] != null ? parseInt(match[2], 10) : 1;
    for (let i = 0; i < count; i++) {
      changed.add(start + i);
    }
  }
  return changed;
}

/**
 * Best-effort line-number lookup for a lint finding. Progressively narrows
 * the search by walking the logical location (host, optional pathname,
 * kind.key), then returns the line of the first occurrence of the selector
 * within that scope. Returns null when any anchor or the selector can't be
 * located; callers should fall back to the logical location in that case.
 */
function findLineInSource(
  source: string,
  formattedLocation: string,
  selector: string | null,
): number | null {
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
function ghEscape(value: string): string {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A");
}

function ghWorkflowCommand(
  severity: string,
  file: string,
  codeLine: number | null,
  title: string,
  message: string,
): string {
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
  let source: string;
  try {
    source = readFileSync(file, "utf-8");
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(red(`Failed to read ${file}: ${message}`));
    totalErrors++;
    continue;
  }

  // `strip-json-comments` preserves line counts (replaces comments with
  // whitespace), so line numbers from the stripped text match the original
  // file. Search in the stripped version so commented-out selectors don't
  // produce false matches.
  const stripped = stripJsonComments(source);

  let data: FormMapData;
  try {
    data = JSON.parse(stripped) as FormMapData;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(red(`Failed to parse ${file}: ${message}`));
    totalErrors++;
    continue;
  }

  const { errors, warnings } = lintMapData(data);

  if (errors.length === 0 && warnings.length === 0) {
    console.log(green(`Selectors OK: ${file}`));
    continue;
  }

  let changedLines: Set<number> | null | undefined;
  if (scopeAnnotationsToDiff) {
    changedLines = getChangedLinesForFile(file);
    if (changedLines == null) {
      console.warn(
        yellow(
          `Could not compute PR diff for ${file}; emitting annotations for all findings.`,
        ),
      );
    }
  }

  // A finding without a resolved line number can't be verified as in-diff,
  // so it's dropped from inline annotations under diff-scoping. Console
  // output is unaffected.
  const shouldAnnotate = (codeLine: number | null): boolean => {
    if (!emitAnnotations) {
      return false;
    }
    if (!scopeAnnotationsToDiff || changedLines == null) {
      return true;
    }
    return codeLine != null && changedLines.has(codeLine);
  };

  for (const w of warnings) {
    const codeLine = findLineInSource(stripped, w.location, w.selector);
    const suffix = codeLine != null ? ` (line ${codeLine})` : "";
    console.warn(
      yellow(`Warning: ${file} - ${w.location}${suffix}\n`) +
        dim(`  selector: ${w.selector}\n`) +
        yellow(`  ${w.message}\n`),
    );
    if (shouldAnnotate(codeLine)) {
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
    if (shouldAnnotate(codeLine)) {
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
