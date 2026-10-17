---
"@wolfstar/plugin-gateway": minor
---

Add the monetization managers. `client.application.entitlements` is an `EntitlementManager`, cached from `ENTITLEMENT_CREATE`, `ENTITLEMENT_UPDATE` and `ENTITLEMENT_DELETE` (which emit the new `entitlementCreate`, `entitlementUpdate` and `entitlementDelete` events), with `fetch()` for one entitlement or a filtered `Collection`, `createTest()`, `deleteTest()` and `consume()`. `client.application.fetchSKUs()` returns the `SKU`s of the application, and `sku.subscriptions` (or `client.application.subscriptions(sku)`) is a fetch-only `SubscriptionManager`. Adds the `Entitlement`, `SKU` and `Subscription` structures, `SKUFlagsBitField`, and the `EntitlementCreateInvalidOwner` error; `EntitlementResolvable`, `SKUResolvable` and `SubscriptionResolvable` now also accept the structures.
