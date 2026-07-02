import { spawn, type ChildProcess } from "node:child_process";
import { watch, type FSWatcher } from "node:fs";
import { stat } from "node:fs/promises";
import { resolve } from "node:path";
import { cyan, dim, green, red, yellow } from "./utils.mts";

const PROJECT_ROOT = process.cwd();
const WATCH_PATHS = ["maps", "scripts/manifest.schema.json"];
const DEBOUNCE_MILLISECONDS = 150;

let serverProcess: ChildProcess | null = null;
let buildProcess: ChildProcess | null = null;
let rebuildQueued = false;
let debounceTimer: NodeJS.Timeout | null = null;
let shuttingDown = false;

function startServer(): void {
  serverProcess = spawn(process.execPath, ["scripts/serve.mts"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: process.env,
  });

  serverProcess.on(
    "exit",
    (code: number | null, signal: NodeJS.Signals | null) => {
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
    },
  );
}

function runBuild(): void {
  if (buildProcess !== null) {
    rebuildQueued = true;

    return;
  }

  console.log(cyan("[watch] rebuilding…"));

  buildProcess = spawn(process.execPath, ["scripts/build.mts"], {
    cwd: PROJECT_ROOT,
    stdio: "inherit",
    env: process.env,
  });

  buildProcess.on("exit", (code: number | null) => {
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

function scheduleBuild(): void {
  if (debounceTimer !== null) {
    clearTimeout(debounceTimer);
  }

  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    runBuild();
  }, DEBOUNCE_MILLISECONDS);
}

async function startWatchers(): Promise<FSWatcher[]> {
  const watchers: FSWatcher[] = [];

  for (const relativePath of WATCH_PATHS) {
    const absolutePath = resolve(PROJECT_ROOT, relativePath);

    let isDirectory: boolean;

    try {
      const stats = await stat(absolutePath);

      isDirectory = stats.isDirectory();
    } catch {
      console.warn(yellow(`[watch] skipping missing path: ${relativePath}`));
      continue;
    }

    const watcher = watch(
      absolutePath,
      { recursive: isDirectory },
      (eventType: string, filename: string | null) => {
        const label = filename ? `${relativePath}/${filename}` : relativePath;

        console.log(dim(`[watch] ${eventType}: ${label}`));
        scheduleBuild();
      },
    );

    watcher.on("error", (error: Error) => {
      console.error(
        red(`[watch] watcher error on ${relativePath}: ${error.message}`),
      );
    });

    watchers.push(watcher);
    console.log(green(`[watch] watching ${cyan(relativePath)}`));
  }

  return watchers;
}

function shutdown(exitCode: number): void {
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

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => shutdown(0));
}

startServer();
await startWatchers();
runBuild();
