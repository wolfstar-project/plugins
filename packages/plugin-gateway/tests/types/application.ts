// Type-level test, checked by the root `typecheck` script through `tsconfig.consumption.json`: `client.application`
// is never null, and its members have the types of discord.js's `ClientApplication`.
import type { Collection } from "@discordjs/collection";
import type {
  ApplicationFlagsBitField,
  ApplicationInstallParams,
  ApplicationRoleConnectionMetadata,
  ClientApplication,
  GatewayClient,
  Guild,
  Team,
  TeamMember,
  User,
} from "../../src/index.js";

declare const client: GatewayClient;
declare const team: Team;
declare const other: ClientApplication;

export const application: ClientApplication = client.application;
export const flags: Readonly<ApplicationFlagsBitField> = client.application.flags;
export const owner: Team | User | null = client.application.owner;
export const install: ApplicationInstallParams | null = client.application.installParams;
export const guild: Guild | null = client.application.guild;
export const partial: boolean = client.application.partial;
export const name: string | null = client.application.name;
export const icon: string | null = client.application.iconURL();
export const fetched: Promise<ClientApplication> = client.application.fetch();
export const edited: Promise<ClientApplication> = client.application.edit({ description: "Awoo" });
export const records: Promise<ApplicationRoleConnectionMetadata[]> =
  client.application.fetchRoleConnectionMetadataRecords();
export const members: Collection<string, TeamMember> = team.members;
export const teamOwner: TeamMember | null = team.owner;

// @ts-expect-error `application` is read-only.
client.application = other;
