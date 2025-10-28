/**
 * @module prs
 * Synchronizes PR descriptions and base branches for a branch hierarchy
 */

import type { Argv, CommandModule } from "yargs";
import { buildGraph } from "../../tree-nav/graph.js";
import { getTableStr, upsertPrDescription } from '../../github-helpers/comment.js'
import { getPrNumber, getPrStatus, updateBaseBranch } from '../../github-helpers/pr.js'
import { createPrTerminalLink } from '../../github-helpers/links.js'
import { logger, type Branch } from "../../utils.js";
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
  logger.debug(`syncPrImpl: Starting PR sync with chain=${options.chain}`);
  logger.info('Building branch graph...');
  const {graph, allNodes} = await buildGraph();

  logger.info('Finding Open PRs...');
  const prToNumber = new Map<Branch, number>();
  let stack = graph.children;

  if (options.chain) {
    const currentBranchName = execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
    logger.debug(`syncPrImpl: Chain mode enabled, starting from branch "${currentBranchName}"`);
    const currentBranch = allNodes.get(currentBranchName);

    if (!currentBranch) {
      logger.debug(`syncPrImpl: Branch "${currentBranchName}" not found in graph`);
      logger.error(`Branch ${currentBranchName} not found in graph.`);
      return;
    }

    stack = [currentBranch];
  }
  const prsToUpdate = new Set<Branch>();

  // Find all open PRs in the branch hierarchy
  logger.debug(`syncPrImpl: Searching for open PRs in ${stack.length} branches`);
  while (stack.length > 0) {
    const branch = stack.pop()!;
    stack.push(...branch.children);
    const prNumber = getPrNumber(branch.branchName);

    if (!prNumber) {
      logger.debug(`syncPrImpl: No PR found for branch "${branch.branchName}"`);
      continue;
    }

    const prStatus = getPrStatus(prNumber);
    logger.debug(`syncPrImpl: Branch "${branch.branchName}" has PR #${prNumber} with status ${prStatus}`);

    if (prStatus !== 'OPEN' && prStatus !== 'DRAFT') {
      logger.debug(`syncPrImpl: Skipping PR #${prNumber} (not open/draft)`);
      continue;
    }

    prToNumber.set(branch, prNumber);
    prsToUpdate.add(branch);
  }

  logger.debug(`syncPrImpl: Found ${prsToUpdate.size} open PRs to update`);
  if (prsToUpdate.size === 0) {
    logger.info('No open PRs found to update.');
    return;
  }

  // Display PRs to be updated and get confirmation
  logger.info('\nThe following PRs will have their base branches and descriptions updated:');
  for (const branch of prsToUpdate) {
    const prNumber = prToNumber.get(branch)!;
    logger.info(`  ${branch.branchName}${createPrTerminalLink(prNumber)}`);
  }

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: 'Would you like to update these PRs?',
    default: false
  }]);

  if (!confirm) {
    logger.info('Update cancelled.');
    return;
  }

  // Update PR descriptions and base branches
  logger.info('Updating PRs...\n');

  const promises: Promise<unknown>[] = [];

  for (const branch of prsToUpdate) {
    const updatePr = new Promise(async () => {
      logger.debug(`syncPrImpl: Processing PR for branch "${branch.branchName}"`);
      const parentPrNumber = prToNumber.get(branch.parent!);
      const tableStr = getTableStr({
        branchName: branch.parent!.branchName,
        prNumber: parentPrNumber
      }, branch.children.map(child => ({
        branchName: child.branchName,
        prNumber: prToNumber.get(child)
      })));

      const prNumber = prToNumber.get(branch)!;

      logger.info(`Updating PR: ${branch.branchName}${createPrTerminalLink(prNumber)}...`);

      // Update PR description with relationship table
      logger.debug(`syncPrImpl: Updating description for PR #${prNumber}`);
      await upsertPrDescription(prNumber, tableStr);

      // Sometimes the parent is different for the basebranch like with split branches
      // we want to point to the parent of the root not to the empty commit itself
      const baseBranch = await getBaseBranch(branch);
      logger.debug(`syncPrImpl: Base branch for "${branch.branchName}": ${baseBranch?.branchName || 'none'}`);

      let success = false;

      if (baseBranch) {
        // Update PR base branch
        logger.debug(`syncPrImpl: Updating base branch for PR #${prNumber} to "${baseBranch.branchName}"`);
        const response = await updateBaseBranch(prNumber, baseBranch!.branchName);
        success = response.success;
      }

      if (success) {
        logger.debug(`syncPrImpl: Successfully updated PR #${prNumber}`);
        logger.info(`PR ${createPrTerminalLink(prNumber)} updated.`);
        return;
      }

      logger.debug(`syncPrImpl: Failed to update base branch for PR #${prNumber}`);
      logger.info(`Base branch (${branch.parent!.branchName}) not found. PR ${createPrTerminalLink(prNumber)} base branch set to main.`);
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
async function getBaseBranch(branch: Branch) {
  logger.debug(`getBaseBranch: Determining base branch for "${branch.branchName}"`);
  const parent = branch.parent;

  if (!parent) {
    logger.debug('getBaseBranch: No parent found');
    return parent;
  }

  const tags = execSync(`git tag --points-at ${parent.branchName}`).toString().split('\n');
  const splitBranchTag = tags.find(tag => isSplitBranchTag(tag));

  if (splitBranchTag) {
    logger.debug(`getBaseBranch: Found split branch tag "${splitBranchTag}", getting parent of parent`);
    return await getParentBranch(parent.branchName);
  }

  logger.debug(`getBaseBranch: Using parent "${parent.branchName}" as base`);
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