import { AsyncEventEmitter } from "@vladfrangu/async_event_emitter";
import { container } from "@wolfstar/http-framework";
import {
  createServer,
  type Server as NodeHttpServer,
  type ServerOptions as NodeHttpServerOptions,
} from "node:http";
import type { ListenOptions } from "node:net";
import { ApiRequest } from "../api/ApiRequest";
import { ApiResponse } from "../api/ApiResponse";
import { MiddlewareStore } from "../MiddlewareStore";
import type { RouterBranch } from "../router/RouterBranch";
import { RouteStore } from "../RouteStore";

export enum ServerEvent {
  Error = "error",
  Request = "request",
  MiddlewareFailure = "middlewareFailure",
  MiddlewareError = "middlewareError",
  MiddlewareSuccess = "middlewareSuccess",
  RouterBranchNotFound = "routerBranchNotFound",
  RouterBranchMethodNotAllowed = "routerBranchMethodNotAllowed",
  RouterFound = "routerFound",
  RouteError = "routeError",
}

export interface ServerEvents {
  [ServerEvent.Error]: [error: Error, request?: ApiRequest, response?: ApiResponse];
  [ServerEvent.Request]: [request: ApiRequest, response: ApiResponse];
  [ServerEvent.MiddlewareFailure]: [request: ApiRequest, response: ApiResponse];
  [ServerEvent.MiddlewareError]: [error: unknown, request: ApiRequest, response: ApiResponse];
  [ServerEvent.MiddlewareSuccess]: [request: ApiRequest, response: ApiResponse];
  [ServerEvent.RouterBranchNotFound]: [request: ApiRequest, response: ApiResponse];
  [ServerEvent.RouterBranchMethodNotAllowed]: [
    request: ApiRequest,
    response: ApiResponse,
    branch: RouterBranch,
  ];
  [ServerEvent.RouterFound]: [request: ApiRequest, response: ApiResponse];
  [ServerEvent.RouteError]: [error: unknown, request: ApiRequest, response: ApiResponse];
}

/**
 * The top-level type of a `Content-Type` value, as defined by RFC 1341 section 4.
 */
export type ContentTypeType =
  | "application"
  | "audio"
  | "font"
  | "haptics"
  | "image"
  | "message"
  | "model"
  | "multipart"
  | "text"
  | "video";

/**
 * A `Content-Type` parameter, for example `charset=utf-8`.
 */
export type ContentTypeParameter = `${string}=${string}`;

/**
 * A `type/subtype` mime type.
 */
export type GenericMimeType = `${ContentTypeType}/${string}`;

/**
 * A `type/subtype; parameter` mime type.
 */
export type GenericParametrizedMimeType = `${GenericMimeType}; ${ContentTypeParameter}`;

export interface ServerOptions {
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
   * The maximum request body size in bytes, enforced by the built-in `body` middleware. A route can
   * lower or raise it with `RouteOptions.maximumBodyLength`.
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
 * Upstream separates the auth-enabled options from the auth-less ones; auth is not implemented here,
 * so they are the same type.
 */
export type AuthLessServerOptions = ServerOptions;

/**
 * A standalone HTTP server for auxiliary REST routes (health checks, dashboards, webhooks from
 * other services, etc). It is deliberately independent from `Client.server`, which is
 * reserved for the Discord interactions webhook.
 */
export class Server extends AsyncEventEmitter<ServerEvents> {
  public readonly routes: RouteStore;
  public readonly middlewares: MiddlewareStore;
  public readonly server: NodeHttpServer<typeof ApiRequest, typeof ApiResponse>;
  public readonly options: ServerOptions;

  public constructor(options: ServerOptions = {}) {
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

    // `emit("error")` throws when nobody listens, and an unhandled throw inside a `node:http` event
    // handler would crash the process (for example on EADDRINUSE); `connect()` reports it instead.
    this.server.on("error", (error) => {
      if (this.listenerCount(ServerEvent.Error) > 0) this.emit(ServerEvent.Error, error);
    });
    this.server.on("request", (request, response) =>
      this.emit(ServerEvent.Request, request, response),
    );
  }

  /**
   * Starts listening for requests. Rejects if the server fails to bind or closes before it is listening.
   */
  public connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        this.server.off("listening", onListening);
        this.server.off("error", onError);
        this.server.off("close", onClose);
      };
      const onListening = () => {
        cleanup();
        resolve();
      };
      const onError = (error: Error) => {
        cleanup();
        reject(error);
      };
      const onClose = () => {
        cleanup();
        reject(new Error("Closed unexpectedly."));
      };

      this.server.on("listening", onListening);
      this.server.on("error", onError);
      this.server.on("close", onClose);
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
