/**
 * @module prs
 * Synchronizes PR descriptions and base branches for a branch hierarchy
 */

import type { Argv, CommandModule } from "yargs";
import { buildGraph } from "../../tree-nav/graph.js";
import { getTableStr, upsertPrDescription } from '../../github-helpers/comment.js'
import { getPrNumber, getPrStatus, updateBaseBranch } from '../../github-helpers/pr.js'
import { createPrLink } from '../../github-helpers/links.js'
import type { Branch } from "../../utils";
import inquirer from "inquirer";
import { execSync } from "child_process";
import { isSplitBranchTag } from "../../tags/split-branch.js";
import { getParentBranch } from "../../tree-nav/parent.js";

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
async function syncPrImpl(options: { chain?: boolean }) {
  console.log('Building branch graph...');
  const {graph, allNodes} = buildGraph();

  console.log('Finding Open PRs...');
  const prToNumber = new Map<Branch, number>();
  let stack = graph.children;

  if (options.chain) {
    const currentBranchName = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    const currentBranch = allNodes.get(currentBranchName);

    if (!currentBranch) {
      console.error(`Branch ${currentBranchName} not found in graph.`);
      return;
    }

    stack = [currentBranch];
  }
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
  console.log('Updating PRs...\n');

  const promises: Promise<unknown>[] = [];

  for (const branch of prsToUpdate) {
    const updatePr = new Promise(async () => {
      const parentPrNumber = prToNumber.get(branch.parent!);
      const tableStr = getTableStr({
        branchName: branch.parent!.branchName,
        prNumber: parentPrNumber
      }, branch.children.map(child => ({
        branchName: child.branchName,
        prNumber: prToNumber.get(child)
      })));

      const prNumber = prToNumber.get(branch)!;

      console.log(`Updating PR: ${branch.branchName}#${prNumber}...`);

      // Update PR description with relationship table
      await upsertPrDescription(prNumber, tableStr);

      // Sometimes the parent is different for the basebranch like with split branches
      // we want to point to the parent of the root not to the empty commit itself
      const baseBranch = getBaseBranch(branch);

      let success = false;

      if (baseBranch) {
        // Update PR base branch
        const response = await updateBaseBranch(prNumber, baseBranch!.branchName);
        success = response.success;
      }

      if (success) {
        console.log(`PR ${prNumber} updated.`);
        return;
      }

      console.log(`Base branch (${branch.parent!.branchName}) not found. PR ${prNumber} base branch set to main.`);
      return;
    });

    promises.push(updatePr);
  }

  await Promise.all(promises);
}

/**
 * Returns the parent branch that a PR should be pointing to
 *
 * @param branch The branch to parse
 * @returns The branch the PR should be pointing to as a parent
 */
function getBaseBranch(branch: Branch) {
  const parent = branch.parent;

  if (!parent) {
    return parent;
  }

  const tags = execSync(`git tag --points-at ${parent.branchName}`).toString().split('\n');
  const splitBranchTag = tags.find(tag => isSplitBranchTag(tag));

  if (splitBranchTag) {
    return getParentBranch(parent.branchName);
  }

  return parent;
}

/**
 * Command configuration for PR synchronization
 */
export const syncPrs = {
  command: ['prs'],
  describe: 'Synchronizes comments and branch bases with PRs',
  handler: syncPrImpl,
  builder: (yargs: Argv) =>
    yargs
      .option('chain', {
        alias: 'c',
        type: 'boolean',
        description: 'Sync PRs in a chain starting from the current branch'
      }),
} as const satisfies CommandModule<{}, {chain?: boolean}>;