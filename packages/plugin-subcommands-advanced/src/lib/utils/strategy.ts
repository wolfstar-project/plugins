import { CommandLoaderStrategy, type Command, type CommandStore } from "@wolfstar/http-framework";
import { hasRegisteredSubcommands, wireParentSubcommands } from "./wiring.js";

/**
 * Loader strategy that wires modular subcommands onto parent commands before
 * chat-input mappings are published to {@link CommandStore.router}.
 *
 * {@link CommandStore.loadAll} constructs every piece first (children populate the
 * registries), then inserts them — {@link onLoad} therefore sees a complete registry.
 */
export class SubcommandsAdvancedLoaderStrategy extends CommandLoaderStrategy {
  public override onLoad(store: CommandStore, piece: Command) {
    const parentName = piece.router.chatInputName;
    if (parentName && hasRegisteredSubcommands(parentName)) {
      wireParentSubcommands(piece);
    }

    return super.onLoad(store, piece);
  }
}
