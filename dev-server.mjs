// 로컬 확인용. Vercel 의 정적 + /api 함수를 한 프로세스로 흉내낸다. 배포되지 않는다.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT) || 8767;
const TYPES = { ".html":"text/html; charset=utf-8", ".js":"text/javascript; charset=utf-8",
  ".json":"application/json; charset=utf-8", ".png":"image/png", ".webp":"image/webp",
  ".jpg":"image/jpeg", ".svg":"image/svg+xml", ".ico":"image/x-icon", ".mp4":"video/mp4" };

const handler = (await import("./api/llm.js")).default;

createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/api/llm") {
    const chunks = []; for await (const c of req) chunks.push(c);
    let body = null; try { body = JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch {}
    const shim = {
      status(c) { res.statusCode = c; return shim; },
      json(o) { res.setHeader("content-type", "application/json; charset=utf-8"); res.end(JSON.stringify(o)); return shim; },
    };
    try { await handler({ method: req.method, body }, shim); }
    catch (e) { res.statusCode = 500; res.end(JSON.stringify({ error: String(e?.message) })); }
    return;
  }
  let p = decodeURIComponent(url.pathname);
  if (p === "/" || p === "") p = "/index.html";
  const file = join(ROOT, normalize(p).replace(/^(\.\.[/\\])+/, ""));
  try {
    const buf = await readFile(file);
    res.setHeader("content-type", TYPES[extname(file).toLowerCase()] || "application/octet-stream");
    res.end(buf);
  } catch { res.statusCode = 404; res.end("not found"); }
}).listen(PORT, () => console.log("dev http://localhost:" + PORT));
