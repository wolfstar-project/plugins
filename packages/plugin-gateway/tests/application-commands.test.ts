import { Collection } from "@discordjs/collection";
import { DiscordAPIError } from "@discordjs/rest";
import { container } from "@wolfstar/http-framework";
import { applicationCommandPermissionsKey, createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  ApplicationCommandOptionType,
  ApplicationCommandPermissionType,
  ApplicationCommandType,
  ApplicationIntegrationType,
  ChannelType,
  GatewayDispatchEvents,
  GatewayIntentBits,
  GatewayOpcodes,
  InteractionContextType,
  Locale,
  PermissionFlagsBits,
  Routes,
  type APIApplicationCommand,
  type APIApplicationCommandOption,
  type APIGuildApplicationCommandPermissions,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { WebSocketShardEvents } from "@discordjs/ws";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ApplicationCommand,
  ApplicationCommandManager,
  ApplicationCommandPermissionsManager,
  GatewayClient,
  GatewayError,
  GatewayErrorCodes,
  GatewayTypeError,
  GuildApplicationCommandManager,
  PermissionsBitField,
  type ApplicationCommandData,
} from "../src/index.js";

const clientId = "266624760782258186";
const guildId = "100000000000000010";
const otherGuild = "100000000000000011";
const commandId = "400000000000000040";
const roleId = "300000000000000030";
const userId = "600000000000000600";
const channelId = "200000000000000020";

function createClient() {
  return new GatewayClient({
    discordPublicKey: "0".repeat(64),
    discordToken: "test-token",
    clientId,
    intents: GatewayIntentBits.Guilds,
    cache: createInMemoryCache(),
  });
}

const options: APIApplicationCommandOption[] = [
  {
    type: ApplicationCommandOptionType.String,
    name: "color",
    description: "Pick one",
    required: true,
    choices: [
      { name: "Red", value: "red", name_localizations: { fr: "Rouge" } },
      { name: "Blue", value: "blue" },
    ],
    min_length: 1,
    max_length: 10,
  },
  {
    type: ApplicationCommandOptionType.Channel,
    name: "where",
    description: "Where",
    channel_types: [ChannelType.GuildText, ChannelType.GuildVoice],
  },
  {
    type: ApplicationCommandOptionType.Subcommand,
    name: "nested",
    description: "A subcommand",
    options: [{ type: ApplicationCommandOptionType.Integer, name: "n", description: "A number" }],
  },
];

function command(extra: Partial<APIApplicationCommand> = {}): APIApplicationCommand {
  return {
    id: commandId,
    application_id: clientId,
    type: ApplicationCommandType.ChatInput,
    name: "awoo",
    description: "Howl",
    name_localizations: { fr: "hurler" },
    description_localizations: { fr: "Hurle" },
    options,
    default_member_permissions: "8",
    version: "500000000000000050",
    nsfw: false,
    integration_types: [ApplicationIntegrationType.GuildInstall],
    contexts: [InteractionContextType.Guild],
    ...extra,
  } as APIApplicationCommand;
}

function permissionsOf(
  extra: Partial<APIGuildApplicationCommandPermissions> = {},
): APIGuildApplicationCommandPermissions {
  return {
    id: commandId,
    application_id: clientId,
    guild_id: guildId,
    permissions: [
      { id: roleId, type: ApplicationCommandPermissionType.Role, permission: false },
      { id: userId, type: ApplicationCommandPermissionType.User, permission: true },
      { id: channelId, type: ApplicationCommandPermissionType.Channel, permission: true },
    ],
    ...extra,
  };
}

function unknownPermissions() {
  return new DiscordAPIError(
    { code: 10_066, message: "Unknown application command permissions" },
    10_066,
    404,
    "GET",
    "/permissions",
    {},
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ApplicationCommand", () => {
  test("GIVEN a raw command THEN it exposes the fields with discord.js's shape", () => {
    const built = new ApplicationCommand(command({ guild_id: guildId, nsfw: true }));
    expect(built.id).toBe(commandId);
    expect(built.applicationId).toBe(clientId);
    expect(built.guildId).toBe(guildId);
    expect(built.type).toBe(ApplicationCommandType.ChatInput);
    expect(built.name).toBe("awoo");
    expect(built.nameLocalizations).toEqual({ fr: "hurler" });
    expect(built.nameLocalized).toBeNull();
    expect(built.description).toBe("Howl");
    expect(built.descriptionLocalizations).toEqual({ fr: "Hurle" });
    expect(built.descriptionLocalized).toBeNull();
    expect(built.nsfw).toBe(true);
    expect(built.defaultMemberPermissions).toBeInstanceOf(PermissionsBitField);
    expect(built.defaultMemberPermissions?.has("Administrator")).toBe(true);
    expect(built.integrationTypes).toEqual([ApplicationIntegrationType.GuildInstall]);
    expect(built.contexts).toEqual([InteractionContextType.Guild]);
    expect(built.handler).toBeNull();
    expect(built.version).toBe("500000000000000050");
    expect(built.createdTimestamp).toBe(Number((BigInt(commandId) >> 22n) + 1_420_070_400_000n));
    expect(built.createdAt).toEqual(new Date(built.createdTimestamp));
    expect(built.toJSON().id).toBe(commandId);
  });

  test("GIVEN options THEN they are camel-cased once per payload", () => {
    const built = new ApplicationCommand(command());

    expect(built.options).toBe(built.options);
    expect(built.options?.[0]).toEqual({
      type: ApplicationCommandOptionType.String,
      name: "color",
      description: "Pick one",
      required: true,
      choices: [
        { name: "Red", value: "red", nameLocalizations: { fr: "Rouge" } },
        { name: "Blue", value: "blue" },
      ],
      minLength: 1,
      maxLength: 10,
    });
    expect(built.options?.[1]?.channelTypes).toEqual([
      ChannelType.GuildText,
      ChannelType.GuildVoice,
    ]);
    expect(built.options?.[1]?.required).toBe(false);
    expect(built.options?.[2]?.required).toBeUndefined();
    expect(built.options?.[2]?.options?.[0]?.name).toBe("n");
    expect(new ApplicationCommand(command({ options: undefined })).options).toBeNull();
    expect(
      new ApplicationCommand(command({ default_member_permissions: null }))
        .defaultMemberPermissions,
    ).toBeNull();
  });

  test("GIVEN a global or guild command THEN the manager and guild follow", async () => {
    const client = createClient();
    const global = client.application.commands;
    vi.spyOn(container.rest, "get").mockResolvedValue(command());

    const fetched = await global.fetch(commandId);
    expect(fetched.guildId).toBeNull();
    expect(fetched.manager).toBe(client.application.commands);
    expect(fetched.client).toBe(client);
    expect(await fetched.fetchGuild()).toBeNull();
    expect(fetched.guild).toBeNull();

    const inGuild = await client.guilds.commands(guildId).fetch(commandId);
    expect(inGuild.guildId).toBe(guildId);
    expect(inGuild.manager).toBeInstanceOf(GuildApplicationCommandManager);
    expect(inGuild.manager.guildId).toBe(guildId);
  });

  test("GIVEN edit THEN it patches this command, dropping what the API no longer returns", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(command());
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue(
        command({ name: "howl", options: undefined, name_localizations: undefined }),
      );
    const fetched = await client.application.commands.fetch(commandId);
    expect(get).toHaveBeenCalledTimes(1);
    expect(fetched.options).not.toBeNull();

    const edited = await fetched.edit({ name: "howl", options: [], nameLocalizations: null });

    expect(patch).toHaveBeenCalledWith(Routes.applicationCommand(clientId, commandId), {
      body: { name: "howl", options: [], name_localizations: null },
      signal: undefined,
    });
    expect(edited).toBe(fetched);
    expect(fetched.name).toBe("howl");
    expect(fetched.options).toBeNull();
    expect(fetched.nameLocalizations).toBeNull();
    expect(fetched.description).toBe("Howl");
  });

  test("GIVEN the set helpers THEN each edits one field", async () => {
    const client = createClient();
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(command());
    const built = new ApplicationCommand(command({ guild_id: guildId }));
    const bound = client.guilds.commands(guildId);
    vi.spyOn(client.guilds, "commands").mockReturnValue(bound);

    await built.setName("a");
    await built.setNameLocalizations({ fr: "b" });
    await built.setDescription("c");
    await built.setDescriptionLocalizations({ fr: "d" });
    await built.setDefaultMemberPermissions(["ManageGuild"]);
    await built.setDefaultMemberPermissions(null);
    await built.setOptions([
      { type: ApplicationCommandOptionType.Boolean, name: "on", description: "On" },
    ]);

    const bodies = patch.mock.calls.map(([, init]) => (init as { body: unknown }).body);
    expect(patch.mock.calls[0]?.[0]).toBe(
      Routes.applicationGuildCommand(clientId, guildId, commandId),
    );
    expect(bodies).toEqual([
      { name: "a" },
      { name_localizations: { fr: "b" } },
      { description: "c" },
      { description_localizations: { fr: "d" } },
      { default_member_permissions: PermissionFlagsBits.ManageGuild.toString() },
      { default_member_permissions: null },
      {
        options: [
          {
            type: ApplicationCommandOptionType.Boolean,
            name: "on",
            description: "On",
            required: false,
          },
        ],
      },
    ]);
  });

  test("GIVEN delete THEN it removes the command and resolves to it", async () => {
    const client = createClient();
    const del = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
    const global = new ApplicationCommand(command());
    const local = new ApplicationCommand(command({ guild_id: guildId }));
    const bound = client.guilds.commands(guildId);
    vi.spyOn(client.guilds, "commands").mockReturnValue(bound);

    expect(await global.delete()).toBe(global);
    expect(await local.delete()).toBe(local);

    expect(del).toHaveBeenNthCalledWith(1, Routes.applicationCommand(clientId, commandId), {
      signal: undefined,
    });
    expect(del).toHaveBeenNthCalledWith(
      2,
      Routes.applicationGuildCommand(clientId, guildId, commandId),
      { signal: undefined },
    );
  });

  test("GIVEN permissions THEN they are bound to the command and its guild", () => {
    const client = createClient();
    const global = new ApplicationCommand(command());
    const local = new ApplicationCommand(command({ guild_id: guildId }));

    expect(global.permissions).toBeInstanceOf(ApplicationCommandPermissionsManager);
    expect(global.permissions).toBe(global.permissions);
    expect(global.permissions.commandId).toBe(commandId);
    expect(global.permissions.guildId).toBeNull();
    expect(local.permissions.guildId).toBe(guildId);
    expect(client.application.commands.permissions.commandId).toBeNull();
  });
});

describe("ApplicationCommand#equals", () => {
  const built = new ApplicationCommand(command());

  test("GIVEN the same data in each form THEN they are equal", () => {
    expect(built.equals(built)).toBe(true);
    expect(built.equals(command())).toBe(true);
    expect(built.equals(new ApplicationCommand(command()))).toBe(true);
    expect(
      built.equals({
        name: "awoo",
        description: "Howl",
        nameLocalizations: { fr: "hurler" },
        descriptionLocalizations: { fr: "Hurle" },
        options: built.options!,
        defaultMemberPermissions: PermissionFlagsBits.Administrator,
        integrationTypes: [ApplicationIntegrationType.GuildInstall],
        contexts: [InteractionContextType.Guild],
      } satisfies ApplicationCommandData),
    ).toBe(true);
  });

  test("GIVEN a differing field THEN they are not equal", () => {
    expect(built.equals(command({ id: "1" }))).toBe(false);
    expect(built.equals(command({ name: "other" }))).toBe(false);
    expect(built.equals(command({ description: "Other" }))).toBe(false);
    expect(built.equals(command({ version: "1" }))).toBe(false);
    expect(built.equals(command({ type: ApplicationCommandType.User }))).toBe(false);
    expect(built.equals(command({ nsfw: true }))).toBe(false);
    expect(built.equals(command({ default_member_permissions: "16" }))).toBe(false);
    expect(built.equals(command({ default_member_permissions: null }))).toBe(false);
    expect(built.equals(command({ name_localizations: { fr: "x" } }))).toBe(false);
    expect(built.equals(command({ description_localizations: null }))).toBe(false);
    expect(
      built.equals(command({ integration_types: [ApplicationIntegrationType.UserInstall] })),
    ).toBe(false);
    expect(built.equals(command({ contexts: [InteractionContextType.BotDM] }))).toBe(false);
    expect(built.equals(command({ options: options.slice(1) }))).toBe(false);
    expect(
      built.equals({
        name: "awoo",
        defaultMemberPermissions: PermissionFlagsBits.Administrator + 1n,
      }),
    ).toBe(false);
    expect(built.equals({ name: "awoo", handler: 2 })).toBe(false);
  });

  test("GIVEN a foreign argument THEN it is false rather than throwing", () => {
    expect(built.equals(null)).toBe(false);
    expect(built.equals(undefined)).toBe(false);
    expect(built.equals("awoo")).toBe(false);
    expect(built.equals(42)).toBe(false);
    expect(built.equals({})).toBe(false);
    expect(built.equals({ name: "awoo", options: "nope" })).toBe(false);
    expect(built.equals({ name: "awoo", defaultMemberPermissions: "NotAPermission" })).toBe(false);
  });

  test("GIVEN options in another order THEN they are equal unless the order is enforced", () => {
    const reversed = command({ options: options.toReversed() });

    expect(built.equals(reversed)).toBe(true);
    expect(built.equals(reversed, true)).toBe(false);
  });

  test("GIVEN choices in another order THEN they are equal unless the order is enforced", () => {
    const [color] = options as [APIApplicationCommandOption & { choices: unknown[] }];
    const swapped = command({
      options: [{ ...color, choices: color.choices.toReversed() } as never, ...options.slice(1)],
    });

    expect(built.equals(swapped)).toBe(true);
    expect(built.equals(swapped, true)).toBe(false);
  });

  test("GIVEN a nested option that differs THEN they are not equal", () => {
    const nested = structuredClone(options);
    (nested[2] as { options: { description: string }[] }).options[0]!.description = "Other";
    const [color] = options as [{ choices: { name: string; value: string }[] }];
    const otherChoice = structuredClone(options);
    (otherChoice[0] as unknown as typeof color).choices[0]!.value = "green";
    const otherChannel = structuredClone(options);
    (otherChannel[1] as { channel_types: ChannelType[] }).channel_types = [
      ChannelType.GuildText,
      ChannelType.GuildForum,
    ];

    expect(built.equals(command({ options: nested }))).toBe(false);
    expect(built.equals(command({ options: otherChoice }))).toBe(false);
    expect(built.equals(command({ options: otherChannel }))).toBe(false);
  });

  test("GIVEN optionsEqual THEN it compares recursively and rejects anything else", () => {
    expect(ApplicationCommand.optionsEqual(built.options!, options)).toBe(true);
    expect(ApplicationCommand.optionsEqual(built.options!, options.slice(1))).toBe(false);
    expect(ApplicationCommand.optionsEqual(built.options!, null as never)).toBe(false);
    expect(ApplicationCommand.optionsEqual(null as never, options)).toBe(false);
    expect(ApplicationCommand.optionsEqual(built.options!, ["a", "b", "c"] as never)).toBe(false);
  });
});

describe("ApplicationCommand.transformOption", () => {
  test("GIVEN camel-cased data THEN it builds the raw option, and the other way round", () => {
    const raw = ApplicationCommand.transformOption({
      type: ApplicationCommandOptionType.Number,
      name: "n",
      description: "N",
      nameLocalizations: { fr: "n" },
      minValue: 1,
      maxValue: 5,
      choices: [{ name: "one", value: 1, nameLocalizations: { fr: "un" } }],
    });

    expect(raw).toEqual({
      type: ApplicationCommandOptionType.Number,
      name: "n",
      description: "N",
      required: false,
      name_localizations: { fr: "n" },
      min_value: 1,
      max_value: 5,
      choices: [{ name: "one", value: 1, name_localizations: { fr: "un" } }],
    });
    expect(ApplicationCommand.transformOption(raw, true)).toEqual({
      type: ApplicationCommandOptionType.Number,
      name: "n",
      description: "N",
      required: false,
      nameLocalizations: { fr: "n" },
      minValue: 1,
      maxValue: 5,
      choices: [{ name: "one", value: 1, nameLocalizations: { fr: "un" } }],
    });
  });
});

describe("ApplicationCommand.transformOption nulls", () => {
  test("GIVEN null localizations THEN they are kept to remove them", () => {
    expect(
      ApplicationCommand.transformOption({
        type: ApplicationCommandOptionType.String,
        name: "n",
        description: "N",
        nameLocalizations: null,
        descriptionLocalizations: null,
        choices: [{ name: "a", value: "a", nameLocalizations: null }],
      }),
    ).toEqual({
      type: ApplicationCommandOptionType.String,
      name: "n",
      description: "N",
      required: false,
      name_localizations: null,
      description_localizations: null,
      choices: [{ name: "a", value: "a", name_localizations: null }],
    });
  });
});

describe("ApplicationCommandManager", () => {
  test("GIVEN the managers THEN they are reachable from the application and the guild", () => {
    const client = createClient();

    expect(client.application.commands).toBeInstanceOf(ApplicationCommandManager);
    expect(client.application.commands).toBe(client.application.commands);
    expect(client.application.commands.guildId).toBeNull();
    expect(client.application.commands.permissions).toBeInstanceOf(
      ApplicationCommandPermissionsManager,
    );
    const first = client.guilds.commands(guildId);
    expect(first).toBeInstanceOf(GuildApplicationCommandManager);
    expect(first).toBeInstanceOf(ApplicationCommandManager);
    expect(first).not.toBe(client.guilds.commands(guildId));
    expect(first.guildId).toBe(guildId);
    expect(first.permissions.guildId).toBe(guildId);
  });

  test("GIVEN commandPath THEN it picks the route from the guild and the command", () => {
    const client = createClient();
    const global = client.application.commands;
    const local = client.guilds.commands(guildId);

    expect(global.commandPath()).toBe(Routes.applicationCommands(clientId));
    expect(global.commandPath({ id: commandId })).toBe(
      Routes.applicationCommand(clientId, commandId),
    );
    expect(global.commandPath({ guildId })).toBe(
      Routes.applicationGuildCommands(clientId, guildId),
    );
    expect(global.commandPath({ id: commandId, guildId })).toBe(
      Routes.applicationGuildCommand(clientId, guildId, commandId),
    );
    expect(local.commandPath({ guildId: "1" })).toBe(
      Routes.applicationGuildCommands(clientId, guildId),
    );
  });

  test("GIVEN fetch without options THEN it lists the global commands by ID", async () => {
    const client = createClient();
    const get = vi
      .spyOn(container.rest, "get")
      .mockResolvedValue([command(), command({ id: "2", name: "other" })]);

    const commands = await client.application.commands.fetch();

    expect(get).toHaveBeenCalledWith(Routes.applicationCommands(clientId), {
      query: expect.any(URLSearchParams),
      signal: undefined,
    });
    expect(commands).toBeInstanceOf(Collection);
    expect([...commands.keys()]).toEqual([commandId, "2"]);
    expect(commands.get("2")).toBeInstanceOf(ApplicationCommand);
    expect(commands.get("2")?.name).toBe("other");
  });

  test("GIVEN fetch options THEN it picks the route, the query, and the locale header", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue([command()]);

    const inGuild = await client.application.commands.fetch({ guildId, withLocalizations: true });
    const localized = await client.guilds.commands(guildId).fetch({ locale: Locale.French });

    const [firstRoute, firstInit] = get.mock.calls[0]!;
    expect(firstRoute).toBe(Routes.applicationGuildCommands(clientId, guildId));
    expect((firstInit as { query: URLSearchParams }).query.get("with_localizations")).toBe("true");
    expect(inGuild.get(commandId)?.guildId).toBe(guildId);

    const [secondRoute, secondInit] = get.mock.calls[1]!;
    expect(secondRoute).toBe(Routes.applicationGuildCommands(clientId, guildId));
    expect((secondInit as { headers: unknown }).headers).toEqual({ "X-Discord-Locale": "fr" });
    expect(localized.get(commandId)?.guildId).toBe(guildId);
  });

  test("GIVEN fetch of one command THEN it asks for it, with an ID or options", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(command());

    const byId = await client.application.commands.fetch(commandId);
    const inGuild = await client.application.commands.fetch({ id: commandId, guildId });
    const bound = await client.guilds.commands(otherGuild).fetch({ id: commandId, guildId });

    expect(get.mock.calls.map(([route]) => route)).toEqual([
      Routes.applicationCommand(clientId, commandId),
      Routes.applicationGuildCommand(clientId, guildId, commandId),
      Routes.applicationGuildCommand(clientId, otherGuild, commandId),
    ]);
    expect(byId.guildId).toBeNull();
    expect(inGuild.guildId).toBe(guildId);
    expect(bound.guildId).toBe(otherGuild);
  });

  test("GIVEN create THEN it posts the transformed command", async () => {
    const client = createClient();
    const post = vi.spyOn(container.rest, "post").mockResolvedValue(command());
    const builder = { toJSON: () => ({ name: "built", description: "From a builder" }) };

    const created = await client.application.commands.create({
      name: "awoo",
      description: "Howl",
      defaultMemberPermissions: ["Administrator"],
      options: [{ type: ApplicationCommandOptionType.Boolean, name: "on", description: "On" }],
    });
    await client.application.commands.create(builder);
    await client.application.commands.create({
      name: "snake",
      description: "s",
      default_member_permissions: "8",
    });
    await client.application.commands.create({ name: "local", description: "l" }, guildId);
    await client.guilds.commands(otherGuild).create({ name: "bound", description: "b" }, guildId);

    expect(created).toBeInstanceOf(ApplicationCommand);
    expect(post.mock.calls.map(([route]) => route)).toEqual([
      Routes.applicationCommands(clientId),
      Routes.applicationCommands(clientId),
      Routes.applicationCommands(clientId),
      Routes.applicationGuildCommands(clientId, guildId),
      Routes.applicationGuildCommands(clientId, otherGuild),
    ]);
    const bodies = post.mock.calls.map(([, init]) => (init as { body: unknown }).body);
    expect(bodies[0]).toEqual({
      name: "awoo",
      description: "Howl",
      default_member_permissions: "8",
      options: [
        {
          type: ApplicationCommandOptionType.Boolean,
          name: "on",
          description: "On",
          required: false,
        },
      ],
    });
    expect(bodies[1]).toEqual({ name: "built", description: "From a builder" });
    expect(bodies[2]).toEqual({ name: "snake", description: "s", default_member_permissions: "8" });
  });

  test("GIVEN set THEN it overwrites the commands and returns them by ID", async () => {
    const client = createClient();
    const put = vi.spyOn(container.rest, "put").mockResolvedValue([command()]);

    const global = await client.application.commands.set([{ name: "awoo", description: "Howl" }]);
    const emptied = await client.guilds.commands(guildId).set([]);

    expect(put).toHaveBeenNthCalledWith(1, Routes.applicationCommands(clientId), {
      body: [{ name: "awoo", description: "Howl" }],
      signal: undefined,
    });
    expect(put).toHaveBeenNthCalledWith(2, Routes.applicationGuildCommands(clientId, guildId), {
      body: [],
      signal: undefined,
    });
    expect(global.get(commandId)).toBeInstanceOf(ApplicationCommand);
    expect(emptied.get(commandId)?.guildId).toBe(guildId);
  });

  test("GIVEN edit and delete THEN they take a command, a raw one, or an ID", async () => {
    const client = createClient();
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(command({ name: "new" }));
    const del = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
    const manager = client.application.commands;

    const edited = await manager.edit(commandId, { description: "New" });
    await manager.edit(command(), { description: "New" }, guildId);
    await manager.delete(command());
    await manager.delete(commandId, guildId);

    expect(edited.name).toBe("new");
    expect(patch.mock.calls.map(([route]) => route)).toEqual([
      Routes.applicationCommand(clientId, commandId),
      Routes.applicationGuildCommand(clientId, guildId, commandId),
    ]);
    expect(del.mock.calls.map(([route]) => route)).toEqual([
      Routes.applicationCommand(clientId, commandId),
      Routes.applicationGuildCommand(clientId, guildId, commandId),
    ]);
  });

  test("GIVEN a raw guild command THEN edit and delete route to its guild", async () => {
    const client = createClient();
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(command());
    const del = vi.spyOn(container.rest, "delete").mockResolvedValue(undefined);
    const raw = command({ guild_id: guildId });

    await client.application.commands.edit(raw, { description: "New" });
    await client.application.commands.delete(raw);

    expect(patch.mock.calls.map(([route]) => route)).toEqual([
      Routes.applicationGuildCommand(clientId, guildId, commandId),
    ]);
    expect(del.mock.calls.map(([route]) => route)).toEqual([
      Routes.applicationGuildCommand(clientId, guildId, commandId),
    ]);
  });

  test("GIVEN something without an ID THEN edit and delete throw an InvalidType error", async () => {
    const client = createClient();
    const rest = vi.spyOn(container.rest, "patch");

    for (const run of [
      () => client.application.commands.edit({} as never, {}),
      () => client.application.commands.delete(undefined as never),
    ]) {
      const error = await run().catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(GatewayTypeError);
      expect((error as GatewayTypeError).code).toBe(GatewayErrorCodes.InvalidType);
    }
    expect(rest).not.toHaveBeenCalled();
  });

  test("GIVEN transformCommand THEN it keeps what is defined and passes builders through", () => {
    expect(
      ApplicationCommandManager.transformCommand({
        name: "n",
        description: "d",
        nameLocalizations: { fr: "n" },
        descriptionLocalizations: null,
        nsfw: true,
        type: ApplicationCommandType.ChatInput,
        defaultMemberPermissions: null,
        integrationTypes: [ApplicationIntegrationType.UserInstall],
        contexts: [InteractionContextType.PrivateChannel],
      }),
    ).toEqual({
      name: "n",
      description: "d",
      name_localizations: { fr: "n" },
      description_localizations: null,
      nsfw: true,
      type: ApplicationCommandType.ChatInput,
      default_member_permissions: null,
      integration_types: [ApplicationIntegrationType.UserInstall],
      contexts: [InteractionContextType.PrivateChannel],
    });
    const edit = ApplicationCommandManager.transformCommand({
      name: "n",
      defaultMemberPermissions: undefined,
    } as never);
    expect("default_member_permissions" in edit).toBe(false);
    const builder = { toJSON: vi.fn(() => ({ name: "b", description: "b" })) };
    expect(ApplicationCommandManager.transformCommand(builder)).toEqual({
      name: "b",
      description: "b",
    });
    expect(builder.toJSON).toHaveBeenCalledOnce();
  });
});

describe("ApplicationCommandPermissionsManager", () => {
  test("GIVEN permissionsPath THEN it picks the route from the command", () => {
    const manager = createClient().application.commands.permissions;

    expect(manager.permissionsPath(guildId, commandId)).toBe(
      Routes.applicationCommandPermissions(clientId, guildId, commandId),
    );
    expect(manager.permissionsPath(guildId)).toBe(
      Routes.guildApplicationCommandsPermissions(clientId, guildId),
    );
  });

  test("GIVEN no guild THEN every method throws GlobalCommandPermissions", async () => {
    const manager = createClient().application.commands.permissions;
    const rest = vi.spyOn(container.rest, "get");

    for (const run of [
      () => manager.fetch(),
      () => manager.fetch({ command: commandId }),
      () => manager.has({ command: commandId, permissionId: userId }),
      () => manager.set({ command: commandId, permissions: [], token: "t" }),
      () => manager.add({ command: commandId, permissions: [], token: "t" }),
      () => manager.remove({ command: commandId, users: [userId], token: "t" }),
    ]) {
      const error = await run().catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(GatewayError);
      expect((error as GatewayError).code).toBe(GatewayErrorCodes.GlobalCommandPermissions);
    }
    expect(rest).not.toHaveBeenCalled();
  });

  test("GIVEN fetch of one command THEN it returns its permissions and caches them", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(permissionsOf());

    const permissions = await client.application.commands.permissions.fetch({
      guild: guildId,
      command: commandId,
    });

    expect(get).toHaveBeenCalledWith(
      Routes.applicationCommandPermissions(clientId, guildId, commandId),
      { signal: undefined },
    );
    expect(permissions).toHaveLength(3);
    expect(
      await client.cache!.applicationCommandPermissions!.get(
        applicationCommandPermissionsKey(clientId, guildId, commandId),
      ),
    ).toEqual(permissionsOf());
  });

  test("GIVEN cached permissions THEN fetch reads them unless forced", async () => {
    const client = createClient();
    const get = vi
      .spyOn(container.rest, "get")
      .mockResolvedValue(permissionsOf({ permissions: [] }));
    await client.cache!.applicationCommandPermissions!.set(
      applicationCommandPermissionsKey(clientId, guildId, commandId),
      permissionsOf(),
    );
    const manager = client.guilds.commands(guildId).permissions;

    expect(await manager.fetch({ command: commandId })).toHaveLength(3);
    expect(get).not.toHaveBeenCalled();
    expect(await manager.fetch({ command: commandId, force: true })).toEqual([]);
    expect(get).toHaveBeenCalledOnce();
    expect(await manager.fetch({ command: commandId })).toEqual([]);
  });

  test("GIVEN a gateway permissions update THEN fetch reads it", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get");

    client.gateway.emit(
      WebSocketShardEvents.Dispatch,
      {
        op: GatewayOpcodes.Dispatch,
        s: 1,
        t: GatewayDispatchEvents.ApplicationCommandPermissionsUpdate,
        d: permissionsOf(),
      } as GatewayDispatchPayload,
      0,
    );
    await client.idle();

    const permissions = await client.guilds
      .commands(guildId)
      .permissions.fetch({ command: commandId });
    expect(permissions).toHaveLength(3);
    expect(get).not.toHaveBeenCalled();
  });

  test("GIVEN fetch without a command THEN it returns the permissions of every command by ID", async () => {
    const client = createClient();
    const get = vi
      .spyOn(container.rest, "get")
      .mockResolvedValue([permissionsOf(), permissionsOf({ id: clientId, permissions: [] })]);

    const all = await client.guilds.commands(guildId).permissions.fetch();

    expect(get).toHaveBeenCalledWith(
      Routes.guildApplicationCommandsPermissions(clientId, guildId),
      {
        signal: undefined,
      },
    );
    expect(all).toBeInstanceOf(Collection);
    expect((all as Collection<string, unknown[]>).get(commandId)).toHaveLength(3);
    expect((all as Collection<string, unknown[]>).get(clientId)).toEqual([]);
    expect(
      await client.cache!.applicationCommandPermissions!.has(
        applicationCommandPermissionsKey(clientId, guildId, clientId),
      ),
    ).toBe(true);
  });

  test("GIVEN a client without the cache THEN fetch always asks the API", async () => {
    const client = new GatewayClient({
      discordPublicKey: "0".repeat(64),
      discordToken: "test-token",
      clientId,
      intents: 0,
      cache: null,
    });
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(permissionsOf());

    await client.application.commands.permissions.fetch({ guild: guildId, command: commandId });
    await client.application.commands.permissions.fetch({ guild: guildId, command: commandId });

    expect(get).toHaveBeenCalledTimes(2);
  });

  test("GIVEN a command or guild bound manager THEN it ignores the options it is bound to", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(permissionsOf());
    const bound = new ApplicationCommand(command({ guild_id: guildId })).permissions;

    await bound.fetch({ guild: otherGuild, command: "1", force: true });
    await client.guilds
      .commands(guildId)
      .permissions.fetch({ guild: otherGuild, command: commandId, force: true });

    expect(get.mock.calls.map(([route]) => route)).toEqual([
      Routes.applicationCommandPermissions(clientId, guildId, commandId),
      Routes.applicationCommandPermissions(clientId, guildId, commandId),
    ]);
  });

  test("GIVEN a guild resolvable THEN the guild of the option is used", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(permissionsOf());
    const manager = client.application.commands.permissions;

    await manager.fetch({ guild: { guildId } as never, command: commandId, force: true });
    await manager.fetch({
      guild: { id: otherGuild } as never,
      command: { id: commandId } as never,
      force: true,
    });

    expect(get.mock.calls.map(([route]) => route)).toEqual([
      Routes.applicationCommandPermissions(clientId, guildId, commandId),
      Routes.applicationCommandPermissions(clientId, otherGuild, commandId),
    ]);
  });

  test("GIVEN set without a token THEN it throws ApplicationCommandPermissionsTokenMissing", async () => {
    const client = createClient();
    const put = vi.spyOn(container.rest, "put");
    const manager = client.guilds.commands(guildId).permissions;

    for (const run of [
      () => manager.set({ command: commandId, permissions: [], token: "" }),
      () => manager.add({ command: commandId, permissions: [], token: undefined as never }),
      () => manager.remove({ command: commandId, users: [userId], token: "" }),
    ]) {
      const error = await run().catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(GatewayError);
      expect((error as GatewayError).code).toBe(
        GatewayErrorCodes.ApplicationCommandPermissionsTokenMissing,
      );
    }
    expect(put).not.toHaveBeenCalled();
  });

  test("GIVEN set THEN it puts the permissions with the bearer token, and caches the result", async () => {
    const client = createClient();
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(permissionsOf());
    const permissions = permissionsOf().permissions;

    const stored = await client.guilds
      .commands(guildId)
      .permissions.set({ command: commandId, permissions, token: "user-token" });

    expect(put).toHaveBeenCalledWith(
      Routes.applicationCommandPermissions(clientId, guildId, commandId),
      {
        auth: false,
        headers: { Authorization: "Bearer user-token" },
        body: { permissions },
        signal: undefined,
      },
    );
    expect(stored).toEqual(permissions);
    expect(
      await client.cache!.applicationCommandPermissions!.get(
        applicationCommandPermissionsKey(clientId, guildId, commandId),
      ),
    ).toEqual(permissionsOf());
  });

  test("GIVEN set without a command THEN it edits the permissions of the guild as a whole", async () => {
    const client = createClient();
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(permissionsOf({ id: clientId }));

    await client.application.commands.permissions.set({
      guild: guildId,
      permissions: [],
      token: "t",
    });

    expect(put.mock.calls[0]?.[0]).toBe(
      Routes.applicationCommandPermissions(clientId, guildId, clientId),
    );
  });

  test("GIVEN set with permissions that are no array THEN it throws an InvalidType error", async () => {
    const client = createClient();
    const put = vi.spyOn(container.rest, "put");

    const error = await client.guilds
      .commands(guildId)
      .permissions.set({ command: commandId, permissions: "all" as never, token: "t" })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(GatewayTypeError);
    expect((error as GatewayTypeError).code).toBe(GatewayErrorCodes.InvalidType);
    expect(put).not.toHaveBeenCalled();
  });

  test("GIVEN add THEN it merges into the permissions the API has, new ones first", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(permissionsOf());
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(permissionsOf());
    // A cached copy must not stand in for what the write merges into.
    await client.cache!.applicationCommandPermissions!.set(
      applicationCommandPermissionsKey(clientId, guildId, commandId),
      permissionsOf({ permissions: [] }),
    );

    await client.guilds.commands(guildId).permissions.add({
      command: commandId,
      token: "t",
      permissions: [
        { id: roleId, type: ApplicationCommandPermissionType.Role, permission: true },
        { id: otherGuild, type: ApplicationCommandPermissionType.Role, permission: false },
      ],
    });

    expect(get).toHaveBeenCalledOnce();
    expect((put.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      permissions: [
        { id: roleId, type: ApplicationCommandPermissionType.Role, permission: true },
        { id: otherGuild, type: ApplicationCommandPermissionType.Role, permission: false },
        { id: userId, type: ApplicationCommandPermissionType.User, permission: true },
        { id: channelId, type: ApplicationCommandPermissionType.Channel, permission: true },
      ],
    });
  });

  test("GIVEN a command without permissions THEN add treats them as empty", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockRejectedValue(unknownPermissions());
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(permissionsOf());
    const permission = {
      id: userId,
      type: ApplicationCommandPermissionType.User,
      permission: true,
    };

    await client.guilds
      .commands(guildId)
      .permissions.add({ command: commandId, token: "t", permissions: [permission] });

    expect((put.mock.calls[0]![1] as { body: unknown }).body).toEqual({
      permissions: [permission],
    });
  });

  test("GIVEN another error THEN add rethrows it", async () => {
    const client = createClient();
    const failure = new Error("boom");
    vi.spyOn(container.rest, "get").mockRejectedValue(failure);
    const put = vi.spyOn(container.rest, "put");

    await expect(
      client.guilds
        .commands(guildId)
        .permissions.add({ command: commandId, token: "t", permissions: [] }),
    ).rejects.toBe(failure);
    expect(put).not.toHaveBeenCalled();
  });

  test("GIVEN remove THEN it puts what is left, resolving IDs and structures", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue(permissionsOf());
    const put = vi.spyOn(container.rest, "put").mockResolvedValue(permissionsOf());
    const manager = client.guilds.commands(guildId).permissions;

    await manager.remove({ command: commandId, token: "t", roles: [{ id: roleId } as never] });
    await manager.remove({
      command: commandId,
      token: "t",
      users: [userId],
      channels: [channelId],
    });
    await manager.remove({ command: commandId, token: "t", users: [], roles: [] });

    const bodies = put.mock.calls.map(
      ([, init]) => (init as { body: { permissions: { id: string }[] } }).body,
    );
    expect(bodies[0]!.permissions.map((permission) => permission.id)).toEqual([userId, channelId]);
    expect(bodies[1]!.permissions.map((permission) => permission.id)).toEqual([roleId]);
    expect(bodies[2]!.permissions).toHaveLength(3);
  });

  test("GIVEN remove with nothing to remove THEN it throws, and so does a bad element", async () => {
    const client = createClient();
    const put = vi.spyOn(container.rest, "put");
    const manager = client.guilds.commands(guildId).permissions;

    for (const input of [
      {},
      { users: "nope" },
      { roles: [{}] },
      { channels: [null] },
      { users: [{}] },
    ]) {
      const error = await manager
        .remove({ command: commandId, token: "t", ...input } as never)
        .catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(GatewayTypeError);
      expect((error as GatewayTypeError).code).toMatch(/^Invalid(Type|Element)$/);
    }
    expect(put).not.toHaveBeenCalled();
  });

  test("GIVEN has THEN it looks the ID up, by type when asked", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue(permissionsOf());
    const manager = client.guilds.commands(guildId).permissions;

    expect(await manager.has({ command: commandId, permissionId: userId })).toBe(true);
    expect(await manager.has({ command: commandId, permissionId: { id: roleId } as never })).toBe(
      true,
    );
    expect(await manager.has({ command: commandId, permissionId: otherGuild })).toBe(false);
    expect(
      await manager.has({
        command: commandId,
        permissionId: userId,
        permissionType: ApplicationCommandPermissionType.Role,
      }),
    ).toBe(false);
  });

  test("GIVEN has without a command or an ID THEN it throws, and a command without permissions has none", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockRejectedValue(unknownPermissions());
    const manager = client.guilds.commands(guildId).permissions;

    expect(await manager.has({ command: commandId, permissionId: userId })).toBe(false);
    for (const input of [
      { permissionId: userId },
      { command: commandId, permissionId: undefined },
    ]) {
      const error = await manager.has(input as never).catch((reason: unknown) => reason);
      expect(error).toBeInstanceOf(GatewayTypeError);
      expect((error as GatewayTypeError).code).toBe(GatewayErrorCodes.InvalidType);
    }
    expect(get).toHaveBeenCalledOnce();
  });

  test("GIVEN the application manager THEN a command resolvable without an ID throws an InvalidType error", async () => {
    const manager = createClient().application.commands.permissions;

    const error = await manager
      .fetch({ guild: guildId, command: {} as never })
      .catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(GatewayTypeError);
    expect((error as GatewayTypeError).code).toBe(GatewayErrorCodes.InvalidType);
  });
});
