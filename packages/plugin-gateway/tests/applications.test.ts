import { WebSocketShardEvents } from "@discordjs/ws";
import { container } from "@wolfstar/http-framework";
import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  ApplicationFlags,
  ApplicationIntegrationType,
  ApplicationRoleConnectionMetadataType,
  GatewayDispatchEvents,
  GatewayIntentBits,
  GatewayOpcodes,
  OAuth2Scopes,
  Routes,
  TeamMemberMembershipState,
  TeamMemberRole,
  type APIApplication,
  type APITeam,
  type GatewayDispatchPayload,
} from "discord-api-types/v10";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  ApplicationFlagsBitField,
  ClientApplication,
  GatewayClient,
  Team,
  TeamMember,
  User,
} from "../src/index.js";

const clientId = "266624760782258186";
const ownerId = "100000000000000010";

const owner = {
  id: ownerId,
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

function team(extra: Partial<APITeam> = {}): APITeam {
  return {
    id: "300000000000000030",
    name: "Pack",
    icon: "teamicon",
    owner_user_id: ownerId,
    members: [
      {
        user: owner,
        team_id: "300000000000000030",
        membership_state: TeamMemberMembershipState.Accepted,
        permissions: ["*"],
        role: TeamMemberRole.Admin,
      },
    ],
    ...extra,
  };
}

function application(extra: Partial<APIApplication> = {}): APIApplication {
  return {
    id: clientId,
    name: "Wolf",
    icon: "icon",
    description: "A wolf",
    bot_public: true,
    bot_require_code_grant: false,
    summary: "",
    verify_key: "key",
    team: null,
    flags: ApplicationFlags.GatewayMessageContent,
    flags_new: "0",
    cover_image: "cover",
    ...extra,
  } as APIApplication;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("client.application", () => {
  test("GIVEN a new client THEN it holds a partial application with the client ID, before READY", () => {
    const client = createClient();

    expect(client.application).toBeInstanceOf(ClientApplication);
    expect(client.application.id).toBe(clientId);
    expect(client.application.client).toBe(client);
    expect(client.application.partial).toBe(true);
    expect(client.application.name).toBeNull();
    expect(client.application.owner).toBeNull();
    expect(client.application.flags.bitField).toBe(0n);
    expect(client.application.iconURL()).toBeNull();
    expect(client.application.toString()).toBe(clientId);
  });

  test("GIVEN READY THEN it patches the same instance in place with the flags", async () => {
    const client = createClient();
    const before = client.application;

    client.gateway.emit(
      WebSocketShardEvents.Dispatch,
      {
        op: GatewayOpcodes.Dispatch,
        s: 1,
        t: GatewayDispatchEvents.Ready,
        d: {
          user: { ...owner, id: clientId },
          guilds: [],
          session_id: "s",
          application: { id: clientId, flags: ApplicationFlags.GatewayGuildMembers },
        },
      } as GatewayDispatchPayload,
      0,
    );
    await client.idle();

    expect(client.application).toBe(before);
    expect(before.partial).toBe(true);
    expect(before.flags.has("GatewayGuildMembers")).toBe(true);
    expect(before.flags).toBeInstanceOf(ApplicationFlagsBitField);
  });

  test("GIVEN fetch THEN it gets the current application and patches this instance", async () => {
    const client = createClient();
    const get = vi.spyOn(container.rest, "get").mockResolvedValue(
      application({
        team: team(),
        owner,
        guild_id: "400000000000000040",
        tags: ["wolf", "bot"],
        approximate_guild_count: 3,
        approximate_user_install_count: 7,
        interactions_endpoint_url: "https://example.com/interactions",
        custom_install_url: "https://example.com/install",
        install_params: { scopes: [OAuth2Scopes.Bot], permissions: "8" },
        integration_types_config: {
          [ApplicationIntegrationType.GuildInstall]: {
            oauth2_install_params: { scopes: [OAuth2Scopes.Bot], permissions: "2048" },
          },
          [ApplicationIntegrationType.UserInstall]: {},
        },
      }),
    );

    const fetched = await client.application.fetch();

    expect(get).toHaveBeenCalledWith(Routes.currentApplication(), expect.anything());
    expect(fetched).toBe(client.application);
    expect(fetched.partial).toBe(false);
    expect(fetched.name).toBe("Wolf");
    expect(fetched.toString()).toBe("Wolf");
    expect(fetched.description).toBe("A wolf");
    expect(fetched.botPublic).toBe(true);
    expect(fetched.botRequireCodeGrant).toBe(false);
    expect(fetched.guildId).toBe("400000000000000040");
    expect(fetched.tags).toEqual(["wolf", "bot"]);
    expect(fetched.approximateGuildCount).toBe(3);
    expect(fetched.approximateUserInstallCount).toBe(7);
    expect(fetched.interactionsEndpointURL).toBe("https://example.com/interactions");
    expect(fetched.customInstallURL).toBe("https://example.com/install");
    expect(fetched.roleConnectionsVerificationURL).toBeNull();
    expect(fetched.eventWebhooksURL).toBeNull();
    expect(fetched.eventWebhooksStatus).toBeNull();
    expect(fetched.eventWebhooksTypes).toBeNull();
    expect(fetched.installParams?.scopes).toEqual([OAuth2Scopes.Bot]);
    expect(fetched.installParams?.permissions.has("Administrator")).toBe(true);
    expect(
      fetched.integrationTypesConfig?.[ApplicationIntegrationType.GuildInstall]?.oauth2InstallParams
        ?.permissions.bitField,
    ).toBe(2048n);
    expect(fetched.integrationTypesConfig?.[ApplicationIntegrationType.UserInstall]).toEqual({
      oauth2InstallParams: null,
    });
    expect(fetched.guild).toBeNull();
  });

  test("GIVEN CDN hashes THEN it builds the icon and cover URLs", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue(application());

    await client.application.fetch();

    expect(client.application.iconURL()).toBe(
      `https://cdn.discordapp.com/app-icons/${clientId}/icon.webp`,
    );
    expect(client.application.coverURL({ extension: "png", size: 256 })).toBe(
      `https://cdn.discordapp.com/app-icons/${clientId}/cover.png?size=256`,
    );
    const created = Number((BigInt(clientId) >> 22n) + 1_420_070_400_000n);
    expect(client.application.createdTimestamp).toBe(created);
    expect(client.application.createdAt).toEqual(new Date(created));
  });

  test("GIVEN a team application THEN the owner is its team, with members bound to it", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue(application({ team: team(), owner }));

    await client.application.fetch();
    const { owner: value } = client.application;

    expect(value).toBeInstanceOf(Team);
    expect(client.application.owner).toBe(value);
    const pack = value as Team;
    expect(pack.name).toBe("Pack");
    expect(pack.toString()).toBe("Pack");
    expect(pack.iconURL()).toBe(`https://cdn.discordapp.com/team-icons/${pack.id}/teamicon.webp`);
    expect(pack.members.size).toBe(1);
    expect(pack.owner).toBeInstanceOf(TeamMember);
    expect(pack.owner).toBe(pack.members.get(ownerId));
    expect(pack.owner?.team).toBe(pack);
    expect(pack.owner?.role).toBe(TeamMemberRole.Admin);
    expect(pack.owner?.membershipState).toBe(TeamMemberMembershipState.Accepted);
    expect(pack.owner?.permissions).toEqual(["*"]);
    expect(pack.owner?.toString()).toBe(`<@${ownerId}>`);
    expect(pack.owner?.user).toBeInstanceOf(User);
    expect(pack.owner?.user.id).toBe(ownerId);
  });

  test("GIVEN a user-owned application THEN the owner is a User bound to the client", async () => {
    const client = createClient();
    vi.spyOn(container.rest, "get").mockResolvedValue(application({ owner }));

    await client.application.fetch();

    const value = client.application.owner as User;
    expect(value).toBeInstanceOf(User);
    expect(value.id).toBe(ownerId);
    expect(value.client).toBe(client);
    expect(client.application.owner).toBe(value);
  });

  test("GIVEN edit THEN it patches the current application with the resolved options", async () => {
    const client = createClient();
    const patch = vi
      .spyOn(container.rest, "patch")
      .mockResolvedValue(application({ description: "Awoo", tags: ["wolf"] }));

    const edited = await client.application.edit({
      description: "Awoo",
      tags: ["wolf"],
      flags: ["GatewayMessageContent"],
      icon: "data:image/png;base64,AAAA",
      coverImage: null,
      interactionsEndpointURL: null,
      installParams: { scopes: [OAuth2Scopes.Bot], permissions: ["SendMessages"] },
      integrationTypesConfig: {
        [ApplicationIntegrationType.GuildInstall]: {
          oauth2InstallParams: { scopes: [OAuth2Scopes.Bot], permissions: 8n },
        },
      },
    });

    expect(patch).toHaveBeenCalledWith(Routes.currentApplication(), {
      body: {
        description: "Awoo",
        tags: ["wolf"],
        flags: ApplicationFlags.GatewayMessageContent,
        icon: "data:image/png;base64,AAAA",
        cover_image: null,
        interactions_endpoint_url: null,
        install_params: { scopes: [OAuth2Scopes.Bot], permissions: "2048" },
        integration_types_config: {
          [ApplicationIntegrationType.GuildInstall]: {
            oauth2_install_params: { scopes: [OAuth2Scopes.Bot], permissions: "8" },
          },
        },
      },
      signal: undefined,
    });
    expect(edited).toBe(client.application);
    expect(edited.description).toBe("Awoo");
  });

  test("GIVEN edit with no options THEN it sends an empty body", async () => {
    const client = createClient();
    const patch = vi.spyOn(container.rest, "patch").mockResolvedValue(application());

    await client.application.edit({});

    expect(patch).toHaveBeenCalledWith(Routes.currentApplication(), { body: {} });
  });

  test("GIVEN role connection metadata THEN it maps the records to camelCase and back", async () => {
    const client = createClient();
    const record = {
      type: ApplicationRoleConnectionMetadataType.BooleanEqual,
      key: "howls",
      name: "Howls",
      name_localizations: { fr: "Hurlements" },
      description: "Has howled",
      description_localizations: { fr: "A hurlé" },
    };
    vi.spyOn(container.rest, "get").mockResolvedValue([record]);
    const put = vi.spyOn(container.rest, "put").mockResolvedValue([record]);

    const expected = {
      type: ApplicationRoleConnectionMetadataType.BooleanEqual,
      key: "howls",
      name: "Howls",
      nameLocalizations: { fr: "Hurlements" },
      description: "Has howled",
      descriptionLocalizations: { fr: "A hurlé" },
    };
    expect(await client.application.fetchRoleConnectionMetadataRecords()).toEqual([expected]);
    expect(await client.application.editRoleConnectionMetadataRecords([expected])).toEqual([
      expected,
    ]);
    expect(put).toHaveBeenCalledWith(Routes.applicationRoleConnectionMetadata(clientId), {
      body: [record],
    });
  });
});
