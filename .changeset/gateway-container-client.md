---
"@wolfstar/plugin-gateway": minor
---

Register every `GatewayClient` as `container.gatewayClient`, typed as `GatewayClient`, so pieces reach its managers through `this.container.gatewayClient` without `getGatewayClient()` or a cast. `container.client` keeps the base `Client` type, since a module augmentation cannot redeclare it.
