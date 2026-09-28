/*
 * Adapted from discord.js's `DataResolver`
 * (https://github.com/discordjs/discord.js/blob/main/packages/discord.js/src/util/DataResolver.js).
 * Copyright 2021 Noel Buechler, Copyright 2015 Amish Shah. Licensed under the Apache License, Version 2.0.
 */

import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { GatewayError, GatewayTypeError } from "../errors/GatewayError.js";
import type { BufferResolvable } from "../structures/messages/MessagePayload.js";
import type { GuildTemplateResolvable, InviteResolvable } from "../types.js";

/**
 * Matches the invite URLs Discord hands out, capturing their `code`, like discord.js's `BaseInvite.InvitesPattern`.
 */
export const InvitesPattern =
  /discord(?:(?:app)?\.com\/invite|\.gg(?:\/invite)?)\/(?<code>[\w-]{2,255})/i;

/**
 * Matches guild template URLs, capturing their `code`, like discord.js's `GuildTemplate.GuildTemplatesPattern`.
 */
export const GuildTemplatesPattern =
  /discord(?:app)?\.(?:com\/template|new)\/(?<code>[\w-]{2,255})/i;

/**
 * Data resolving to a base64 data URI, typically to upload an image: its contents, or the data URI itself.
 */
export type Base64Resolvable = Uint8Array | ArrayBuffer | string;

/**
 * An image to upload: a data URI, or anything {@link resolveFile} reads (contents, a path, a URL, a stream, a blob).
 */
export type ImageResolvable = Base64Resolvable | BufferResolvable;

/**
 * The contents of a resolved file, and its content type when known (e.g. from a download's headers).
 */
export interface ResolvedFile {
  data: Uint8Array;
  contentType?: string;
}

/**
 * Extracts a code from a string with a pattern capturing it, or returns the string itself when it does not match.
 *
 * @param data The string to resolve.
 * @param pattern The pattern capturing the code as its first group.
 */
export function resolveCode(data: string, pattern: RegExp): string {
  return pattern.exec(data)?.[1] ?? data;
}

/**
 * Resolves an invite URL, or code, to the code.
 *
 * @param data The invite resolvable to resolve.
 */
export function resolveInviteCode(data: InviteResolvable): string {
  return resolveCode(data, InvitesPattern);
}

/**
 * Resolves a guild template URL, or code, to the code.
 *
 * @param data The template resolvable to resolve.
 */
export function resolveGuildTemplateCode(data: GuildTemplateResolvable): string {
  return resolveCode(data, GuildTemplatesPattern);
}

/**
 * Resolves a {@link BufferResolvable} to its contents: reads paths from disk, downloads URLs, and drains streams.
 *
 * @remarks
 * A URL is fetched as is. Sanitize URLs that come from users: fetching them may reach internal services.
 * @param resource The resource to resolve.
 * @throws A `GatewayError` when a path is not a file, or a download fails.
 */
export async function resolveFile(resource: BufferResolvable): Promise<ResolvedFile> {
  if (resource instanceof Uint8Array) return { data: resource };
  if (resource instanceof ArrayBuffer) return { data: new Uint8Array(resource) };
  if (resource instanceof Blob) {
    return {
      data: new Uint8Array(await resource.arrayBuffer()),
      contentType: resource.type || undefined,
    };
  }

  if (typeof resource === "string") {
    if (/^https?:\/\//.test(resource)) {
      const response = await fetch(resource);
      if (!response.ok) {
        throw new GatewayError("AttachmentDownloadFailed", resource, response.status);
      }
      return {
        data: new Uint8Array(await response.arrayBuffer()),
        contentType: response.headers.get("content-type") ?? undefined,
      };
    }

    const file = resolve(resource);
    const stats = await stat(file);
    if (!stats.isFile()) throw new GatewayError("FileNotFound", file);
    return { data: await readFile(file) };
  }

  if (typeof resource === "object" && resource !== null && Symbol.asyncIterator in resource) {
    const chunks: Uint8Array[] = [];
    for await (const chunk of resource) {
      chunks.push(typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk);
    }
    return { data: Buffer.concat(chunks) };
  }

  throw new GatewayTypeError("ReqResourceType");
}

/**
 * Resolves contents to a base64 data URI. A string is taken to be one already, and returned as is.
 *
 * @param data The contents, or a data URI.
 * @param contentType The content type of the contents.
 */
export function resolveBase64(data: Base64Resolvable, contentType = "image/jpg"): string {
  if (typeof data === "string") return data;
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return `data:${contentType};base64,${Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString("base64")}`;
}

/**
 * Resolves an image to the base64 data URI Discord expects for avatars, icons, banners, and the like. Data URIs are
 * kept; anything else is read with {@link resolveFile}.
 *
 * @param image The image, `null` or `undefined` to remove it.
 * @returns The data URI, `null` when there is no image.
 */
export async function resolveImage(
  image: ImageResolvable | null | undefined,
): Promise<string | null> {
  if (!image) return null;
  if (typeof image === "string" && image.startsWith("data:")) return image;
  const file = await resolveFile(image as BufferResolvable);
  return resolveBase64(file.data, file.contentType ?? "image/jpg");
}

/**
 * Resolves an optional image option: `undefined` leaves the image unchanged, `null` removes it, anything else is
 * resolved with {@link resolveImage}.
 *
 * @param image The image option.
 * @internal
 */
export async function resolveImageOption(
  image: ImageResolvable | null | undefined,
): Promise<string | null | undefined> {
  return image === undefined ? undefined : resolveImage(image);
}
