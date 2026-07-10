import { ServerResponse } from "node:http";
import { HttpCodes } from "@wolfstar/http-framework";
import type { ApiRequest } from "./ApiRequest";

export class ApiResponse extends ServerResponse<ApiRequest> {
	public status(statusCode: number): this {
		this.statusCode = statusCode;
		return this;
	}

	public json(body: unknown, statusCode: number = HttpCodes.OK): this {
		this.statusCode = statusCode;
		if (!this.hasHeader("Content-Type"))
			this.setHeader("Content-Type", "application/json; charset=utf-8");
		this.end(JSON.stringify(body));
		return this;
	}

	public text(body: string, statusCode: number = HttpCodes.OK): this {
		this.statusCode = statusCode;
		if (!this.hasHeader("Content-Type"))
			this.setHeader("Content-Type", "text/plain; charset=utf-8");
		this.end(body);
		return this;
	}

	public noContent(): this {
		this.statusCode = HttpCodes.NoContent;
		this.end();
		return this;
	}

	public notFound(body: unknown = { error: "Not Found" }): this {
		return this.json(body, HttpCodes.NotFound);
	}

	public methodNotAllowed(body: unknown = { error: "Method Not Allowed" }): this {
		return this.json(body, HttpCodes.MethodNotAllowed);
	}

	public badRequest(body: unknown = { error: "Bad Request" }): this {
		return this.json(body, HttpCodes.BadRequest);
	}

	public error(
		statusCode: number = HttpCodes.InternalServerError,
		body: unknown = { error: "Internal Server Error" },
	): this {
		return this.json(body, statusCode);
	}
}
