---
"@wolfstar/plugin-i18next": patch
---

Fix the typed-key helpers introduced in v2.0.0 under a real
[`@wolfstar/i18next-type-generator`](https://www.npmjs.com/package/@wolfstar/i18next-type-generator)
augmentation, which was never exercised before: every fully-qualified `<namespace>:<key>` string
(the shape `getSupportedLanguageT`, `getSupportedUserLanguageT`, `container.i18n.format`, `fetchKey`
and the builder helpers all expect) failed to typecheck once `CustomTypeOptions.resources` declared
more than one namespace, and `container.i18n.format`/`fetchKey` failed to typecheck at all.

Namespace-prefixed keys are now typed against every namespace `CustomTypeOptions.resources` declares
(previously only i18next's own `DefaultNamespace`, which is what left non-default namespaces
unreachable) through the new `AnyNamespace` type. The generic `Ret` these functions and
`InternationalizationHandler#format` compute their return type through had an invalid default that
violated its own constraint as soon as it resolved to something narrower than `string` — dropped in
favour of letting it resolve from the constraint, matching how i18next's own `t()` overloads are
typed.

`@wolfstar/i18next-type-generator` is now an optional peer dependency: nothing at runtime depends on
it, but it is the tool that produces the `CustomTypeOptions` augmentation these helpers key off. A
new `tests/typedConsumption.test.ts`, checked by a dedicated `tsconfig.consumption.json` wired into
the package's `typecheck` script, runs the public API against types generated from the test fixtures
so a regression like this is caught continuously.
