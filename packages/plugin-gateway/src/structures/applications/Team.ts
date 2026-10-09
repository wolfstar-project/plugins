import { Collection } from "@discordjs/collection";
import type { BaseImageURLOptions } from "@discordjs/rest";
import type { APITeam } from "discord-api-types/v10";
import { cdn } from "../../util/cdn.js";
import { bindClient, kClient, kData, snowflakeTimestamp, Structure } from "../Structure.js";
import { TeamMember } from "./TeamMember.js";

/**
 * A team of developers owning an application, like discord.js's `Team`.
 */
export class Team extends Structure<APITeam> {
  // The members are built once per payload, so that `owner` is one of them and neither changes between reads.
  #members: { source: APITeam["members"]; value: Collection<string, TeamMember> } | null = null;

  public get id(): string {
    return this[kData].id;
  }

  public get name(): string {
    return this[kData].name;
  }

  /**
   * The hash of the team's icon, or `null` if it has none.
   */
  public get icon(): string | null {
    return this[kData].icon;
  }

  /**
   * The ID of the user owning the team.
   */
  public get ownerId(): string {
    return this[kData].owner_user_id;
  }

  /**
   * The members of the team, by the ID of their user.
   */
  public get members(): Collection<string, TeamMember> {
    const source = this[kData].members;
    if (this.#members?.source !== source) {
      const value = new Collection<string, TeamMember>();
      const client = this[kClient];
      for (const data of source) {
        const member = new TeamMember(data, { team: this });
        if (client) bindClient(member, client);
        value.set(member.id, member);
      }
      this.#members = { source, value };
    }
    return this.#members.value;
  }

  /**
   * The member owning the team, if it is among {@link Team.members}.
   */
  public get owner(): TeamMember | null {
    return this.members.get(this.ownerId) ?? null;
  }

  public get createdTimestamp(): number {
    return snowflakeTimestamp(this.id);
  }

  public get createdAt(): Date {
    return new Date(this.createdTimestamp);
  }

  /**
   * Gets the URL of the team's icon, or `null` if it has none.
   *
   * @param options The image options.
   */
  public iconURL(options?: BaseImageURLOptions): string | null {
    const { icon } = this[kData];
    return icon ? cdn.teamIcon(this.id, icon, options) : null;
  }

  public toString(): string {
    return this.name;
  }
}
