// Lets the fixtures run the TypeScript sources: their `.js` imports resolve to the `.ts` files next to them.
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (error) {
    if (specifier.startsWith(".") && specifier.endsWith(".js")) {
      return next(`${specifier.slice(0, -3)}.ts`, context);
    }

    throw error;
  }
}
