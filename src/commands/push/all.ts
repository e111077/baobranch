/**
 * @module push/all
 * @description Handles pushing all branches to remote.
 * Uses force push to ensure branch state consistency.
 */

import type { CommandModule } from "yargs";
import { execCommand } from "../../utils.js";

/**
 * Pushes all branches forcefully to remote
 * @throws {Error} If git push command fails
 */
function pushAllImpl() {
  console.log(execCommand('git push --all -f'));
}

/**
 * Command configuration for pushing all branches
 * @example
 * // Push all branches forcefully
 * fb push all
 * // or
 * fb p a
 */
export const pushAll = {
  command: ['all', 'a'],
  describe: 'Force pushes all branches to remote',
  handler: pushAllImpl,
} as const satisfies CommandModule<{}, {}>;