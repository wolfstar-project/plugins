import { createInMemoryCache } from "@wolfstar/plugin-cache";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  Attachment,
  AttachmentBuilder,
  GatewayClient,
  MessagePayload,
  type GatewayClientOptions,
} from "../src/index.js";

function createClient(options: Partial<GatewayClientOptions> = {}) {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId: "266624760782258186",
    intents: 0,
    cache: createInMemoryCache(),
    ...options,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("AttachmentBuilder", () => {
  test("GIVEN a file and data THEN they are kept and serialized", () => {
    const file = new Uint8Array([1]);
    const builder = new AttachmentBuilder(file, { name: "howl.ogg", description: "A howl" });

    expect(builder.attachment).toBe(file);
    expect(builder.name).toBe("howl.ogg");
    expect(builder.description).toBe("A howl");
    expect(builder.toJSON()).toEqual({
      attachment: file,
      name: "howl.ogg",
      description: "A howl",
    });
  });

  test("GIVEN the setters THEN they chain", () => {
    const file = new Uint8Array([2]);
    const builder = new AttachmentBuilder(new Uint8Array([1]))
      .setFile(file, "pack.png")
      .setDescription("The pack")
      .setTitle("Pack")
      .setDuration(3)
      .setWaveform("AAAA");

    expect(builder.toJSON()).toEqual({
      attachment: file,
      name: "pack.png",
      description: "The pack",
      title: "Pack",
      duration: 3,
      waveform: "AAAA",
    });
    expect(builder.setName("renamed.png").name).toBe("renamed.png");
    expect(builder.setFile("./other.png").name).toBe("renamed.png");
  });

  test("GIVEN setSpoiler THEN the name is prefixed once, and the prefix is removed by setSpoiler(false)", () => {
    const builder = new AttachmentBuilder(new Uint8Array([1]), { name: "howl.ogg" });
    expect(builder.spoiler).toBe(false);

    expect(builder.setSpoiler().name).toBe("SPOILER_howl.ogg");
    expect(builder.setSpoiler(true).name).toBe("SPOILER_howl.ogg");
    expect(builder.spoiler).toBe(true);

    expect(builder.setSpoiler(false).name).toBe("howl.ogg");
    expect(builder.spoiler).toBe(false);
    expect(
      new AttachmentBuilder("x", { name: "SPOILER_SPOILER_a.png" }).setSpoiler(false).name,
    ).toBe("a.png");
  });

  test("GIVEN a spoiler without a name THEN it waits for the name", () => {
    const builder = new AttachmentBuilder("./howl.ogg").setSpoiler();
    expect(builder.spoiler).toBe(true);
    expect(builder.name).toBeUndefined();
    expect(builder.toJSON()).toMatchObject({ spoiler: true });

    expect(builder.setName("howl.ogg").name).toBe("SPOILER_howl.ogg");
    expect(builder.toJSON()).not.toHaveProperty("spoiler");
  });

  test("GIVEN from THEN it copies a builder, a payload, or a received attachment", () => {
    const original = new AttachmentBuilder(new Uint8Array([1]), {
      name: "howl.ogg",
      description: "A howl",
    }).setTitle("Howl");
    const copy = AttachmentBuilder.from(original);
    expect(copy).not.toBe(original);
    expect(copy.toJSON()).toEqual(original.toJSON());

    expect(AttachmentBuilder.from({ attachment: "./a.png", name: "a.png" }).toJSON()).toEqual({
      attachment: "./a.png",
      name: "a.png",
    });

    const received = new Attachment({
      id: "1",
      filename: "SPOILER_pack.png",
      description: "The pack",
      size: 10,
      url: "https://cdn.discordapp.com/attachments/1/1/SPOILER_pack.png",
      proxy_url: "https://media.discordapp.net/attachments/1/1/SPOILER_pack.png",
    });
    const fromReceived = AttachmentBuilder.from(received);
    expect(fromReceived.attachment).toBe(received.url);
    expect(fromReceived.name).toBe("SPOILER_pack.png");
    expect(fromReceived.description).toBe("The pack");
    expect(fromReceived.spoiler).toBe(true);
  });

  test("GIVEN a builder in files THEN the message sends and describes it", async () => {
    const client = createClient();
    const { body, files } = await MessagePayload.create(client, {
      files: [
        new AttachmentBuilder(new Uint8Array([1]), { name: "howl.ogg" })
          .setDescription("A howl")
          .setSpoiler(),
        new AttachmentBuilder(new Uint8Array([2])).setSpoiler(),
      ],
    }).resolve();

    expect(files).toEqual([
      { name: "SPOILER_howl.ogg", data: new Uint8Array([1]) },
      { name: "SPOILER_file.jpg", data: new Uint8Array([2]) },
    ]);
    expect(body.attachments).toEqual([{ id: "0", description: "A howl" }, { id: "1" }]);
  });
});

describe("Attachment", () => {
  test("GIVEN a received attachment THEN attachment is its url, like discord.js", () => {
    const attachment = new Attachment({
      id: "1",
      filename: "pack.png",
      size: 10,
      url: "https://cdn.discordapp.com/attachments/1/1/pack.png",
      proxy_url: "https://media.discordapp.net/attachments/1/1/pack.png",
    });
    expect(attachment.attachment).toBe(attachment.url);
  });
});
