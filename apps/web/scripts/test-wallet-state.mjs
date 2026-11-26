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
const directory = await mkdtemp(join(tmpdir(), "copby-wallet-state-"));
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
    response.end('<!doctype html><meta charset="utf-8"><script>window.onerror=(message)=>fetch("/result",{method:"POST",body:JSON.stringify({ok:false,error:String(message)})});</script><script type="module" src="/test.js"></script>');
  }
});
try {
  await build({
    stdin: {
      contents: `
        import { createRoot } from "react-dom/client";
        import { useState } from "react";
        import { StellarWalletProvider, useStellarWallet } from "./src/hooks/use-stellar-wallet";
        const source = "GANTUVPE7JSXMMZHEOHWAWBJY5BIKDW2KYYI2ELBWBRC2TL7THMT6Z5I";
        const destination = "GBIMQFMFVQ2JGNSKL6RGPBYW3MCV7WTUEMOEBB44EAVMKRXBZW7VROGR";
        const state = { balance: "20", fail: false, defer: false, failSetup: false };
        const wallet = {
          chain: "stellar", status: "ready", address: source,
          create: async () => {},
          addTrustline: async () => { if (state.failSetup) throw new Error("change_trust low reserve"); },
          tokenBalance: async () => {
            if (state.defer) return new Promise(resolve => { state.resolve = resolve; });
            if (state.fail) throw new Error("offline");
            return state.balance;
          },
        };
        window.__cavos = { wallet, isAuthenticated: true, isLoading: false };
        function Consumer({ name }) { state[name] = useStellarWallet(); return null; }
        function App() {
          const [, setRevision] = useState(0);
          state.render = () => setRevision(value => value + 1);
          return <StellarWalletProvider><Consumer name="a"/><Consumer name="b"/></StellarWalletProvider>;
        }
        const assert = (value, message) => { if (!value) throw new Error(message); };
        const wait = async (predicate) => {
          for (let i = 0; i < 300; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); }
          throw new Error("Wallet state did not settle");
        };
        const settle = () => new Promise(resolve => setTimeout(resolve, 30));
        const host = document.createElement("div"); document.body.append(host);
        const root = createRoot(host); root.render(<App/>);
        try {
          await wait(() => state.a?.usdcBalance === "20" && state.b?.usdcBalance === "20");
          state.balance = "8"; await state.a.refreshUsdcBalance(); await wait(() => state.b.usdcBalance === "8");
          state.fail = true; await state.a.refreshUsdcBalance(); await wait(() => state.b.balanceError);
          assert(state.b.usdcBalance === "8", "Query failure replaced a confirmed balance");
          state.fail = false; await state.a.refreshUsdcBalance(); await wait(() => state.b.balanceError === null);
          state.defer = true; void state.a.refreshUsdcBalance(); await wait(() => state.resolve);
          state.defer = false; state.balance = "6"; await state.a.refreshUsdcBalance();
          state.resolve("99"); await settle(); assert(state.b.usdcBalance === "6", "Old response overwrote new balance");
          state.resolve = null; state.defer = true; void state.a.refreshUsdcBalance(); await wait(() => state.resolve);
          state.defer = false; state.balance = "0";
          window.__cavos.wallet = { ...wallet, address: destination }; state.render();
          await wait(() => state.b.address === destination && state.b.usdcBalance === "0");
          state.resolve("99"); await settle(); assert(state.b.usdcBalance === "0", "Previous account balance leaked");
          assert(!state.b.trustlineReady, "Zero balance was mistaken for a trustline");
          await state.a.ensureAccountAndTrustline(); await wait(() => state.b.trustlineReady);
          window.__cavos.wallet = { ...wallet }; state.render();
          await wait(() => state.b.address === source && state.b.usdcBalance === "0" && !state.b.trustlineReady);
          state.failSetup = true; let rejected = false;
          try { await state.a.ensureAccountAndTrustline(); } catch { rejected = true; }
          await settle(); assert(rejected && !state.b.trustlineReady, "Failed setup was mistaken for readiness");
          assert(!state.b.bootstrapError?.includes("change_trust"), "Setup error exposed SDK internals");
          root.unmount();
          await fetch("/result", {method:"POST",body:JSON.stringify({ok:true,checked:["shared balance","offline retention","retry","request order","account switch","zero balance","setup success/failure"]})});
        } catch (error) {
          root.unmount();
          await fetch("/result", {method:"POST",body:JSON.stringify({ok:false,error:String(error)})});
        }
`,
      resolveDir: root,
      loader: "tsx",
    },
    define: { "process.env": JSON.stringify({ NODE_ENV: "production", NEXT_PUBLIC_CAVOS_APP_ID: "qa", NEXT_PUBLIC_CAVOS_NETWORK: "testnet" }), "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "cavos-fixture", setup(build) {
      build.onResolve({filter: /^@cavos\/kit\/react$/}, () => ({path: "cavos", namespace: "fixture"}));
      build.onLoad({filter: /.*/, namespace: "fixture"}, () => ({contents: "export const useCavos = () => window.__cavos;", loader: "js"}));
    }}],
    jsx: "automatic",
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
  browser.once("exit", (code) => resolveReport({ok:false,error:`Chrome exited before wallet check (${code})`}));
  timer = setTimeout(() => resolveReport({ok:false,error:"Wallet state check timed out"}), 30_000);
  const result = await report;
  assert.equal(result.ok, true, result.error);
  console.log("Wallet state verified:", JSON.stringify(result.checked));
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
