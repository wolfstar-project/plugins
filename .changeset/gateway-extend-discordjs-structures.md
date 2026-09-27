---
"@wolfstar/plugin-gateway": minor
---

Extend `@discordjs/structures`' own classes instead of reimplementing them: `User`, `Message`, `Attachment`, `Embed`, `MessageReaction` (`Reaction`), `Poll`, `PollAnswer`, `Emoji`, `BaseInvite` (`Invite`), `Presence`, `Activity`, `VoiceState`, `Webhook`, `Sticker`, `StickerPack`, `SoundboardSound`, `StageInstance`, `AutoModerationRule`, and every channel type now inherit from their counterparts, keeping only the members they add or whose semantics are stricter. The structures without a counterpart still extend its base `Structure`. The source is now organized in one folder per domain (`channels/`, `messages/`, `users/`, ...), each with an `index.ts`.

New exports: `StructureMixin` (relations, public `kPatch`/`kClone`, and parsed timestamps, mixed into every structure), `initStructure`, and `MixinTypes`.

Breaking type changes, following `@discordjs/structures`:

- Getters that now come from `@discordjs/structures` return `undefined` rather than `null` when the field is absent (e.g. `Attachment.description`, `Message.webhookId`, `BaseInvite.maxAge`, `Webhook.token`, `VoiceState.guildId`, `Activity.applicationId`).
- Overridden getters are typed by `@discordjs/structures` (e.g. `TextChannel.nsfw` is `boolean | undefined`) even though ours still return a default.
- `Channel.flags` is a frozen `ChannelFlagsBitField` rather than a `number`; `isThread()` and `isDMBased()` are `@discordjs/structures`' type guards.
- `Embed.timestamp` is the timestamp in milliseconds rather than the ISO string.
- `MessageReaction.burstColors` holds numbers rather than `#rrggbb` strings.
- `VoiceState.requestToSpeakTimestamp` is the raw ISO string rather than milliseconds: use `requestToSpeakAt` for a `Date`.
