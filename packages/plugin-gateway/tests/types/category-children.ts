// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: `category.children` and
// `answer.voters` read like discord.js's.
import type {
  CacheRead,
  CategoryChannel,
  CategoryChannelChildManager,
  Guild,
  NonThreadGuildBasedChannel,
  PollAnswer,
  PollAnswerVoterManager,
  User,
} from "../../src/index.js";

declare const category: CategoryChannel;
declare const answer: PollAnswer;

export const children: CategoryChannelChildManager = category.children;
export const guild: Guild | null = category.children.guild;
export const size: number = category.children.cache.size;
export const resolved: NonThreadGuildBasedChannel | null = category.children.resolve("1");
export const cache: ReadonlyMap<string, NonThreadGuildBasedChannel> = category.children.valueOf();
export const read: CacheRead<ReadonlyMap<string, NonThreadGuildBasedChannel>> =
  category.children.cache;
export const created = category.children.create({ name: "howl" });
export const voters: PollAnswerVoterManager = answer.voters;
export const fetched: Promise<User[]> = answer.voters.fetch({ limit: 10 });

// @ts-expect-error - a category cannot hold a category
category.children.create({ name: "nested", type: 4 });
// @ts-expect-error - the category is the parent
category.children.create({ name: "howl", parent: "1" });
