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
  ClientCacheConflict:
    "cacheConstructor and cacheOptions cannot be combined with cache or makeCache, pass one or the other",
  ClientSweepersConflict:
    "sweepers cannot be combined with cache or makeCache, whose stores hold raw data a sweep cannot filter: use their policies' ttl instead",
  ClientNotConstructed: "No GatewayClient has been constructed yet",

  SweeperIntervalTooLong: (entity: string, interval: number) =>
    `The sweeper of ${entity} has an interval of ${interval}s, which a timer cannot wait for: the maximum is 2147483s`,

  DispatchHandlerConflict: (event: string) =>
    `Dispatch event "${event}" is registered in both DispatchHandlers and MultiDispatchHandlers`,
  DispatchTimeout: (type: string, shardId: number, partition: string | null, timeout: number) =>
    `Processing ${type} on shard ${shardId} (${partition ?? "barrier"}) took longer than ${timeout}ms`,
  SessionStoreFailed: (operation: "get" | "set", shardId: number) =>
    `Cannot ${operation === "get" ? "read" : "write"} the session of shard ${shardId} in the session store`,
  SessionStoreTimeout: (timeout: number) => `Timed out after ${timeout}ms`,

  CacheAsynchronous: (entity: string) =>
    `The ${entity} cache is asynchronous, await cache.get instead`,
  CacheConstructorAsynchronous: (entity: string) =>
    `The ${entity} structures resolve relations from an asynchronous cache, which a cache of instances cannot await`,
  CacheNotIterable: (entity: string) =>
    `The ${entity} cache cannot enumerate its entries (it has no keys/values/entries)`,
  CacheKeyUnresolvable: (entity: string, reason: string) => `Cannot key a ${entity} ${reason}`,
  IdUnresolvable: "Cannot resolve an ID from a structure without one",
  MessageBulkDeleteType: "The messages must be an Array, Collection, or number.",
  InvalidType: (name: string, expected: string, an = false) =>
    `Supplied ${name} is not a${an ? "n" : ""} ${expected}.`,
  InvalidElement: (type: string, name: string, element: unknown) =>
    `Supplied ${type} ${name} includes an invalid element: ${String(element)}`,

  GuildUncached: (guildId: string) => `Guild ${guildId} is not cached`,
  GuildUncachedMe: (guildId: string) => `The client's member in guild ${guildId} is not cached`,
  GuildMemberUncached: (guildId: string, userId: string) =>
    `Member ${userId} of guild ${guildId} is not cached`,
  ChannelUncached: (channelId: string) => `Channel ${channelId} is not cached`,

  ChannelGuildUnknown: (channelId: string) => `Channel ${channelId} has no known guild`,
  ChannelTypeChanged: (channelId: string, from: number, to: number) =>
    `Channel ${channelId} changed type from ${from} to ${to}`,
  ChannelLockPermissionsConflict: "Pass either lockPermissions or permissionOverwrites, not both",
  GuildChannelOrphan: (channelId: string) =>
    `Channel ${channelId} has no category to sync its permissions with`,
  GuildChannelUnknown: (guildId: string, channelId: string) =>
    `Channel ${channelId} is not a channel of guild ${guildId}`,
  GuildResolve: "Cannot resolve the value to a guild ID",
  GuildRoleUnknown: (guildId: string, roleId: string) =>
    `Role ${roleId} is not a role of guild ${guildId}`,
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
  UserNoDMChannel: "No DM Channel exists!",

  EmojiEmpty: "Cannot resolve an empty string to an emoji",
  EmojiType: "Cannot resolve an emoji without an ID nor a name",
  NotGuildSticker: "Only guild stickers can be edited or deleted",
  NotGuildSoundboardSound: "Default soundboard sounds cannot be changed",
  SoundboardSoundContentType: "Could not infer the content type of the sound, pass contentType",

  MessageContentType: "The content of a message must be a string",
  MessageNonceLength: "A message nonce must be at most 25 characters long",
  MessageNonceType: "A message nonce must be an integer",
  MessageSearchContentLength: "The content of a message search cannot exceed 1024 characters",
  MessageSearchSlop: "The slop of a message search must be an integer from 0 to 100",
  MessageSearchChannelIdsLimit: "A message search cannot filter by more than 500 channels",
  MessageSearchLimit: "The limit of a message search must be an integer from 1 to 25",
  MessageSearchOffset: "The offset of a message search must be an integer from 0 to 9975",
  SearchIndexNotYetAvailable: (guildId: string, retryAfter: number, documentsIndexed: number) =>
    `The message search index of guild ${guildId} is not available yet (${documentsIndexed} documents indexed), retry after ${retryAfter}s`,
  MessageForwardChannelMissing: "Forwarding a message by ID needs its channel",
  MessageReferenceMissing: (messageId: string) => `Message ${messageId} references no message`,
  WebhookMessage: "The message was not sent by a webhook.",
  WebhookApplication: "This message webhook belongs to an application and cannot be fetched.",
  MessagePollMissing: (messageId: string) => `Message ${messageId} has no poll`,
  AttachmentDownloadFailed: (url: string, status: number) => `Could not download ${url}: ${status}`,
  FileNotFound: (file: string) => `File could not be found: ${file}`,
  ReqResourceType:
    "The resource must be a string, a Uint8Array, an ArrayBuffer, a Blob, or a stream",

  VoiceStateNotOwn: "Only the bot's own voice state can request to speak",
  VoiceStateGuildUnknown: "This voice state does not belong to a guild",

  WebhookTokenUnavailable: (webhookId: string) => `Webhook ${webhookId} has no token to post with`,
} as const satisfies Record<string, string | ((...args: never[]) => string)>;
