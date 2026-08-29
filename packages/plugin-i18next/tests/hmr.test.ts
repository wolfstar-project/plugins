import { container } from "@sapphire/pieces";
import { postListen } from "@wolfstar/http-framework";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { InternationalizationHandler } from "../src/index";
import { I18nextPlugin } from "../src/register";

let languagesDirectory: string;

async function writeNamespace(locale: string, namespace: string, content: object) {
  const path = join(languagesDirectory, locale, `${namespace}.json`);
  await mkdir(join(path, ".."), { recursive: true });
  await writeFile(path, JSON.stringify(content), "utf8");
}

beforeAll(async () => {
  languagesDirectory = await mkdtemp(join(tmpdir(), "plugin-i18next-hmr-"));
  await writeNamespace("en-US", "default", { hello: "Hello" });

  container.i18n = new InternationalizationHandler({
    defaultLanguageDirectory: languagesDirectory,
  });
  await container.i18n.init();
});

afterAll(async () => {
  await I18nextPlugin.watcher?.close();
  I18nextPlugin.watcher = null;
  await rm(languagesDirectory, { recursive: true, force: true });
});

describe("reloadResources", () => {
  test("GIVEN a freshly initialized handler THEN only the initial language and namespace exist", () => {
    expect([...container.i18n.languages.keys()]).toEqual(["en-US"]);
    expect([...container.i18n.namespaces]).toEqual(["default"]);
  });

  test("GIVEN a new namespace THEN reloading registers it", async () => {
    await writeNamespace("en-US", "greetings", { hi: "Hi" });
    await container.i18n.reloadResources();

    expect(container.i18n.namespaces.has("greetings")).toBe(true);
    expect(container.i18n.format("en-US", "greetings:hi")).toBe("Hi");
  });

  test("GIVEN a new locale THEN reloading registers it", async () => {
    await writeNamespace("fr", "default", { hello: "Bonjour" });
    await writeNamespace("fr", "greetings", { hi: "Salut" });
    await container.i18n.reloadResources();

    expect(container.i18n.languages.has("fr")).toBe(true);
    expect(container.i18n.format("fr", "default:hello")).toBe("Bonjour");
    expect(container.i18n.format("fr", "greetings:hi")).toBe("Salut");
  });

  test("GIVEN edited contents THEN reloading picks them up", async () => {
    await writeNamespace("en-US", "default", { hello: "Hello again" });
    await container.i18n.reloadResources();

    expect(container.i18n.format("en-US", "default:hello")).toBe("Hello again");
  });

  test("GIVEN concurrent calls THEN they are serialized", async () => {
    await expect(
      Promise.all([
        container.i18n.reloadResources(),
        container.i18n.reloadResources(),
        container.i18n.reloadResources(),
      ]),
    ).resolves.toHaveLength(3);
  });
});

describe("HMR watcher", () => {
  test("GIVEN HMR enabled THEN adding a locale triggers a reload", async () => {
    const reloadResources = vi.spyOn(container.i18n, "reloadResources");

    // The `postListen` hook only reads `container.i18n` and the options, never `this`.
    I18nextPlugin[postListen].call(null as never, {
      i18n: { hmr: { enabled: true, options: { usePolling: true, interval: 25 } } },
    });

    const watcher = I18nextPlugin.watcher;
    expect(watcher).not.toBeNull();
    await new Promise<void>((resolve) => watcher!.once("ready", () => resolve()));

    // `add` and `addDir`, not `change`: this is the event pair the watcher used to ignore.
    await writeNamespace("de", "default", { hello: "Hallo" });

    await vi.waitFor(() => expect(reloadResources).toHaveBeenCalled(), { timeout: 15_000 });
    await vi.waitFor(() => expect(container.i18n.languages.has("de")).toBe(true), {
      timeout: 15_000,
    });

    expect(container.i18n.format("de", "default:hello")).toBe("Hallo");
  }, 30_000);
});
