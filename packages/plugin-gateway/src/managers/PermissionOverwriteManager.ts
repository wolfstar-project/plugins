import { OverwriteType, Routes, type APIOverwrite } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { PermissionOverwrites } from "../structures/PermissionOverwrites.js";
import {
  resolveId,
  resolveOverwriteOptions,
  type IdResolvable,
  type OverwriteData,
  type PermissionOverwriteOptions,
} from "../util/channels.js";
import { container } from "../util/container.js";

/**
 * The options of {@link PermissionOverwriteManager.create} and {@link PermissionOverwriteManager.edit}.
 */
export interface PermissionOverwriteEditOptions {
  /**
   * Whether the target is a role or a member. Guessed from the cache when absent: a cached role of the guild with
   * that ID makes it a role, anything else a member.
   */
  type?: OverwriteType;
  reason?: string;
}

/**
 * Manages the permission overwrites of one channel, as they were in the channel's payload.
 */
export class PermissionOverwriteManager {
  public readonly client: GatewayClient;
  public readonly channelId: string;
  public readonly guildId: string | null;

  readonly #overwrites: readonly APIOverwrite[];

  public constructor(
    client: GatewayClient,
    channelId: string,
    guildId: string | null,
    overwrites: readonly APIOverwrite[],
  ) {
    this.client = client;
    this.channelId = channelId;
    this.guildId = guildId;
    this.#overwrites = overwrites;
  }

  /**
   * The overwrites of the channel.
   */
  public get cache(): PermissionOverwrites[] {
    return this.#overwrites.map(
      (overwrite) => new PermissionOverwrites({ ...overwrite, channel_id: this.channelId }),
    );
  }

  /**
   * Finds the overwrite of a role or member, if the channel has one.
   *
   * @param target The role or member, or its ID.
   */
  public resolve(target: IdResolvable): PermissionOverwrites | null {
    const id = resolveId(target);
    return this.cache.find((overwrite) => overwrite.id === id) ?? null;
  }

  /**
   * Replaces every overwrite of the channel.
   *
   * @param overwrites The new overwrites.
   * @param reason The reason for the audit log.
   */
  public async set(overwrites: readonly OverwriteData[], reason?: string): Promise<void> {
    await this.client.channels.edit(this.channelId, { permissionOverwrites: overwrites, reason });
  }

  /**
   * Creates the overwrite of a role or member, replacing any existing one.
   *
   * @param target The role or member, or its ID.
   * @param options The permissions to allow (`true`) or deny (`false`).
   * @param editOptions The target's type and the reason for the audit log.
   */
  public create(
    target: IdResolvable,
    options: PermissionOverwriteOptions,
    editOptions: PermissionOverwriteEditOptions = {},
  ): Promise<PermissionOverwrites> {
    return this.upsert(target, options, editOptions, false);
  }

  /**
   * Changes some permissions of the overwrite of a role or member, creating it if needed.
   *
   * @param target The role or member, or its ID.
   * @param options The permissions to allow (`true`), deny (`false`), or reset (`null`).
   * @param editOptions The target's type and the reason for the audit log.
   */
  public edit(
    target: IdResolvable,
    options: PermissionOverwriteOptions,
    editOptions: PermissionOverwriteEditOptions = {},
  ): Promise<PermissionOverwrites> {
    return this.upsert(target, options, editOptions, true);
  }

  /**
   * Deletes the overwrite of a role or member.
   *
   * @param target The role or member, or its ID.
   * @param reason The reason for the audit log.
   */
  public async delete(target: IdResolvable, reason?: string): Promise<void> {
    const id = resolveId(target);
    await container.rest.delete(Routes.channelPermission(this.channelId, id), { reason });
    await this.patchCached((overwrites) => overwrites.filter((overwrite) => overwrite.id !== id));
  }

  private async upsert(
    target: IdResolvable,
    options: PermissionOverwriteOptions,
    editOptions: PermissionOverwriteEditOptions,
    keepExisting: boolean,
  ): Promise<PermissionOverwrites> {
    const id = resolveId(target);
    const existing = keepExisting ? this.resolve(id) : null;
    const type = editOptions.type ?? existing?.type ?? (await this.guessType(target, id));
    const { allow, deny } = resolveOverwriteOptions(options, {
      allow: existing?.allow.bitField,
      deny: existing?.deny.bitField,
    });

    const overwrite: APIOverwrite = { id, type, allow: String(allow), deny: String(deny) };
    await container.rest.put(Routes.channelPermission(this.channelId, id), {
      body: { type, allow: overwrite.allow, deny: overwrite.deny },
      reason: editOptions.reason,
    });
    await this.patchCached((overwrites) => [
      ...overwrites.filter((current) => current.id !== id),
      overwrite,
    ]);
    return new PermissionOverwrites({ ...overwrite, channel_id: this.channelId });
  }

  private async guessType(target: IdResolvable, id: string): Promise<OverwriteType> {
    if (typeof target !== "string") {
      // Roles have a `hoist` flag, members and users do not.
      return "hoist" in target ? OverwriteType.Role : OverwriteType.Member;
    }

    if (id === this.guildId) return OverwriteType.Role;
    const role = this.guildId ? await this.client.roles.get(this.guildId, id) : undefined;
    return role ? OverwriteType.Role : OverwriteType.Member;
  }

  // The overwrite endpoints answer 204 without the channel, so the cached entry is patched instead of refetched.
  private async patchCached(
    update: (overwrites: readonly APIOverwrite[]) => APIOverwrite[],
  ): Promise<void> {
    const cache = this.client.cache?.channels;
    const cached = await cache?.get(this.channelId);
    if (!cached || !("permission_overwrites" in cached)) return;
    await cache!.set(this.channelId, {
      ...cached,
      permission_overwrites: update(cached.permission_overwrites ?? []),
    } as typeof cached);
  }
}
