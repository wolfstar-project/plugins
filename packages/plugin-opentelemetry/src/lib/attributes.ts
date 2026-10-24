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
  Kind: "wolfstar.interaction.kind",
  /**
   * The name of the command or of the handler.
   */
  Name: "wolfstar.interaction.name",
  /**
   * `success` or `error`, set when the run ends.
   */
  Outcome: "wolfstar.interaction.outcome",
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
