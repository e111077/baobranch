/**
 * @module prs
 * Synchronizes PR descriptions and base branches for a branch hierarchy
 */

import type { CommandModule } from "yargs";
import { buildGraph } from "../../tree-nav/graph.js";
import { getTableStr, upsertPrDescription } from '../../github-helpers/comment.js'
import { getPrNumber, getPrStatus, updateBaseBranch } from '../../github-helpers/pr.js'
import { createPrLink } from '../../github-helpers/links.js'
import type { Branch } from "../../utils";
import inquirer from "inquirer";

/**
 * Synchronizes PR descriptions and base branches for all open PRs in the branch hierarchy
 *
 * This function:
 * 1. Builds a graph of branch relationships
 * 2. Finds all open PRs in the hierarchy
 * 3. Updates PR descriptions with parent/child relationship tables
 * 4. Updates PR base branches to maintain correct hierarchy
 *
 * @example
 * // Sync all PRs in the branch hierarchy
 * await syncPrImpl({});
 */
async function syncPrImpl() {
  console.log('Building branch graph...');
  const graph = buildGraph();

  console.log('Finding Open PRs...');
  const prToNumber = new Map<Branch, number>();
  const stack = graph.children;
  const prsToUpdate = new Set<Branch>();

  // Find all open PRs in the branch hierarchy
  while (stack.length > 0) {
    const branch = stack.pop()!;
    stack.push(...branch.children);
    const prNumber = getPrNumber(branch.branchName);

    if (!prNumber) {
      continue;
    }

    const prStatus = getPrStatus(prNumber);

    if (prStatus !== 'OPEN' && prStatus !== 'DRAFT') {
      continue;
    }

    prToNumber.set(branch, prNumber);
    prsToUpdate.add(branch);
  }

  if (prsToUpdate.size === 0) {
    console.log('No open PRs found to update.');
    return;
  }

  // Display PRs to be updated and get confirmation
  console.log('\nThe following PRs will have their base branches and descriptions updated:');
  for (const branch of prsToUpdate) {
    const prNumber = prToNumber.get(branch)!;
    console.log(`  ${branch.branchName}${createPrLink(branch.branchName, prNumber).replace(/\[(.+)\]/, '$1 ')}`);
  }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Would you like to update these PRs?',
    default: false
  }]);

  if (!confirm) {
    console.log('Update cancelled.');
    return;
  }

  // Update PR descriptions and base branches
  console.log('Updating PRs...');

  for (const branch of prsToUpdate) {
    const parentPrNumber = prToNumber.get(branch.parent!);
    const tableStr = getTableStr({
      branchName: branch.parent!.branchName,
      prNumber: parentPrNumber
    }, branch.children.map(child => ({
      branchName: child.branchName,
      prNumber: prToNumber.get(child)
    })));

    const prNumber = prToNumber.get(branch)!;

    console.log(`\nUpdating PR: ${branch.branchName}#${prNumber}...`);

    // Update PR description with relationship table
    upsertPrDescription(prNumber, tableStr);

    // Update PR base branch
    const { success } = updateBaseBranch(prNumber, branch.parent!.branchName);

    if (success) {
      console.log(`PR ${prNumber} updated.`);
      continue;
    }

    console.log(`Base branch (${branch.parent!.branchName}) not found. PR ${prNumber} base branch set to main.`);
  }
}

/**
 * Command configuration for PR synchronization
 */
export const syncPrs = {
  command: ['prs'],
  describe: 'Synchronizes comments and branch bases with PRs',
  handler: syncPrImpl,
} as const satisfies CommandModule<{}, {}>;