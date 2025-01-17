/**
 * @module push/chain
 * @description Pushes the current branch and all its child branches to origin in a breadth-first manner.
 * Force pushes are used to ensure branch state consistency.
 */

import type { Argv, CommandModule } from "yargs";
import { execCommand } from "../../utils.js";
import { findChildren } from "../../tree-nav/children.js";

/**
 * Implements the chain push functionality
 * Pushes the current branch and all its descendants to origin
 *
 * @throws {Error} If git push fails for any branch
 */
export async function pushChainImpl(options: PushChainOptions) {
  // Get the current branch name
  const startBranch = execCommand('git rev-parse --abbrev-ref HEAD').trim();
  const isMasterOrMain = startBranch === 'master' || startBranch === 'main';
  const isBranchlessHead = startBranch === 'HEAD';
  const shouldSkipCurrentBranch = (isMasterOrMain && !options.includeMain) || isBranchlessHead;

  // Initialize queue with starting branch
  const queue = shouldSkipCurrentBranch ? enqueueQualifiedPushChildren(startBranch, []) : [startBranch];

  // Process branches in breadth-first order
  while (queue.length) {
    const branch = queue.shift()!;

    console.log(`Pushing branch to origin ${branch}...`);

    try {
      // Force push the branch to origin
      const pushOutput = execCommand(`git push origin ${branch} -f`, true);

      if (pushOutput.trim()) {
        console.log(pushOutput);
      }

      console.log(`Branch ${branch} successfully pushed to origin\n`);

      if (options.postPush) {
        await options.postPush(branch);
      }
    } catch (e: unknown) {
      console.error(`Failed to push branch ${branch} to origin\n`);
      console.error(e);
    }

    enqueueQualifiedPushChildren(branch, queue);
  }

  console.log('Chain push operation complete,');
  execCommand(`git checkout ${startBranch}`);
}

/**
 * Finds the non-orphaned child branches of a given branch. Then it enqueues
 * them onto the queue and returns the mutated queue.
 *
 * @param branch Branch from which to find children
 * @param queue The current queue to enqueue onto
 * @returns The mutated queue
 */
function enqueueQualifiedPushChildren(branch: string, queue: string[]) {
  // Add child branches to the queue
  findChildren(branch).forEach(child => {
    // Skip orphaned branches
    if (child.orphaned) {
      return;
    }

    queue.push(child.branchName.trim());
  });

  return queue;
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
  builder: (yargs: Argv) =>
    yargs
      .option('include-main', {
        alias: 'm',
        type: 'boolean',
        default: false,
        describe: 'Include main/master branches in the chain push operation',
      }),
} as const satisfies CommandModule<{}, PushChainOptions>;

interface PushChainOptions {
  includeMain?: boolean;
  yesToAll?: boolean;
  postPush?: (branch: string) => Promise<void>;
}