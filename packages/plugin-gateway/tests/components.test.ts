import { createInMemoryCache } from "@wolfstar/plugin-cache";
import {
  ButtonStyle,
  ChannelType,
  ComponentType,
  SelectMenuDefaultValueType,
  SeparatorSpacingSize,
  TextInputStyle,
  type APIActionRowComponent,
  type APIComponentInMessageActionRow,
  type APIContainerComponent,
  type APILabelComponent,
  type APIMessageTopLevelComponent,
} from "discord-api-types/v10";
import { describe, expect, test } from "vitest";
import {
  ActionRow,
  ChannelSelectMenuComponent,
  CheckboxComponent,
  CheckboxGroupComponent,
  Component,
  ContainerComponent,
  createComponent,
  FileComponent,
  FileUploadComponent,
  findComponentByCustomId,
  GatewayClient,
  InteractiveButtonComponent,
  kPatch,
  LabelComponent,
  LinkButtonComponent,
  MediaGalleryComponent,
  MediaGalleryItem,
  MentionableSelectMenuComponent,
  Message,
  MessagePayload,
  PremiumButtonComponent,
  RadioGroupComponent,
  RoleSelectMenuComponent,
  SectionComponent,
  SeparatorComponent,
  StringSelectMenuComponent,
  TextDisplayComponent,
  TextInputComponent,
  ThumbnailComponent,
  UnfurledMediaItem,
  UserSelectMenuComponent,
  type APIAnyComponent,
} from "../src/index.js";

const row: APIActionRowComponent<APIComponentInMessageActionRow> = {
  type: ComponentType.ActionRow,
  id: 1,
  components: [
    {
      type: ComponentType.Button,
      id: 2,
      style: ButtonStyle.Primary,
      custom_id: "confirm",
      label: "Confirm",
      emoji: { name: "✅" },
    },
    {
      type: ComponentType.Button,
      style: ButtonStyle.Link,
      url: "https://discord.com",
      label: "Open",
    },
    { type: ComponentType.Button, style: ButtonStyle.Premium, sku_id: "300000000000000030" },
  ],
};

const container: APIContainerComponent = {
  type: ComponentType.Container,
  accent_color: 0xff_00_aa,
  components: [
    { type: ComponentType.TextDisplay, content: "# Title" },
    {
      type: ComponentType.Section,
      components: [{ type: ComponentType.TextDisplay, content: "Body" }],
      accessory: {
        type: ComponentType.Thumbnail,
        media: { url: "https://cdn.discordapp.com/avatar.png" },
        description: "Avatar",
      },
    },
    {
      type: ComponentType.Section,
      components: [{ type: ComponentType.TextDisplay, content: "Settings" }],
      accessory: {
        type: ComponentType.Button,
        style: ButtonStyle.Secondary,
        custom_id: "settings",
        label: "Edit",
      },
    },
    { type: ComponentType.Separator },
    {
      type: ComponentType.MediaGallery,
      items: [{ media: { url: "https://cdn.discordapp.com/a.png" }, spoiler: true }],
    },
    { type: ComponentType.File, file: { url: "attachment://log.txt" } },
    {
      type: ComponentType.ActionRow,
      components: [
        {
          type: ComponentType.StringSelect,
          custom_id: "pick",
          options: [{ label: "One", value: "1" }],
        },
      ],
    },
  ],
};

const label: APILabelComponent = {
  type: ComponentType.Label,
  label: "Your name",
  component: {
    type: ComponentType.TextInput,
    custom_id: "name",
    style: TextInputStyle.Short,
  },
};

describe("createComponent", () => {
  test.each<[string, APIAnyComponent, abstract new (...args: never[]) => object]>([
    ["an action row", row, ActionRow],
    ["an interactive button", row.components[0]!, InteractiveButtonComponent],
    ["a link button", row.components[1]!, LinkButtonComponent],
    ["a premium button", row.components[2]!, PremiumButtonComponent],
    [
      "a string select",
      { type: ComponentType.StringSelect, custom_id: "s", options: [] },
      StringSelectMenuComponent,
    ],
    ["a user select", { type: ComponentType.UserSelect, custom_id: "u" }, UserSelectMenuComponent],
    ["a role select", { type: ComponentType.RoleSelect, custom_id: "r" }, RoleSelectMenuComponent],
    [
      "a mentionable select",
      { type: ComponentType.MentionableSelect, custom_id: "m" },
      MentionableSelectMenuComponent,
    ],
    [
      "a channel select",
      { type: ComponentType.ChannelSelect, custom_id: "c" },
      ChannelSelectMenuComponent,
    ],
    ["a text input", label.component, TextInputComponent],
    ["a container", container, ContainerComponent],
    ["a section", container.components[1]!, SectionComponent],
    ["a text display", container.components[0]!, TextDisplayComponent],
    [
      "a thumbnail",
      (container.components[1] as never as { accessory: APIAnyComponent }).accessory,
      ThumbnailComponent,
    ],
    ["a separator", container.components[3]!, SeparatorComponent],
    ["a media gallery", container.components[4]!, MediaGalleryComponent],
    ["a file", container.components[5]!, FileComponent],
    ["a label", label, LabelComponent],
    ["a file upload", { type: ComponentType.FileUpload, custom_id: "f" }, FileUploadComponent],
    [
      "a radio group",
      { type: ComponentType.RadioGroup, custom_id: "g", options: [] },
      RadioGroupComponent,
    ],
    [
      "a checkbox group",
      { type: ComponentType.CheckboxGroup, custom_id: "cg", options: [] },
      CheckboxGroupComponent,
    ],
    ["a checkbox", { type: ComponentType.Checkbox, custom_id: "cb" }, CheckboxComponent],
  ])("GIVEN %s THEN it builds its class", (_, data, Class) => {
    const component = createComponent(data);
    expect(component).toBeInstanceOf(Class);
    expect(component).toBeInstanceOf(Component);
    expect(component.type).toBe(data.type);
    expect(component.toJSON()).toEqual(data);
  });

  test("GIVEN an unknown type THEN it builds a plain Component", () => {
    const data = { type: ComponentType.ContentInventoryEntry, id: 5 } as never as APIAnyComponent;
    const component = createComponent(data);
    expect(component.constructor).toBe(Component);
    expect(component.id).toBe(5);
    expect(component.toJSON()).toEqual(data);
  });

  test("GIVEN a component THEN it is returned as is", () => {
    const component = createComponent(row);
    expect(createComponent(component)).toBe(component);
  });

  test("GIVEN a value that is not a component THEN instanceof Component is false", () => {
    expect(row).not.toBeInstanceOf(Component);
    expect(new UnfurledMediaItem({ url: "https://discord.com" })).not.toBeInstanceOf(Component);
  });
});

describe("ActionRow", () => {
  test("GIVEN an action row THEN its components are built", () => {
    const actionRow = new ActionRow(row);
    const [button, link, premium] = actionRow.components;

    expect(actionRow.id).toBe(1);
    expect(button).toBeInstanceOf(InteractiveButtonComponent);
    const interactive = button as InteractiveButtonComponent;
    expect(interactive.customId).toBe("confirm");
    expect(interactive.label).toBe("Confirm");
    expect(interactive.style).toBe(ButtonStyle.Primary);
    expect(interactive.emoji).toEqual({ name: "✅" });
    expect(interactive.disabled).toBe(false);
    expect((link as LinkButtonComponent).url).toBe("https://discord.com");
    expect((link as LinkButtonComponent).emoji).toBeNull();
    expect((premium as PremiumButtonComponent).skuId).toBe("300000000000000030");
  });

  test("GIVEN an action row THEN toJSON serializes it back, nested components included", () => {
    const actionRow = new ActionRow(row);
    expect(actionRow.toJSON()).toEqual(row);
    expect(JSON.parse(JSON.stringify(actionRow))).toEqual(row);
  });

  test("GIVEN a patch THEN the components follow it", () => {
    const actionRow = new ActionRow(row);
    actionRow[kPatch]({ components: [row.components[1]!] });
    expect(actionRow.components).toHaveLength(1);
    expect(actionRow.components[0]).toBeInstanceOf(LinkButtonComponent);
  });

  test("GIVEN equals THEN it compares the data, nested components included", () => {
    const actionRow = new ActionRow(row);
    expect(actionRow.equals(row)).toBe(true);
    expect(actionRow.equals(new ActionRow(structuredClone(row)))).toBe(true);
    expect(actionRow.equals({ ...row, components: row.components.slice(1) })).toBe(false);
  });
});

describe("select menus", () => {
  test("GIVEN a string select THEN its options and defaults are exposed", () => {
    const menu = new StringSelectMenuComponent({
      type: ComponentType.StringSelect,
      custom_id: "pick",
      options: [{ label: "One", value: "1" }],
      min_values: 1,
    });
    expect(menu.customId).toBe("pick");
    expect(menu.options).toEqual([{ label: "One", value: "1" }]);
    expect(menu.disabled).toBe(false);
    expect(menu.minValues).toBe(1);
  });

  test("GIVEN an auto-populated select THEN its default values are exposed", () => {
    const menu = new ChannelSelectMenuComponent({
      type: ComponentType.ChannelSelect,
      custom_id: "channel",
      channel_types: [ChannelType.GuildText],
      default_values: [{ id: "200000000000000020", type: SelectMenuDefaultValueType.Channel }],
    });
    expect(menu.channelTypes).toEqual([ChannelType.GuildText]);
    expect(menu.defaultValues).toEqual([
      { id: "200000000000000020", type: SelectMenuDefaultValueType.Channel },
    ]);
    expect(
      new UserSelectMenuComponent({ type: ComponentType.UserSelect, custom_id: "u" }).defaultValues,
    ).toEqual([]);
  });
});

describe("layout components", () => {
  test("GIVEN a container THEN its components, accessories, and media are built", () => {
    const built = new ContainerComponent(container);
    const [text, thumbnailSection, buttonSection, separator, gallery, file, actionRow] =
      built.components;

    expect(built.accentColor).toBe(0xff_00_aa);
    expect(built.hexAccentColor).toBe("#ff00aa");
    expect(built.spoiler).toBe(false);
    expect((text as TextDisplayComponent).content).toBe("# Title");

    const section = thumbnailSection as SectionComponent;
    expect(section.components[0]).toBeInstanceOf(TextDisplayComponent);
    expect(section.accessory).toBeInstanceOf(ThumbnailComponent);
    const thumbnail = section.accessory as ThumbnailComponent;
    expect(thumbnail.media).toBeInstanceOf(UnfurledMediaItem);
    expect(thumbnail.media.url).toBe("https://cdn.discordapp.com/avatar.png");
    expect(thumbnail.description).toBe("Avatar");
    expect(thumbnail.spoiler).toBe(false);
    expect((buttonSection as SectionComponent).accessory).toBeInstanceOf(
      InteractiveButtonComponent,
    );

    expect((separator as SeparatorComponent).spacing).toBe(SeparatorSpacingSize.Small);
    expect((separator as SeparatorComponent).divider).toBe(true);

    const [item] = (gallery as MediaGalleryComponent).items;
    expect(item).toBeInstanceOf(MediaGalleryItem);
    expect(item!.media.url).toBe("https://cdn.discordapp.com/a.png");
    expect(item!.spoiler).toBe(true);

    expect((file as FileComponent).file.url).toBe("attachment://log.txt");
    expect((file as FileComponent).spoiler).toBe(false);
    expect((actionRow as ActionRow).components[0]).toBeInstanceOf(StringSelectMenuComponent);

    expect(built.toJSON()).toEqual(container);
  });

  test("GIVEN a container without an accent color THEN it is null", () => {
    const built = new ContainerComponent({ type: ComponentType.Container, components: [] });
    expect(built.accentColor).toBeNull();
    expect(built.hexAccentColor).toBeNull();
  });
});

describe("modal components", () => {
  test("GIVEN a label THEN its component is built", () => {
    const built = new LabelComponent(label);
    expect(built.label).toBe("Your name");
    expect(built.description).toBeNull();
    expect(built.component).toBeInstanceOf(TextInputComponent);
    expect((built.component as TextInputComponent).customId).toBe("name");
    expect(built.toJSON()).toEqual(label);
  });

  test("GIVEN choice components THEN their fields are exposed", () => {
    const options = [
      { label: "A", value: "a" },
      { label: "B", value: "b", default: true },
    ];
    const radio = new RadioGroupComponent({
      type: ComponentType.RadioGroup,
      custom_id: "g",
      options,
    });
    expect(radio.customId).toBe("g");
    expect(radio.options).toEqual(options);
    expect(radio.required).toBe(true);

    const group = new CheckboxGroupComponent({
      type: ComponentType.CheckboxGroup,
      custom_id: "cg",
      options,
      min_values: 0,
      max_values: 1,
    });
    expect(group.minValues).toBe(0);
    expect(group.maxValues).toBe(1);

    const defaults = new CheckboxGroupComponent({
      type: ComponentType.CheckboxGroup,
      custom_id: "cg",
      options,
    });
    expect(defaults.minValues).toBe(1);
    expect(defaults.maxValues).toBe(options.length);

    const checkbox = new CheckboxComponent({ type: ComponentType.Checkbox, custom_id: "cb" });
    expect(checkbox.customId).toBe("cb");
    expect(checkbox.default).toBe(false);

    const upload = new FileUploadComponent({ type: ComponentType.FileUpload, custom_id: "f" });
    expect(upload.customId).toBe("f");
    expect(upload.fileTypes).toEqual([]);
  });
});

describe("findComponentByCustomId", () => {
  const components: APIMessageTopLevelComponent[] = [row, container];

  test("GIVEN built components THEN it finds nested ones", () => {
    const built = components.map((component) => createComponent(component));
    const found = findComponentByCustomId(built, "settings");
    expect(found).toBeInstanceOf(InteractiveButtonComponent);
    expect((found as InteractiveButtonComponent).label).toBe("Edit");
    expect(findComponentByCustomId(built, "pick")).toBeInstanceOf(StringSelectMenuComponent);
    expect(findComponentByCustomId(built, "missing")).toBeNull();
  });

  test("GIVEN raw components THEN it finds nested ones", () => {
    expect(findComponentByCustomId(components, "confirm")).toBe(row.components[0]);
    expect(findComponentByCustomId([label], "name")).toBe(label.component);
  });
});

describe("Message#components", () => {
  test("GIVEN a message with components THEN they are built", () => {
    const message = new Message({
      id: "1",
      channel_id: "2",
      author: { id: "3", username: "wolf", discriminator: "0", global_name: null, avatar: null },
      components: [row, container],
    } as never);
    const [first, second] = message.components;
    expect(first).toBeInstanceOf(ActionRow);
    expect(second).toBeInstanceOf(ContainerComponent);
    expect(new Message({ id: "1", channel_id: "2" } as never).components).toEqual([]);
  });

  test("GIVEN built components THEN MessagePayload serializes them", async () => {
    const client = new GatewayClient({
      discordPublicKey: "0".repeat(64),
      discordToken: "test-token",
      clientId: "266624760782258186",
      intents: 0,
      cache: createInMemoryCache(),
    });
    const { body } = await MessagePayload.create(client, {
      components: [new ActionRow(row) as never, createComponent(container)],
    }).resolve();
    expect((body as { components: unknown }).components).toEqual([row, container]);
  });
});
