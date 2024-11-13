import type { Argv, CommandModule } from "yargs";
import { execCommand, findChildren } from "../../utils.js";
import inquirer from 'inquirer';
import { clearStaleParentTags, markStale } from '../../tags/stale.js';

export async function rebaseImpl(from: string, to: string, flag: 'continue' | 'abort' | null) {

  // Get current branch name
  const fromCommit = execCommand(`git rev-parse ${from}`);

  if (flag === 'abort') {
    execCommand('git rebase --abort', true);
    clearStaleParentTags(fromCommit);
    return;
  }

  // Find all child branches that will be affected by this rebase
  const children = findChildren(from);

  if (flag === 'continue') {
    execCommand('git rebase --continue', true);
  } else {
    // Prompt for confirmation before rebasing
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Attempt rebase this single branch-commit onto ${to}?`,
      default: false
    }]);

    // Exit if user cancels
    if (!confirm) {
      console.log('Rebase cancelled');
      process.exit(0);
    }

    console.log(`Rebasing onto ${to}...`);
    // Perform the actual rebase
    execCommand(`git rebase --onto ${to} ${fromCommit}^ ${from}`, true);
  }

  const newCommit = execCommand(`git rev-parse ${from}`);

  if (fromCommit !== newCommit) {
    const hasNonOrphanedChildren = children.some(child => !child.orphaned);
    markStale(fromCommit, from, hasNonOrphanedChildren);
  }
}

/**
 * Rebase command module for figbranch.
 * Handles rebasing the current branch onto a target branch after user confirmation.
 * Updates state to mark child branches as orphaned since they'll need to be rebased too.
 *
 * Usage: fb rebase <branch>
 * Example: fb rebase main
 */
export const rebase = {
  command: 'rebase <branch>',
  describe: 'Rebase the current branch-commit onto the given branch',
  builder: (yargs: Argv) =>
    yargs
      .positional('branch', {
        describe: 'The branch to rebase onto',
        type: 'string',
        demandOption: true
      })
      .option('continue', {
        describe: 'Continue the rebase after resolving conflicts',
        type: 'boolean'
      })
      .option('abort', {
        describe: 'Abort the rebase operation',
        type: 'boolean'
      }),
  handler: async (options) => {
    const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
    const flag = options.continue ? 'continue' : options.abort ? 'abort' : null;

    rebaseImpl(currentBranch, options.branch, flag);
  }
} satisfies CommandModule<{}, { branch: string, continue?: boolean, abort?: boolean }>;