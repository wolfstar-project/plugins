import { Subscription as BaseSubscription } from "@discordjs/structures";
import type { APISubscription } from "discord-api-types/v10";
import { isDeepEqual } from "../../util/equal.js";
import { Mixin } from "../Mixin.js";
import { initStructure, StructureMixin } from "../Structure.js";

export interface Subscription extends StructureMixin<APISubscription> {}

/**
 * A user's recurring purchase of a SKU: `@discordjs/structures`' `Subscription`.
 */
export class Subscription extends BaseSubscription {
  /**
   * @param data The raw subscription.
   */
  public constructor(data: APISubscription) {
    super(data);
    initStructure(this, data, {});
  }

  /**
   * The time the subscription was created at, from its ID.
   */
  public get createdAt(): Date | null {
    return this.createdDate;
  }

  /**
   * The time the current period of the subscription starts at.
   */
  public get currentPeriodStartAt(): Date | null {
    return this.currentPeriodStartDate;
  }

  /**
   * The time the current period of the subscription ends at.
   */
  public get currentPeriodEndAt(): Date | null {
    return this.currentPeriodEndDate;
  }

  /**
   * The time the subscription was canceled at, `null` if it was not.
   */
  public get canceledAt(): Date | null {
    return this.canceledDate;
  }

  /**
   * Whether this subscription has the same data as another one. `false` for anything that is neither a subscription
   * nor a raw one.
   *
   * @param other The subscription, or raw subscription, to compare with.
   */
  public equals(other: unknown): boolean {
    const subscription =
      other instanceof Subscription
        ? other
        : typeof other === "object" && other !== null && "sku_ids" in other && "id" in other
          ? new Subscription(other as APISubscription)
          : null;
    return subscription !== null && isDeepEqual(this.toJSON(), subscription.toJSON());
  }
}

Mixin(Subscription, [StructureMixin]);
