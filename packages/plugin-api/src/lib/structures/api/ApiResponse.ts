import type { MimeType } from "@sapphire/iana-mime-types";
import { STATUS_CODES, ServerResponse, type IncomingMessage } from "node:http";
import { Readable } from "node:stream";
import { HttpCodes } from "../http/HttpCodes";
import type { CookieStore } from "./CookieStore";

export class ApiResponse<
  Request extends IncomingMessage = IncomingMessage,
> extends ServerResponse<Request> {
  /**
   * The cookies of the request, created by the `cookies` middleware.
   */
  public cookies!: CookieStore;

  public ok(data: unknown = STATUS_CODES[HttpCodes.OK]): void {
    this.status(HttpCodes.OK).respond(data);
  }

  public created(data: unknown = STATUS_CODES[HttpCodes.Created]): void {
    this.status(HttpCodes.Created).respond(data);
  }

  public noContent(data: unknown = STATUS_CODES[HttpCodes.NoContent]): void {
    this.status(HttpCodes.NoContent).respond(data);
  }

  public badRequest(data?: unknown): void {
    this.error(HttpCodes.BadRequest, data);
  }

  public unauthorized(data?: unknown): void {
    this.error(HttpCodes.Unauthorized, data);
  }

  public forbidden(data?: unknown): void {
    this.error(HttpCodes.Forbidden, data);
  }

  public notFound(data?: unknown): void {
    this.error(HttpCodes.NotFound, data);
  }

  public methodNotAllowed(data?: unknown): void {
    this.error(HttpCodes.MethodNotAllowed, data);
  }

  public conflict(data?: unknown): void {
    this.error(HttpCodes.Conflict, data);
  }

  /**
   * Sends an error. A string is the message of a 500; a number is the status code, with `data` (or the status text) as message.
   */
  public error(error: number | string, data?: unknown): void {
    if (typeof error === "string") {
      this.status(HttpCodes.InternalServerError).json({ error });
    } else {
      this.status(error).json({ error: data ?? STATUS_CODES[error] });
    }
  }

  public respond(data: unknown): void {
    if (typeof data === "string") this.text(data);
    else this.json(data);
  }

  public status(code: number): this {
    this.statusCode = code;
    return this;
  }

  public json(data: unknown): void {
    this.setContentType("application/json").end(JSON.stringify(data));
  }

  public text(data: string): void {
    this.setContentType("text/plain").end(data);
  }

  public image(
    type: Extract<MimeType, `image/${string}`>,
    data: string | Buffer | Uint8Array | Readable,
  ): void {
    if (data instanceof Readable) {
      this.setContentType(type);
      data.pipe(this);
    } else {
      this.setContentType(type).end(data);
    }
  }

  public html(code: number, data: string): void {
    this.setContentType("text/html").status(code).end(data);
  }

  public setContentType(type: MimeType): this {
    return this.setHeader("Content-Type", type);
  }
}
