import { AsyncEventEmitter } from "@vladfrangu/async_event_emitter";
import { container } from "@wolfstar/http-framework";
import {
  createServer,
  type Server as NodeHttpServer,
  type ServerOptions as NodeHttpServerOptions,
} from "node:http";
import type { ListenOptions } from "node:net";
import { MiddlewareStore } from "../structures/MiddlewareStore";
import { RouteStore } from "../structures/RouteStore";
import { ApiRequest } from "./ApiRequest";
import { ApiResponse } from "./ApiResponse";

export enum ApiServerEvent {
  Error = "error",
  Request = "request",
  RouterBranchNotFound = "routerBranchNotFound",
  RouterBranchMethodNotAllowed = "routerBranchMethodNotAllowed",
  RouterFound = "routerFound",
  RouteError = "routeError",
  MiddlewareError = "middlewareError",
}

export interface ApiServerEvents {
  [ApiServerEvent.Error]: [error: Error];
  [ApiServerEvent.Request]: [request: ApiRequest, response: ApiResponse];
  [ApiServerEvent.RouterBranchNotFound]: [request: ApiRequest, response: ApiResponse];
  [ApiServerEvent.RouterBranchMethodNotAllowed]: [request: ApiRequest, response: ApiResponse];
  [ApiServerEvent.RouterFound]: [request: ApiRequest, response: ApiResponse];
  [ApiServerEvent.RouteError]: [error: unknown, request: ApiRequest, response: ApiResponse];
  [ApiServerEvent.MiddlewareError]: [error: unknown, request: ApiRequest, response: ApiResponse];
}

export interface ApiServerOptions {
  /**
   * A path segment prefix applied to every route, e.g. `/api`.
   */
  prefix?: string;

  /**
   * The value of the `Access-Control-Allow-Origin` header set by the built-in `headers` middleware.
   * @default '*'
   */
  origin?: string;

  /**
   * The maximum request body size in bytes, enforced by the built-in `body` middleware.
   * @default 1024 * 1024 * 50
   */
  maximumBodyLength?: number;

  /**
   * Raw options forwarded to `node:http`'s `createServer`.
   */
  server?: NodeHttpServerOptions;

  /**
   * Raw options forwarded to `Server#listen`.
   * @default { port: 4000 }
   */
  listenOptions?: ListenOptions;

  /**
   * Whether to start listening automatically once the interaction webhook is up (during the
   * `postListen` plugin hook).
   * @default true
   */
  automaticallyConnect?: boolean;
}

/**
 * A standalone HTTP server for auxiliary REST routes (health checks, dashboards, webhooks from
 * other services, etc). It is deliberately independent from {@link Client.server}, which is
 * reserved for the Discord interactions webhook.
 */
export class ApiServer extends AsyncEventEmitter<ApiServerEvents> {
  public readonly routes: RouteStore;
  public readonly middlewares: MiddlewareStore;
  public readonly server: NodeHttpServer<typeof ApiRequest, typeof ApiResponse>;
  public readonly options: ApiServerOptions;

  public constructor(options: ApiServerOptions = {}) {
    super();

    container.server = this;

    this.options = options;

    const serverOptions: NodeHttpServerOptions<typeof ApiRequest, typeof ApiResponse> = {
      ...options.server,
      IncomingMessage: ApiRequest,
      ServerResponse: ApiResponse,
    };
    this.server = createServer(serverOptions);

    this.routes = new RouteStore();
    this.middlewares = new MiddlewareStore();

    this.server.on("error", (error) => this.emit(ApiServerEvent.Error, error));
    this.server.on("request", (request, response) =>
      this.emit(ApiServerEvent.Request, request, response),
    );
  }

  /**
   * Starts listening for requests.
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const onError = (error: Error) => {
        this.server.off("listening", onListening);
        reject(error);
      };
      const onListening = () => {
        this.server.off("error", onError);
        resolve();
      };

      this.server.once("error", onError);
      this.server.once("listening", onListening);
      this.server.listen({ port: 4000, ...this.options.listenOptions });
    });
  }

  /**
   * Stops the server from accepting new connections.
   */
  public disconnect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.server.close((error) => (error ? reject(error) : resolve()));
    });
  }
}
