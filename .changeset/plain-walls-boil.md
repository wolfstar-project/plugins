---
"@wolfstar/plugin-i18next": patch
---

Fix TypeScript overload resolution in `getSupportedLanguageT`, `getSupportedUserLanguageT`, and `fetchKey` when `key` is a union type (such as a ternary expression).

Previously, these functions used a single generic signature with a union-typed rest parameter. When `key` was a union, TypeScript failed to resolve the candidate tuple properly and rejected valid options objects as if they were positional `defaultValue` strings. Each call shape is now declared as an independent overload, while the original generic signature is retained as a deprecated trailing overload for full backward compatibility.
