---
"@wolfstar/plugin-gateway": minor
---

Add component structures like discord.js': `ActionRow`, `InteractiveButtonComponent`, `LinkButtonComponent`, `PremiumButtonComponent`, the five select menus, `TextInputComponent`, `ContainerComponent`, `SectionComponent`, `TextDisplayComponent`, `ThumbnailComponent`, `MediaGalleryComponent` (with `MediaGalleryItem` and `UnfurledMediaItem`), `FileComponent`, `SeparatorComponent`, `LabelComponent`, `FileUploadComponent`, `RadioGroupComponent`, `CheckboxGroupComponent`, and `CheckboxComponent`, all extending a common `Component`. `createComponent()` builds the matching class for raw component data, and `findComponentByCustomId()` searches a component tree.

**Breaking:** `Message#components` now returns these structures instead of the raw API data. Call `toJSON()` on them to get the raw components back.
