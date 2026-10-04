import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";

const packagesDirectory = fileURLToPath(new URL("../packages/", import.meta.url));

interface Manifest {
  name: string;
  exports?: Record<string, unknown>;
  peerDependencies?: Record<string, string>;
  peerDependenciesMeta?: Record<string, { optional?: boolean }>;
  devDependencies?: Record<string, string>;
}

const entries = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const directory = `${packagesDirectory}${entry.name}`;
    if (!existsSync(`${directory}/src/module.ts`)) return [];

    const manifest = JSON.parse(readFileSync(`${directory}/package.json`, "utf8")) as Manifest;
    // Its module is exported from the root, so it has no `./module` subpath.
    if (manifest.name === "@wolfstar/plugin-scheduled-tasks") return [];

    return [
      {
        manifest,
        tsdown: readFileSync(`${directory}/tsdown.config.ts`, "utf8"),
        hasPlugin: existsSync(`${directory}/src/plugin.ts`),
      },
    ];
  });

describe.each(entries)("$manifest.name module entries", ({ manifest, tsdown, hasPlugin }) => {
  const subpaths = hasPlugin ? ["module", "plugin"] : ["module"];

  test.each(subpaths)("exports ./%s and builds it", (name) => {
    expect(manifest.exports).toHaveProperty(
      [`./${name}`, "import", "default"],
      `./dist/esm/${name}.js`,
    );
    expect(manifest.exports).toHaveProperty(
      [`./${name}`, "import", "types"],
      `./dist/esm/${name}.d.ts`,
    );
    expect(tsdown).toContain(`"src/${name}.ts"`);
    expect(tsdown).toContain(`"./${name}"`);
  });

  test("declares @wolfstar/kit as an optional peer and a devDependency", () => {
    expect(manifest.peerDependencies?.["@wolfstar/kit"]).toBe("^0.1.0");
    expect(manifest.peerDependenciesMeta?.["@wolfstar/kit"]?.optional).toBe(true);
    expect(manifest.devDependencies?.["@wolfstar/kit"]).toBeDefined();
  });
});
