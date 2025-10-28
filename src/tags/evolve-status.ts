/**
 * @module evolve-status
 * @description Manages Git tags for tracking the progress of branch evolution operations.
 * These tags are used to track which branches need to be evolved and in what order.
 */

import inquirer from "inquirer";
import { findChildren } from "../tree-nav/children.js";
import { execCommand, logger } from "../utils.js";
import { getParentBranch } from "../tree-nav/parent.js";

/**
 * Represents the current status of an evolve operation
 * @typedef {Object} EvolveStatus
 * @property {number} step - The current step number in the evolution process
 * @property {'self' | 'full' | 'directs'} scope - The scope of the evolution
 */

/**
 * Retrieves the current status of an ongoing evolve operation
 * @returns {EvolveStatus | null} The current evolve status or null if no evolve is in progress
 */
export function getEvolveStatus(): { step: number, scope: 'self' | 'full' | 'directs' } | null {
  logger.debug('getEvolveStatus: Checking for existing evolve tags');
  const evolveTags = execCommand(`git tag --list | grep -E "${generateEvolveTag('.+?', '.+?')}"`)
    .split('\n')
    .filter(Boolean);

  if (evolveTags.length === 0) {
    logger.debug('getEvolveStatus: No evolve tags found');
    return null;
  }

  logger.debug(`getEvolveStatus: Found ${evolveTags.length} evolve tags: ${evolveTags.join(', ')}`);
  const evolveNums = evolveTags
    .map(tag => parseEvolveTag(tag).step)
    .sort((a, b) => a - b);
  const scope = parseEvolveTag(evolveTags[0]).scope as 'self' | 'full' | 'directs';

  logger.debug(`getEvolveStatus: Current evolve status - step: ${evolveNums[0]}, scope: ${scope}`);
  return { step: evolveNums[0], scope };
}

/**
 * Tags branches for evolution in the specified scope
 * @param {string} branch - The starting branch name
 * @param {'full' | 'directs'} scope - The scope of evolution
 * @throws Will exit process if evolve is in progress or if attempting to evolve main/master
 */
export async function tagEvolveBranches(branch: string, scope: 'full' | 'directs') {
  logger.debug(`tagEvolveBranches: Tagging branches for evolve, branch="${branch}", scope="${scope}"`);

  // Check if evolve is already in progress
  if (getEvolveStatus() !== null) {
    logger.debug('tagEvolveBranches: Evolve already in progress');
    logger.error('Evolve currently in progress. Please complete or abort before starting a new one.');
    process.exit(1);
  }

  const isMasterOrMain = branch === 'master' || branch === 'main';
  const isBranchlessHead = branch === 'HEAD';
  const shouldSkipCurrentBranch = isMasterOrMain || isBranchlessHead;
  logger.debug(`tagEvolveBranches: shouldSkipCurrentBranch=${shouldSkipCurrentBranch}`);

  // Prevent evolving main/master branches, enqueue children instead
  let queue = shouldSkipCurrentBranch ? await enqueueQualifiedEvolveChildren(branch, scope, []) : [branch];
  logger.debug(`tagEvolveBranches: Initial queue has ${queue.length} branches: ${queue.join(', ')}`);
  let count = 0;

  if (shouldSkipCurrentBranch && queue.length) {
    const currentCommit = execCommand('git rev-parse --short HEAD').trim();

    // Determine what the branches will be rebased onto
    let rebaseTarget: string;
    let rebaseTargetDesc: string;
    try {
      const parent = await getParentBranch('HEAD');
      if (parent.stale) {
        rebaseTarget = `${parent.branchName} (stale reference)`;
        rebaseTargetDesc = `stale reference to ${parent.branchName}`;
      } else {
        rebaseTarget = parent.branchName;
        rebaseTargetDesc = `branch ${parent.branchName}`;
      }
    } catch {
      // If we can't determine a parent, fall back to the current commit
      rebaseTarget = currentCommit;
      rebaseTargetDesc = `current commit ${currentCommit}`;
    }

    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `You are attempting to evolve from ${
        isBranchlessHead ? 'a HEAD without a branch': `the ${branch} branch`
      } which will rebase the following branches (and all their descendants) onto the ${rebaseTargetDesc}:
${queue.join('\n')}

Are you sure you want to continue?`,
      default: false
    }]);

    if (!confirm) {
      logger.info('Evolve aborted');
      process.exit(0);
    }
  }

  // Process branches breadth-first
  logger.debug('tagEvolveBranches: Processing branches breadth-first');
  while (queue.length) {
    const currentBranch = queue.shift()!;
    const tag = generateEvolveTag(count, scope);
    logger.debug(`tagEvolveBranches: Tagging branch "${currentBranch}" with tag "${tag}"`);
    execCommand(`git tag ${tag} ${currentBranch}`);
    count++;

    // Add child branches to queue based on scope
    await enqueueQualifiedEvolveChildren(currentBranch, scope, queue);
  }
  logger.debug(`tagEvolveBranches: Finished tagging ${count} branches for evolve`);
}

/**
 * Finds the child branches of a given branch and filters them based on the
 * scope of the evolve operation. Then enqueues them onto the queue and returns
 * the mutated queue.
 *
 * @param branch Branch from which to find children
 * @param scope The scope of the evolve operation
 * @param queue The current queue to enqueue onto
 * @returns The mutated queue
 */
async function enqueueQualifiedEvolveChildren(branch: string, scope: 'full' | 'directs', queue: string[]) {
  logger.debug(`enqueueQualifiedEvolveChildren: Finding children for branch "${branch}" with scope "${scope}"`);
  const children = await findChildren(branch);
  logger.debug(`enqueueQualifiedEvolveChildren: Found ${children.length} children for "${branch}"`);

  let addedCount = 0;
  children.forEach(child => {
    if (scope === 'directs' && child.orphaned) {
      logger.debug(`enqueueQualifiedEvolveChildren: Skipping orphaned child "${child.branchName}" in directs scope`);
      return;
    }
    logger.debug(`enqueueQualifiedEvolveChildren: Adding child "${child.branchName}" to queue`);
    queue.push(child.branchName);
    addedCount++;
  });

  logger.debug(`enqueueQualifiedEvolveChildren: Added ${addedCount} children to queue`);
  return queue;
}

/**
 * Removes all evolve-related tags from the repository
 */
export function clearAllEvolveTags(): void {
  logger.debug('clearAllEvolveTags: Clearing all evolve tags');
  execCommand(`git tag --list | grep -E '${generateEvolveTag('.+?', '.+?')}' | xargs git tag -d`);
  logger.debug('clearAllEvolveTags: All evolve tags cleared');
}

/**
 * Generates an evolve tag name for a specific step and scope
 * @param {number} step - The evolution step number
 * @param {string} scope - The scope of evolution
 * @returns {string} The formatted tag name
 * @example
 * generateEvolveTag(0, 'self') // Returns "bbranch-evolve-{{chain}}-{{0}}"
 */
export function generateEvolveTag(step: number|string, scope: string): string {
  return `bbranch-evolve-{{${scope}}}-{{${step}}}`;
}

export function parseEvolveTag(tag: string) {
  const regex = new RegExp(generateEvolveTag('(.+?)', '(.+?)'));
  const [_, scope, step] = tag.match(regex) ?? [];
  return { scope, step: parseInt(step) };
}