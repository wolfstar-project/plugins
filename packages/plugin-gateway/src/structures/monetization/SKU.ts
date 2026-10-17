import { SKU as BaseSKU } from "@discordjs/structures";
import type { APISKU } from "discord-api-types/v10";
import { SubscriptionManager } from "../../managers/SubscriptionManager.js";
import { isDeepEqual } from "../../util/equal.js";
import { SKUFlagsBitField } from "../../util/flags.js";
import { Mixin } from "../Mixin.js";
import { initStructure, kData, snowflakeTimestamp, StructureMixin } from "../Structure.js";

export interface SKU extends StructureMixin<APISKU> {}

/**
 * A premium offer of the application, to subscribe to or to buy: `@discordjs/structures`' `SKU`, with its
 * subscriptions.
 */
export class SKU extends BaseSKU {
  /**
   * @param data The raw SKU.
   */
  public constructor(data: APISKU) {
    super(data);
    initStructure(this, data, {});
  }

  /**
   * The flags of the SKU.
   */
  public override get flags(): Readonly<SKUFlagsBitField> {
    return new SKUFlagsBitField(this[kData].flags ?? 0).freeze();
  }

  public get createdTimestamp(): number {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  /**
   * The subscriptions to the SKU, fetched from the API and never cached. A manager is built on every access.
   */
  public get subscriptions(): SubscriptionManager {
    return new SubscriptionManager(this.client, this.id);
  }

  /**
   * The name of the SKU.
   */
  public toString(): string {
    return this.name;
  }

  /**
   * Whether this SKU has the same data as another one. `false` for anything that is neither a SKU nor a raw one.
   *
   * @param other The SKU, or raw SKU, to compare with.
   */
  public equals(other: unknown): boolean {
    const sku =
      other instanceof SKU
        ? other
        : typeof other === "object" && other !== null && "slug" in other && "id" in other
          ? new SKU(other as APISKU)
          : null;
    return sku !== null && isDeepEqual(this.toJSON(), sku.toJSON());
  }
}

Mixin(SKU, [StructureMixin]);
