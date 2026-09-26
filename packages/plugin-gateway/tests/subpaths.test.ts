import { readFile } from "node:fs/promises";
import * as rest from "@discordjs/rest";
import * as ws from "@discordjs/ws";
import { describe, expect, test } from "vitest";
import * as gatewayRest from "../src/rest.js";
import * as gatewayWs from "../src/ws.js";

const packageJson = JSON.parse(
  await readFile(new URL("../package.json", import.meta.url), "utf8"),
) as {
  exports: Record<string, { import: { types: string; default: string } }>;
};

describe.each([
  { subpath: "./rest", original: rest, reexport: gatewayRest },
  { subpath: "./ws", original: ws, reexport: gatewayWs },
])("$subpath", ({ subpath, original, reexport }) => {
  test("is exported by the package", () => {
    const name = subpath.slice(2);
    expect(packageJson.exports[subpath]).toStrictEqual({
      import: { types: `./dist/esm/${name}.d.ts`, default: `./dist/esm/${name}.js` },
    });
  });

  test("re-exports every export of the original package as is", () => {
    expect(Object.keys(reexport).sort()).toStrictEqual(Object.keys(original).sort());
    for (const [key, value] of Object.entries(original)) {
      expect(reexport[key as keyof typeof reexport]).toBe(value);
    }
  });
});
