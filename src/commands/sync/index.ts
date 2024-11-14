/**
 * @module sync
 * @description Synchronizes local repository with remote changes.
 * Handles updating main/master branch and cleaning up merged/closed branches.
 */

import type { Argv, CommandModule } from "yargs";
import { syncPrs } from "./prs.js";
import { execCommand } from "../../utils.js";
import { getPrStatus, getPrNumber } from '../../github-helpers/pr.js';

/**
 * Main sync implementation
 * - Updates main/master branch safely without requiring checkout
 * - Cleans up branches that are merged or closed in GitHub
 *
 * @throws {Error} If git commands fail during sync process
 */
function handler() {
  // Get current branch
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD').trim();

  // Determine if repo uses main or master as primary branch
  const mainOrMaster = execCommand('git branch --list main') ? 'main' : 'master';

  console.log(`Fetching changes from origin/${mainOrMaster}...`);

  // Handle updating main/master branch based on current checkout state
  if (currentBranch === mainOrMaster) {
    // If we're on main/master, do a regular pull
    execCommand(`git pull origin ${mainOrMaster}`, true);
  } else {
    // If we're on another branch, update main/master without checkout
    execCommand(`git fetch origin ${mainOrMaster}:${mainOrMaster}`, true);
  }

  // Get all branches except main/master
  const allBranches = execCommand('git branch --format="%(refname:short)"')
    .split('\n')
    .filter(b => b && (b !== mainOrMaster));

  const branchesToDelete = new Set<string>();

  // Check each branch's PR status
  for (const branch of allBranches) {
    const prNumber = getPrNumber(branch);

    if (!prNumber) {
      continue;
    }

    const prStatus = getPrStatus(prNumber);

    // Mark branches for deletion if their PR is merged or closed
    if (prStatus === 'CLOSED' || prStatus === 'MERGED') {
      branchesToDelete.add(branch);
    }
  }

  console.log('Cleaning up merged and closed branches...');

  // Delete branches that have merged or closed PRs
  branchesToDelete.forEach(branch => {
    execCommand(`git branch -D ${branch}`);
  });

  console.log('Sync complete.');
}

/**
 * Command configuration for sync functionality
 * @example
 * // Sync repository with remote
 * fb sync
 *
 * // Sync PRs specifically
 * fb sync prs
 */
export const sync = {
  command: ['sync [command]'],
  describe: 'Synchronizes with remotes',
  builder: (yargs: Argv): Argv<{}> =>
    yargs
      .command(syncPrs),
  handler,
} as const satisfies CommandModule<{}, {}>;