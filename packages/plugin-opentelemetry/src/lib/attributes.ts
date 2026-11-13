/**
 * The name of the tracer the spans of this package are created with.
 */
export const TRACER_NAME = "@wolfstar/plugin-opentelemetry";

/**
 * The attributes of the span of an interaction.
 */
export const InteractionAttributes = {
  /**
   * What ran: `command`, `autocomplete`, `component` or `modal`.
   */
  Kind: "interaction.kind",
  /**
   * The name of the command or of the handler.
   */
  Name: "interaction.name",
  /**
   * `success` or `error`, set when the run ends.
   */
  Outcome: "interaction.outcome",
  /**
   * The id of the interaction.
   */
  Id: "discord.interaction.id",
  /**
   * The guild the interaction came from, when it came from one.
   */
  GuildId: "discord.guild.id",
  /**
   * The channel the interaction came from.
   */
  ChannelId: "discord.channel.id",
} as const;

/**
 * Which interactions get a span.
 */
export interface OpenTelemetryInteractionsOptions {
  /**
   * Slash, user and message commands.
   *
   * @default true
   */
  commands?: boolean;

  /**
   * Autocomplete requests. Off by default: Discord sends one for every keystroke.
   *
   * @default false
   */
  autocomplete?: boolean;

  /**
   * Message components (buttons, select menus) and modals.
   *
   * @default true
   */
  handlers?: boolean;
}

/**
 * The attributes of the span of a gateway dispatch.
 */
export const DispatchAttributes = {
  /**
   * The type of the dispatch (`MESSAGE_CREATE`, `GUILD_MEMBER_UPDATE`, ...).
   */
  Type: "discord.dispatch.type",
  /**
   * The gateway shard the dispatch came from.
   */
  ShardId: "discord.shard.id",
  /**
   * The partition the dispatch is ordered in (`guild:<id>`, `channel:<id>`...), when it has one.
   */
  Partition: "discord.dispatch.partition",
  /**
   * The guild of the dispatch, when it belongs to one.
   */
  GuildId: "discord.guild.id",
  /**
   * `success` or `error`, set when the processing ends.
   */
  Outcome: "dispatch.outcome",
} as const;

/**
 * Which gateway dispatches get a span.
 */
export interface OpenTelemetryDispatchesOptions {
  /**
   * The dispatch types that get no span, such as `PRESENCE_UPDATE` or `TYPING_START` on a busy bot.
   *
   * @default []
   */
  ignore?: readonly string[];
}
