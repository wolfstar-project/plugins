import { GatewayDispatchEvents } from "discord-api-types/v10";
import type {
  APIEmoji,
  APIGuildMember,
  APIRole,
  APISoundboardSound,
  APISticker,
  GatewayDispatchPayload,
  GatewayGuildCreateDispatchData,
  GatewayGuildMembersChunkDispatchData,
  GatewayGuildSoundboardSoundsUpdateDispatchData,
  GatewaySoundboardSoundsDispatchData,
  GatewayThreadListSync,
  GatewayThreadMembersUpdateDispatchData,
  Snowflake,
} from "discord-api-types/v10";
import {
  applicationCommandPermissionsKey,
  autoModerationRuleKey,
  banKey,
  emojiKey,
  guildScopedKey,
  integrationKey,
  inviteKey,
  memberKey,
  messageKey,
  presenceKey,
  roleKey,
  scheduledEventKey,
  soundboardSoundKey,
  stageInstanceKey,
  stickerKey,
  threadMemberKey,
  voiceStateKey,
} from "./keys.js";
import type { Cache, CacheEntityName, EntityCache } from "./types.js";

// A record rather than an array so the compiler enforces that every entity cache is listed.
const cacheEntityNameRecord: Record<CacheEntityName, true> = {
  applicationCommandPermissions: true,
  auditLogEntries: true,
  autoModerationRules: true,
  bans: true,
  channels: true,
  emojis: true,
  entitlements: true,
  guilds: true,
  integrations: true,
  invites: true,
  members: true,
  messages: true,
  presences: true,
  roles: true,
  scheduledEvents: true,
  soundboardSounds: true,
  stageInstances: true,
  stickers: true,
  subscriptions: true,
  threadMembers: true,
  threads: true,
  users: true,
  voiceStates: true,
};

/**
 * The name of every entity cache held by a {@link Cache}.
 */
export const CacheEntityNames = Object.keys(cacheEntityNameRecord) as readonly CacheEntityName[];

/**
 * A single mutation a gateway dispatch produces on a {@link Cache}.
 */
export type CacheOperation =
  | {
      type: "upsert";
      store: CacheEntityName;
      key: string;
      raw: unknown;
      /** Whether to shallow-merge `raw` onto the existing value, used for partial updates. */
      merge?: boolean;
    }
  | { type: "delete"; store: CacheEntityName; key: string }
  | { type: "deletePrefix"; store: CacheEntityName; prefix: string }
  | { type: "deleteWhere"; store: CacheEntityName; predicate: (value: unknown) => boolean };

/**
 * Translates a gateway dispatch into the list of {@link CacheOperation}s it implies, including the cascades (e.g.
 * `CHANNEL_DELETE` also drops that channel's messages).
 *
 * @remarks
 * This is a pure function, it does not touch any cache. Use {@link applyGatewayDispatch} to apply them.
 * `INTERACTION_CREATE` is intentionally ignored: interactions are short-lived and never cached.
 *
 * @param payload The gateway dispatch payload.
 */
export function createCacheOperations(payload: GatewayDispatchPayload): CacheOperation[] {
  const operations: CacheOperation[] = [];

  switch (payload.t) {
    case GatewayDispatchEvents.ApplicationCommandPermissionsUpdate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "applicationCommandPermissions",
        key: applicationCommandPermissionsKey(data.application_id, data.guild_id, data.id),
        raw: data,
      });
      break;
    }

    case GatewayDispatchEvents.AutoModerationRuleCreate:
    case GatewayDispatchEvents.AutoModerationRuleUpdate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "autoModerationRules",
        key: autoModerationRuleKey(data.guild_id, data.id),
        raw: data,
      });
      break;
    }

    case GatewayDispatchEvents.AutoModerationRuleDelete: {
      const data = payload.d;
      operations.push({
        type: "delete",
        store: "autoModerationRules",
        key: autoModerationRuleKey(data.guild_id, data.id),
      });
      break;
    }

    case GatewayDispatchEvents.ChannelCreate:
    case GatewayDispatchEvents.ChannelUpdate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "channels",
        key: data.id,
        raw: data,
        merge: payload.t === GatewayDispatchEvents.ChannelUpdate,
      });
      break;
    }

    case GatewayDispatchEvents.ChannelDelete: {
      const data = payload.d;
      operations.push({ type: "delete", store: "channels", key: data.id });
      operations.push({ type: "deletePrefix", store: "messages", prefix: `${data.id}:` });
      break;
    }

    case GatewayDispatchEvents.EntitlementCreate:
    case GatewayDispatchEvents.EntitlementUpdate: {
      const data = payload.d;
      operations.push({ type: "upsert", store: "entitlements", key: data.id, raw: data });
      break;
    }

    case GatewayDispatchEvents.EntitlementDelete: {
      operations.push({ type: "delete", store: "entitlements", key: payload.d.id });
      break;
    }

    case GatewayDispatchEvents.GuildAuditLogEntryCreate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "auditLogEntries",
        key: guildScopedKey(data.guild_id, data.id),
        raw: data,
      });
      break;
    }

    case GatewayDispatchEvents.GuildBanAdd: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "bans",
        key: banKey(data.guild_id, data.user.id),
        raw: data,
      });
      operations.push({ type: "upsert", store: "users", key: data.user.id, raw: data.user });
      break;
    }

    case GatewayDispatchEvents.GuildBanRemove: {
      const data = payload.d;
      operations.push({ type: "delete", store: "bans", key: banKey(data.guild_id, data.user.id) });
      operations.push({ type: "upsert", store: "users", key: data.user.id, raw: data.user });
      break;
    }

    case GatewayDispatchEvents.GuildCreate: {
      hydrateGuildCreate(operations, payload.d);
      break;
    }

    case GatewayDispatchEvents.GuildUpdate: {
      const data = payload.d;
      operations.push({ type: "upsert", store: "guilds", key: data.id, raw: data, merge: true });
      break;
    }

    case GatewayDispatchEvents.GuildDelete: {
      const data = payload.d;
      // An `unavailable` guild is an outage, not a removal: keep its data around until it comes back.
      if (data.unavailable) {
        operations.push({ type: "upsert", store: "guilds", key: data.id, raw: data, merge: true });
        break;
      }

      operations.push({ type: "delete", store: "guilds", key: data.id });
      deleteGuildScopedResources(operations, data.id);
      break;
    }

    case GatewayDispatchEvents.GuildEmojisUpdate: {
      const data = payload.d;
      operations.push({ type: "deletePrefix", store: "emojis", prefix: `${data.guild_id}:` });
      for (const emoji of data.emojis) {
        if (!emoji.id) continue;
        operations.push({
          type: "upsert",
          store: "emojis",
          key: emojiKey(data.guild_id, emoji.id),
          raw: withGuildId(emoji, data.guild_id),
        });
      }
      break;
    }

    case GatewayDispatchEvents.GuildStickersUpdate: {
      const data = payload.d;
      operations.push({ type: "deletePrefix", store: "stickers", prefix: `${data.guild_id}:` });
      for (const sticker of data.stickers) {
        operations.push({
          type: "upsert",
          store: "stickers",
          key: stickerKey(data.guild_id, sticker.id),
          raw: withGuildId(sticker, data.guild_id),
        });
      }
      break;
    }

    case GatewayDispatchEvents.GuildMemberAdd:
    case GatewayDispatchEvents.GuildMemberUpdate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "members",
        key: memberKey(data.guild_id, data.user.id),
        raw: data,
        merge: true,
      });
      operations.push({ type: "upsert", store: "users", key: data.user.id, raw: data.user });
      break;
    }

    case GatewayDispatchEvents.GuildMemberRemove: {
      const data = payload.d;
      operations.push({
        type: "delete",
        store: "members",
        key: memberKey(data.guild_id, data.user.id),
      });
      operations.push({ type: "upsert", store: "users", key: data.user.id, raw: data.user });
      break;
    }

    case GatewayDispatchEvents.GuildMembersChunk: {
      hydrateGuildMembersChunk(operations, payload.d);
      break;
    }

    case GatewayDispatchEvents.GuildRoleCreate:
    case GatewayDispatchEvents.GuildRoleUpdate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "roles",
        key: roleKey(data.guild_id, data.role.id),
        raw: withGuildId(data.role, data.guild_id),
        merge: payload.t === GatewayDispatchEvents.GuildRoleUpdate,
      });
      break;
    }

    case GatewayDispatchEvents.GuildRoleDelete: {
      const data = payload.d;
      operations.push({
        type: "delete",
        store: "roles",
        key: roleKey(data.guild_id, data.role_id),
      });
      break;
    }

    case GatewayDispatchEvents.GuildScheduledEventCreate:
    case GatewayDispatchEvents.GuildScheduledEventUpdate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "scheduledEvents",
        key: scheduledEventKey(data.guild_id, data.id),
        raw: data,
        merge: true,
      });
      break;
    }

    case GatewayDispatchEvents.GuildScheduledEventDelete: {
      const data = payload.d;
      operations.push({
        type: "delete",
        store: "scheduledEvents",
        key: scheduledEventKey(data.guild_id, data.id),
      });
      break;
    }

    case GatewayDispatchEvents.GuildSoundboardSoundCreate:
    case GatewayDispatchEvents.GuildSoundboardSoundUpdate: {
      const data = payload.d;
      if (!data.guild_id) break;
      operations.push({
        type: "upsert",
        store: "soundboardSounds",
        key: soundboardSoundKey(data.guild_id, data.sound_id),
        raw: data,
        merge: payload.t === GatewayDispatchEvents.GuildSoundboardSoundUpdate,
      });
      break;
    }

    case GatewayDispatchEvents.GuildSoundboardSoundDelete: {
      const data = payload.d;
      operations.push({
        type: "delete",
        store: "soundboardSounds",
        key: soundboardSoundKey(data.guild_id, data.sound_id),
      });
      break;
    }

    case GatewayDispatchEvents.GuildSoundboardSoundsUpdate: {
      hydrateGuildSoundboardSoundsUpdate(operations, payload.d);
      break;
    }

    case GatewayDispatchEvents.SoundboardSounds: {
      hydrateSoundboardSounds(operations, payload.d);
      break;
    }

    case GatewayDispatchEvents.IntegrationCreate:
    case GatewayDispatchEvents.IntegrationUpdate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "integrations",
        key: integrationKey(data.guild_id, data.id),
        raw: data,
        merge: true,
      });
      break;
    }

    case GatewayDispatchEvents.IntegrationDelete: {
      const data = payload.d;
      operations.push({
        type: "delete",
        store: "integrations",
        key: integrationKey(data.guild_id, data.id),
      });
      break;
    }

    case GatewayDispatchEvents.InviteCreate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "invites",
        key: inviteKey(data.guild_id, data.code),
        raw: data,
      });
      break;
    }

    case GatewayDispatchEvents.InviteDelete: {
      const data = payload.d;
      operations.push({
        type: "delete",
        store: "invites",
        key: inviteKey(data.guild_id, data.code),
      });
      break;
    }

    case GatewayDispatchEvents.MessageCreate:
    case GatewayDispatchEvents.MessageUpdate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "messages",
        key: messageKey(data.channel_id, data.id),
        raw: data,
        merge: payload.t === GatewayDispatchEvents.MessageUpdate,
      });

      const author = "author" in data ? data.author : undefined;
      if (author) {
        operations.push({ type: "upsert", store: "users", key: author.id, raw: author });
        if (data.member && data.guild_id) {
          operations.push({
            type: "upsert",
            store: "members",
            key: memberKey(data.guild_id, author.id),
            raw: withGuildId(data.member, data.guild_id),
            merge: true,
          });
        }
      }
      break;
    }

    case GatewayDispatchEvents.MessageDelete: {
      const data = payload.d;
      operations.push({
        type: "delete",
        store: "messages",
        key: messageKey(data.channel_id, data.id),
      });
      break;
    }

    case GatewayDispatchEvents.MessageDeleteBulk: {
      const data = payload.d;
      for (const id of data.ids) {
        operations.push({
          type: "delete",
          store: "messages",
          key: messageKey(data.channel_id, id),
        });
      }
      break;
    }

    case GatewayDispatchEvents.PresenceUpdate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "presences",
        key: presenceKey(data.guild_id, data.user.id),
        raw: data,
        merge: true,
      });
      operations.push({
        type: "upsert",
        store: "users",
        key: data.user.id,
        raw: data.user,
        merge: true,
      });
      break;
    }

    case GatewayDispatchEvents.Ready: {
      const data = payload.d;
      operations.push({ type: "upsert", store: "users", key: data.user.id, raw: data.user });
      for (const guild of data.guilds) {
        operations.push({
          type: "upsert",
          store: "guilds",
          key: guild.id,
          raw: guild,
          merge: true,
        });
      }
      break;
    }

    case GatewayDispatchEvents.StageInstanceCreate:
    case GatewayDispatchEvents.StageInstanceUpdate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "stageInstances",
        key: stageInstanceKey(data.guild_id, data.channel_id),
        raw: data,
        merge: true,
      });
      break;
    }

    case GatewayDispatchEvents.StageInstanceDelete: {
      const data = payload.d;
      operations.push({
        type: "delete",
        store: "stageInstances",
        key: stageInstanceKey(data.guild_id, data.channel_id),
      });
      break;
    }

    case GatewayDispatchEvents.SubscriptionCreate:
    case GatewayDispatchEvents.SubscriptionUpdate: {
      const data = payload.d;
      operations.push({ type: "upsert", store: "subscriptions", key: data.id, raw: data });
      break;
    }

    case GatewayDispatchEvents.SubscriptionDelete: {
      operations.push({ type: "delete", store: "subscriptions", key: payload.d.id });
      break;
    }

    case GatewayDispatchEvents.ThreadCreate:
    case GatewayDispatchEvents.ThreadUpdate: {
      const data = payload.d;
      operations.push({
        type: "upsert",
        store: "threads",
        key: data.id,
        raw: data,
        merge: payload.t === GatewayDispatchEvents.ThreadUpdate,
      });

      const member = "member" in data ? data.member : undefined;
      if (member?.user_id) {
        operations.push({
          type: "upsert",
          store: "threadMembers",
          key: threadMemberKey(data.id, member.user_id),
          raw: member,
          merge: true,
        });
      }
      break;
    }

    case GatewayDispatchEvents.ThreadDelete: {
      const data = payload.d;
      operations.push({ type: "delete", store: "threads", key: data.id });
      operations.push({ type: "deletePrefix", store: "threadMembers", prefix: `${data.id}:` });
      operations.push({ type: "deletePrefix", store: "messages", prefix: `${data.id}:` });
      break;
    }

    case GatewayDispatchEvents.ThreadListSync: {
      hydrateThreadListSync(operations, payload.d);
      break;
    }

    case GatewayDispatchEvents.ThreadMemberUpdate: {
      const data = payload.d;
      if (!data.id || !data.user_id) break;
      operations.push({
        type: "upsert",
        store: "threadMembers",
        key: threadMemberKey(data.id, data.user_id),
        raw: data,
        merge: true,
      });
      break;
    }

    case GatewayDispatchEvents.ThreadMembersUpdate: {
      hydrateThreadMembersUpdate(operations, payload.d);
      break;
    }

    case GatewayDispatchEvents.UserUpdate: {
      const data = payload.d;
      operations.push({ type: "upsert", store: "users", key: data.id, raw: data, merge: true });
      break;
    }

    case GatewayDispatchEvents.VoiceStateUpdate: {
      const data = payload.d;
      if (!data.guild_id) break;

      const key = voiceStateKey(data.guild_id, data.user_id);
      if (data.channel_id) {
        operations.push({ type: "upsert", store: "voiceStates", key, raw: data, merge: true });
      } else {
        operations.push({ type: "delete", store: "voiceStates", key });
      }

      const user = data.member?.user;
      if (data.member && user) {
        operations.push({ type: "upsert", store: "users", key: user.id, raw: user });
        operations.push({
          type: "upsert",
          store: "members",
          key: memberKey(data.guild_id, user.id),
          raw: withGuildId(data.member, data.guild_id),
          merge: true,
        });
      }
      break;
    }

    default:
      break;
  }

  return operations;
}

/**
 * Applies a list of {@link CacheOperation}s to a {@link Cache}, sequentially and in order.
 *
 * @param cache The cache to mutate.
 * @param operations The operations to apply, usually created by {@link createCacheOperations}.
 */
export async function applyCacheOperations(
  cache: Cache,
  operations: readonly CacheOperation[],
): Promise<void> {
  for (const operation of operations) {
    const store = cache[operation.store] as EntityCache<unknown>;

    switch (operation.type) {
      case "upsert": {
        const value = operation.merge
          ? mergeValues(await store.get(operation.key), operation.raw)
          : operation.raw;
        await store.set(operation.key, value);
        break;
      }
      case "delete":
        await store.delete(operation.key);
        break;
      case "deletePrefix":
        for (const key of await store.keys()) {
          if (key.startsWith(operation.prefix)) await store.delete(key);
        }
        break;
      case "deleteWhere":
        for (const [key, value] of await store.entries()) {
          if (operation.predicate(value)) await store.delete(key);
        }
        break;
    }
  }
}

/**
 * Writes a gateway dispatch into every relevant entity cache of a {@link Cache}.
 *
 * @param cache The cache to mutate.
 * @param payload The gateway dispatch payload.
 */
export function applyGatewayDispatch(cache: Cache, payload: GatewayDispatchPayload): Promise<void> {
  return applyCacheOperations(cache, createCacheOperations(payload));
}

/**
 * Shallow-merges `value` onto `existing` when both are plain objects, returning `value` otherwise.
 */
export function mergeValues<Value>(existing: Value | undefined, value: Value): Value {
  if (isObject(existing) && isObject(value)) return { ...existing, ...value };
  return value;
}

function hydrateGuildCreate(
  operations: CacheOperation[],
  guild: GatewayGuildCreateDispatchData,
): void {
  // Unavailable guilds carry no data besides their ID, see `GuildDelete`.
  if ("unavailable" in guild && guild.unavailable) {
    operations.push({ type: "upsert", store: "guilds", key: guild.id, raw: guild, merge: true });
    return;
  }

  const {
    channels,
    threads,
    members,
    presences,
    voice_states: voiceStates,
    stage_instances: stageInstances,
    guild_scheduled_events: scheduledEvents,
    soundboard_sounds: soundboardSounds,
    ...rest
  } = guild;
  // Collections are stored in their own entity caches, keeping the guild entry small.
  operations.push({ type: "upsert", store: "guilds", key: guild.id, raw: rest });

  for (const channel of channels ?? []) {
    operations.push({
      type: "upsert",
      store: "channels",
      key: channel.id,
      raw: withGuildId(channel, guild.id),
    });
  }

  for (const thread of threads ?? []) {
    operations.push({
      type: "upsert",
      store: "threads",
      key: thread.id,
      raw: withGuildId(thread, guild.id),
    });
    if (thread.member?.user_id) {
      operations.push({
        type: "upsert",
        store: "threadMembers",
        key: threadMemberKey(thread.id, thread.member.user_id),
        raw: withGuildId(thread.member, guild.id),
      });
    }
  }

  for (const member of members ?? []) hydrateMember(operations, guild.id, member);

  for (const presence of presences ?? []) {
    operations.push({
      type: "upsert",
      store: "presences",
      key: presenceKey(guild.id, presence.user.id),
      raw: withGuildId(presence, guild.id),
    });
  }

  for (const role of guild.roles ?? []) hydrateRole(operations, guild.id, role);
  for (const emoji of guild.emojis ?? []) hydrateEmoji(operations, guild.id, emoji);
  for (const sticker of guild.stickers ?? []) hydrateSticker(operations, guild.id, sticker);

  for (const voiceState of voiceStates ?? []) {
    if (!voiceState.channel_id) continue;
    operations.push({
      type: "upsert",
      store: "voiceStates",
      key: voiceStateKey(guild.id, voiceState.user_id),
      raw: withGuildId(voiceState, guild.id),
    });
  }

  for (const stageInstance of stageInstances ?? []) {
    operations.push({
      type: "upsert",
      store: "stageInstances",
      key: stageInstanceKey(guild.id, stageInstance.channel_id),
      raw: stageInstance,
    });
  }

  for (const scheduledEvent of scheduledEvents ?? []) {
    operations.push({
      type: "upsert",
      store: "scheduledEvents",
      key: scheduledEventKey(guild.id, scheduledEvent.id),
      raw: scheduledEvent,
    });
  }

  for (const sound of soundboardSounds ?? []) hydrateSoundboardSound(operations, guild.id, sound);
}

function hydrateGuildMembersChunk(
  operations: CacheOperation[],
  data: GatewayGuildMembersChunkDispatchData,
): void {
  for (const member of data.members) hydrateMember(operations, data.guild_id, member);
  for (const presence of data.presences ?? []) {
    operations.push({
      type: "upsert",
      store: "presences",
      key: presenceKey(data.guild_id, presence.user.id),
      raw: withGuildId(presence, data.guild_id),
    });
  }
}

function hydrateGuildSoundboardSoundsUpdate(
  operations: CacheOperation[],
  data: GatewayGuildSoundboardSoundsUpdateDispatchData,
): void {
  operations.push({ type: "deletePrefix", store: "soundboardSounds", prefix: `${data.guild_id}:` });
  for (const sound of data.soundboard_sounds)
    hydrateSoundboardSound(operations, data.guild_id, sound);
}

function hydrateSoundboardSounds(
  operations: CacheOperation[],
  data: GatewaySoundboardSoundsDispatchData,
): void {
  for (const sound of data.soundboard_sounds)
    hydrateSoundboardSound(operations, data.guild_id, sound);
}

function hydrateThreadListSync(operations: CacheOperation[], data: GatewayThreadListSync): void {
  for (const thread of data.threads) {
    operations.push({ type: "upsert", store: "threads", key: thread.id, raw: thread, merge: true });
  }

  for (const member of data.members) {
    if (!member.id || !member.user_id) continue;
    operations.push({
      type: "upsert",
      store: "threadMembers",
      key: threadMemberKey(member.id, member.user_id),
      raw: withGuildId(member, data.guild_id),
      merge: true,
    });
  }
}

function hydrateThreadMembersUpdate(
  operations: CacheOperation[],
  data: GatewayThreadMembersUpdateDispatchData,
): void {
  for (const member of data.added_members ?? []) {
    if (!member.user_id) continue;
    operations.push({
      type: "upsert",
      store: "threadMembers",
      key: threadMemberKey(data.id, member.user_id),
      raw: withGuildId(member, data.guild_id),
      merge: true,
    });
  }

  for (const userId of data.removed_member_ids ?? []) {
    operations.push({
      type: "delete",
      store: "threadMembers",
      key: threadMemberKey(data.id, userId),
    });
  }
}

function hydrateMember(
  operations: CacheOperation[],
  guildId: Snowflake,
  member: APIGuildMember,
): void {
  if (!member.user) return;

  operations.push({
    type: "upsert",
    store: "members",
    key: memberKey(guildId, member.user.id),
    raw: withGuildId(member, guildId),
    merge: true,
  });
  operations.push({ type: "upsert", store: "users", key: member.user.id, raw: member.user });
}

function hydrateRole(operations: CacheOperation[], guildId: Snowflake, role: APIRole): void {
  operations.push({
    type: "upsert",
    store: "roles",
    key: roleKey(guildId, role.id),
    raw: withGuildId(role, guildId),
  });
}

function hydrateEmoji(operations: CacheOperation[], guildId: Snowflake, emoji: APIEmoji): void {
  if (!emoji.id) return;
  operations.push({
    type: "upsert",
    store: "emojis",
    key: emojiKey(guildId, emoji.id),
    raw: withGuildId(emoji, guildId),
  });
}

function hydrateSticker(
  operations: CacheOperation[],
  guildId: Snowflake,
  sticker: APISticker,
): void {
  operations.push({
    type: "upsert",
    store: "stickers",
    key: stickerKey(guildId, sticker.id),
    raw: withGuildId(sticker, guildId),
  });
}

function hydrateSoundboardSound(
  operations: CacheOperation[],
  guildId: Snowflake,
  sound: APISoundboardSound,
): void {
  operations.push({
    type: "upsert",
    store: "soundboardSounds",
    key: soundboardSoundKey(guildId, sound.sound_id),
    raw: withGuildId(sound, guildId),
  });
}

function deleteGuildScopedResources(operations: CacheOperation[], guildId: Snowflake): void {
  // Entities keyed by `${guildId}:...` can be dropped by prefix, which is cheap.
  const prefixed = [
    "auditLogEntries",
    "autoModerationRules",
    "bans",
    "emojis",
    "integrations",
    "members",
    "presences",
    "roles",
    "scheduledEvents",
    "soundboardSounds",
    "stageInstances",
    "stickers",
    "voiceStates",
  ] as const satisfies readonly CacheEntityName[];

  for (const store of prefixed) {
    operations.push({ type: "deletePrefix", store, prefix: `${guildId}:` });
  }

  // The rest are keyed by their own ID and need a scan over the stored `guild_id`.
  const scanned = [
    "applicationCommandPermissions",
    "channels",
    "threads",
    "threadMembers",
    "messages",
    "invites",
  ] as const satisfies readonly CacheEntityName[];

  for (const store of scanned) {
    operations.push({
      type: "deleteWhere",
      store,
      predicate: (value) => isObject(value) && value.guild_id === guildId,
    });
  }
}

function withGuildId<Value extends object>(
  value: Value,
  guildId: Snowflake,
): Value & { guild_id: Snowflake } {
  return { ...value, guild_id: guildId };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
