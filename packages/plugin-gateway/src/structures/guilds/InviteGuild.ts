import type { APIInviteGuild } from "discord-api-types/v10";
import { AnonymousGuild } from "./AnonymousGuild.js";

/**
 * The partial guild carried by a {@link GuildInvite}.
 *
 * @remarks
 * The welcome screen discord.js attaches here comes with the admin phase (see #54).
 */
export class InviteGuild extends AnonymousGuild<APIInviteGuild> {}
