import {
  createServer,
  type IncomingMessage,
  type ServerResponse,
} from "node:http";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { cyan, green, red, yellow } from "./utils.mts";

const DIST_DIRECTORY = resolve(process.cwd(), "dist");
const DEFAULT_PORT = 8000;
const port = Number.parseInt(process.env.PORT ?? "", 10) || DEFAULT_PORT;
const host = process.env.HOST ?? "127.0.0.1";

const CONTENT_TYPES: Record<string, string> = {
  ".json": "application/json; charset=utf-8",
  ".jsonc": "application/json; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".sha256": "text/plain; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

interface ResolvedTarget {
  path: string;
  size: number;
}

function contentTypeFor(filePath: string): string {
  const extension = extname(filePath).toLowerCase();

  return CONTENT_TYPES[extension] ?? "application/octet-stream";
}

function resolveSafePath(requestPath: string): string | null {
  let decoded: string;

  try {
    decoded = decodeURIComponent(requestPath.split("?")[0]);
  } catch {
    return null;
  }

  const normalized = normalize(decoded).replace(/^([/\\])+/, "");
  const candidate = resolve(DIST_DIRECTORY, normalized);

  if (
    candidate !== DIST_DIRECTORY &&
    !candidate.startsWith(DIST_DIRECTORY + sep)
  ) {
    return null;
  }

  return candidate;
}

async function resolveTarget(
  candidate: string,
): Promise<ResolvedTarget | null> {
  try {
    const stats = await stat(candidate);

    if (stats.isDirectory()) {
      const indexPath = join(candidate, "index.html");

      try {
        const indexStats = await stat(indexPath);

        if (indexStats.isFile()) {
          return { path: indexPath, size: indexStats.size };
        }
      } catch {
        return null;
      }

      return null;
    }

    if (stats.isFile()) {
      return { path: candidate, size: stats.size };
    }

    return null;
  } catch {
    return null;
  }
}

function writePlain(
  response: ServerResponse,
  statusCode: number,
  message: string,
): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
  });
  response.end(message);
}

const server = createServer(
  async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      writePlain(response, 405, "Method Not Allowed");

      return;
    }

    const safePath = resolveSafePath(request.url ?? "/");

    if (safePath === null) {
      writePlain(response, 403, "Forbidden");

      return;
    }

    const target = await resolveTarget(safePath);

    if (target === null) {
      writePlain(response, 404, "Not Found");

      return;
    }

    response.writeHead(200, {
      "Content-Type": contentTypeFor(target.path),
      "Content-Length": target.size,
      "Cache-Control": "no-cache",
      "Access-Control-Allow-Origin": "*",
    });

    if (request.method === "HEAD") {
      response.end();

      return;
    }

    const stream = createReadStream(target.path);

    stream.on("error", (error: Error) => {
      console.error(red(`Error streaming ${target.path}: ${error.message}`));

      if (!response.headersSent) {
        writePlain(response, 500, "Internal Server Error");
      } else {
        response.destroy();
      }
    });

    stream.pipe(response);
  },
);

try {
  const distributionStats = await stat(DIST_DIRECTORY);

  if (!distributionStats.isDirectory()) {
    console.error(red(`${DIST_DIRECTORY} is not a directory.`));
    process.exit(1);
  }
} catch {
  console.error(
    red(
      `dist directory not found at ${DIST_DIRECTORY}. Run \`npm run build\` first.`,
    ),
  );
  process.exit(1);
}

server.listen(port, host, () => {
  console.log(
    `${green("Serving")} ${cyan(DIST_DIRECTORY)} at ${yellow(`http://${host}:${port}/`)}`,
  );
  console.warn(
    "\n" +
      yellow(
        `Warning: this server is intended for development purposes only and is not suitable for production deployments.`,
      ) +
      "\n",
  );
  console.log(yellow("Press Ctrl+C to stop."));
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
