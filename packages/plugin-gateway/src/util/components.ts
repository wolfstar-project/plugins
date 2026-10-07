import {
  ButtonStyle,
  ComponentType,
  type APIActionRowComponent,
  type APIButtonComponentWithCustomId,
  type APIButtonComponentWithSKUId,
  type APIButtonComponentWithURL,
  type APIChannelSelectComponent,
  type APICheckboxComponent,
  type APICheckboxGroupComponent,
  type APIContainerComponent,
  type APIFileComponent,
  type APIFileUploadComponent,
  type APILabelComponent,
  type APIMediaGalleryComponent,
  type APIMentionableSelectComponent,
  type APIRadioGroupComponent,
  type APIRoleSelectComponent,
  type APISectionComponent,
  type APISeparatorComponent,
  type APIStringSelectComponent,
  type APITextDisplayComponent,
  type APITextInputComponent,
  type APIThumbnailComponent,
  type APIUserSelectComponent,
} from "discord-api-types/v10";
import { ActionRow } from "../structures/components/ActionRow.js";
import { ChannelSelectMenuComponent } from "../structures/components/ChannelSelectMenuComponent.js";
import { CheckboxComponent } from "../structures/components/CheckboxComponent.js";
import { CheckboxGroupComponent } from "../structures/components/CheckboxGroupComponent.js";
import { Component, type APIAnyComponent } from "../structures/components/Component.js";
import { ContainerComponent } from "../structures/components/ContainerComponent.js";
import { FileComponent } from "../structures/components/FileComponent.js";
import { FileUploadComponent } from "../structures/components/FileUploadComponent.js";
import { InteractiveButtonComponent } from "../structures/components/InteractiveButtonComponent.js";
import { LabelComponent } from "../structures/components/LabelComponent.js";
import { LinkButtonComponent } from "../structures/components/LinkButtonComponent.js";
import { MediaGalleryComponent } from "../structures/components/MediaGalleryComponent.js";
import { MentionableSelectMenuComponent } from "../structures/components/MentionableSelectMenuComponent.js";
import { PremiumButtonComponent } from "../structures/components/PremiumButtonComponent.js";
import { RadioGroupComponent } from "../structures/components/RadioGroupComponent.js";
import { RoleSelectMenuComponent } from "../structures/components/RoleSelectMenuComponent.js";
import { SectionComponent } from "../structures/components/SectionComponent.js";
import { SeparatorComponent } from "../structures/components/SeparatorComponent.js";
import { StringSelectMenuComponent } from "../structures/components/StringSelectMenuComponent.js";
import { TextDisplayComponent } from "../structures/components/TextDisplayComponent.js";
import { TextInputComponent } from "../structures/components/TextInputComponent.js";
import { ThumbnailComponent } from "../structures/components/ThumbnailComponent.js";
import { UserSelectMenuComponent } from "../structures/components/UserSelectMenuComponent.js";

/**
 * A button, of any style.
 */
export type ButtonComponent =
  | InteractiveButtonComponent
  | LinkButtonComponent
  | PremiumButtonComponent;

/**
 * A select menu, of any type.
 */
export type SelectMenuComponent =
  | ChannelSelectMenuComponent
  | MentionableSelectMenuComponent
  | RoleSelectMenuComponent
  | StringSelectMenuComponent
  | UserSelectMenuComponent;

/**
 * A component of a message's action row.
 */
export type MessageActionRowComponent = ButtonComponent | SelectMenuComponent;

/**
 * A component of a modal's action row.
 */
export type ModalActionRowComponent = TextInputComponent;

/**
 * A component of a section.
 */
export type ComponentInSection = TextDisplayComponent;

/**
 * A component of a container.
 */
export type ComponentInContainer =
  | ActionRow<MessageActionRowComponent>
  | FileComponent
  | MediaGalleryComponent
  | SectionComponent
  | SeparatorComponent
  | TextDisplayComponent;

/**
 * A top-level component of a message.
 */
export type MessageTopLevelComponent = ComponentInContainer | ContainerComponent;

/**
 * A component of a label.
 */
export type ComponentInLabel =
  | CheckboxComponent
  | CheckboxGroupComponent
  | FileUploadComponent
  | RadioGroupComponent
  | SelectMenuComponent
  | TextInputComponent;

/**
 * The component {@link createComponent} builds for some raw component data, {@link Component} for the types this
 * package has no class for.
 *
 * @typeParam Data The raw component data.
 */
export type ComponentOf<Data extends APIAnyComponent> =
  Data extends APIActionRowComponent<infer Child>
    ? ActionRow<Extract<ComponentOf<Child>, MessageActionRowComponent | ModalActionRowComponent>>
    : Data extends APIButtonComponentWithCustomId
      ? InteractiveButtonComponent
      : Data extends APIButtonComponentWithURL
        ? LinkButtonComponent
        : Data extends APIButtonComponentWithSKUId
          ? PremiumButtonComponent
          : Data extends APIStringSelectComponent
            ? StringSelectMenuComponent
            : Data extends APIUserSelectComponent
              ? UserSelectMenuComponent
              : Data extends APIRoleSelectComponent
                ? RoleSelectMenuComponent
                : Data extends APIMentionableSelectComponent
                  ? MentionableSelectMenuComponent
                  : Data extends APIChannelSelectComponent
                    ? ChannelSelectMenuComponent
                    : Data extends APITextInputComponent
                      ? TextInputComponent
                      : Data extends APISectionComponent
                        ? SectionComponent
                        : Data extends APITextDisplayComponent
                          ? TextDisplayComponent
                          : Data extends APIThumbnailComponent
                            ? ThumbnailComponent
                            : Data extends APIMediaGalleryComponent
                              ? MediaGalleryComponent
                              : Data extends APIFileComponent
                                ? FileComponent
                                : Data extends APISeparatorComponent
                                  ? SeparatorComponent
                                  : Data extends APIContainerComponent
                                    ? ContainerComponent
                                    : Data extends APILabelComponent
                                      ? LabelComponent
                                      : Data extends APIFileUploadComponent
                                        ? FileUploadComponent
                                        : Data extends APIRadioGroupComponent
                                          ? RadioGroupComponent
                                          : Data extends APICheckboxGroupComponent
                                            ? CheckboxGroupComponent
                                            : Data extends APICheckboxComponent
                                              ? CheckboxComponent
                                              : Component;

/**
 * Any component of this package.
 */
export type AnyComponent = ComponentOf<APIAnyComponent>;

/**
 * Builds the component class matching some raw component data, like discord.js' `createComponent`: an `ActionRow` for
 * an action row, a `LinkButtonComponent` for a link button, and so on. Nested components are built too, when accessed.
 *
 * @param data The raw component data, or a component, which is returned as is.
 * @returns The component.
 */
export function createComponent<Data extends APIAnyComponent>(
  data: Data | ComponentOf<Data>,
): ComponentOf<Data>;
export function createComponent(data: APIAnyComponent | Component): Component {
  if (data instanceof Component) return data;
  return buildComponent(data) as Component;
}

// A switch rather than a lookup table: the component classes import this module, so they may not be initialized yet
// when it is evaluated.
function buildComponent(data: APIAnyComponent): object {
  switch (data.type) {
    case ComponentType.ActionRow:
      return new ActionRow(data);
    case ComponentType.Button:
      switch (data.style) {
        case ButtonStyle.Link:
          return new LinkButtonComponent(data);
        case ButtonStyle.Premium:
          return new PremiumButtonComponent(data);
        default:
          return new InteractiveButtonComponent(data);
      }
    case ComponentType.StringSelect:
      return new StringSelectMenuComponent(data);
    case ComponentType.TextInput:
      return new TextInputComponent(data);
    case ComponentType.UserSelect:
      return new UserSelectMenuComponent(data);
    case ComponentType.RoleSelect:
      return new RoleSelectMenuComponent(data);
    case ComponentType.MentionableSelect:
      return new MentionableSelectMenuComponent(data);
    case ComponentType.ChannelSelect:
      return new ChannelSelectMenuComponent(data);
    case ComponentType.Section:
      return new SectionComponent(data);
    case ComponentType.TextDisplay:
      return new TextDisplayComponent(data);
    case ComponentType.Thumbnail:
      return new ThumbnailComponent(data);
    case ComponentType.MediaGallery:
      return new MediaGalleryComponent(data);
    case ComponentType.File:
      return new FileComponent(data);
    case ComponentType.Separator:
      return new SeparatorComponent(data);
    case ComponentType.Container:
      return new ContainerComponent(data);
    case ComponentType.Label:
      return new LabelComponent(data);
    case ComponentType.FileUpload:
      return new FileUploadComponent(data);
    case ComponentType.RadioGroup:
      return new RadioGroupComponent(data);
    case ComponentType.CheckboxGroup:
      return new CheckboxGroupComponent(data);
    case ComponentType.Checkbox:
      return new CheckboxComponent(data);
    default:
      return new Component(data);
  }
}

/**
 * Gets the components of a component tree that can have a custom ID: the children of action rows and labels, the
 * components and accessory of sections, recursively through containers.
 *
 * @param component The component, or raw component data.
 */
function extractInteractiveComponents(
  component: AnyComponent | APIAnyComponent,
): (AnyComponent | APIAnyComponent)[] {
  const node = component as {
    type: ComponentType;
    components: (AnyComponent | APIAnyComponent)[];
    accessory: AnyComponent | APIAnyComponent;
    component: AnyComponent | APIAnyComponent;
  };
  switch (node.type) {
    case ComponentType.ActionRow:
      return node.components;
    case ComponentType.Section:
      return [...node.components, node.accessory];
    case ComponentType.Container:
      return node.components.flatMap(extractInteractiveComponents);
    case ComponentType.Label:
      return [node.component];
    default:
      return [component];
  }
}

/**
 * Finds a component by its custom ID in a component tree, like discord.js' `findComponentByCustomId`.
 *
 * @param components The components, or raw component data, to search in, like a message's top-level components.
 * @param customId The custom ID.
 * @returns The component, as given, `null` when none has the custom ID.
 */
export function findComponentByCustomId(
  components: readonly (AnyComponent | APIAnyComponent)[],
  customId: string,
): AnyComponent | APIAnyComponent | null {
  return (
    components.flatMap(extractInteractiveComponents).find((component) => {
      const node = component as { customId?: unknown; custom_id?: unknown };
      return (component instanceof Component ? node.customId : node.custom_id) === customId;
    }) ?? null
  );
}
