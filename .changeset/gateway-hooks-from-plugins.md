---
"@wolfstar/plugin-gateway": patch
---

`addDispatchWrapper` and `addDestroyHook` work when a plugin calls them from `postInitialization`, which runs before the fields of `GatewayClient` are initialized; they threw a `TypeError` about a private member there.
