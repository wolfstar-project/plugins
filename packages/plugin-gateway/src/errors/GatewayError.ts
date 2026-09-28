/*
 * Adapted from discord.js's `DJSError`
 * (https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/errors/DJSError.js).
 * Copyright 2021 Noel Buechler, Copyright 2015 Amish Shah. Licensed under the Apache License, Version 2.0.
 */

import type { GatewayErrorCode } from "./ErrorCodes.js";
import { GatewayErrorMessages } from "./Messages.js";

/**
 * The arguments the message of `Code` is formatted with, none when the message is a plain string.
 */
export type GatewayErrorArgs<Code extends GatewayErrorCode> =
  (typeof GatewayErrorMessages)[Code] extends (...args: infer Args) => string ? Args : [];

/**
 * An {@link Error} carrying a {@link GatewayErrorCode}, like discord.js's `DiscordjsError`.
 *
 * @remarks
 * Its `name` is `GatewayError [<code>]`, and its message is the code's entry in {@link GatewayErrorMessages}.
 */
export class GatewayError<Code extends GatewayErrorCode = GatewayErrorCode> extends Error {
  /**
   * The code of the error.
   */
  public readonly code: Code;

  public constructor(code: Code, ...args: GatewayErrorArgs<Code>) {
    super(formatMessage(code, args));
    this.code = code;
    setName(this, new.target, code);
  }
}

/**
 * A {@link TypeError} carrying a {@link GatewayErrorCode}, like discord.js's `DiscordjsTypeError`.
 */
export class GatewayTypeError<Code extends GatewayErrorCode = GatewayErrorCode> extends TypeError {
  /**
   * The code of the error.
   */
  public readonly code: Code;

  public constructor(code: Code, ...args: GatewayErrorArgs<Code>) {
    super(formatMessage(code, args));
    this.code = code;
    setName(this, new.target, code);
  }
}

/**
 * A {@link RangeError} carrying a {@link GatewayErrorCode}, like discord.js's `DiscordjsRangeError`.
 */
export class GatewayRangeError<
  Code extends GatewayErrorCode = GatewayErrorCode,
> extends RangeError {
  /**
   * The code of the error.
   */
  public readonly code: Code;

  public constructor(code: Code, ...args: GatewayErrorArgs<Code>) {
    super(formatMessage(code, args));
    this.code = code;
    setName(this, new.target, code);
  }
}

function formatMessage(code: GatewayErrorCode, args: readonly unknown[]): string {
  const message = GatewayErrorMessages[code] as string | ((...args: readonly unknown[]) => string);
  return typeof message === "function" ? message(...args) : message;
}

function setName(
  error: Error,
  target: abstract new (...args: never[]) => Error,
  code: string,
): void {
  error.name = `${target.name} [${code}]`;
  // Captured again so that the stack's header shows the name with the code.
  Error.captureStackTrace?.(error, target);
}
