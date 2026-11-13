// Module hooks that serve `@wolfstar/http-framework` without its `runPreconditions` export, the shape of a framework
// older than 6.3.0. The shim re-exports every other name of the installed framework, so a build that imports
// `runPreconditions` by name fails to link, as it would on such a framework.
const SHIM = "file:///wolfstar-shim/http-framework.mjs";
const MISSING = "runPreconditions";

export async function resolve(specifier, context, nextResolve) {
  if (specifier !== "@wolfstar/http-framework") return nextResolve(specifier, context);

  const real = await nextResolve(specifier, context);
  return { url: `${SHIM}?real=${encodeURIComponent(real.url)}`, shortCircuit: true };
}

export async function load(url, context, nextLoad) {
  if (!url.startsWith(SHIM)) return nextLoad(url, context);

  const real = new URL(url).searchParams.get("real");
  const names = Object.keys(await import(real)).filter(
    (name) => name !== MISSING && name !== "default",
  );
  const source = [
    `import * as real from ${JSON.stringify(real)};`,
    `export const { ${names.join(", ")} } = real;`,
  ].join("\n");

  return { format: "module", source, shortCircuit: true };
}
