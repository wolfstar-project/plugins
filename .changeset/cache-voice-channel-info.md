---
"@wolfstar/plugin-cache": minor
---

Cache the status and start time of voice channels: `VOICE_CHANNEL_STATUS_UPDATE`, `VOICE_CHANNEL_START_TIME_UPDATE` and `CHANNEL_INFO` patch the `status` and `voice_start_time` of a cached channel, and leave an uncached one uncached.
