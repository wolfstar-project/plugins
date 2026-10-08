/*
 * Adapted from discord.js's `AttachmentBuilder`
 * (https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/structures/AttachmentBuilder.js).
 * Copyright 2021 Noel Buechler, Copyright 2015 Amish Shah. Licensed under the Apache License, Version 2.0.
 */

import { basename } from "node:path";
import type { AttachmentPayload, BufferResolvable, JSONEncodable } from "./MessagePayload.js";

const SpoilerPrefix = "SPOILER_";

/**
 * The optional data of an {@link AttachmentBuilder}.
 */
export interface AttachmentBuilderData {
  /**
   * The name of the file, inferred from a path or URL when omitted.
   */
  name?: string;
  /**
   * The description (alt text) of the file.
   */
  description?: string;
}

/**
 * What {@link AttachmentBuilder.from} copies: an {@link AttachmentPayload}, an {@link AttachmentBuilder}, or a received
 * `Attachment`, whose `attachment` is its URL.
 */
export interface AttachmentBuilderSource {
  attachment: BufferResolvable;
  name?: string | null;
  description?: string | null;
  title?: string | null;
  duration?: number | null;
  waveform?: string | null;
  spoiler?: boolean;
}

/**
 * Builds a file to send with a message, like discord.js's `AttachmentBuilder`. Pass it in the `files` of a message.
 *
 * @example
 * ```ts
 * const file = new AttachmentBuilder("./howl.ogg").setDescription("A howl").setSpoiler();
 * await channel.send({ content: "Awoo", files: [file] });
 * ```
 */
export class AttachmentBuilder implements JSONEncodable<AttachmentPayload> {
  /**
   * The contents of the file: its data, a path on disk, a URL, a stream, or a blob.
   */
  public attachment: BufferResolvable;

  /**
   * The name of the file, `undefined` to infer it from a path or URL.
   */
  public name?: string;

  /**
   * The description (alt text) of the file.
   */
  public description?: string;

  /**
   * The title of the file.
   */
  public title?: string;

  /**
   * The duration of a voice message, in seconds.
   */
  public duration?: number;

  /**
   * The waveform of a voice message, base64-encoded.
   */
  public waveform?: string;

  /**
   * Whether the file is a spoiler while it has no name to prefix with `SPOILER_`.
   */
  private pendingSpoiler = false;

  /**
   * @param attachment The contents of the file.
   * @param data The name and description of the file.
   */
  public constructor(attachment: BufferResolvable, data: AttachmentBuilderData = {}) {
    this.attachment = attachment;
    this.name = data.name;
    this.description = data.description;
  }

  /**
   * Whether the file is a spoiler: its name starts with `SPOILER_`.
   */
  public get spoiler(): boolean {
    return this.name === undefined
      ? this.pendingSpoiler
      : basename(this.name).startsWith(SpoilerPrefix);
  }

  /**
   * Sets the description (alt text) of the file.
   *
   * @param description The description.
   */
  public setDescription(description: string): this {
    this.description = description;
    return this;
  }

  /**
   * Sets the contents of the file, and its name when given.
   *
   * @param attachment The contents of the file.
   * @param name The name of the file, kept as is when omitted.
   */
  public setFile(attachment: BufferResolvable, name?: string): this {
    this.attachment = attachment;
    if (name !== undefined) this.setName(name);
    return this;
  }

  /**
   * Sets the name of the file.
   *
   * @param name The name of the file.
   */
  public setName(name: string): this {
    this.name = name;
    if (this.pendingSpoiler) {
      this.pendingSpoiler = false;
      this.setSpoiler();
    }
    return this;
  }

  /**
   * Marks the file as a spoiler, or not, by adding or removing the `SPOILER_` prefix of its name.
   *
   * @param spoiler Whether the file is a spoiler.
   */
  public setSpoiler(spoiler = true): this {
    if (this.name === undefined) {
      this.pendingSpoiler = spoiler;
    } else if (!spoiler) {
      while (this.name.startsWith(SpoilerPrefix)) this.name = this.name.slice(SpoilerPrefix.length);
    } else if (!this.name.startsWith(SpoilerPrefix)) {
      this.name = `${SpoilerPrefix}${this.name}`;
    }
    return this;
  }

  /**
   * Sets the title of the file.
   *
   * @param title The title.
   */
  public setTitle(title: string): this {
    this.title = title;
    return this;
  }

  /**
   * Sets the duration of a voice message.
   *
   * @param duration The duration, in seconds.
   */
  public setDuration(duration: number): this {
    this.duration = duration;
    return this;
  }

  /**
   * Sets the waveform of a voice message.
   *
   * @param waveform The waveform, base64-encoded.
   */
  public setWaveform(waveform: string): this {
    this.waveform = waveform;
    return this;
  }

  /**
   * The file as an {@link AttachmentPayload}.
   */
  public toJSON(): AttachmentPayload {
    const payload: AttachmentPayload = { attachment: this.attachment };
    if (this.name !== undefined) payload.name = this.name;
    if (this.description !== undefined) payload.description = this.description;
    if (this.title !== undefined) payload.title = this.title;
    if (this.duration !== undefined) payload.duration = this.duration;
    if (this.waveform !== undefined) payload.waveform = this.waveform;
    if (this.name === undefined && this.pendingSpoiler) payload.spoiler = true;
    return payload;
  }

  /**
   * Copies a file.
   *
   * @param other The builder, payload, or received attachment to copy.
   */
  public static from(other: AttachmentBuilderSource): AttachmentBuilder {
    const builder = new AttachmentBuilder(other.attachment, {
      name: other.name ?? undefined,
      description: other.description ?? undefined,
    });
    if (other.title != null) builder.title = other.title;
    if (other.duration != null) builder.duration = other.duration;
    if (other.waveform != null) builder.waveform = other.waveform;
    if (builder.name === undefined && other.spoiler) builder.pendingSpoiler = true;
    return builder;
  }
}
