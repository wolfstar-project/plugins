/**
 * The options to build a CDN image URL with.
 */
export interface ImageOptions {
  /**
   * The image extension. Animated hashes (prefixed with `a_`) default to `gif`, everything else to `png`.
   */
  extension?: "png" | "jpg" | "jpeg" | "webp" | "gif";
  /**
   * The image size, a power of two between 16 and 4096.
   */
  size?: 16 | 32 | 64 | 128 | 256 | 512 | 1024 | 2048 | 4096;
}

const Base = "https://cdn.discordapp.com";

function image(path: string, hash: string, { extension, size }: ImageOptions = {}): string {
  const resolvedExtension = extension ?? (hash.startsWith("a_") ? "gif" : "png");
  return `${Base}/${path}/${hash}.${resolvedExtension}${size ? `?size=${size}` : ""}`;
}

/**
 * @internal Builders for the Discord CDN URLs used by the structures.
 */
export const CDN = {
  avatar: (userId: string, hash: string, options?: ImageOptions) =>
    image(`avatars/${userId}`, hash, options),
  defaultAvatar: (userId: string, discriminator: string) => {
    // Migrated users (discriminator "0") use the new formula, legacy ones use their discriminator.
    const index =
      discriminator === "0" ? Number((BigInt(userId) >> 22n) % 6n) : Number(discriminator) % 5;
    return `${Base}/embed/avatars/${index}.png`;
  },
  guildIcon: (guildId: string, hash: string, options?: ImageOptions) =>
    image(`icons/${guildId}`, hash, options),
  memberAvatar: (guildId: string, userId: string, hash: string, options?: ImageOptions) =>
    image(`guilds/${guildId}/users/${userId}/avatars`, hash, options),
};
