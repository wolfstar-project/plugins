/*
 * Adapted from discord.js's `ErrorCodes`
 * (https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/errors/ErrorCodes.js).
 * Copyright 2021 Noel Buechler, Copyright 2015 Amish Shah. Licensed under the Apache License, Version 2.0.
 */

import { GatewayErrorMessages } from "./Messages.js";

/**
 * The code of an error thrown by this package, set as its `code`.
 */
export type GatewayErrorCode = keyof typeof GatewayErrorMessages;

/**
 * Every {@link GatewayErrorCode}, keyed by itself, like discord.js's `DiscordjsErrorCodes`.
 *
 * @example
 * ```typescript
 * try {
 *   await webhook.send("Awoo");
 * } catch (error) {
 *   if (error instanceof GatewayError && error.code === GatewayErrorCodes.WebhookTokenUnavailable) {
 *     // ...
 *   }
 * }
 * ```
 */
export const GatewayErrorCodes = Object.freeze(
  Object.fromEntries(Object.keys(GatewayErrorMessages).map((code) => [code, code])),
) as { readonly [Code in GatewayErrorCode]: Code };
