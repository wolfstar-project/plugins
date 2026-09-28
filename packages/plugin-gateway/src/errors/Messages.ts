/*
 * Adapted from discord.js's `Messages`
 * (https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/errors/Messages.js).
 * Copyright 2021 Noel Buechler, Copyright 2015 Amish Shah. Licensed under the Apache License, Version 2.0.
 */

/**
 * The message of every {@link GatewayErrorCode}: a string, or a function formatting the arguments passed to the
 * error's constructor.
 */
export const GatewayErrorMessages = {
  ClientSessionStoreConflict:
    "sessionStore replaces gateway.retrieveSessionInfo and gateway.updateSessionInfo, pass one or the other",
  ClientNotConstructed: "No GatewayClient has been constructed yet",

  DispatchHandlerConflict: (event: string) =>
    `Dispatch event "${event}" is registered in both DispatchHandlers and MultiDispatchHandlers`,
  DispatchTimeout: (type: string, shardId: number, partition: string | null, timeout: number) =>
    `Processing ${type} on shard ${shardId} (${partition ?? "barrier"}) took longer than ${timeout}ms`,
  SessionStoreFailed: (operation: "get" | "set", shardId: number) =>
    `Cannot ${operation === "get" ? "read" : "write"} the session of shard ${shardId} in the session store`,
  SessionStoreTimeout: (timeout: number) => `Timed out after ${timeout}ms`,

  CacheAsynchronous: (entity: string) =>
    `The ${entity} cache is asynchronous, use get instead of cached`,
  CacheRelationsAsynchronous: (entity: string) =>
    `The relations of the ${entity} cache are read from an asynchronous cache, use get instead of cached`,
  CacheNotIterable: (entity: string) =>
    `The ${entity} cache cannot enumerate its entries (it has no keys/values/entries)`,
  CacheKeyUnresolvable: (entity: string, reason: string) => `Cannot key a ${entity} ${reason}`,
  IdUnresolvable: "Cannot resolve an ID from a structure without one",

  ChannelGuildUnknown: (channelId: string) => `Channel ${channelId} has no known guild`,
  ChannelTypeChanged: (channelId: string, from: number, to: number) =>
    `Channel ${channelId} changed type from ${from} to ${to}`,
  ChannelLockPermissionsConflict: "Pass either lockPermissions or permissionOverwrites, not both",
  GuildChannelOrphan: (channelId: string) =>
    `Channel ${channelId} has no category to sync its permissions with`,
  ThreadParentUnknown: (threadId: string) => `Thread ${threadId} has no known parent`,
  ThreadOwnerUnknown: (threadId: string) => `Thread ${threadId} has no known owner`,
  ThreadMemberIdsMissing: (action: string) =>
    `A thread member without a thread or user ID cannot be ${action}`,

  GuildIntegrationNotFound: (guildId: string, integrationId: string) =>
    `The guild ${guildId} has no integration ${integrationId}`,
  GuildMemberUserUnknown: "This member has no user data: its ID is unknown",
  GuildMembersQueryConflict: "Cannot request members by both query and userIds",
  GuildMembersUserIdsLimit: "Cannot request more than 100 members by their IDs",
  MemberFetchNonceLength: "The nonce of a members request cannot exceed 32 bytes",
  GuildMembersNoncePending: (nonce: string) =>
    `A members request with the nonce "${nonce}" is pending already`,
  GuildMembersTimeout: (guildId: string, nonce: string, timeout: number) =>
    `Requesting the members of guild ${guildId} (${nonce}) took longer than ${timeout}ms`,
  GuildMembersRateLimited: (guildId: string, nonce: string, retryAfter: number) =>
    `Requesting the members of guild ${guildId} (${nonce}) is rate limited, retry after ${retryAfter}ms`,
  PresenceNotFetchable: (guildId: string, userId: string) =>
    `Presences cannot be fetched from the API, they are only received from the gateway (user ${userId} of guild ${guildId} is not cached); enable the presences cache to read them later`,
  InviteGuildUnknown: (code: string) => `Invite ${code} has no known guild`,

  EmojiEmpty: "Cannot resolve an empty string to an emoji",
  EmojiType: "Cannot resolve an emoji without an ID nor a name",
  NotGuildSticker: "Only guild stickers can be edited or deleted",
  NotGuildSoundboardSound: "Default soundboard sounds cannot be changed",

  MessageContentType: "The content of a message must be a string",
  MessageNonceLength: "A message nonce must be at most 25 characters long",
  MessageNonceType: "A message nonce must be an integer",
  MessageForwardChannelMissing: "Forwarding a message by ID needs its channel",
  MessageReferenceMissing: (messageId: string) => `Message ${messageId} references no message`,
  MessagePollMissing: (messageId: string) => `Message ${messageId} has no poll`,
  AttachmentDownloadFailed: (url: string, status: number) => `Could not download ${url}: ${status}`,

  VoiceStateNotOwn: "Only the bot's own voice state can request to speak",
  VoiceStateGuildUnknown: "This voice state does not belong to a guild",

  WebhookTokenUnavailable: (webhookId: string) => `Webhook ${webhookId} has no token to post with`,
} as const satisfies Record<string, string | ((...args: never[]) => string)>;
