import type { RawFile } from "@discordjs/rest";
import type {
  RESTPatchAPIChannelMessageJSONBody,
  RESTPostAPIChannelMessageJSONBody,
} from "discord-api-types/v10";

/**
 * The options to send a message with: the REST body, plus the files to attach.
 */
export type MessageCreateOptions = RESTPostAPIChannelMessageJSONBody & { files?: RawFile[] };

/**
 * The options to edit a message with: the REST body, plus the files to attach.
 */
export type MessageEditOptions = RESTPatchAPIChannelMessageJSONBody & { files?: RawFile[] };

/**
 * Anything accepted where a message payload is expected: a string is the message content.
 */
export type MessagePayloadResolvable<Options extends { files?: RawFile[] }> = Options | string;

/**
 * Splits message options into the REST body and the files, turning a plain string into `{ content }`.
 *
 * @param options The options, or the content.
 */
export function resolveMessageOptions<Options extends { files?: RawFile[] }>(
  options: MessagePayloadResolvable<Options>,
): { body: Omit<Options, "files">; files: RawFile[] | undefined } {
  if (typeof options === "string") {
    return { body: { content: options } as unknown as Omit<Options, "files">, files: undefined };
  }

  const { files, ...body } = options;
  return { body, files };
}
