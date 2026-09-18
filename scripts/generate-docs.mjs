import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// typedoc@0.28.20's peer range tops out at typescript 6.0.x; it crashes reading its internal TS
// API against this repo's typescript@7.0.2 (experimental, native-typechecker API). pnpm has no way
// to give a single devDependency its own nested typescript peer, so install typedoc + a supported
// typescript into a throwaway npm-managed directory instead: Node resolves `require("typescript")`
// from typedoc's own install location there, while TypeScript's own module resolution still walks
// up from the real source files being analyzed, so workspace-linked packages and @types/node
// resolve normally against this repo's real node_modules.
const runtimeDir = mkdtempSync(join(tmpdir(), "typedoc-runtime-"));

function run(command, args) {
  const { status, error } = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (error) throw error;
  if (status !== 0) process.exit(status ?? 1);
}

run("npm", [
  "install",
  "--prefix",
  runtimeDir,
  "--no-audit",
  "--no-fund",
  "--no-save",
  "typedoc@0.28.20",
  "typescript@^5.9.3",
]);

run(join(runtimeDir, "node_modules", ".bin", "typedoc"), process.argv.slice(2));
