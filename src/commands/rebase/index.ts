import type { Argv, CommandModule } from "yargs";
import { execCommand, findChildren } from "../../utils.js";
import inquirer from 'inquirer';
import { cleanupStaleParentTags, markStale } from '../../tags/stale.js';

export async function rebaseImpl(from: string, to: string | undefined, flag: 'continue' | 'abort' | null) {
  const fromCommit = execCommand(`git rev-parse ${from}`);

  // Handle abort case
  if (flag === 'abort') {
    execCommand('git rebase --abort', true);
    cleanupStaleParentTags();
    return;
  }

  // Exit if no target branch and not continuing
  if (!to && flag !== 'continue') {
    return;
  }

  // Handle continue case
  if (flag === 'continue') {
    execCommand('git rebase --continue', true);
    cleanupStaleParentTags();
    return;
  }

  // Get confirmation for new rebase
  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: `Attempt to rebase single branch-commit (${from}) onto branch ${to}?`,
    default: false
  }]);

  if (!confirm) {
    console.log('Rebase cancelled');
    process.exit(0);
  }

  // Perform the rebase
  console.log(`Rebasing onto ${to}...`);
  try {
    execCommand(`git rebase --onto ${to} ${fromCommit}^ ${from}`, true);

    // Handle successful rebase case
    const newCommit = execCommand(`git rev-parse ${from}`);
    if (fromCommit !== newCommit) {
      const children = findChildren(from);
      const hasNonOrphanedChildren = children.some(child => !child.orphaned);
      markStale(fromCommit, from, hasNonOrphanedChildren);
    }
  } catch (error: any) {
    // Mark as stale before showing error
    const children = findChildren(from);
    const hasNonOrphanedChildren = children.some(child => !child.orphaned);
    markStale(fromCommit, from, hasNonOrphanedChildren);

    // Show clean git error output
    if (error.stderr) {
      process.stderr.write(error.stderr);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  } finally {

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
  command: 'rebase [branch]',
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
} satisfies CommandModule<{}, { branch?: string, continue?: boolean, abort?: boolean }>;