import { IncomingMessage } from "node:http";
import { RequestProxy } from "../../utils/_body/RequestProxy";
import { isNullishOrEmpty } from "../../utils/common";
import type { Route } from "../Route";
import type { RouterNode } from "../router/RouterNode";

export type ValidatorFunction<Data, Type> = (data: Data) => Type;

export class ApiRequest extends IncomingMessage {
  /**
   * The query parameters, parsed from the request URL.
   */
  public query: Record<string, string | string[]> = {};

  /**
   * The values of the dynamic (`[param]`) path segments.
   */
  public params: Record<string, string> = {};

  /**
   * The router node that matched the request's pathname, if any.
   */
  public routerNode?: RouterNode | null;

  /**
   * The route that matched the request's pathname and method, if any.
   */
  public route?: Route | null;

  #cachedRequest: RequestProxy | null = null;

  /**
   * Returns a WHATWG `Request` view of this request.
   */
  public asWeb(): Request {
    this.#cachedRequest ??= new RequestProxy(this);
    return this.#cachedRequest;
  }

  /**
   * Reads the body as `FormData` for form content types, and as JSON otherwise.
   */
  public readBody(): Promise<unknown> {
    return this.#isFormContentType ? this.readBodyFormData() : this.readBodyJson();
  }

  public readBodyArrayBuffer(): Promise<ArrayBuffer> {
    return this.asWeb().arrayBuffer();
  }

  public readBodyBlob(): Promise<Blob> {
    return this.asWeb().blob();
  }

  public readBodyFormData(): Promise<FormData> {
    return this.asWeb().formData();
  }

  public readBodyJson(): Promise<unknown> {
    return this.asWeb().json();
  }

  public readBodyText(): Promise<string> {
    return this.asWeb().text();
  }

  public readValidatedBody<Type>(validator: ValidatorFunction<unknown, Type>): Promise<Type> {
    return this.readBody().then(validator);
  }

  public readValidatedBodyFormData<Type>(
    validator: ValidatorFunction<FormData, Type>,
  ): Promise<Type> {
    return this.readBodyFormData().then(validator);
  }

  public readValidatedBodyJson<Type>(validator: ValidatorFunction<unknown, Type>): Promise<Type> {
    return this.readBodyJson().then(validator);
  }

  public readValidatedBodyText<Type>(validator: ValidatorFunction<string, Type>): Promise<Type> {
    return this.readBodyText().then(validator);
  }

  get #isFormContentType(): boolean {
    const contentType = this.headers["content-type"];
    if (isNullishOrEmpty(contentType)) return false;

    return (
      contentType.startsWith("application/x-www-form-urlencoded") ||
      contentType.startsWith("multipart/form-data")
    );
  }
}
