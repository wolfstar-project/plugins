import { CommandLoaderStrategy, type Command, type CommandStore } from "@wolfstar/http-framework";
import { resolveDeferredSubcommands } from "./functions.js";
import { hasRegisteredSubcommands, wireParentSubcommands } from "./wiring.js";

/**
 * Loader strategy that wires modular subcommands onto parent commands before
 * chat-input mappings are published to {@link CommandStore.router}.
 *
 * {@link CommandStore.loadAll} constructs every piece first, then inserts them. The
 * first {@link onLoad} resolves all deferred children, so every parent sees a complete
 * registry while builders avoid the construction phase.
 */
export class SubcommandsAdvancedLoaderStrategy extends CommandLoaderStrategy {
  public override onLoad(store: CommandStore, piece: Command) {
    resolveDeferredSubcommands();

    const parentName = piece.router.chatInputName;
    if (parentName && hasRegisteredSubcommands(parentName)) {
      wireParentSubcommands(piece);
    }

    return super.onLoad(store, piece);
  }
}
