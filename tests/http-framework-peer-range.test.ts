import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import semver from "semver";

/**
 * Guards against the published peer ranges lagging behind the framework (#121): every plugin that declares
 * `@wolfstar/http-framework` as a peer must accept the version the workspace itself installs, which Renovate keeps on
 * the latest release, so a new major lands as a failing check instead of a silently unmet peer for consumers.
 */

const FRAMEWORK = "@wolfstar/http-framework";
const packagesDirectory = fileURLToPath(new URL("../packages/", import.meta.url));

interface Manifest {
  name: string;
  private?: boolean;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface Plugin {
  name: string;
  directory: string;
  peerRange: string;
  devRange: string | undefined;
  installed: string | null;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function installedFrameworkVersion(manifestPath: string): string | null {
  try {
    const require = createRequire(manifestPath);
    return readJson<{ version: string }>(require.resolve(`${FRAMEWORK}/package.json`)).version;
  } catch {
    return null;
  }
}

const plugins: Plugin[] = readdirSync(packagesDirectory, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .flatMap((entry) => {
    const manifestPath = `${packagesDirectory}${entry.name}/package.json`;
    let manifest: Manifest;
    try {
      manifest = readJson<Manifest>(manifestPath);
    } catch {
      return [];
    }

    const peerRange = manifest.peerDependencies?.[FRAMEWORK];
    if (manifest.private || peerRange === undefined) return [];

    return [
      {
        name: manifest.name,
        directory: `packages/${entry.name}`,
        peerRange,
        devRange: manifest.devDependencies?.[FRAMEWORK],
        installed: installedFrameworkVersion(manifestPath),
      },
    ];
  });

const installedVersions = plugins.flatMap((plugin) => (plugin.installed ? [plugin.installed] : []));
const latest = semver.rsort([...installedVersions])[0];

/** The majors (up to the latest installed one) that a range accepts at least one release of. */
function acceptedMajors(range: string, upTo: number): number[] {
  const majors: number[] = [];
  for (let major = 0; major <= upTo; major++) {
    if (semver.intersects(range, `>=${major}.0.0 <${major + 1}.0.0`)) majors.push(major);
  }
  return majors;
}

describe(`${FRAMEWORK} peer ranges`, () => {
  test("at least one plugin declares the peer", () => {
    expect(plugins.length).toBeGreaterThan(0);
    expect(
      latest,
      `${FRAMEWORK} is not installed in any package; run \`pnpm install\``,
    ).toBeDefined();
  });

  describe.each(plugins)("$name", (plugin) => {
    test(`devDepends on ${FRAMEWORK} so the peer range is exercised by its own tests`, () => {
      expect(
        plugin.devRange && plugin.installed,
        `${plugin.name} declares ${FRAMEWORK} as a peer but it is not installed as a devDependency. ` +
          `Add it with \`pnpm --filter ${plugin.name} add -D ${FRAMEWORK}@^${latest}\`.`,
      ).toBeTruthy();
    });

    test("accepts the latest installed major", () => {
      const major = semver.major(latest!);
      expect(
        semver.satisfies(latest!, plugin.peerRange),
        `${plugin.name} (${plugin.directory}/package.json) has peerDependencies["${FRAMEWORK}"] = ` +
          `"${plugin.peerRange}", which excludes ${latest}, the version the workspace installs. ` +
          `Widen it (e.g. "${plugin.peerRange} || ^${major}.0.0") and add a patch changeset so the ` +
          `new range gets published.`,
      ).toBe(true);
    });

    test("accepts the same majors as every other plugin", () => {
      const upTo = semver.major(latest!);
      // A plugin built on a framework feature that only exists from some version on (`definePlugin`, 6.1.0) cannot
      // accept the majors before it: only the majors from its own minimum up have to match.
      const minimum = semver.minVersion(plugin.peerRange)!.major;
      const expected = acceptedMajors(plugins[0]!.peerRange, upTo).filter(
        (major) => major >= minimum,
      );
      expect(
        acceptedMajors(plugin.peerRange, upTo),
        `${plugin.name}'s peer range "${plugin.peerRange}" supports different ${FRAMEWORK} majors than ` +
          `${plugins[0]!.name}'s "${plugins[0]!.peerRange}"; keep the plugins' peer ranges in sync.`,
      ).toEqual(expected);
    });
  });
});
