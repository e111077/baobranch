/**
 * @module evolve
 * Handles rebasing branches onto their parent branches while maintaining branch relationships
 */

import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { evolveSelfImpl } from "./self.js";
import type { EvolveOptions } from "./options.js";

/**
 * Implements the evolve command logic
 *
 * Currently handles the 'self' scope which evolves only the current branch.
 * Other scopes ('directs' and 'full') to be implemented.
 *
 * @param options - Command line options for the evolve operation
 * @param options.scope - The scope of branches to evolve ('self', 'directs', or 'full')
 * @param options.continue - Whether to continue a previous evolve after resolving conflicts
 * @param options.abort - Whether to abort the current evolve operation
 */
function evolveImpl(options: ArgumentsCamelCase<EvolveOptions>) {
  if (options.scope === 'self') {
    evolveSelfImpl(options);
    return;
  }
}

/**
 * Command configuration for the evolve feature
 *
 * The evolve command rebases branches onto their parent branches while maintaining
 * branch relationships. It can operate in different scopes:
 * - self: Only evolves the current branch
 * - directs: Evolves current branch and direct descendants
 * - full: Evolves current branch and all descendants (direct and orphaned)
 *
 * @example
 * // Evolve only the current branch
 * fb evolve --scope self
 *
 * @example
 * // Continue evolve after resolving conflicts
 * fb evolve --continue
 */
export const evolve = {
  command: 'evolve',
  describe: 'Rebase the current orphaned branch onto a fresh reference of its parent branch as well as all of its descendants',
  builder: (yargs: Argv): Argv<EvolveOptions> =>
    yargs
      .option('continue', {
        describe: 'Continue the evolve after resolving rebase conflicts',
        type: 'boolean'
      })
      .option('abort', {
        describe: 'Abort the current rebase taking place in the evolve operation',
        type: 'boolean'
      })
      .option('scope', {
        describe: 'The scope of the rebase operation. Self only evolves the current branch, directs evolves the current branch and its direct descendants, full evolves the current branch and all its direct and orphaned descendants',
        choices: ['self', 'directs', 'full'] as const,
        default: 'directs' as const,
        type: 'string'
      }),
  handler: evolveImpl
} satisfies CommandModule<{}, EvolveOptions>;