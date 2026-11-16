// Tiny static server for the test page: the built bundle plus the committed draft scene.
// /media/<any scene id>/<file> serves public/media/drafts/draft.opening/<file>, so one draft can stand in
// for several scenes. `throttle(bytesPerSecond)` slows the .mp4 responses down (0 = full speed).
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const MEDIA_DIR = join(repo, "public/media/drafts/draft.opening");
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".json": "application/json",
  ".mp4": "video/mp4",
  ".avif": "image/avif",
  ".webp": "image/webp",
};

export function startServer(publicDir) {
  let bytesPerSecond = 0;
  const server = createServer((request, response) => {
    const path = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
    const media = /^\/media\/[a-z0-9.-]+\/([a-z0-9.]+)$/.exec(path);
    const file = media ? join(MEDIA_DIR, media[1]) : join(publicDir, normalize(path === "/" ? "/index.html" : path));
    if (!file.startsWith(media ? MEDIA_DIR : publicDir) || !existsSync(file) || !statSync(file).isFile()) {
      response.writeHead(404).end("not found");
      return;
    }
    response.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "content-length": statSync(file).size, "cache-control": "no-store" });
    if (!media || extname(file) !== ".mp4" || bytesPerSecond <= 0) {
      createReadStream(file).pipe(response);
      return;
    }
    // Throttled: a slice every 100 ms.
    const stream = createReadStream(file, { highWaterMark: Math.max(1, Math.round(bytesPerSecond / 10)) });
    stream.on("data", (chunk) => {
      stream.pause();
      response.write(chunk);
      setTimeout(() => stream.resume(), 100);
    });
    stream.on("end", () => response.end());
    response.on("close", () => stream.destroy());
  });
  return new Promise((ready) => {
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      ready({
        url: `http://127.0.0.1:${port}`,
        throttle: (rate) => void (bytesPerSecond = rate),
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}
