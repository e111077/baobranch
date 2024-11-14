/**
 * @module push/chain
 * @description Pushes the current branch and all its child branches to origin in a breadth-first manner.
 * Force pushes are used to ensure branch state consistency.
 */

import type { CommandModule } from "yargs";
import { execCommand } from "../../utils.js";
import { findChildren } from "../../tree-nav/children.js";

/**
 * Implements the chain push functionality
 * Pushes the current branch and all its descendants to origin
 *
 * @throws {Error} If git push fails for any branch
 */
async function pushChainImpl() {
  // Get the current branch name
  const startBranch = execCommand('git rev-parse --abbrev-ref HEAD').trim();

  // Initialize queue with starting branch
  const queue = [startBranch];

  // Process branches in breadth-first order
  while (queue.length) {
    const branch = queue.shift()!;

    console.log(`Pushing branch to origin ${branch}...`);

    try {
      // Force push the branch to origin
      console.log(execCommand(`git push origin ${branch} -f`, true));
      console.log(`Branch ${branch} successfully pushed to origin`);
    } catch (e: unknown) {
      console.error(`Failed to push branch ${branch} to origin`);
      console.error(e);
    }

    // Add child branches to the queue
    findChildren(branch).forEach(child => {
      // Skip orphaned branches
      if (child.orphaned) {
        return;
      }

      queue.push(child.branchName);
    });
  }
}

/**
 * Command configuration for chain push
 *
 * @example
 * // Push current branch and all its children
 * fb push chain
 * // or
 * fb push c
 */
export const pushChain = {
  command: ['chain', 'c'],
  describe: 'Force pushes the current branch and all its descendants to origin',
  handler: pushChainImpl,
} as const satisfies CommandModule<{}, {}>;