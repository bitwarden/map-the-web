import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { cyan, dim, green, red, yellow } from "./utils.mjs";

const PROJECT_ROOT = process.cwd();
const WATCH_PATHS = ["maps", "scripts/manifest.schema.json"];
const DEBOUNCE_MILLISECONDS = 150;

let serverProcess = null;
let buildProcess = null;
let rebuildQueued = false;
let debounceTimer = null;
let shuttingDown = false;

function startServer() {
  serverProcess = spawn(process.execPath, ["scripts/serve.mjs"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: process.env,
  });

  serverProcess.on("exit", (code, signal) => {
    serverProcess = null;

    if (shuttingDown) {
      return;
    }

    console.error(
      red(
        `Static server exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"}).`,
      ),
    );
    shutdown(1);
  });
}

function runBuild() {
  if (buildProcess !== null) {
    rebuildQueued = true;

    return;
  }

  console.log(cyan("[watch] rebuilding…"));

  buildProcess = spawn(process.execPath, ["scripts/build.mjs"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: process.env,
  });

  buildProcess.on("exit", (code) => {
    buildProcess = null;

    if (code === 0) {
      console.log(green("[watch] build OK"));
    } else {
      console.error(red(`[watch] build failed (exit ${code ?? "null"})`));
    }

    if (rebuildQueued && !shuttingDown) {
      rebuildQueued = false;
      runBuild();
    }
  });
}

function scheduleBuild() {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBuild();
  }, DEBOUNCE_MILLISECONDS);
}

async function startWatchers() {
  const watchers = [];

  for (const relativePath of WATCH_PATHS) {
    const absolutePath = resolve(PROJECT_ROOT, relativePath);

    let stats;

    try {
      stats = await stat(absolutePath);
    } catch {
      console.warn(yellow(`[watch] skipping missing path: ${relativePath}`));
      continue;
    }

    const watcher = watch(
      absolutePath,
      { recursive: stats.isDirectory() },
      (eventType, filename) => {
        const label = filename ? `${relativePath}/${filename}` : relativePath;

        console.log(dim(`[watch] ${eventType}: ${label}`));
        scheduleBuild();
      },
    );

    watcher.on("error", (error) => {
      console.error(red(`[watch] watcher error on ${relativePath}: ${error.message}`));
    });

    watchers.push(watcher);
    console.log(green(`[watch] watching ${cyan(relativePath)}`));
  }

  return watchers;
}

function shutdown(exitCode) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  if (buildProcess !== null) {
    buildProcess.kill("SIGTERM");
  }

  if (serverProcess !== null) {
    serverProcess.kill("SIGTERM");
  }

  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => shutdown(0));
}

startServer();
await startWatchers();
runBuild();
