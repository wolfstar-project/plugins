import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

// Changesets v3 makes `changeset version` exit with code 1 when there is nothing
// to release, so that a no-op version step can no longer be followed by a
// publish that tags already-released versions as `next`. The snapshot job runs
// on every push to `main` that touches `packages/`, so "nothing to release" is a
// normal outcome and has to be skipped instead of failing the job.
const changesetDir = fileURLToPath(new URL("../.changeset", import.meta.url));

async function hasPendingChangesets() {
  const entries = await readdir(changesetDir, { withFileTypes: true });
  return entries.some(
    (entry) =>
      entry.isFile() && entry.name.endsWith(".md") && entry.name.toLowerCase() !== "readme.md",
  );
}

function run(command, args) {
  const { status, error } = spawnSync(command, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (error) throw error;
  if (status !== 0) process.exit(status ?? 1);
}

if (!(await hasPendingChangesets())) {
  console.log("No pending changesets found — skipping the snapshot release.");
  process.exit(0);
}

run("changeset", ["version", "--snapshot", "next"]);
run("pnpm", ["build"]);
run("changeset", ["publish", "--tag", "next", "--no-git-tag"]);
