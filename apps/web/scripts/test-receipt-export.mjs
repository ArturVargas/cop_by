import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler/package.json"))("esbuild");
const candidates = [process.env.CHROME_PATH, "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"].filter(Boolean);
let chromePath;
for (const candidate of candidates) {
  try { await access(candidate); chromePath = candidate; break; } catch {}
}
if (!chromePath) throw new Error("Chrome/Chromium is required; set CHROME_PATH to its executable.");
const directory = await mkdtemp(join(tmpdir(), "copby-receipt-export-"));
let browser;
let timer;
let resolveReport;
const report = new Promise((resolve) => { resolveReport = resolve; });
const server = createServer(async (request, response) => {
  if (request.url === "/result" && request.method === "POST") {
    let body = "";
    for await (const chunk of request) body += chunk;
    response.end("ok");
    resolveReport(JSON.parse(body));
  } else if (request.url === "/test.js") {
    response.setHeader("Content-Type", "text/javascript");
    response.end(await readFile(join(directory, "test.js")));
  } else {
    response.setHeader("Content-Type", "text/html");
    response.end('<!doctype html><meta charset="utf-8"><script type="module" src="/test.js"></script>');
  }
});
try {
  await build({
    stdin: {
      contents: `
        import { createReceiptImageBlob } from "./src/lib/receipt-share";
        try {
          const checked = [];
          for (const [containerWidth, receiptWidth] of [[320, 288], [480, 360]]) {
            const host = document.createElement("div");
            host.style.width = containerWidth + "px";
            host.innerHTML = '<div style="width:' + receiptWidth + 'px;margin:0 auto"><div style="height:80px;background:rgb(109,69,184)"></div><div style="height:80px;background:rgb(14,124,79)"></div></div>';
            document.body.append(host);
            const receipt = host.firstElementChild;
            const blob = await createReceiptImageBlob(receipt);
            const image = await createImageBitmap(blob);
            const canvas = document.createElement("canvas");
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext("2d");
            context.drawImage(image, 0, 0);
            const pixel = (x,y) => [...context.getImageData(x,y,1,1).data].join(",");
            if (image.width !== receiptWidth * 2 || image.height !== 320) throw new Error("Incorrect export dimensions");
            for (const x of [4, image.width - 5]) {
              if (pixel(x,40) !== "109,69,184,255") throw new Error("Clipped header at container width " + containerWidth + ", pixel x=" + x);
              if (pixel(x,image.height - 5) !== "14,124,79,255") throw new Error("Clipped footer at container width " + containerWidth + ", pixel x=" + x);
            }
            checked.push({containerWidth, pngWidth:image.width, pngHeight:image.height});
            image.close();
            host.remove();
          }
          await fetch("/result", {method:"POST",body:JSON.stringify({ok:true,checked})});
        } catch (error) {
          await fetch("/result", {method:"POST",body:JSON.stringify({ok:false,error:String(error)})});
        }
      `,
      resolveDir: root,
      loader: "js",
    },
    outfile: join(directory, "test.js"),
    bundle: true,
    platform: "browser",
    format: "esm",
    alias: { "@": join(root, "src") },
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  browser = spawn(chromePath, ["--headless", "--disable-gpu", "--disable-dev-shm-usage", ...(process.platform === "linux" ? ["--no-sandbox"] : []), "--no-first-run", "--no-default-browser-check", `--user-data-dir=${join(directory, "profile")}`, `http://127.0.0.1:${port}`], { stdio: "ignore" });
  browser.once("error", (error) => resolveReport({ok:false,error:String(error)}));
  browser.once("exit", (code) => resolveReport({ok:false,error:`Chrome exited before export check (${code})`}));
  timer = setTimeout(() => resolveReport({ok:false,error:"Receipt export check timed out"}), 30_000);
  const result = await report;
  assert.equal(result.ok, true, result.error);
  console.log("Receipt PNG bounds verified:", JSON.stringify(result.checked));
} finally {
  clearTimeout(timer);
  if (browser && browser.exitCode === null) {
    const closed = new Promise((resolve) => browser.once("exit", resolve));
    browser.kill();
    await closed;
  }
  await new Promise((resolve) => server.close(resolve));
  await rm(directory, { recursive: true, force: true });
}
