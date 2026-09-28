import { FileUploadComponent as BaseFileUploadComponent } from "@discordjs/structures";
import type { APIFileUploadComponent, FileUploadType } from "discord-api-types/v10";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, StructureMixin } from "../Structure.js";
import { ComponentMixin } from "./Component.js";

export interface FileUploadComponent
  extends StructureMixin<APIFileUploadComponent>, ComponentMixin {}

/**
 * A file upload field of a modal: `@discordjs/structures`' `FileUploadComponent`, like discord.js'.
 */
export class FileUploadComponent extends BaseFileUploadComponent<""> {
  /**
   * @param data The raw file upload.
   * @param relations The related structures, resolved from the cache.
   */
  public constructor(data: APIFileUploadComponent, relations: object = {}) {
    super(data);
    initStructure(this, data, relations);
  }

  /**
   * The types of files that can be uploaded, any when empty.
   */
  public get fileTypes(): readonly FileUploadType[] {
    return this[kData].file_types ?? [];
  }
}

Mixin(FileUploadComponent, [StructureMixin, ComponentMixin]);
