import { container } from "@wolfstar/http-framework";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  GatewayIntentBits,
  Routes,
  type APIApplicationEmoji,
  type APIUser,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ApplicationEmoji,
  ApplicationEmojiManager,
  Emoji,
  GatewayClient,
  GuildEmoji,
  User,
} from "../src/index.js";

const clientId = "266624760782258186";
const emojiId = "800000000000000080";

const uploader: APIUser = {
  id: "100000000000000010",
  username: "alpha",
  discriminator: "0",
  global_name: "Alpha",
  avatar: null,
};

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId,
    intents: GatewayIntentBits.Guilds,
    cache: createInMemoryCache(),
  });
}

function emoji(extra: Partial<APIApplicationEmoji> = {}): APIApplicationEmoji {
  return { id: emojiId, name: "howl", animated: false, user: uploader, ...extra };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client.application.emojis", () => {
  test("GIVEN a client THEN application.emojis is one fetch-only manager of the client", () => {
    const client = createClient();

    expect(client.application.emojis).toBeInstanceOf(ApplicationEmojiManager);
    expect(client.application.emojis).toBe(client.application.emojis);
    expect(client.application.emojis.client).toBe(client);
    expect(client.application.emojis.applicationId).toBe(clientId);
  });

  test("GIVEN an ID THEN fetch gets the emoji of the application, bound to the client", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(emoji());

    const fetched = await client.application.emojis.fetch(emojiId);

    expect(get).toHaveBeenCalledWith(Routes.applicationEmoji(clientId, emojiId), expect.anything());
    expect(fetched).toBeInstanceOf(ApplicationEmoji);
    expect(fetched).toBeInstanceOf(Emoji);
    expect(fetched.id).toBe(emojiId);
    expect(fetched.name).toBe("howl");
    expect(fetched.animated).toBe(false);
    expect(fetched.identifier).toBe(`howl:${emojiId}`);
    expect(fetched.toString()).toBe(`<:howl:${emojiId}>`);
    expect(fetched.imageURL()).toBe(`https://cdn.discordapp.com/emojis/${emojiId}.webp`);
    expect(fetched.client).toBe(client);
    expect(fetched.application).toBe(client.application);
    expect(fetched.author).toBeInstanceOf(User);
    expect(fetched.author.id).toBe(uploader.id);
  });

  test("GIVEN no ID THEN fetch lists every emoji by ID, without caching them", async () => {
    const client = createClient();
    const other = emoji({ id: "800000000000000081", name: "awoo", animated: true });
    const get = vi.spyOn(container.rest, "get").mockResolvedValue({ items: [emoji(), other] });

    const emojis = await client.application.emojis.fetch();

    expect(get).toHaveBeenCalledWith(Routes.applicationEmojis(clientId), expect.anything());
    expect([...emojis.keys()]).toEqual([emojiId, other.id]);
    expect(emojis.get(other.id)?.animated).toBe(true);
    expect(emojis.get(other.id)?.toString()).toBe(`<a:awoo:${other.id}>`);
    expect(emojis.get(emojiId)?.client).toBe(client);

    await client.application.emojis.fetch();
    expect(get).toHaveBeenCalledTimes(2);
  });

  test("GIVEN an image THEN create uploads it, resolving the image", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(emoji());

    const created = await client.application.emojis.create({
      attachment: "data:image/png;base64,AAAA",
      name: "howl",
    });

    expect(post).toHaveBeenCalledWith(Routes.applicationEmojis(clientId), {
      body: { image: "data:image/png;base64,AAAA", name: "howl" },
      signal: undefined,
    });
    expect(created).toBeInstanceOf(ApplicationEmoji);
    expect(created.name).toBe("howl");
  });

  test("GIVEN an emoji or its ID THEN edit patches its name", async () => {
    const client = createClient();
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(emoji({ name: "renamed" }));
    const existing = new ApplicationEmoji(emoji());

    const edited = await client.application.emojis.edit(existing, { name: "renamed" });
    await client.application.emojis.edit(emojiId, { name: "renamed" });

    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch).toHaveBeenCalledWith(Routes.applicationEmoji(clientId, emojiId), {
      body: { name: "renamed" },
      signal: undefined,
    });
    expect(edited.name).toBe("renamed");
    expect(existing.name).toBe("howl");
  });

  test("GIVEN an emoji or its ID THEN delete removes it", async () => {
    const client = createClient();
    const del = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);

    await client.application.emojis.delete(emojiId);
    await client.application.emojis.delete(new ApplicationEmoji(emoji()));

    expect(del).toHaveBeenCalledTimes(2);
    expect(del).toHaveBeenCalledWith(Routes.applicationEmoji(clientId, emojiId), {
      signal: undefined,
    });
  });

  test("GIVEN an ID THEN fetchAuthor gets the uploader from the API", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(emoji());

    const author = await client.application.emojis.fetchAuthor(emojiId);

    expect(get).toHaveBeenCalledWith(Routes.applicationEmoji(clientId, emojiId), expect.anything());
    expect(author).toBeInstanceOf(User);
    expect(author.id).toBe(uploader.id);
  });
});

describe("ApplicationEmoji", () => {
  test("GIVEN a built emoji THEN edit and setName patch it in place", async () => {
    const client = createClient();
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(emoji({ name: "renamed" }));
    const existing = await client.application.emojis.hydrate(emoji());

    expect(await existing.edit({ name: "renamed" })).toBe(existing);
    expect(existing.name).toBe("renamed");

    patch.mockResolvedValue(emoji({ name: "again" }));
    await existing.setName("again");
    expect(existing.name).toBe("again");
    expect(patch).toHaveBeenLastCalledWith(Routes.applicationEmoji(clientId, emojiId), {
      body: { name: "again" },
      signal: undefined,
    });
  });

  test("GIVEN a built emoji THEN delete calls the API and resolves to it", async () => {
    const client = createClient();
    const del = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
    const existing = await client.application.emojis.hydrate(emoji());

    expect(await existing.delete()).toBe(existing);
    expect(del).toHaveBeenCalledWith(Routes.applicationEmoji(clientId, emojiId), {
      signal: undefined,
    });
  });

  test("GIVEN a built emoji THEN fetchAuthor refetches the uploader", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(emoji());
    const existing = await client.application.emojis.hydrate(emoji());

    const author = await existing.fetchAuthor();

    expect(get).toHaveBeenCalledOnce();
    expect(author.id).toBe(uploader.id);
  });

  test("GIVEN a patch with a user THEN the resolved author is dropped", () => {
    const existing = new ApplicationEmoji(emoji(), { author: new User(uploader) });
    const resolved = existing.author;

    expect(existing.author).toBe(resolved);
    existing[Symbol.for("djs.structures.patch") as never]({
      user: { ...uploader, id: "100000000000000011" },
    } as never);
    expect(existing.author.id).toBe("100000000000000011");
  });
});

describe("ApplicationEmoji#equals", () => {
  const base = new ApplicationEmoji(emoji());

  test("GIVEN an application emoji THEN it compares the ID, name, and animated", () => {
    expect(base.equals(new ApplicationEmoji(emoji()))).toBe(true);
    expect(base.equals(new ApplicationEmoji(emoji({ user: { ...uploader, id: "1" } })))).toBe(true);
    expect(base.equals(new ApplicationEmoji(emoji({ name: "renamed" })))).toBe(false);
    expect(base.equals(new ApplicationEmoji(emoji({ animated: true })))).toBe(false);
    expect(base.equals(new ApplicationEmoji(emoji({ id: "1" })))).toBe(false);
  });

  test("GIVEN a raw emoji THEN it compares the same fields, animated defaulting to false", () => {
    expect(base.equals(emoji())).toBe(true);
    expect(base.equals({ id: emojiId, name: "howl" })).toBe(true);
    expect(base.equals(emoji({ name: "renamed" }))).toBe(false);
    expect(base.equals(emoji({ animated: true }))).toBe(false);
  });

  test("GIVEN a foreign argument THEN it is false", () => {
    expect(base.equals(new GuildEmoji({ id: emojiId, name: "howl", guild_id: "1" } as never))).toBe(
      false,
    );
    expect(base.equals(new Emoji({ id: emojiId, name: "howl" }))).toBe(false);
    expect(base.equals(null)).toBe(false);
    expect(base.equals(undefined)).toBe(false);
    expect(base.equals("howl")).toBe(false);
    expect(base.equals(42)).toBe(false);
    expect(base.equals({})).toBe(false);
  });
});
