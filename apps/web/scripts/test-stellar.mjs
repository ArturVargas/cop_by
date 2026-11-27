import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler/package.json"))("esbuild");
const directory = await mkdtemp(join(tmpdir(), "copby-stellar-tests-"));
try {
  const output = join(directory, "stellar.test.cjs");
  await build({
    stdin: {
      contents: 'import "./src/lib/stellar-activity.test"; import "./src/lib/stellar-account-share.test"; import "./src/lib/send-usdc.test"; import "./src/components/shareable-receipt.test"; import "./src/components/stellar-receive.test";',
      resolveDir: root,
      loader: "tsx",
    },
    outfile: output,
    bundle: true,
    platform: "node",
    packages: "external",
    jsx: "automatic",
    alias: { "@": join(root, "src") },
  });
  execFileSync(process.execPath, ["--test", output], {
    stdio: "inherit",
    env: { ...process.env, NODE_PATH: join(root, "node_modules") },
  });
} finally {
  await rm(directory, { recursive: true, force: true });
}
