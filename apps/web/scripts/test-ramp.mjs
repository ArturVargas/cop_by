import { createRequire } from "node:module";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const { build } = createRequire(require.resolve("wrangler/package.json"))("esbuild");
const directory = await mkdtemp(join(tmpdir(), "copby-ramp-tests-"));
try {
  const tests = (await readdir(join(root, "src/lib/ramp/tests"))).filter(name => name.endsWith(".test.ts")).sort();
  const output = join(directory, "ramp.test.cjs");
  await build({ stdin: { contents: tests.map(name => `import "./src/lib/ramp/tests/${name}";`).join("\n"), resolveDir: root, loader: "ts" }, outfile: output, bundle: true, platform: "node", packages: "external", alias: { "@": join(root, "src") } });
  execFileSync(process.execPath, ["--test", output], { stdio: "inherit", env: { ...process.env, NODE_PATH: join(root, "node_modules") } });
} finally { await rm(directory, { recursive: true, force: true }); }
