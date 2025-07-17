/**
 * @module evolve-status
 * @description Manages Git tags for tracking the progress of branch evolution operations.
 * These tags are used to track which branches need to be evolved and in what order.
 */

import inquirer from "inquirer";
import { findChildren } from "../tree-nav/children.js";
import { execCommand } from "../utils.js";

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
  const evolveTags = execCommand(`git tag --list | grep -E "${generateEvolveTag('.+?', '.+?')}"`)
    .split('\n')
    .filter(Boolean);

  if (evolveTags.length === 0) {
    return null;
  }

  const evolveNums = evolveTags
    .map(tag => parseEvolveTag(tag).step)
    .sort((a, b) => a - b);
  const scope = parseEvolveTag(evolveTags[0]).scope as 'self' | 'full' | 'directs';

  return { step: evolveNums[0], scope };
}

/**
 * Tags branches for evolution in the specified scope
 * @param {string} branch - The starting branch name
 * @param {'full' | 'directs'} scope - The scope of evolution
 * @throws Will exit process if evolve is in progress or if attempting to evolve main/master
 */
export async function tagEvolveBranches(branch: string, scope: 'full' | 'directs') {
  // Check if evolve is already in progress
  if (getEvolveStatus() !== null) {
    console.error('Evolve currently in progress. Please complete or abort before starting a new one.');
    process.exit(1);
  }

  const isMasterOrMain = branch === 'master' || branch === 'main';
  const isBranchlessHead = branch === 'HEAD';
  const shouldSkipCurrentBranch = isMasterOrMain || isBranchlessHead;

  // Prevent evolving main/master branches, enqueue children instead
  let queue = shouldSkipCurrentBranch ? await enqueueQualifiedEvolveChildren(branch, scope, []) : [branch];
  let count = 0;

  if (shouldSkipCurrentBranch && queue.length) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `You are attempting to evolve from ${
        isBranchlessHead ? 'a HEAD without a branch': `the ${branch} branch`
      } which will evolve the following branches and all their descendants:
${queue.join('\n')}

Are you sure you want to continue?`,
      default: false
    }]);

    if (!confirm) {
      console.log('Evolve aborted');
      process.exit(0);
    }
  }

  // Process branches breadth-first
  while (queue.length) {
    const currentBranch = queue.shift()!;
    execCommand(`git tag ${generateEvolveTag(count, scope)} ${currentBranch}`);
    count++;

    // Add child branches to queue based on scope
    await enqueueQualifiedEvolveChildren(currentBranch, scope, queue);
  }
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
  const children = await findChildren(branch);
  children.forEach(child => {
    if (scope === 'directs' && child.orphaned) {
      return;
    }
    queue.push(child.branchName);
  });

  return queue;
}

/**
 * Removes all evolve-related tags from the repository
 */
export function clearAllEvolveTags(): void {
  execCommand(`git tag --list | grep -E '${generateEvolveTag('.+?', '.+?')}' | xargs git tag -d`);
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