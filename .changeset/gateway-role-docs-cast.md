---
"@wolfstar/plugin-gateway": patch
---

Fix `Role#fetchPermissionsIn` failing to type-check under TypeScript 5.9, which broke the API documentation build.
