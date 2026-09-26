import {
  ActivityType,
  GatewayOpcodes,
  PresenceUpdateStatus,
  type GatewayActivityUpdateData,
  type GatewayPresenceUpdateData,
  type RESTPatchAPICurrentUserJSONBody,
} from "discord-api-types/v10";
import { getGatewayClient } from "../util/container.js";
import { kData, kPatch } from "./Structure.js";
import { User } from "./User.js";

/**
 * The presence to set for the bot user. Omitted fields keep their current value.
 */
export interface PresenceData {
  status?: PresenceUpdateStatus;
  afk?: boolean;
  activities?: GatewayActivityUpdateData[];
  /**
   * The shards to update, every shard by default.
   */
  shardId?: number | readonly number[];
}

/**
 * An activity to set, with its type defaulting to `Playing`.
 */
export interface ActivityOptions extends Omit<GatewayActivityUpdateData, "name" | "type"> {
  type?: ActivityType;
  /**
   * The shards to update, every shard by default.
   */
  shardId?: number | readonly number[];
}

/**
 * The options to edit the bot user with. Images are data URIs (`data:image/png;base64,...`), `null` removes them.
 */
export interface ClientUserEditOptions {
  username?: string;
  avatar?: string | null;
  banner?: string | null;
}

/**
 * The bot user, as known to the {@link GatewayClient}: a {@link User} that can edit its profile and presence.
 */
export class ClientUser extends User {
  #presence: GatewayPresenceUpdateData = {
    since: null,
    activities: [],
    status: PresenceUpdateStatus.Online,
    afk: false,
  };

  /**
   * Whether the bot's owner account has two-factor authentication enabled.
   */
  public get mfaEnabled(): boolean {
    return this[kData].mfa_enabled ?? false;
  }

  /**
   * Whether the bot is verified.
   */
  public get verified(): boolean {
    return this[kData].verified ?? false;
  }

  /**
   * The presence last set through this structure.
   */
  public get presence(): Readonly<GatewayPresenceUpdateData> {
    return this.#presence;
  }

  /**
   * Edits the bot user's profile.
   *
   * @param options The fields to edit.
   */
  public async edit(options: ClientUserEditOptions): Promise<this> {
    const body: RESTPatchAPICurrentUserJSONBody = options;
    const user = await getGatewayClient().core.api.users.edit(body);
    await getGatewayClient().users._add(user);
    return this[kPatch](user);
  }

  public setUsername(username: string): Promise<this> {
    return this.edit({ username });
  }

  public setAvatar(avatar: string | null): Promise<this> {
    return this.edit({ avatar });
  }

  public setBanner(banner: string | null): Promise<this> {
    return this.edit({ banner });
  }

  /**
   * Sets the bot's presence on its shards.
   *
   * @param data The presence to set.
   */
  public async setPresence(data: PresenceData): Promise<Readonly<GatewayPresenceUpdateData>> {
    const { shardId, ...presence } = data;
    this.#presence = {
      ...this.#presence,
      ...presence,
      since: presence.afk ? Date.now() : this.#presence.since,
    };

    const gateway = getGatewayClient().gateway;
    const shards =
      shardId === undefined
        ? await gateway.getShardIds()
        : typeof shardId === "number"
          ? [shardId]
          : shardId;
    await Promise.all(
      shards.map((id) =>
        gateway.send(id, { op: GatewayOpcodes.PresenceUpdate, d: this.#presence }),
      ),
    );
    return this.#presence;
  }

  public setStatus(status: PresenceUpdateStatus, shardId?: number | readonly number[]) {
    return this.setPresence({ status, shardId });
  }

  /**
   * Sets the bot's activity, or clears it when called without a name.
   *
   * @param name The activity's name.
   * @param options The activity's type and other fields.
   */
  public setActivity(name?: string, options: ActivityOptions = {}) {
    const { shardId, type = ActivityType.Playing, ...activity } = options;
    return this.setPresence({
      activities: name === undefined ? [] : [{ ...activity, name, type }],
      shardId,
    });
  }

  public setAFK(afk = true, shardId?: number | readonly number[]) {
    return this.setPresence({ afk, shardId });
  }
}
