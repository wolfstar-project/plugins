import { OverwriteType, type APIOverwrite } from "discord-api-types/v10";
import type { GatewayClient } from "../GatewayClient.js";
import { bindClient, kPatch } from "../structures/Structure.js";
import type { AnyChannel } from "./ChannelManager.js";
import { PermissionOverwrites } from "../structures/channels/PermissionOverwrites.js";
import {
  resolveId,
  resolveOverwriteOptions,
  type IdResolvable,
  type OverwriteData,
  type PermissionOverwriteOptions,
} from "../util/channels.js";
import { BaseManager } from "./BaseManager.js";

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
export class PermissionOverwriteManager extends BaseManager {
  public readonly channelId: string;
  public readonly guildId: string | null;

  readonly #overwrites: readonly APIOverwrite[];

  readonly #channel: AnyChannel | null;

  /**
   * @param client The client.
   * @param channelId The ID of the channel.
   * @param guildId The ID of the channel's guild, if known.
   * @param overwrites The raw overwrites of the channel.
   * @param channel The channel, which the overwrites refer to.
   */
  public constructor(
    client: GatewayClient,
    channelId: string,
    guildId: string | null,
    overwrites: readonly APIOverwrite[],
    channel: AnyChannel | null = null,
  ) {
    super(client);
    this.channelId = channelId;
    this.guildId = guildId;
    this.#overwrites = overwrites;
    this.#channel = channel;
  }

  /**
   * The overwrites of the channel.
   */
  public get cache(): PermissionOverwrites[] {
    return this.#overwrites.map((overwrite) =>
      bindClient(
        new PermissionOverwrites(
          { ...overwrite, channel_id: this.channelId },
          { channel: this.#channel },
        ),
        this.client,
      ),
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
    await this.client.api.channels.deletePermissionOverwrite(this.channelId, id, { reason });
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
    await this.client.api.channels.editPermissionOverwrite(
      this.channelId,
      id,
      {
        type,
        allow: overwrite.allow,
        deny: overwrite.deny,
      },
      {
        reason: editOptions.reason,
      },
    );
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

    if (id === this.guildId || !this.guildId) return OverwriteType.Role;
    // With a roles cache, an uncached ID is a member's; without one, only the guild's roles tell.
    if (this.client.cache?.roles) {
      return (await this.client.roles.cache.get(this.client.roles.resolveKey(this.guildId, id)))
        ? OverwriteType.Role
        : OverwriteType.Member;
    }

    const roles = await this.client.roles.fetchAll(this.guildId);
    return roles.some((role) => role.id === id) ? OverwriteType.Role : OverwriteType.Member;
  }

  // The overwrite endpoints answer 204 without the channel, so the cached entry is patched instead of refetched.
  private async patchCached(
    update: (overwrites: readonly APIOverwrite[]) => APIOverwrite[],
  ): Promise<void> {
    const { cache } = this.client.channels;
    const cached = await cache.get(this.channelId);
    const data = cached?.toJSON() as { permission_overwrites?: APIOverwrite[] } | undefined;
    if (!cached || !data || !("permission_overwrites" in data)) return;
    cached[kPatch]({ permission_overwrites: update(data.permission_overwrites ?? []) } as never);
    await cache.set(this.channelId, cached);
  }
}
