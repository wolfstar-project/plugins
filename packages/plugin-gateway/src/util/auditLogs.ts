import type { CacheEntityTypes } from "@wolfstar/plugin-cache";
import {
  AuditLogEvent,
  type APIApplicationCommand,
  type APIAuditLogChange,
  type APIWebhook,
} from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import type { AnyChannel } from "../managers/ChannelManager.js";
import type { DataManager } from "../managers/DataManager.js";
import { AutoModerationRule } from "../structures/automoderation/AutoModerationRule.js";
import type { GuildEmoji } from "../structures/emojis/GuildEmoji.js";
import type { Guild } from "../structures/guilds/Guild.js";
import { GuildOnboardingPrompt } from "../structures/guilds/GuildOnboarding.js";
import { GuildScheduledEvent } from "../structures/guilds/GuildScheduledEvent.js";
import { Integration } from "../structures/guilds/Integration.js";
import type { Role } from "../structures/guilds/Role.js";
import { GuildInvite } from "../structures/invites/GuildInvite.js";
import type { SoundboardSound } from "../structures/soundboards/SoundboardSound.js";
import { StageInstance } from "../structures/stageInstances/StageInstance.js";
import { Sticker } from "../structures/stickers/Sticker.js";
import { bindClient, type StructureMixin } from "../structures/Structure.js";
import type { User } from "../structures/users/User.js";
import { Webhook } from "../structures/webhooks/Webhook.js";

/**
 * The kind of entity an audit log entry targets, like discord.js's `GuildAuditLogs.Targets`.
 */
export type AuditLogTargetType =
  | "ApplicationCommand"
  | "AutoModeration"
  | "Channel"
  | "Emoji"
  | "Guild"
  | "GuildOnboardingPrompt"
  | "GuildScheduledEvent"
  | "Integration"
  | "Invite"
  | "Message"
  | "Role"
  | "SoundboardSound"
  | "StageInstance"
  | "Sticker"
  | "Thread"
  | "Unknown"
  | "User"
  | "Webhook";

/**
 * The entity an audit log entry targets, like discord.js's `AuditLogEntryTarget`: the cached structure, else a
 * structure (or an object) built from the entry's changes, at least holding the target's ID.
 */
export type AuditLogEntryTarget =
  | AnyChannel
  | APIApplicationCommand
  | AutoModerationRule
  | Guild
  | GuildEmoji
  | GuildInvite
  | GuildOnboardingPrompt
  | GuildScheduledEvent
  | Integration
  | Role
  | SoundboardSound
  | StageInstance
  | Sticker
  | User
  | Webhook
  | AuditLogPartialTarget;

/**
 * A target known only by the entry: its ID, and the fields the entry changed.
 */
interface AuditLogPartialTarget {
  id: string | null;
  [key: string]: unknown;
}

/**
 * The entities of an audit log page, which the targets are looked up in before the cache.
 *
 * @internal
 */
export interface AuditLogEntities {
  users?: ReadonlyMap<string, User>;
  webhooks?: ReadonlyMap<string, Webhook>;
  integrations?: ReadonlyMap<string, Integration>;
  applicationCommands?: ReadonlyMap<string, APIApplicationCommand>;
}

/**
 * Gets the kind of entity an audit log action targets, like discord.js's `GuildAuditLogsEntry.targetType`.
 *
 * @param action The action.
 */
export function auditLogTargetType(action: AuditLogEvent): AuditLogTargetType {
  if (action < 10) return "Guild";
  if (action < 20) return "Channel";
  if (action < 30) return "User";
  if (action < 40) return "Role";
  if (action < 50) return "Invite";
  if (action < 60) return "Webhook";
  if (action < 70) return "Emoji";
  if (action < 80) return "Message";
  if (action < 83) return "Integration";
  if (action < 86) return "StageInstance";
  if (action < 100) return "Sticker";
  if (action < 110) return "GuildScheduledEvent";
  if (action < 120) return "Thread";
  if (action < 130) return "ApplicationCommand";
  if (action < 140) return "SoundboardSound";
  if (action < 143) return "AutoModeration";
  if (action < 146) return "User";
  if (action >= 163 && action <= 165) return "GuildOnboardingPrompt";
  return "Unknown";
}

/**
 * Folds the changes of an entry into the target's data, their new value else their old one, like discord.js.
 */
function changesReduce(
  changes: readonly APIAuditLogChange[] | undefined,
  initial: Record<string, unknown> = {},
): AuditLogPartialTarget {
  const data: AuditLogPartialTarget = { id: null, ...initial };
  for (const change of changes ?? []) {
    const {
      key,
      new_value: newValue,
      old_value: oldValue,
    } = change as {
      key: string;
      new_value?: unknown;
      old_value?: unknown;
    };
    data[key] = newValue ?? oldValue;
  }

  return data;
}

// A cache read that never rejects, so a failing cache degrades to the fallback target.
async function read<Value extends StructureMixin<object>, Args extends readonly string[]>(
  manager: DataManager<Value, Args>,
  ...args: Args
): Promise<Value | undefined> {
  try {
    return await manager.cache.get(manager.resolveKey(...args));
  } catch {
    return undefined;
  }
}

/**
 * Resolves the target of an audit log entry from the cache, like discord.js's `GuildAuditLogsEntry#target`.
 *
 * @param client The client.
 * @param entry The raw entry, with its guild's ID.
 * @param entities The entities of the audit log page the entry comes from, if any.
 * @returns The target, `null` for user targets that are not cached (like discord.js without the `User` partial) and
 * for entries without a target.
 * @internal
 */
export async function resolveAuditLogTarget(
  client: GatewayClient,
  entry: CacheEntityTypes["auditLogEntries"],
  entities: AuditLogEntities = {},
): Promise<AuditLogEntryTarget | null> {
  const { guild_id: guildId, target_id: targetId, changes, options } = entry;
  const type = auditLogTargetType(entry.action_type);
  const { guilds } = client;
  const built = <Value extends object>(value: Value) => bindClient(value, client);

  if (type === "Unknown") return changesReduce(changes, { id: targetId });
  const user = async (userId: string) =>
    entities.users?.get(userId) ?? (await read(client.users, userId)) ?? null;
  if (type === "User") return targetId ? user(targetId) : null;
  if (!targetId && type !== "Invite") return null;
  const id = targetId!;

  switch (type) {
    case "Guild":
      return (await read(guilds, id)) ?? { id };
    case "Channel":
    case "Thread":
      return (await read(client.channels, id)) ?? changesReduce(changes, { id });
    case "Role":
      return (await read(client.roles, guildId, id)) ?? { id };
    case "Invite": {
      const { id: _id, ...changed } = changesReduce(changes);
      const code = changed.code as string | undefined;
      const cached = code ? await read(guilds.invites(guildId), code) : undefined;
      return cached ?? built(new GuildInvite({ ...changed, code: code ?? "", guild_id: guildId }));
    }
    case "Webhook":
      return (
        entities.webhooks?.get(id) ??
        built(
          new Webhook(changesReduce(changes, { id, guild_id: guildId }) as unknown as APIWebhook),
        )
      );
    case "Emoji":
      return (await read(guilds.emojis(guildId), id)) ?? { id };
    case "Message":
      // Discord sends the channel's ID for bulk deletions, the author's otherwise.
      return entry.action_type === AuditLogEvent.MessageBulkDelete
        ? ((await read(client.channels, id)) ?? { id })
        : user(id);
    case "Integration":
      return (
        entities.integrations?.get(id) ??
        (await read(guilds.integrations(guildId), id)) ??
        built(new Integration(changesReduce(changes, { id, guild_id: guildId }) as never))
      );
    case "StageInstance": {
      const channelId = options?.channel_id;
      const cached = channelId ? await read(guilds.stageInstances(guildId), channelId) : undefined;
      return (
        cached ??
        built(
          new StageInstance(
            changesReduce(changes, { id, channel_id: channelId, guild_id: guildId }) as never,
          ),
        )
      );
    }
    case "Sticker":
      return (
        (await read(guilds.stickers(guildId), id)) ??
        built(new Sticker(changesReduce(changes, { id }) as never))
      );
    case "GuildScheduledEvent":
      return (
        (await read(guilds.scheduledEvents(guildId), id)) ??
        built(new GuildScheduledEvent(changesReduce(changes, { id, guild_id: guildId }) as never))
      );
    case "ApplicationCommand":
      return entities.applicationCommands?.get(id) ?? { id };
    case "SoundboardSound":
      return (await read(guilds.soundboardSounds(guildId), id)) ?? { id };
    case "AutoModeration":
      return (
        (await read(guilds.autoModerationRules(guildId), id)) ??
        built(new AutoModerationRule(changesReduce(changes, { id, guild_id: guildId }) as never))
      );
    case "GuildOnboardingPrompt":
      return entry.action_type === AuditLogEvent.OnboardingPromptCreate
        ? built(new GuildOnboardingPrompt(changesReduce(changes, { id }) as never))
        : changesReduce(changes, { id });
    default:
      return { id };
  }
}
