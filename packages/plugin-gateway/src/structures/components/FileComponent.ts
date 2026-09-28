import { FileComponent as BaseFileComponent } from "@discordjs/structures";
import type { APIFileComponent } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";
import { UnfurledMediaItem } from "./UnfurledMediaItem.js";

export interface FileComponent extends StructureMixin<APIFileComponent>, ComponentMixin {}

/**
 * An attached file: `@discordjs/structures`' `FileComponent`, with its media like discord.js'.
 */
export class FileComponent extends BaseFileComponent<""> {
  /**
   * @param data The raw file component.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIFileComponent, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The file, an `attachment://` reference to an attachment of the message.
   */
  public get file(): UnfurledMediaItem {
    return new UnfurledMediaItem(this[kData].file);
  }

  /**
   * Whether the file is marked as a spoiler.
   */
  public override get spoiler(): boolean {
    return this[kData].spoiler ?? false;
  }
}

Mixin(FileComponent, [StructureMixin, ComponentMixin]);
