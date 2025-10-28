/**
 * @module push
 * @description Main push command module that handles different push strategies:
 * - Basic force push of current branch
 * - Chain push (current branch and its descendants)
 * - All branches push
 */

import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { pushAll } from "./all.js";
import { pushChain } from "./chain.js";
import { execCommand, logger } from "../../utils.js";

/**
 * Default push handler that force pushes the current branch
 * @throws {Error} If git push fails
 */
function handler() {
  logger.info(execCommand('git push -f'));
}

/**
 * Push command configuration
 * @example
 * // Force push current branch
 * fb push
 *
 * // Push current branch and descendants
 * fb push chain
 * // or
 * fb p c
 *
 * // Push all branches
 * fb push all
 * // or
 * fb p a
 */
export const push = {
  command: ['push <command>', 'p <command>'],
  describe: 'Pushes changes to remotes',
  builder: (yargs: Argv): Argv<{}> =>
    yargs
      .command(pushChain)
      .command(pushAll),
  handler,
} as const satisfies CommandModule<{}, {}>;