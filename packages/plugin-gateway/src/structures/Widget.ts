import {
  GuildWidgetStyle,
  RouteBases,
  Routes,
  type APIGuildWidget,
  type APIGuildWidgetMember,
} from "discord-api-types/v10";
import { getGatewayClient } from "../util/container.js";
import { kData, Structure } from "./Structure.js";

/**
 * A member shown by a guild's widget. Its ID is only an index, not the user's: the widget hides who they are.
 */
export class WidgetMember extends Structure<APIGuildWidgetMember> {
  public get id() {
    return this[kData].id;
  }

  public get username() {
    return this[kData].username;
  }

  public get discriminator() {
    return this[kData].discriminator;
  }

  public get avatar() {
    return this[kData].avatar;
  }

  public get avatarURL() {
    return this[kData].avatar_url;
  }

  public get status() {
    return this[kData].status;
  }

  /**
   * The name of what the member is playing, if anything.
   */
  public get activity(): string | null {
    return this[kData].activity?.name ?? null;
  }
}

/**
 * The public widget of a guild: its online members and voice channels.
 */
export class Widget extends Structure<APIGuildWidget> {
  public get id() {
    return this[kData].id;
  }

  public get name() {
    return this[kData].name;
  }

  /**
   * The invite of the widget's channel, if it has one.
   */
  public get instantInvite() {
    return this[kData].instant_invite;
  }

  /**
   * The voice channels everyone can join.
   */
  public get channels() {
    return this[kData].channels;
  }

  /**
   * The online members, up to 100.
   */
  public get members(): WidgetMember[] {
    return this[kData].members.map((member) => new WidgetMember(member));
  }

  public get presenceCount() {
    return this[kData].presence_count;
  }

  /**
   * Gets the URL of the widget's image.
   *
   * @param style The style of the image.
   */
  public imageURL(style: GuildWidgetStyle = GuildWidgetStyle.Shield): string {
    return `${RouteBases.api}${Routes.guildWidgetImage(this.id)}?style=${style}`;
  }

  /**
   * Fetches the current state of the widget.
   */
  public fetch(): Promise<Widget> {
    return getGatewayClient().fetchGuildWidget(this.id);
  }
}
