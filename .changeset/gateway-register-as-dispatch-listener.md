---
"@wolfstar/plugin-gateway": minor
---

Add `RegisterAsDispatchListener`, a `RegisterAsGatewayListener` whose listener runs on one process only: the workers replaying the dispatches while the gateway client forwards them, the gateway client otherwise, so a bot loading the same pieces on both no longer handles each dispatch twice. `GatewayClient` gains `forwardsDispatches` and `markDispatchesForwarded()` for `forwardGatewayDispatches` to set, and `DispatchEventName`, `GatewayOnlyEventName` and `gatewayOnlyEvents` tell the events a worker receives from the ones only the gateway client emits, which the decorator rejects.
