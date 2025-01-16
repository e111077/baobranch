import type { Argv, CommandModule } from "yargs";
import { execCommand } from "../../utils.js";
import { findChildren } from "../../tree-nav/children.js";
import inquirer from 'inquirer';
import { cleanupStaleParentTags, markStale } from '../../tags/stale.js';

export async function rebaseImpl(
  { from, to, flag, silent = false }:
    {
      from: string;
      to: string | undefined;
      flag: 'continue' | 'abort' | null;
      silent?: boolean;
    }) {
  // Handle abort case
  if (flag === 'abort') {
    execCommand('git rebase --abort');
    cleanupStaleParentTags();
    return;
  }

  const fromCommit = execCommand(`git rev-parse ${from}`);

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

  if (!silent) {
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
  }

  // Perform the rebase
  console.log(`Rebasing ${from} onto ${to}...`);
  const children = findChildren(from);

  try {
    execCommand(`git rebase --onto ${to} ${fromCommit}^ ${from}`, true);

    // Handle successful rebase case
    const newCommit = execCommand(`git rev-parse ${from}`);

    if (fromCommit !== newCommit) {
      const hasNonOrphanedChildren = children.some(child => !child.orphaned);
      markStale(fromCommit, from, hasNonOrphanedChildren);
    }

    console.log('Rebase complete.');
  } catch (error: any) {
    // Mark as stale before showing error
    const hasNonOrphanedChildren = children.some(child => !child.orphaned);
    markStale(fromCommit, from, hasNonOrphanedChildren);
    console.log('Rebase incomplete:');

    // Show clean git error output
    if (error.stderr) {
      process.stderr.write(error.stderr);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

/**
 * Rebase command module for baobranch.
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
      })
      .option('continue', {
        describe: 'Continue the rebase after resolving conflicts',
        type: 'boolean'
      })
      .option('abort', {
        describe: 'Abort the rebase operation',
        type: 'boolean'
      })
      .option('source', {
        describe: 'The branch to rebase',
        type: 'string',
        alias: 's'
      })
      .option('destination', {
        describe: 'The branch to rebase the source onto',
        type: 'string',
        alias: 'd'
      })
      .check((argv) => {
        // Ensure either branch positional arg or --destination is provided
        if (!argv.branch && !argv.destination) {
          throw new Error('Either provide a branch argument or use --destination flag');
        }

        if (argv.branch && argv.destination) {
          throw new Error('Please provide only one of branch argument or --destination flag');
        }

        if (argv.source !== undefined && !argv.source) {
          throw new Error('Please provide a --source branch to rebase');
        }

        return true;
      }),
  handler: async (options) => {
    const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
    const flag = options.continue ? 'continue' : options.abort ? 'abort' : null;
    const from = options.source ?? currentBranch;
    const to = options.destination ?? options.branch;

    rebaseImpl({ from, to, flag });
  }
} satisfies CommandModule<{}, { branch?: string, continue?: boolean, abort?: boolean, source?: string, destination?: string }>;