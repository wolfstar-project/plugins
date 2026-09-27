---
"@wolfstar/plugin-gateway": minor
---

Bring the structures closer to discord.js:

- Every structure exposes `client`, the `GatewayClient` whose manager built it (the most recently constructed one for structures built by hand), like discord.js's `Base#client`. It is neither serialized by `toJSON` nor cached.
- Add `MessagePayload`, which normalizes message options like discord.js's: camel case options, builders, `reply` and `forward` shortcuts, stickers, polls, and files from paths, URLs, streams, or buffers. Every `send`/`edit`/`reply` accepts either the options or a `MessagePayload`.
- Add `WebhookMixin`, the token-based members `Webhook` posts through (`send`, `editMessage`, `deleteMessage`, `fetchMessage`, `url`, ...), factored out ahead of the other classes that will share it.
- `GatewayClient` exposes `rest`, the `REST` manager the gateway and every manager's API calls go through, like discord.js's `Client#rest`.
- Resolve related structures from the cache, as synchronous getters like discord.js's, alongside the existing `fetch*()` methods. Managers resolve them when they build a structure (synchronously with a synchronous cache), and a patch changing a related ID drops the stale relation. Missing entries fall back to the payload where it carries the entity, like discord.js, else to `null`:
  - Channels: `parent` and `permissionsLocked` on guild channels and threads, `joined` on threads, `recipient`/`recipientId` on direct messages, `stageInstance` on stage channels, and `channel` on their permission overwrites.
  - Guilds: `afkChannel`, `systemChannel`, `widgetChannel`, `rulesChannel`, `publicUpdatesChannel`, and `safetyAlertsChannel`. A guild resolved as the relation of another structure (`message.guild`, ...) does not read them upfront; its getters then look them up in a synchronous cache.
  - Members: `voice` and `presence`. Thread members: `thread` and `user`. Voice states: `channel`. `typingStart`'s `Typing`: `channel`, `user`, `guild`, and the cached `member`.
  - Messages: the cached `thread`; `mentions` with cached users and members, plus `roles`, `channels`, `parsedUsers`, and `guild`; `cleanContent` now names cached roles and channels. Reactions: `message`, and `emoji` as the cached custom emoji of the message's guild. Polls: `message` and `channel`; answers: `poll` and the cached custom `emoji`.
  - Audit log entries: `target` (the cached guild, channel, user, role, invite, webhook, emoji, integration, stage instance, sticker, scheduled event, soundboard sound, or auto moderation rule, else a structure or object built from the entry's changes) and `targetType`.
  - Auto moderation executions: `member`, `channel`, and `autoModerationRule`. Stage instances: `guildScheduledEvent`. Soundboard sounds: `emoji`. Integrations: `role`. Guild templates: the cached `creator`.
  - Invites: `channel`, the cached channel before the payload's partial one, also for `client.fetchInvite()`.
  - Welcome channels: `channel` and the cached custom `emoji`. Onboardings: `defaultChannels`; prompts: `guild`; options: `guild`, `channels`, `roles`, and the cached custom `emoji`.

Type changes: `BaseInvite.channel` is `AnyChannel | APIInviteChannel | null`; `MessageReaction.emoji`, `PollAnswer.emoji`, `SoundboardSound.emoji`, `WelcomeChannel.emoji`, and `GuildOnboardingPromptOption.emoji` may be a `GuildEmoji`; `WelcomeChannel` gains `channel`.

Fix: `Message#reply()` no longer hardcodes `failIfNotExists` to `false`; it now defaults like every other `reply`, to `GatewayClientOptions.failIfNotExists ?? true`.

Breaking: `GatewayClient#core` is now protected, like the RFC `next` `Client`'s. Use the new `client.api` (the same `@discordjs/core` `API`), `client.rest`, and `client.gateway` instead of `client.core.api`, `client.core.rest`, and `client.core.gateway`.

Add `Partials` and the `partials` client option, like discord.js's. With a partial enabled, an event about an uncached message, user, member, thread member, scheduled event, soundboard sound, poll, or direct message receives a structure built from the dispatch's IDs (`partial` is `true`, `fetch()` completes it) instead of `null`. Unlike discord.js, events are still emitted without it, so the default behavior is unchanged. `User`, `GuildMember`, `Message`, `MessageReaction`, `ThreadMember`, `GuildScheduledEvent`, `Poll`, `PollAnswer`, `SoundboardSound`, and channels gain `partial`; `ThreadMember`, `GuildScheduledEvent`, `Poll`, and `SoundboardSound` gain `fetch()`.
