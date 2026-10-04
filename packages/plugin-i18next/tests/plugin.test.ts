import { Client, container, type ClientOptions } from "@wolfstar/http-framework";
import { watch } from "chokidar";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { InternationalizationHandler } from "../src/lib/InternationalizationHandler";
import i18nPlugin from "../src/plugin";

vi.mock("chokidar", () => ({
  watch: vi.fn(() => ({ on: vi.fn(), close: vi.fn() })),
}));

const FIXTURES = fileURLToPath(new URL("./fixtures/languages", import.meta.url));
const base = { discordPublicKey: "a".repeat(64), discordToken: "token" };

function createClient(options: ConstructorParameters<typeof Client>[0]): Client {
  return new Client(options);
}

beforeEach(() => {
  vi.mocked(watch).mockClear();
});

describe("i18nextPlugin", () => {
  test("GIVEN the factory THEN the plugin is named", () => {
    expect((i18nPlugin() as { name: string }).name).toBe("@wolfstar/plugin-i18next");
  });

  test("GIVEN no options anywhere THEN the handler keeps its own defaults", () => {
    createClient({ ...base, plugins: [i18nPlugin()] });

    expect(container.i18n).toBeInstanceOf(InternationalizationHandler);
    expect(container.i18n.options).toEqual({ i18next: { ignoreJSONStructure: false } });
  });

  test("GIVEN an empty options object (as defineModule passes) THEN the handler keeps its own defaults", () => {
    createClient({ ...base, plugins: [i18nPlugin({})] });

    expect(container.i18n).toBeInstanceOf(InternationalizationHandler);
    expect(container.i18n.options).toEqual({ i18next: { ignoreJSONStructure: false } });
  });

  test("GIVEN an empty options object and an empty ClientOptions.i18n THEN the handler keeps its own defaults", () => {
    createClient({ ...base, i18n: {}, plugins: [i18nPlugin({})] });

    expect(container.i18n.options).toEqual({ i18next: { ignoreJSONStructure: false } });
  });

  test("GIVEN an empty options object THEN ClientOptions.i18n is still honoured", () => {
    createClient({
      ...base,
      i18n: { defaultLanguageDirectory: "/from-client" },
      plugins: [i18nPlugin({})],
    });

    expect(container.i18n.languagesDirectory).toBe("/from-client");
  });

  test("GIVEN factory options only THEN the handler uses them", () => {
    createClient({ ...base, plugins: [i18nPlugin({ defaultLanguageDirectory: "/from-factory" })] });

    expect(container.i18n).toBeInstanceOf(InternationalizationHandler);
    expect(container.i18n.languagesDirectory).toBe("/from-factory");
  });

  test("GIVEN ClientOptions.i18n THEN it is merged over the factory options", () => {
    createClient({
      ...base,
      i18n: { defaultLanguageDirectory: "/from-client" },
      plugins: [i18nPlugin({ defaultLanguageDirectory: "/from-factory", defaultName: "it" })],
    });

    expect(container.i18n.languagesDirectory).toBe("/from-client");
    expect(container.i18n.options.defaultName).toBe("it");
  });

  test("GIVEN preLoad THEN the handler is initialised", async () => {
    const plugin = i18nPlugin({ defaultLanguageDirectory: FIXTURES });
    const client = new Client({ ...base, plugins: [plugin] });
    const init = vi.spyOn(container.i18n, "init").mockResolvedValue();

    await plugin.preLoad?.(client, {} as ClientOptions);

    expect(init).toHaveBeenCalledOnce();
  });

  test("GIVEN HMR enabled in the factory options THEN postListen watches the languages directory", () => {
    const plugin = i18nPlugin({ defaultLanguageDirectory: FIXTURES, hmr: { enabled: true } });
    const client = new Client({ ...base, plugins: [plugin] });

    plugin.postListen?.(client, {} as ClientOptions);

    expect(watch).toHaveBeenCalledWith(FIXTURES, expect.objectContaining({ ignoreInitial: true }));
  });

  test("GIVEN HMR enabled THEN the watcher is exposed on the plugin so it can be closed", () => {
    const plugin = i18nPlugin({ defaultLanguageDirectory: FIXTURES, hmr: { enabled: true } });
    const client = new Client({ ...base, plugins: [plugin] });
    expect(plugin.watcher).toBeNull();

    plugin.postListen?.(client, {} as ClientOptions);

    expect(plugin.watcher).toBe(vi.mocked(watch).mock.results[0]?.value);
  });

  test("GIVEN HMR not enabled THEN the plugin exposes no watcher", () => {
    const plugin = i18nPlugin({ defaultLanguageDirectory: FIXTURES });
    const client = new Client({ ...base, plugins: [plugin] });

    plugin.postListen?.(client, {} as ClientOptions);

    expect(plugin.watcher).toBeNull();
  });

  test("GIVEN HMR not enabled THEN postListen watches nothing", () => {
    const plugin = i18nPlugin({ defaultLanguageDirectory: FIXTURES });
    const client = new Client({ ...base, plugins: [plugin] });

    plugin.postListen?.(client, {} as ClientOptions);

    expect(watch).not.toHaveBeenCalled();
  });
});
