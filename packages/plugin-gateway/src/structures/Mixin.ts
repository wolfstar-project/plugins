/**
 * Any class, abstract or not.
 */
export type MixinBase = abstract new (...args: any[]) => object;

/**
 * Copies the members of every mixin onto the prototype of `target`, the way `@discordjs/structures`' `Mixin` does.
 *
 * @remarks
 * Only the prototype is copied: mixins must not rely on their constructor running. Declare an interface with the same
 * name as `target`, extending every mixin, so the members are visible to the type system as well:
 *
 * ```typescript
 * export interface TextChannel extends TextChannelMixin<ChannelType.GuildText> {}
 * export class TextChannel extends Channel<ChannelType.GuildText> {}
 * Mixin(TextChannel, [TextChannelMixin]);
 * ```
 *
 * Members already defined on `target` itself win over the mixins', and earlier mixins win over later ones.
 *
 * @param target The class to mix into.
 * @param mixins The classes whose members are copied.
 */
export function Mixin(target: MixinBase, mixins: readonly MixinBase[]): void {
  const prototype = target.prototype as object;

  for (const mixin of mixins) {
    for (const key of Reflect.ownKeys(mixin.prototype as object)) {
      if (key === "constructor" || Object.hasOwn(prototype, key)) continue;

      const descriptor = Reflect.getOwnPropertyDescriptor(mixin.prototype as object, key)!;
      Reflect.defineProperty(prototype, key, descriptor);
    }
  }
}
