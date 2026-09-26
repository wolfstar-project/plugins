import type { GatewayDispatchPayload } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import {
  DispatchHandlers,
  MultiDispatchHandlers,
  type DispatchHandler,
  type GatewayEventTuple,
  type MultiDispatchHandler,
} from "../util/dispatch.js";
import type { GatewayEventName } from "../util/events.js";

/** Processes one kind of gateway dispatch around the cache write. */
export abstract class Action {
  public constructor(protected readonly client: GatewayClient) {}

  /** Captures the state required to build the event before the cache changes. */
  public async before(_data: GatewayDispatchPayload["d"]): Promise<unknown> {
    return undefined;
  }

  /** Builds and emits events after the cache has been updated. */
  public abstract handle(
    data: GatewayDispatchPayload["d"],
    state: unknown,
    shardId: number,
  ): Promise<void>;

  protected emit([event, ...args]: GatewayEventTuple): void {
    this.client.emit(event, ...(args as never));
  }
}

/** An action producing one public event. */
export class DispatchAction extends Action {
  public constructor(
    client: GatewayClient,
    private readonly handler: DispatchHandler<GatewayDispatchPayload["t"], GatewayEventName>,
  ) {
    super(client);
  }

  public override async before(data: GatewayDispatchPayload["d"]): Promise<unknown> {
    return this.handler.before?.(this.client, data);
  }

  public async handle(
    data: GatewayDispatchPayload["d"],
    state: unknown,
    shardId: number,
  ): Promise<void> {
    const args = await this.handler.build(this.client, data, state, shardId);
    this.emit([this.handler.event, ...args] as GatewayEventTuple);
  }
}

/** An action producing several public events from one dispatch. */
export class MultiDispatchAction extends Action {
  public constructor(
    client: GatewayClient,
    private readonly handler: MultiDispatchHandler<GatewayDispatchPayload["t"]>,
  ) {
    super(client);
  }

  public override async before(data: GatewayDispatchPayload["d"]): Promise<unknown> {
    return this.handler.before?.(this.client, data);
  }

  public async handle(data: GatewayDispatchPayload["d"], state: unknown): Promise<void> {
    for (const event of await this.handler.emit(this.client, data, state)) this.emit(event);
  }
}

/** Holds one action per handled dispatch, like discord.js's ActionsManager. */
export class ActionsManager {
  readonly #actions = new Map<GatewayDispatchPayload["t"], Action>();

  public constructor(client: GatewayClient) {
    for (const [event, handler] of Object.entries(DispatchHandlers)) {
      if (handler) {
        this.#actions.set(
          event as GatewayDispatchPayload["t"],
          new DispatchAction(client, handler as never),
        );
      }
    }
    for (const [event, handler] of Object.entries(MultiDispatchHandlers)) {
      if (handler) {
        // An event holds a single action, so it may be registered in only one of the two handler tables.
        if (this.#actions.has(event as GatewayDispatchPayload["t"])) {
          throw new Error(
            `Dispatch event "${event}" is registered in both DispatchHandlers and MultiDispatchHandlers`,
          );
        }
        this.#actions.set(
          event as GatewayDispatchPayload["t"],
          new MultiDispatchAction(client, handler as never),
        );
      }
    }
  }

  public get(event: GatewayDispatchPayload["t"]): Action | undefined {
    return this.#actions.get(event);
  }
}
