import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

// The Stars CLI build (`@wolfstar/cli`) injects `import "<name>/register"` for every dependency named
// `@wolfstar/plugin-*`, so a package of that name without the subpath crashes its consumers at startup with
// `ERR_PACKAGE_PATH_NOT_EXPORTED`.
const PluginPackage = /^@wolfstar\/plugin-[^/]+$/;

const packagesDirectory = join(import.meta.dirname, "..", "packages");
const packages = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => {
    const directory = join(packagesDirectory, entry.name);
    const manifest = JSON.parse(readFileSync(join(directory, "package.json"), "utf8")) as {
      name: string;
      exports?: Record<string, { import?: { types?: string; default?: string } }>;
    };
    return { directory, manifest };
  })
  .filter(({ manifest }) => PluginPackage.test(manifest.name));

describe("register entrypoints", () => {
  test("GIVEN the workspace THEN it has @wolfstar/plugin-* packages", () => {
    expect(packages.length).toBeGreaterThan(0);
  });

  test.each(
    packages.map(({ directory, manifest }) => [manifest.name, directory, manifest] as const),
  )("GIVEN %s THEN it exports a ./register subpath", (_name, directory, manifest) => {
    expect(manifest.exports?.["./register"]?.import).toEqual({
      types: "./dist/esm/register.d.ts",
      default: "./dist/esm/register.js",
    });
    expect(existsSync(join(directory, "src", "register.ts"))).toBe(true);
  });
});
