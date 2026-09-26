import { CDN } from "@discordjs/rest";

/**
 * @internal The CDN URL builder shared by the structures. Structures never hold a client, so they cannot use
 * `container.rest.cdn`.
 */
export const cdn = new CDN();
