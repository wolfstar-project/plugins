import type { GatewayClient } from "../../GatewayClient.js";
import { getGatewayClient } from "../../util/container.js";
import { Mixin } from "../Mixin.js";
import { WebhookMixin } from "./WebhookMixin.js";

/**
 * The webhook a {@link WebhookClient} posts through: its URL, or its ID and token.
 */
export type WebhookClientData = { url: string } | { id: string; token: string };

/**
 * The options of a {@link WebhookClient}.
 */
export interface WebhookClientOptions {
  /**
   * The client whose REST manager the requests go through, and whose managers cache the messages.
   *
   * @default the most recently constructed GatewayClient
   */
  client?: GatewayClient;
}

export interface WebhookClient extends WebhookMixin {}

/**
 * Posts through a webhook from its ID and token alone, without fetching it, like discord.js's `WebhookClient`.
 *
 * @example
 * ```typescript
 * const webhook = new WebhookClient({ url: process.env.WEBHOOK_URL! });
 * await webhook.send({ content: "Awoo", username: "WolfStar" });
 * ```
 */
export class WebhookClient {
  public readonly id: string;

  public readonly token: string;

  readonly #client: GatewayClient | undefined;

  public constructor(data: WebhookClientData, options: WebhookClientOptions = {}) {
    if ("url" in data) {
      const match = /\/webhooks\/(?<id>\d{17,20})\/(?<token>[\w-]{60,90})\/?$/i.exec(
        new URL(data.url).pathname,
      );
      if (!match?.groups) throw new TypeError(`Invalid webhook URL: ${data.url}`);
      this.id = match.groups.id!;
      this.token = match.groups.token!;
    } else {
      this.id = data.id;
      this.token = data.token;
    }

    this.#client = options.client;
  }

  /**
   * The client the requests go through.
   */
  public get client(): GatewayClient {
    return this.#client ?? getGatewayClient();
  }
}

Mixin(WebhookClient, [WebhookMixin]);
