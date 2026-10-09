import type {
  APITeamMember,
  TeamMemberMembershipState,
  TeamMemberRole,
} from "discord-api-types/v10";
import { bindClient, kClient, kData, kRelations, Structure } from "../Structure.js";
import { User } from "../users/User.js";
import type { Team } from "./Team.js";

/**
 * The relations of a {@link TeamMember}, set by its {@link Team}.
 */
export interface TeamMemberRelations {
  team?: Team | null;
}

/**
 * A member of a {@link Team}, like discord.js's `TeamMember`.
 */
export class TeamMember extends Structure<APITeamMember> {
  declare public [kRelations]: TeamMemberRelations;

  // The user is built once per payload, so that it stays the same object between reads.
  #user: { source: APITeamMember["user"]; value: User } | null = null;

  /**
   * @param data The raw team member.
   * @param relations The team the member belongs to, set by the team itself.
   */
  public constructor(data: APITeamMember, relations: TeamMemberRelations = {}) {
    super(data, relations);
  }

  /**
   * The ID of the member's user.
   */
  public get id(): string {
    return this[kData].user.id;
  }

  /**
   * The team the member belongs to, or `null` when the member was built by hand.
   */
  public get team(): Team | null {
    return this[kRelations].team ?? null;
  }

  /**
   * The permissions of the member in the team. Discord only ever sends `["*"]`.
   */
  public get permissions(): readonly string[] {
    return this[kData].permissions;
  }

  /**
   * Whether the member accepted the invite to the team, or is still invited.
   */
  public get membershipState(): TeamMemberMembershipState {
    return this[kData].membership_state;
  }

  /**
   * The role of the member in the team.
   */
  public get role(): TeamMemberRole {
    return this[kData].role;
  }

  /**
   * The user of the member.
   */
  public get user(): User {
    const source = this[kData].user;
    if (this.#user?.source !== source) {
      const user = new User(source);
      const client = this[kClient];
      this.#user = { source, value: client ? bindClient(user, client) : user };
    }
    return this.#user.value;
  }

  /**
   * The mention of the member's user.
   */
  public toString(): string {
    return `<@${this.id}>`;
  }
}
