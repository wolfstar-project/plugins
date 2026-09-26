/**
 * Any class, abstract or not.
 */
export type MixinBase = abstract new (...args: any[]) => object;

/**
 * Copies the members of every mixin onto the prototype of `target`, the way `@discordjs/structures`' `Mixin` does.
 *
 * @remarks
 * Prototype members are copied. Static `DataTemplate`, `optimizeData`, and `enrichToJSON` hooks are
 * combined with the target's behavior, following `@discordjs/structures`.
 * Mixins must not rely on their constructor running. Declare an interface with the same name as `target`, extending
 * every mixin, so the members are visible to the type system as well:
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
  const optimizations: Array<(this: object, data: object) => void> = [];
  const enrichments: Array<(this: object, data: object) => void> = [];
  const templates: object[] = [];
  const jsonKey = Symbol.for("djs.structures.mixin.toJSON");
  const inheritedOptimization = Reflect.get(prototype, "optimizeData") as
    | ((this: object, data: object) => void)
    | undefined;
  if (inheritedOptimization) optimizations.push(inheritedOptimization);
  const inheritedEnrichment = Reflect.get(prototype, jsonKey) as
    | ((this: object, data: object) => void)
    | undefined;
  if (inheritedEnrichment) enrichments.push(inheritedEnrichment);

  for (const mixin of mixins) {
    const template = Reflect.get(mixin, "DataTemplate") as object | undefined;
    if (template) templates.push(template);
    const optimize = Reflect.get(mixin, "optimizeData") as
      | ((this: object, data: object) => void)
      | undefined;
    if (optimize) optimizations.push(optimize);
    const enrich = Reflect.get(mixin, "enrichToJSON") as
      | ((this: object, data: object) => void)
      | undefined;
    if (enrich) enrichments.push(enrich);
    for (const key of Reflect.ownKeys(mixin.prototype as object)) {
      if (key === "constructor") continue;

      const descriptor = Reflect.getOwnPropertyDescriptor(mixin.prototype as object, key)!;
      if (Object.hasOwn(prototype, key)) continue;
      Reflect.defineProperty(prototype, key, descriptor);
    }
  }

  if (optimizations.length > 1) {
    Reflect.defineProperty(prototype, "optimizeData", {
      configurable: true,
      value(this: object, data: object) {
        for (const optimize of optimizations) optimize.call(this, data);
      },
    });
  }

  if (templates.length > 0) {
    const base = Reflect.get(target, "DataTemplate") as object | undefined;
    const template = Object.defineProperties({}, Object.getOwnPropertyDescriptors(base ?? {}));
    for (const addition of templates) {
      Object.defineProperties(template, Object.getOwnPropertyDescriptors(addition));
    }
    Reflect.defineProperty(target, "DataTemplate", {
      configurable: true,
      value: template,
    });
  }

  if (enrichments.length > 0) {
    Reflect.defineProperty(prototype, jsonKey, {
      configurable: true,
      value(this: object, data: object) {
        for (const enrich of enrichments) enrich.call(this, data);
      },
    });
  }
}
