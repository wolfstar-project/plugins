---
"@wolfstar/plugin-i18next": minor
---

feat(plugin-i18next): accept guild, channel and message targets

`Target` was `Interaction` only, so the guild, channel and message targets `@sapphire/plugin-i18next`
supports had no equivalent here — the note in #50 about dropping the `Message` / `Guild` /
`BaseInteraction` union in favour of raw `APIInteraction` payloads left that gap open.

`Target` is now `Interaction | MessageTarget | ChannelTarget | GuildTarget`, and every helper
(`getSupportedLanguageName`, `getSupportedUserLanguageName`, their `…T` variants, `resolveKey`,
`resolveUserKey`, `fetchLanguage`, `fetchT`, `fetchKey`) accepts all four. `APIGuild`, `APIChannel`
and `APIMessage` satisfy the matching target structurally, so payloads can be passed straight
through.

Since the framework receives raw JSON rather than `discord.js` class instances, the members are told
apart by shape: an interaction has `locale`, a message has `channel_id`, a channel has `type`, and
anything left is a guild.

A guild resolves its language from `preferred_locale`, mirroring `Guild#preferredLocale` in Sapphire.
Channels and messages carry no locale, so the synchronous helpers fall back to `defaultName` for
them; `InternationalizationContext` now also carries `preferredLocale`, and the hook keeps receiving
`guildId`, `channelId` and `userId` so an asynchronous lookup can resolve them.

Interaction behaviour is unchanged.
