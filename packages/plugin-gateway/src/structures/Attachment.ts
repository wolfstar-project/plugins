import type { APIAttachment } from "discord-api-types/v10";
import { AttachmentFlagsBitField } from "../util/flags.js";
import { kData, snowflakeTimestamp, Structure } from "./Structure.js";

/**
 * A file attached to a message.
 */
export class Attachment extends Structure<APIAttachment> {
  public get id() {
    return this[kData].id;
  }

  /**
   * The name of the file.
   */
  public get name() {
    return this[kData].filename;
  }

  /**
   * The title of the file, if any.
   */
  public get title(): string | null {
    return this[kData].title ?? null;
  }

  /**
   * The description (alt text) of the file, if any.
   */
  public get description(): string | null {
    return this[kData].description ?? null;
  }

  /**
   * The media type of the file, if known.
   */
  public get contentType(): string | null {
    return this[kData].content_type ?? null;
  }

  /**
   * The size of the file, in bytes.
   */
  public get size() {
    return this[kData].size;
  }

  public get url() {
    return this[kData].url;
  }

  public get proxyURL() {
    return this[kData].proxy_url;
  }

  /**
   * The height of the file, if it is an image or a video.
   */
  public get height(): number | null {
    return this[kData].height ?? null;
  }

  /**
   * The width of the file, if it is an image or a video.
   */
  public get width(): number | null {
    return this[kData].width ?? null;
  }

  /**
   * Whether the attachment is ephemeral: it is deleted shortly after the message is, unless referenced elsewhere.
   */
  public get ephemeral(): boolean {
    return this[kData].ephemeral ?? false;
  }

  /**
   * The duration of a voice message, in seconds.
   */
  public get duration(): number | null {
    return this[kData].duration_secs ?? null;
  }

  /**
   * The base64 encoded byte array of a voice message's sampled waveform.
   */
  public get waveform(): string | null {
    return this[kData].waveform ?? null;
  }

  public get flags() {
    return new AttachmentFlagsBitField(this[kData].flags ?? 0).freeze();
  }

  /**
   * Whether the attachment is marked as a spoiler.
   */
  public get spoiler(): boolean {
    return this.flags.has("IsSpoiler");
  }

  public get createdTimestamp() {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt() {
    return new Date(this.createdTimestamp);
  }
}
