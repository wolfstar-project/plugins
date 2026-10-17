---
"@wolfstar/plugin-broker": minor
---

`forwardGatewayDispatches` marks a `GatewayClient` as forwarding (`forwardsDispatches`) until its stop function is called, through the new optional `GatewayDispatchEmitterLike#markDispatchesForwarded`, so listeners registered with `RegisterAsDispatchListener` from `@wolfstar/plugin-gateway` run on the workers only. Emitters without it forward as before.
