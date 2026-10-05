# @wolfstar/plugin-sharder

## 0.2.0

### Minor Changes

- [#190](https://github.com/wolfstar-project/plugins/pull/190) [`e2ff310`](https://github.com/wolfstar-project/plugins/commit/e2ff310297f611ebbe0a18685829f33a0749a62a) - Add `@wolfstar/plugin-sharder/module`: list it in `modules` in `stars.config` to add the package to the auto imports. It needs the optional `@wolfstar/kit` peer; the main entrypoint is unchanged.

## 0.1.1

### Patch Changes

- [#123](https://github.com/wolfstar-project/plugins/pull/123) [`354dec1`](https://github.com/wolfstar-project/plugins/commit/354dec1644b9485375a642b7fcd733cbe52b5489) - Add a `./register` subpath export. The Stars CLI build imports `<name>/register` for every `@wolfstar/plugin-*` dependency of a project, so these packages crashed their consumers at startup with `ERR_PACKAGE_PATH_NOT_EXPORTED`. The entrypoint is a no-op: none of them has an `@wolfstar/http-framework` `Plugin` hook to register.

## 0.1.0

### Minor Changes

- [#112](https://github.com/wolfstar-project/plugins/pull/112) [`2742425`](https://github.com/wolfstar-project/plugins/commit/2742425f29e839f760f91f8f1176a448edf70531) - Add `@wolfstar/plugin-sharder`, implementing discord.js's sharder RFC (discordjs/discord.js#8084) with the answers of its thread and its two drafts ([#7204](https://github.com/wolfstar-project/plugins/issues/7204), [#8859](https://github.com/wolfstar-project/plugins/issues/8859)). `ShardManager` spawns shards as child processes, cluster workers, worker threads, or on other machines through `ShardManagerProxy` (`NetworkStrategy`, over TLS), whose proxies serve one manager with failover or several at once, and route messages between shards directly, locally or to peer proxies; it lays gateway shards out automatically, paces identifies across every process, supervises crashes after Erlang/OTP (intensity, period, one-for-one/all/rest), and restarts or reshards with rolling spawns. `ShardClient` is the shard's side: statuses, messages, requests with timeouts, abort and partial broadcasts, gateway shard control, and `gatewayOptions`/`identifyThrottler` for `GatewayClient`. Every fallible operation has a `try*` twin returning a `Result<T, E>` (`@sapphire/result`), and request handlers may return one. Messages go through named, registrable handlers (JSON, V8, raw) and transformers (gzip, Brotli).
