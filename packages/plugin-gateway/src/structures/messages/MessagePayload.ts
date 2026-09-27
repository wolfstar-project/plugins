import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import type { RawFile } from "@discordjs/rest";
import {
  MessageReferenceType,
  type APIAllowedMentions,
  type APIAttachment,
  type APIEmbed,
  type RESTAPIMessageReference,
  type APIMessageTopLevelComponent,
  type APIPollAnswer,
  type AllowedMentionsTypes,
  type PollLayoutType,
  type RESTAPIPoll,
  type RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";
import type { GatewayClient } from "../../GatewayClient.js";
import { MessageFlagsBitField, type MessageFlagsResolvable } from "../../util/flags.js";

/**
 * Anything with a `toJSON` method, like the builders of `@discordjs/builders` and the structures of this package.
 */
export interface JSONEncodable<Value> {
  toJSON(): Value;
}

/**
 * Data a file can be resolved from: its contents, a path on disk, a URL, a stream, or a blob.
 */
export type BufferResolvable =
  | Uint8Array
  | ArrayBuffer
  | string
  | Blob
  | AsyncIterable<Uint8Array | string>;

/**
 * A file described along with its attachment metadata, like discord.js's `AttachmentPayload`.
 */
export interface AttachmentPayload {
  /**
   * The contents of the file.
   */
  attachment: BufferResolvable;
  /**
   * The name of the file, inferred from a path or URL when omitted.
   */
  name?: string;
  /**
   * The description (alt text) of the file.
   */
  description?: string;
  /**
   * The title of the file.
   */
  title?: string;
  /**
   * Whether to mark the file as a spoiler, by prefixing its name with `SPOILER_`.
   */
  spoiler?: boolean;
  /**
   * The duration of a voice message, in seconds.
   */
  duration?: number;
  /**
   * The waveform of a voice message, base64-encoded.
   */
  waveform?: string;
}

/**
 * A file to attach to a message: a {@link RawFile} of `@discordjs/rest`, an {@link AttachmentPayload}, anything with
 * a `toJSON` returning one (e.g. an attachment builder), or its raw contents.
 */
export type AttachmentResolvable =
  | RawFile
  | AttachmentPayload
  | JSONEncodable<AttachmentPayload>
  | BufferResolvable;

/**
 * The mentions a message may ping, in camel case like discord.js's `MessageMentionOptions`, or the raw API object.
 */
export type MessageMentionOptions =
  | APIAllowedMentions
  | {
      parse?: readonly AllowedMentionsTypes[];
      roles?: readonly string[];
      users?: readonly string[];
      /**
       * Whether to ping the author of the message replied to.
       */
      repliedUser?: boolean;
    };

/**
 * The message a message replies to.
 */
export interface ReplyOptions {
  /**
   * The message, or its ID.
   */
  messageReference: string | { readonly id: string; readonly channelId?: string };
  /**
   * Whether to fail when the message no longer exists, rather than sending a regular message.
   *
   * @default GatewayClientOptions.failIfNotExists ?? true
   */
  failIfNotExists?: boolean;
}

/**
 * The message a message forwards.
 */
export interface ForwardOptions {
  /**
   * The message, or its ID along with `channel`.
   */
  message:
    | string
    | { readonly id: string; readonly channelId: string; readonly guildId?: string | null };
  /**
   * The channel of the message, or its ID, needed when `message` is an ID.
   */
  channel?: string | { readonly id: string };
  /**
   * The guild of the message, or its ID.
   */
  guild?: string | { readonly id: string };
}

/**
 * A poll to create, in camel case like discord.js's `PollCreateData`.
 */
export interface PollCreateData {
  question: { text: string };
  answers: readonly {
    text?: string;
    emoji?: string | { id?: string | null; name?: string | null };
  }[];
  /**
   * How long the poll lasts, in hours.
   */
  duration: number;
  allowMultiselect?: boolean;
  layoutType?: PollLayoutType;
}

/**
 * The options every message payload accepts, when creating and editing.
 *
 * @remarks
 * The keys of the raw REST body (`allowed_mentions`, `message_reference`, `sticker_ids`...) are accepted too, and are
 * sent as they are: the camel case ones win when both are set.
 */
export interface BaseMessageOptions {
  content?: string | null;
  embeds?: readonly (APIEmbed | JSONEncodable<APIEmbed>)[] | null;
  components?:
    | readonly (APIMessageTopLevelComponent | JSONEncodable<APIMessageTopLevelComponent>)[]
    | null;
  /**
   * The files to upload.
   */
  files?: readonly AttachmentResolvable[];
  /**
   * The attachments to keep, when editing, or their metadata.
   */
  attachments?: readonly (Partial<APIAttachment> | JSONEncodable<Partial<APIAttachment>>)[];
  allowedMentions?: MessageMentionOptions;
  flags?: MessageFlagsResolvable;
  poll?: PollCreateData | RESTAPIPoll | JSONEncodable<RESTAPIPoll>;
}

/**
 * The options to send a message with.
 */
export interface MessageCreateOptions
  extends
    BaseMessageOptions,
    Omit<Partial<RESTPostAPIChannelMessageJSONBody>, keyof BaseMessageOptions> {
  tts?: boolean;
  nonce?: string | number;
  /**
   * Whether to refuse sending a message whose nonce was used recently, deduplicating retries.
   */
  enforceNonce?: boolean;
  /**
   * The message to reply to.
   */
  reply?: ReplyOptions;
  /**
   * The message to forward.
   */
  forward?: ForwardOptions;
  /**
   * The stickers to send, or their IDs.
   */
  stickers?: readonly (string | { readonly id: string })[];
}

/**
 * The options to edit a message with.
 */
export interface MessageEditOptions extends BaseMessageOptions {}

/**
 * The options only webhooks accept.
 */
export interface WebhookMessageOptions {
  username?: string;
  avatarURL?: string;
  /**
   * The name of the post to create, for webhooks of forum and media channels.
   */
  threadName?: string;
  /**
   * The tags of the post to create, for webhooks of forum and media channels.
   */
  appliedTags?: readonly string[];
  /**
   * Whether to allow components on a message of a webhook not owned by an application.
   */
  withComponents?: boolean;
}

/**
 * The thread a webhook message is in, for webhooks of forum and media channels, or of a thread's parent.
 */
export interface WebhookThreadOptions {
  threadId?: string;
}

/**
 * The options to send a message through a webhook with.
 */
export interface WebhookMessageCreateOptions
  extends BaseMessageOptions, WebhookMessageOptions, WebhookThreadOptions {
  tts?: boolean;
}

/**
 * The options to edit a message sent by a webhook with.
 */
export interface WebhookMessageEditOptions extends MessageEditOptions, WebhookThreadOptions {}

/**
 * Anything with a client, e.g. a structure, which a {@link MessagePayload} reads its defaults from.
 */
export type MessageTarget = { readonly client: GatewayClient } | GatewayClient;

/**
 * The extra flags telling a {@link MessagePayload} what its target accepts.
 */
export interface MessagePayloadContext {
  /**
   * Whether the message is sent through a webhook, which accepts {@link WebhookMessageOptions}.
   */
  webhook?: boolean;
  /**
   * Whether the message is edited rather than created: `null` clears fields instead of leaving them out.
   */
  edit?: boolean;
}

/**
 * The options of any message payload.
 */
export type MessagePayloadOptions = MessageCreateOptions & WebhookMessageOptions;

/**
 * Anything accepted where a message payload is expected: its content, its options, or a {@link MessagePayload}.
 */
export type MessagePayloadResolvable<Options extends object = MessageCreateOptions> =
  | string
  | Options
  | MessagePayload;

/**
 * The body and files a {@link MessagePayload} resolved to, ready for `@discordjs/core`.
 */
export interface ResolvedMessagePayload<Body = RESTPostAPIChannelMessageJSONBody> {
  body: Body;
  files: RawFile[] | undefined;
}

const kOptionKeys = new Set([
  "content",
  "embeds",
  "components",
  "files",
  "attachments",
  "allowedMentions",
  "flags",
  "poll",
  "tts",
  "nonce",
  "enforceNonce",
  "reply",
  "forward",
  "stickers",
  "username",
  "avatarURL",
  "threadName",
  "appliedTags",
  "withComponents",
  "threadId",
]);

/**
 * Normalizes the options of a message into the REST body and files Discord expects, like discord.js's
 * `MessagePayload`: camel case options, builders, reply and forward shortcuts, stickers, polls, and files from paths,
 * URLs, streams, or buffers.
 *
 * @example
 * ```typescript
 * const payload = MessagePayload.create(channel, {
 *   content: "Awoo",
 *   reply: { messageReference: message },
 *   files: ["./wolf.png", { attachment: buffer, name: "howl.ogg", description: "A howl" }],
 * });
 * await channel.send(payload);
 * ```
 */
export class MessagePayload {
  /**
   * What the message is sent to: the structure it is sent through, or the client.
   */
  public readonly target: MessageTarget;

  /**
   * The options the payload was created with.
   */
  public readonly options: MessagePayloadOptions;

  /**
   * What the target accepts.
   */
  public readonly context: Readonly<MessagePayloadContext>;

  /**
   * The resolved REST body, set by {@link MessagePayload.resolveBody}.
   */
  public body: RESTPostAPIChannelMessageJSONBody | null = null;

  /**
   * The resolved files, set by {@link MessagePayload.resolveFiles}.
   */
  public files: RawFile[] | null = null;

  public constructor(
    target: MessageTarget,
    options: MessagePayloadOptions,
    context: MessagePayloadContext = {},
  ) {
    this.target = target;
    this.options = options;
    this.context = context;
  }

  /**
   * The client the target belongs to.
   */
  public get client(): GatewayClient {
    return "gateway" in this.target ? (this.target as GatewayClient) : this.target.client;
  }

  /**
   * Whether the message is sent through a webhook.
   */
  public get isWebhook(): boolean {
    return this.context.webhook === true;
  }

  /**
   * Whether the message is edited rather than created.
   */
  public get isEdit(): boolean {
    return this.context.edit === true;
  }

  /**
   * Resolves the content of the message: `null` clears it when editing, and is left out otherwise.
   */
  public makeContent(): string | null | undefined {
    const { content } = this.options;
    if (content === null) return this.isEdit ? "" : undefined;
    if (content === undefined) return undefined;
    if (typeof content !== "string")
      throw new TypeError("The content of a message must be a string");
    return content;
  }

  /**
   * Resolves the REST body of the message.
   */
  public resolveBody(): this {
    if (this.body) return this;

    const { options } = this;
    const raw: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(options)) {
      if (!kOptionKeys.has(key)) raw[key] = value;
    }

    const body: Record<string, unknown> = { ...raw };
    const set = (key: string, value: unknown) => {
      if (value !== undefined) body[key] = value;
    };

    set("content", this.makeContent());
    set("tts", options.tts);
    set("nonce", this.resolveNonce(options.nonce));
    set("enforce_nonce", options.enforceNonce);
    set("embeds", this.resolveList(options.embeds));
    set("components", this.resolveList(options.components));
    set(
      "flags",
      options.flags === undefined ? undefined : Number(MessageFlagsBitField.resolve(options.flags)),
    );
    set("allowed_mentions", this.resolveAllowedMentions());
    set("message_reference", this.resolveReference());
    set(
      "sticker_ids",
      options.stickers?.map((sticker) => (typeof sticker === "string" ? sticker : sticker.id)),
    );
    set("poll", this.resolvePoll());
    set("attachments", this.resolveAttachments());

    if (this.isWebhook) {
      set("username", options.username);
      set("avatar_url", options.avatarURL);
      set("thread_name", options.threadName);
      set("applied_tags", options.appliedTags?.slice());
      set("with_components", options.withComponents);
    }

    this.body = body as unknown as RESTPostAPIChannelMessageJSONBody;
    return this;
  }

  /**
   * Resolves the files of the message, reading them from disk, the network, or streams.
   */
  public async resolveFiles(): Promise<this> {
    if (this.files) return this;
    this.files = await Promise.all(
      (this.options.files ?? []).map((file) => MessagePayload.resolveFile(file)),
    );
    return this;
  }

  /**
   * Resolves both the body and the files, for `@discordjs/core`.
   */
  public async resolve<Body = RESTPostAPIChannelMessageJSONBody>(): Promise<
    ResolvedMessagePayload<Body>
  > {
    await this.resolveBody().resolveFiles();
    return {
      body: this.body as unknown as Body,
      files: this.files!.length > 0 ? this.files! : undefined,
    };
  }

  private resolveNonce(nonce: string | number | undefined): string | number | undefined {
    if (nonce === undefined) return undefined;
    if (typeof nonce === "string" && nonce.length > 25) {
      throw new RangeError("A message nonce must be at most 25 characters long");
    }
    if (typeof nonce === "number" && !Number.isInteger(nonce)) {
      throw new RangeError("A message nonce must be an integer");
    }
    return nonce;
  }

  private resolveList<Value extends object>(
    values: readonly (Value | JSONEncodable<Value>)[] | null | undefined,
  ): Value[] | undefined {
    if (values === null) return this.isEdit ? [] : undefined;
    return values?.map((value) => MessagePayload.toJSON(value));
  }

  private resolveAllowedMentions(): APIAllowedMentions | undefined {
    const mentions = this.options.allowedMentions ?? this.clientOption("allowedMentions");
    if (mentions === undefined) return undefined;

    const { repliedUser, ...rest } = mentions as { repliedUser?: boolean } & APIAllowedMentions;
    const resolved: APIAllowedMentions = { ...rest };
    if (rest.parse) resolved.parse = [...rest.parse];
    if (rest.roles) resolved.roles = [...rest.roles];
    if (rest.users) resolved.users = [...rest.users];
    if (repliedUser !== undefined) resolved.replied_user = repliedUser;
    return resolved;
  }

  private resolveReference(): RESTAPIMessageReference | undefined {
    const { reply, forward } = this.options as MessageCreateOptions;
    if (forward) {
      const { message, channel, guild } = forward;
      const channelId =
        typeof message === "string" ? MessagePayload.id(channel) : message.channelId;
      if (!channelId) throw new TypeError("Forwarding a message by ID needs its channel");
      return {
        type: MessageReferenceType.Forward,
        message_id: typeof message === "string" ? message : message.id,
        channel_id: channelId,
        guild_id:
          MessagePayload.id(guild) ??
          (typeof message === "string" ? undefined : (message.guildId ?? undefined)),
      };
    }

    if (reply) {
      const { messageReference, failIfNotExists = this.clientOption("failIfNotExists") ?? true } =
        reply;
      const reference: RESTAPIMessageReference = {
        type: MessageReferenceType.Default,
        message_id: typeof messageReference === "string" ? messageReference : messageReference.id,
        fail_if_not_exists: failIfNotExists,
      };
      if (typeof messageReference !== "string" && messageReference.channelId) {
        reference.channel_id = messageReference.channelId;
      }
      return reference;
    }

    return undefined;
  }

  private resolvePoll(): RESTAPIPoll | undefined {
    const { poll } = this.options;
    if (poll === undefined) return undefined;
    if ("toJSON" in poll && typeof poll.toJSON === "function") return poll.toJSON();
    if (!("allowMultiselect" in poll || "layoutType" in poll || isCamelPoll(poll)))
      return poll as RESTAPIPoll;

    const data = poll as PollCreateData;
    return {
      question: { text: data.question.text },
      answers: data.answers.map(
        ({ text, emoji }) =>
          ({
            poll_media: {
              text,
              emoji: typeof emoji === "string" ? resolvePartialEmoji(emoji) : (emoji ?? undefined),
            },
          }) as Omit<APIPollAnswer, "answer_id">,
      ),
      duration: data.duration,
      allow_multiselect: data.allowMultiselect ?? false,
      layout_type: data.layoutType,
    } as RESTAPIPoll;
  }

  private resolveAttachments(): Partial<APIAttachment>[] | undefined {
    const { files, attachments } = this.options;
    if (files === undefined && attachments === undefined) return undefined;

    const resolved: Partial<APIAttachment>[] = (attachments ?? []).map((attachment) =>
      MessagePayload.toJSON(attachment),
    );
    for (const [index, file] of (files ?? []).entries()) {
      const payload = MessagePayload.attachmentPayload(file);
      const attachment: Record<string, unknown> = { id: index.toString() };
      if (payload?.description !== undefined) attachment.description = payload.description;
      if (payload?.title !== undefined) attachment.title = payload.title;
      if (payload?.duration !== undefined) attachment.duration_secs = payload.duration;
      if (payload?.waveform !== undefined) attachment.waveform = payload.waveform;
      resolved.push(attachment as Partial<APIAttachment>);
    }
    return resolved;
  }

  private clientOption<Key extends "allowedMentions" | "failIfNotExists">(
    key: Key,
  ): GatewayClientMessageDefaults[Key] {
    try {
      return (this.client.options as GatewayClientMessageDefaults)[key];
    } catch {
      return undefined;
    }
  }

  /**
   * Creates a payload, or returns it when it already is one.
   *
   * @param target What the message is sent to.
   * @param options The message, its content, or a payload.
   * @param context What the target accepts.
   */
  public static create(
    target: MessageTarget,
    options: MessagePayloadResolvable<MessagePayloadOptions | MessageEditOptions>,
    context?: MessagePayloadContext,
  ): MessagePayload {
    if (options instanceof MessagePayload) return options;
    return new MessagePayload(
      target,
      typeof options === "string" ? { content: options } : (options as MessagePayloadOptions),
      context,
    );
  }

  /**
   * Resolves a file to upload, reading paths from disk and downloading URLs.
   *
   * @param file The file.
   */
  public static async resolveFile(file: AttachmentResolvable): Promise<RawFile> {
    if (isRawFile(file)) return file;

    const payload = MessagePayload.attachmentPayload(file)!;
    const { attachment } = payload;
    let name = payload.name ?? (typeof attachment === "string" ? nameOf(attachment) : "file.jpg");
    if (payload.spoiler && !name.startsWith("SPOILER_")) name = `SPOILER_${name}`;

    const { data, contentType } = await resolveBuffer(attachment);
    return contentType ? { name, data, contentType } : { name, data };
  }

  private static attachmentPayload(file: AttachmentResolvable): AttachmentPayload | null {
    if (isRawFile(file)) return null;
    if (isBufferResolvable(file)) return { attachment: file };
    if ("toJSON" in file && typeof file.toJSON === "function") return file.toJSON();
    return file as AttachmentPayload;
  }

  private static toJSON<Value extends object>(value: Value | JSONEncodable<Value>): Value {
    return "toJSON" in value && typeof value.toJSON === "function"
      ? value.toJSON()
      : (value as Value);
  }

  private static id(value: string | { readonly id: string } | undefined): string | undefined {
    return typeof value === "string" ? value : value?.id;
  }
}

/**
 * The message defaults read from the client's options.
 */
export interface GatewayClientMessageDefaults {
  /**
   * The mentions every message may ping, unless it sets its own.
   */
  allowedMentions?: MessageMentionOptions;
  /**
   * Whether replies fail when the message they reply to no longer exists, unless they set it themselves.
   *
   * @default true
   */
  failIfNotExists?: boolean;
}

function isCamelPoll(poll: object): boolean {
  const answers = (poll as { answers?: readonly object[] }).answers;
  return answers?.some((answer) => !("poll_media" in answer)) ?? false;
}

function resolvePartialEmoji(emoji: string): { id?: string; name?: string } {
  const match = /<?(?:a?:)?(\w{2,32}):(\d{17,20})>?/.exec(emoji);
  return match ? { name: match[1], id: match[2] } : { name: emoji };
}

function isRawFile(file: AttachmentResolvable): file is RawFile {
  return (
    typeof file === "object" &&
    file !== null &&
    "data" in file &&
    "name" in file &&
    !("attachment" in file)
  );
}

function isBufferResolvable(file: AttachmentResolvable): file is BufferResolvable {
  return (
    typeof file === "string" ||
    file instanceof Uint8Array ||
    file instanceof ArrayBuffer ||
    file instanceof Blob ||
    (typeof file === "object" && file !== null && Symbol.asyncIterator in file)
  );
}

function nameOf(path: string): string {
  if (/^https?:\/\//.test(path)) {
    const name = basename(new URL(path).pathname);
    return name || "file.jpg";
  }
  return basename(path);
}

async function resolveBuffer(
  attachment: BufferResolvable,
): Promise<{ data: Uint8Array; contentType?: string }> {
  if (attachment instanceof Uint8Array) return { data: attachment };
  if (attachment instanceof ArrayBuffer) return { data: new Uint8Array(attachment) };
  if (attachment instanceof Blob) {
    return {
      data: new Uint8Array(await attachment.arrayBuffer()),
      contentType: attachment.type || undefined,
    };
  }
  if (typeof attachment === "string") {
    if (/^https?:\/\//.test(attachment)) {
      const response = await fetch(attachment);
      if (!response.ok) throw new Error(`Could not download ${attachment}: ${response.status}`);
      return {
        data: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? undefined,
      };
    }
    return { data: await readFile(attachment) };
  }

  const chunks: Uint8Array[] = [];
  for await (const chunk of attachment) {
    chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
  }
  return { data: Buffer.concat(chunks) };
}
