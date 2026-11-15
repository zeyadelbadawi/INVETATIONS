// Bundles the test page (client + server render) with the rolldown that ships with vitest's vite.
// Usage: node e2e-fixtures/scene-test/build.mjs <outDir>
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = resolve(here, "../..");
const outDir = resolve(process.argv[2] ?? "");
if (!process.argv[2]) throw new Error("Usage: build.mjs <outDir>");

const require = createRequire(join(repo, "package.json"));
const vitePath = require.resolve("vite", { paths: [dirname(require.resolve("vitest/package.json"))] });
const { rolldown } = createRequire(vitePath)("rolldown");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "public"), { recursive: true });

const shared = {
  cwd: repo,
  transform: { jsx: "react-jsx", define: { "process.env.NODE_ENV": '"production"' } },
  onLog(level, log, handler) {
    if (log.code === "MODULE_LEVEL_DIRECTIVE") return;
    handler(level, log);
  },
};

const client = await rolldown({ ...shared, input: { client: join(here, "client.tsx") }, platform: "browser" });
await client.write({ dir: join(outDir, "public"), format: "esm", entryFileNames: "[name].js", chunkFileNames: "chunk-[name]-[hash].js" });

const server = await rolldown({ ...shared, input: { ssr: join(here, "ssr.tsx") }, platform: "node" });
await server.write({ dir: join(outDir, "ssr"), format: "esm", entryFileNames: "[name].mjs", codeSplitting: false });

const { renderDocument } = await import(pathToFileURL(join(outDir, "ssr", "ssr.mjs")).href);
const manifest = JSON.parse(readFileSync(join(repo, "media/drafts/draft.opening/manifest.json"), "utf8"));
writeFileSync(join(outDir, "public", "index.html"), renderDocument({ manifest }));
// Same page with a short stall limit, to see the "Continue without waiting" way out.
writeFileSync(join(outDir, "public", "stall.html"), renderDocument({ manifest, splash: { stallMs: 1500 } }));
writeFileSync(join(outDir, "public", "other.html"), "<!doctype html><title>other</title><h1>Other page</h1>");
console.log(readdirSync(join(outDir, "public")).join("\n"));
