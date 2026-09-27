import { Attachment as BaseAttachment } from "@discordjs/structures";
import type { APIAttachment } from "discord-api-types/v10";
import { AttachmentFlagsBitField } from "../../util/flags.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, snowflakeTimestamp, StructureMixin } from "../Structure.js";

export interface Attachment extends StructureMixin<APIAttachment> {}

/**
 * A file attached to a message: `@discordjs/structures`' `Attachment`, with discord.js' aliases and helpers.
 */
export class Attachment extends BaseAttachment {
  /**
   * @param data The raw attachment.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIAttachment, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The name of the file.
   */
  public get name() {
    return this.filename;
  }

  /**
   * Whether the attachment is ephemeral: it is deleted shortly after the message is, unless referenced elsewhere.
   */
  public override get ephemeral(): boolean {
    return this[kData].ephemeral ?? false;
  }

  /**
   * The duration of a voice message, in seconds.
   */
  public get duration(): number | null {
    return this[kData].duration_secs ?? null;
  }

  public override get flags(): Readonly<AttachmentFlagsBitField> {
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

Mixin(Attachment, [StructureMixin]);
