/*!
 * `Partialize` is adapted from `@discordjs/structures` (https://github.com/discordjs/discord.js/tree/main/packages/structures),
 * Copyright 2023 Noel Buechler and Chai Kohen, licensed under the Apache License, Version 2.0
 * (https://www.apache.org/licenses/LICENSE-2.0).
 */

/**
 * `Type`, with the `Omitted` keys made optional: the data a structure omitting them from its `DataTemplate` accepts.
 */
export type Partialize<Type, Omitted extends keyof Type | ""> = Omit<Type, Omitted> &
  Partial<Pick<Type, Exclude<Omitted, "">>>;
