# @wolfstar/plugin-gateway

## 0.2.0

### Minor Changes

- [#130](https://github.com/wolfstar-project/plugins/pull/130) [`5f8c91c`](https://github.com/wolfstar-project/plugins/commit/5f8c91c9e0216aaf70b110a54b9018fdfaaf0ee7) - Register every `GatewayClient` as `container.gatewayClient`, typed as `GatewayClient`, so pieces reach its managers through `this.container.gatewayClient` without `getGatewayClient()` or a cast. `container.client` keeps the base `Client` type, since a module augmentation cannot redeclare it.

- [#138](https://github.com/wolfstar-project/plugins/pull/138) [`d7c1b3f`](https://github.com/wolfstar-project/plugins/commit/d7c1b3fb1b8423ca55076e8168d711d2a0a387f2) - Extend `@discordjs/structures`' own classes instead of reimplementing them: `User`, `Message`, `Attachment`, `Embed`, `MessageReaction` (`Reaction`), `Poll`, `PollAnswer`, `Emoji`, `BaseInvite` (`Invite`), `Presence`, `Activity`, `VoiceState`, `Webhook`, `Sticker`, `StickerPack`, `SoundboardSound`, `StageInstance`, `AutoModerationRule`, and every channel type now inherit from their counterparts, keeping only the members they add or whose semantics are stricter. The structures without a counterpart still extend its base `Structure`. The source is now organized in one folder per domain (`channels/`, `messages/`, `users/`, ...), each with an `index.ts`.

  New exports: `StructureMixin` (relations, public `kPatch`/`kClone`, and parsed timestamps, mixed into every structure), `initStructure`, and `MixinTypes`.

  Breaking type changes, following `@discordjs/structures`:

  - Getters that now come from `@discordjs/structures` return `undefined` rather than `null` when the field is absent (e.g. `Attachment.description`, `Message.webhookId`, `BaseInvite.maxAge`, `Webhook.token`, `VoiceState.guildId`, `Activity.applicationId`).
  - Overridden getters are typed by `@discordjs/structures` (e.g. `TextChannel.nsfw` is `boolean | undefined`) even though ours still return a default.
  - `Channel.flags` is a frozen `ChannelFlagsBitField` rather than a `number`; `isThread()` and `isDMBased()` are `@discordjs/structures`' type guards.
  - `Embed.timestamp` is the timestamp in milliseconds rather than the ISO string.
  - `MessageReaction.burstColors` holds numbers rather than `#rrggbb` strings.
  - `VoiceState.requestToSpeakTimestamp` is the raw ISO string rather than milliseconds: use `requestToSpeakAt` for a `Date`.

- [#126](https://github.com/wolfstar-project/plugins/pull/126) [`d6dc821`](https://github.com/wolfstar-project/plugins/commit/d6dc821d3619a59258c3fd71cc22b3d166ffbdc2) - Request guild members over the gateway (`REQUEST_GUILD_MEMBERS`) with `client.members.request(guildId, options)` or `guild.requestMembers(options)`, discord.js's `guild.members.fetch()`: every member, a `query`, or up to 100 `userIds`, resolving with the `GuildMember`s once the last `GUILD_MEMBERS_CHUNK` of the request's nonce is cached. It rejects with the new `GuildMembersTimeoutError` when the chunks stop arriving, or `GuildMembersRateLimitError` when Discord answers with `RATE_LIMITED`. Every chunk is also emitted as the new `guildMembersChunk` event (`members`, `guild | null`, `data`).

- [#128](https://github.com/wolfstar-project/plugins/pull/128) [`b2ff9ed`](https://github.com/wolfstar-project/plugins/commit/b2ff9ed2e20cae0e48f49ce4e38d02784bbc88b0) - Resume gateway sessions across restarts. `GatewayClient` gains a `sessionStore` option (and `sessionStoreTimeout`), read once per shard and mirrored in memory, with background writes collapsed per shard; store failures are reported as `GatewaySessionStoreError`s and fall back to identifying. `GatewayClient#destroy({ resumable: true })` closes the shards with a resumable code and keeps their sessions stored, for the next process to resume them. `@wolfstar/plugin-cache` ships `createRedisSessionStore`, with a `ttl` (10 minutes by default), and the `GatewaySessionStore`/`GatewaySessionInfo` types.

- [#131](https://github.com/wolfstar-project/plugins/pull/131) [`4203b27`](https://github.com/wolfstar-project/plugins/commit/4203b27e9f518a94cfabd6cb9443713853ae9aa3) - Add a synchronous read path for in-memory caches. `EntityCache` gains an optional, readonly `synchronous` flag, `true` on `MemoryEntityCache` (`createInMemoryCache`) and `false` on `RedisEntityCache` (`createRedisCache`, compressed or not); a store leaving it out is treated as asynchronous. Every `CachedManager` gains `cached(...ids)`, which takes the same arguments as `get` and returns the same structure, relations included, without a promise: `client.members.cached(guildId, userId)`. It returns `undefined` on a miss or without a cache, and throws a `TypeError` on an asynchronous cache instead of reporting a miss it cannot know about. The existing asynchronous methods are unchanged.

### Patch Changes

- [#132](https://github.com/wolfstar-project/plugins/pull/132) [`5e1ac23`](https://github.com/wolfstar-project/plugins/commit/5e1ac23370c481962be408c21d832cce5a2ffda6) - fix(deps): update all non-major dependencies Thanks [@renovate](https://github.com/apps/renovate)!

- [#135](https://github.com/wolfstar-project/plugins/pull/135) [`caea598`](https://github.com/wolfstar-project/plugins/commit/caea598b9baaf9e4876dabc907d3981ff5e5a326) - fix(deps): update dependency @discordjs/structures to v1.0.0-pr-11602.1789066132-275cd4b42 Thanks [@renovate](https://github.com/apps/renovate)!

- [#134](https://github.com/wolfstar-project/plugins/pull/134) [`7d78af1`](https://github.com/wolfstar-project/plugins/commit/7d78af11709f72b935640eeec7685875346e0434) - Remove the README's "Subpath exports" section: `@wolfstar/plugin-gateway/rest` and `@wolfstar/plugin-gateway/ws` were never exported (importing them failed with `ERR_PACKAGE_PATH_NOT_EXPORTED`). Depend on `@discordjs/rest` and `@discordjs/ws` directly instead.

- [#123](https://github.com/wolfstar-project/plugins/pull/123) [`354dec1`](https://github.com/wolfstar-project/plugins/commit/354dec1644b9485375a642b7fcd733cbe52b5489) - Add a `./register` subpath export. The Stars CLI build imports `<name>/register` for every `@wolfstar/plugin-*` dependency of a project, so these packages crashed their consumers at startup with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The entrypoint is a no-op: none of them has an `@wolfstar/http-framework` `Plugin` hook to register.
- Updated dependencies [[`b2ff9ed`](https://github.com/wolfstar-project/plugins/commit/b2ff9ed2e20cae0e48f49ce4e38d02784bbc88b0), [`354dec1`](https://github.com/wolfstar-project/plugins/commit/354dec1644b9485375a642b7fcd733cbe52b5489), [`4203b27`](https://github.com/wolfstar-project/plugins/commit/4203b27e9f518a94cfabd6cb9443713853ae9aa3)]:
  - @wolfstar/plugin-cache@0.3.0

## 0.1.1

### Patch Changes

- Updated dependencies [[`f762ba2`](https://github.com/wolfstar-project/plugins/commit/f762ba27b3ad58b05129cea11e81822d5af78663)]:
  - @wolfstar/plugin-cache@0.2.0

## 0.1.0

### Minor Changes

- [#105](https://github.com/wolfstar-project/plugins/pull/105) [`c7f73dc`](https://github.com/wolfstar-project/plugins/commit/c7f73dca7eb7305c82b856842527973ddbfee0a3) - Bring guild channels to discord.js parity: `edit`, `setName`, `clone`, the per-type setters, `setParent`/`lockPermissions`/`setPosition`, a `PermissionOverwriteManager` with `PermissionOverwrites`, `guild.channels` (`GuildChannelManager`: create, fetch, setPositions), and channel permissions with overwrites (`channel.fetchPermissionsFor`, `member.fetchPermissionsIn`, `role.fetchPermissionsIn`, `computeChannelPermissions`), now used by the message permission checks.

- [#113](https://github.com/wolfstar-project/plugins/pull/113) [`2c5f29d`](https://github.com/wolfstar-project/plugins/commit/2c5f29df9f53c96993755859f8cb6935a4309d4b) - Add gateway actions and a unified startup method, use `@discordjs/core` for API operations, optimize structure data during construction and patches, and provide a standalone gateway cache adapter.

- [#98](https://github.com/wolfstar-project/plugins/pull/98) [`3fb3e5d`](https://github.com/wolfstar-project/plugins/commit/3fb3e5df51c47e4b401830c3d6180ed59c45d90a) - Bring guilds to discord.js parity (every field, editing, invites pause, incident actions, leave and delete, preview, vanity data, voice regions) and add emojis, stickers, sticker packs, and invites with their guild managers, `client.fetchInvite`, `client.fetchSticker`, `client.fetchStickerPacks`, `client.fetchVoiceRegions`, and the `emojiCreate`/`emojiUpdate`/`emojiDelete`, `stickerCreate`/`stickerUpdate`/`stickerDelete`, `inviteCreate`, and `inviteDelete` events.

- [#110](https://github.com/wolfstar-project/plugins/pull/110) [`769d943`](https://github.com/wolfstar-project/plugins/commit/769d943f0606c90cad08db5dd4f8eec179de215d) - Add scheduled events (`GuildScheduledEvent`, `guild.scheduledEvents`, subscribers), stage instances (`StageInstance`, `guild.stageInstances`, `StageChannel#createStageInstance`/`fetchStageInstance`), and soundboard sounds (`SoundboardSound`, `guild.soundboardSounds`, `client.fetchDefaultSoundboardSounds`, `VoiceChannel#sendSoundboardSound`), with their gateway events.

- [#111](https://github.com/wolfstar-project/plugins/pull/111) [`2e8ff40`](https://github.com/wolfstar-project/plugins/commit/2e8ff40c6ad94a325e7331bc3271a5a64bc1ca8f) - Add integrations (`Integration`, `guild.integrations`, `integrationCreate`/`Update`/`Delete` and `guildIntegrationsUpdate` events), guild templates (`GuildTemplate`, `client.templates`, `client.fetchGuildTemplate`), welcome screens (`WelcomeScreen`), widgets (`Widget`, `client.fetchGuildWidget`, `guild.setWidgetSettings`), and onboarding (`GuildOnboarding`). Audit log pages now return `Integration`s.

- [#102](https://github.com/wolfstar-project/plugins/pull/102) [`ba2423d`](https://github.com/wolfstar-project/plugins/commit/ba2423d44e1215b50b9ac44423073c5aa67620e8) - Add discord.js's `CachedManager#_add` and `DataManager#resolve` to every manager: API payloads are merged into the cached entry, and structures resolve their relations from the cache, so `message.author`, `message.member`, `member.user`, `emoji.author`, `sticker.user`, and `invite.inviter` are the entries of `client.users` and `client.members` rather than the copies embedded in the payload.

- [#101](https://github.com/wolfstar-project/plugins/pull/101) [`4c60620`](https://github.com/wolfstar-project/plugins/commit/4c60620c74c845709f5b4a1fc37ea20ac7885a6f) - Bring messages to discord.js parity: `Attachment`, `Embed`, `MessageMentions`, `MessageReaction`, `Poll`, `PollAnswer`, and `ReactionEmoji` structures, `Message` actions (`reply`, `edit`, `forward`, `pin`, `react`, `crosspost`, `startThread`, `suppressEmbeds`, ...) and async permission checks, `ReactionManager`/`ReactionUserManager`, every message and reaction route on `client.messages` (list, send, bulk delete, pins, crosspost, polls), and `messages`/`send`/`sendTyping`/`bulkDelete` on text channels.

- [#109](https://github.com/wolfstar-project/plugins/pull/109) [`6a9b360`](https://github.com/wolfstar-project/plugins/commit/6a9b360e2b55ac2c557bc5c44c2fce0a03bd221e) - Add moderation: `GuildBan` with `guild.bans` (list, fetch, create, remove, bulk create), audit logs with `guild.fetchAuditLogs()` and `GuildAuditLogsEntry`, auto moderation with `AutoModerationRule`, `guild.autoModerationRules`, and `AutoModerationActionExecution`, and the `guildBanAdd`, `guildBanRemove`, `guildAuditLogEntryCreate`, `autoModerationRuleCreate`/`Update`/`Delete`, and `autoModerationActionExecution` events.

- [#104](https://github.com/wolfstar-project/plugins/pull/104) [`90d77c9`](https://github.com/wolfstar-project/plugins/commit/90d77c9d08ef6a859977084418f0da3cd42d8e83) - Emit `messageReactionAdd`, `messageReactionRemove`, `messageReactionRemoveAll`, `messageReactionRemoveEmoji`, `messagePollVoteAdd`, and `messagePollVoteRemove`, with reactions and poll answers read from the cached message after the dispatch is counted into it.

- [#103](https://github.com/wolfstar-project/plugins/pull/103) [`5f897c6`](https://github.com/wolfstar-project/plugins/commit/5f897c6b113f03e35ee301664554a913e74ec379) - Resolve `guild` from the cache on every guild structure (channels, threads, members, roles, messages, emojis, stickers, invites) and `channel` on messages, like discord.js, with `fetchGuild()` for when the guild is not cached. Structures keep their resolved relations under the exported `kRelations` symbol, and clones keep them.

- [#107](https://github.com/wolfstar-project/plugins/pull/107) [`11d87b2`](https://github.com/wolfstar-project/plugins/commit/11d87b2fc3d976f79aaaea80abc9b6cf44c14b34) - Bring threads to discord.js parity: `channel.threads` (`create`, forum posts included, `fetchActive`, `fetchArchived`), thread setters (`setArchived`, `setLocked`, `setInvitable`, `setAutoArchiveDuration`, `setAppliedTags`), `join`/`leave`, `fetchStarterMessage`, `fetchOwner`, `ThreadMember` with `client.threadMembers` and `thread.members`, `guild.fetchActiveThreads`, and the `threadListSync`, `threadMemberUpdate`, and `threadMembersUpdate` events.

- [#97](https://github.com/wolfstar-project/plugins/pull/97) [`d145ace`](https://github.com/wolfstar-project/plugins/commit/d145acef0531f92fd389e7b7d037daa6627fe52f) - Bring users, guild members and roles to discord.js parity: every API field, CDN URLs, `ClientUser` (profile edits and presence on every shard), `GuildMemberRoleManager`, permission computation, member moderation (edit, timeout, kick, ban, bulk ban, prune), member listing and search, and role creation, editing, positioning and deletion. `Role#permissions` is now a `PermissionsBitField` instead of a `bigint`.

- [#108](https://github.com/wolfstar-project/plugins/pull/108) [`fb1bc9b`](https://github.com/wolfstar-project/plugins/commit/fb1bc9b7da424764559ce40bd5fa63d22b4cc305) - Add voice states and presences: `VoiceState` (mute, deafen, move, disconnect, stage speaker requests), `Presence` with `Activity` and `RichPresenceAssets`, `client.voiceStates` and `client.presences`, `member.fetchVoiceState()` and `member.fetchPresence()`, and the `voiceStateUpdate` and `presenceUpdate` events.

- [#106](https://github.com/wolfstar-project/plugins/pull/106) [`6659e67`](https://github.com/wolfstar-project/plugins/commit/6659e67b45bf3ccf8961cc0828ad299acf57579a) - Add webhooks: the `Webhook` structure (send, edit, delete, and fetch, edit, or delete its messages with its token), `client.webhooks` and `client.fetchWebhook`, `fetchWebhooks`/`createWebhook` on the channels that support them (`ChannelWebhooksMixin`), `guild.fetchWebhooks`, and `AnnouncementChannel#addFollower`.

- [#93](https://github.com/wolfstar-project/plugins/pull/93) [`c576cfb`](https://github.com/wolfstar-project/plugins/commit/c576cfbcdad34979906d59b23dd91d49ab6161a9) - Add `@wolfstar/plugin-gateway`, implementing the Gateway RFC ([#54](https://github.com/wolfstar-project/plugins/issues/54)). `GatewayClient` extends the framework's `Client` with a Discord gateway connection (through `@discordjs/ws`), per-entity managers (`users`, `guilds`, `channels`, `threads`, `messages`, `members`, `roles`) reading from an optional `@wolfstar/plugin-cache` cache, and events carrying structures (`Message`, `User`, `Guild`, ...) instead of raw payloads. Gateway events can be handled from the `listeners` directory with `EventGatewayListener`, optionally through the `RegisterAsGatewayListener` decorator.

### Patch Changes

- [#95](https://github.com/wolfstar-project/plugins/pull/95) [`c525730`](https://github.com/wolfstar-project/plugins/commit/c52573080f49f9a8fdfa3539d52676ee5c266027) - Process dispatches in per-guild partitions instead of one queue per shard, report dispatches slower than `dispatchTimeout`, add a `cacheFailure` policy (`"skip"` or `"emitUncached"`), accept `{ force, cache }` options on managers' `fetch`, and drop the cached guilds a new `READY` no longer lists. `READY` itself is always emitted, even when the cache fails.

- [#117](https://github.com/wolfstar-project/plugins/pull/117) [`4033d65`](https://github.com/wolfstar-project/plugins/commit/4033d65865913aa3329e693da90243c95e4ed0f9) - Fix `Role#fetchPermissionsIn` failing to type-check under TypeScript 5.9, which broke the API documentation build.
- Updated dependencies [[`90d77c9`](https://github.com/wolfstar-project/plugins/commit/90d77c9d08ef6a859977084418f0da3cd42d8e83), [`7db3af5`](https://github.com/wolfstar-project/plugins/commit/7db3af571b8d27e6becc36581b0984d5099887bb), [`769d943`](https://github.com/wolfstar-project/plugins/commit/769d943f0606c90cad08db5dd4f8eec179de215d), [`2c5f29d`](https://github.com/wolfstar-project/plugins/commit/2c5f29df9f53c96993755859f8cb6935a4309d4b), [`6da7e99`](https://github.com/wolfstar-project/plugins/commit/6da7e999286e3d3fa755334882dea76e643ab336)]:
  - @wolfstar/plugin-cache@0.1.0
