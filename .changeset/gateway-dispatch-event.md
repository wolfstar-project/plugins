---
"@wolfstar/plugin-gateway": minor
---

Add the `dispatch` event (`GatewayEvents.Dispatch`), emitted for every gateway dispatch once it is written to the cache, before the matching event: unlike `raw`, a listener reading the cache sees the dispatch applied. `@wolfstar/plugin-broker`'s `forwardGatewayDispatches` relies on it.
