/**
 * @module evolve
 * @description Handles rebasing branches onto their parent branches while maintaining branch relationships.
 * This module provides functionality for evolving branches in different scopes:
 * - self: Only evolves the current branch
 * - directs: Evolves current branch and direct descendants
 * - full: Evolves current branch and all descendants
 */

import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { evolveSelfImpl } from "./self.js";
import type { EvolveOptions } from "./options.js";
import {
  clearAllEvolveTags,
  getEvolveStatus,
  tagEvolveBranches,
  generateEvolveTag
} from "../../tags/evolve-status.js";
import { execCommand, logger } from "../../utils.js";
import { rebaseImpl } from "../rebase/index.js";
import { getParentBranch } from "../../tree-nav/parent.js";

/**
 * Main implementation of the evolve command
 * @param options - Command line arguments and options
 */
async function evolveImpl(options: ArgumentsCamelCase<EvolveOptions>) {
  logger.debug(`evolveImpl: Starting with scope="${options.scope}", continue=${options.continue}, abort=${options.abort}`);

  // Handle abort case
  if (options.abort) {
    logger.debug('evolveImpl: Aborting evolve operation');
    clearAllEvolveTags();
    await evolveSelfImpl(options);
    return;
  }

  const status = getEvolveStatus();
  logger.debug(`evolveImpl: Current status: ${status ? `step=${status.step}, scope=${status.scope}` : 'none'}`);
  const isContinuingSelf = options.continue && status?.scope === 'self';

  // Handle self evolution
  if (options.scope === 'self' || isContinuingSelf) {
    logger.debug('evolveImpl: Running self evolution');
    await evolveSelfImpl(options);
    clearAllEvolveTags();
    return;
  }

  const initialBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  logger.debug(`evolveImpl: Initial branch is "${initialBranch}"`);

  // Handle continue case
  if (status && options.continue) {
    logger.info('Resuming evolve operation...');
    logger.debug(`evolveImpl: Continuing from step ${status.step}`);
    const tagToResume = generateEvolveTag(status.step, status.scope);
    const branchToResume = execCommand(`git branch --format="%(refname:short)" --points-at ${tagToResume}`).trim();
    logger.debug(`evolveImpl: Resuming at branch "${branchToResume}"`);
    const rebaseInProgress = execCommand(
      `git status | grep -E '(all conflicts fixed: run "git rebase --continue")|(fix conflicts and then run "git rebase --continue")'`
    );
    const flag = rebaseInProgress ? 'continue' : null;
    logger.debug(`evolveImpl: Rebase in progress: ${!!rebaseInProgress}, flag: ${flag}`);

    await evolveChain({
      currentBranch: branchToResume,
      scope: options.scope,
      flag,
      step: status.step
    });

    logger.debug(`evolveImpl: Checking out initial branch "${initialBranch}"`);
    execCommand(`git checkout ${initialBranch}`);
    return;
  }

  // Handle new evolution
  logger.debug('evolveImpl: Starting new evolution, tagging branches');
  await tagEvolveBranches(initialBranch, options.scope);

  // Determine rebase target when evolving from HEAD/main/master
  const isMasterOrMain = initialBranch === 'master' || initialBranch === 'main';
  const isBranchlessHead = initialBranch === 'HEAD';
  let explicitRebaseTarget: string | undefined;

  if (isMasterOrMain || isBranchlessHead) {
    logger.debug('evolveImpl: Evolving from HEAD/main/master, determining explicit rebase target');
    try {
      const parent = await getParentBranch('HEAD');
      explicitRebaseTarget = parent.branchName;
      logger.debug(`evolveImpl: Explicit rebase target: ${explicitRebaseTarget} (stale: ${parent.stale})`);
      logger.info(`Child branches will be rebased onto: ${parent.branchName}${parent.stale ? ' (stale reference)' : ''}`);
    } catch {
      // If we can't determine parent, let each branch find its own parent
      logger.debug('evolveImpl: Could not determine parent, branches will find their own parent');
      logger.info('Could not determine parent branch; each branch will find its own parent');
    }
  }

  logger.debug('evolveImpl: Starting evolve chain');
  await evolveChain({
    currentBranch: initialBranch,
    scope: options.scope,
    flag: null,
    explicitRebaseTarget
  });

  logger.debug(`evolveImpl: Checking out initial branch "${initialBranch}"`);
  execCommand(`git checkout ${initialBranch}`);
}

/**
 * Recursively evolves a chain of branches
 * @param params - Parameters for chain evolution
 * @param params.currentBranch - The branch currently being evolved
 * @param params.scope - The scope of evolution (full or directs)
 * @param params.flag - Optional flag for rebase operation
 * @param params.step - Current step in the evolution process
 * @param params.explicitRebaseTarget - When set, child branches will be rebased onto this target instead of finding their own parent
 */
async function evolveChain({
  currentBranch,
  scope,
  flag,
  step = 0,
  explicitRebaseTarget
}: {
  currentBranch: string;
  scope: 'full' | 'directs';
  flag: 'continue' | null;
  step?: number;
  explicitRebaseTarget?: string;
}): void {
  logger.debug(`evolveChain: Processing branch "${currentBranch}" at step ${step}, flag=${flag}`);
  const isMasterOrMain = currentBranch === 'master' || currentBranch === 'main';
  const isBranchlessHead = currentBranch === 'HEAD';
  const isInitialBranch = isMasterOrMain || isBranchlessHead;

  // Determine the rebase target
  let parent: string;
  if (flag === 'continue') {
    parent = '';
    logger.debug('evolveChain: Flag is continue, skipping parent determination');
  } else if (explicitRebaseTarget && !isInitialBranch) {
    // Use explicit target for child branches when evolving from HEAD/main/master
    parent = explicitRebaseTarget;
    logger.debug(`evolveChain: Using explicit rebase target: ${parent}`);
  } else if (isMasterOrMain) {
    parent = currentBranch;
    logger.debug(`evolveChain: Branch is main/master, using self as parent: ${parent}`);
  } else {
    parent = (await getParentBranch(currentBranch)).branchName;
    logger.debug(`evolveChain: Determined parent for "${currentBranch}": ${parent}`);
  }

  // don't do a rebase, just go to next branch if is master or main because we
  // never tag it as in-progress evolve
  if (!isMasterOrMain && !isBranchlessHead) {
    logger.debug(`evolveChain: Rebasing "${currentBranch}" onto "${parent}"`);
    // Rebase current branch onto parent
    await rebaseImpl({
      from: currentBranch,
      to: parent,
      flag,
      silent: true
    });

    // Clean up completed step
    const tagToDelete = generateEvolveTag(step, scope);
    logger.debug(`evolveChain: Deleting completed tag: ${tagToDelete}`);
    execCommand(`git tag -d ${tagToDelete}`);

    step++;
  }

  // Find next branch to evolve
  const nextTag = generateEvolveTag(step, scope);
  logger.debug(`evolveChain: Looking for next branch at tag: ${nextTag}`);
  const nextBranch = execCommand(`git branch --format="%(refname:short)" --points-at ${nextTag}`).trim();

  if (!nextBranch) {
    logger.debug('evolveChain: No more branches to evolve');
    logger.info('Evolve operation complete.');
    clearAllEvolveTags();
    return;
  }

  logger.debug(`evolveChain: Found next branch: ${nextBranch}`);
  // Continue chain with next branch
  await evolveChain({
    currentBranch: nextBranch,
    scope,
    flag: null,
    step,
    explicitRebaseTarget
  });
}

/**
 * Command configuration for the evolve feature
 * @example
 * // Evolve only the current branch
 * fb evolve --scope self
 *
 * @example
 * // Evolve current branch and direct descendants
 * fb evolve --scope directs
 *
 * @example
 * // Continue evolve after resolving conflicts
 * fb evolve --continue
 */
export const evolve: CommandModule<{}, EvolveOptions> = {
  command: 'evolve',
  describe: 'Rebase the current orphaned branch onto a fresh reference of its parent branch as well as all of its descendants',
  builder: (yargs: Argv): Argv<EvolveOptions> =>
    yargs
      .option('continue', {
        describe: 'Continue the evolve after resolving rebase conflicts',
        type: 'boolean'
      })
      .option('abort', {
        describe: 'Abort the current rebase taking place in the evolve operation. (This will only abort the current rebase and not the entire evolve operation)',
        type: 'boolean'
      })
      .option('scope', {
        describe: 'The scope of the rebase operation. Self only evolves the current branch, directs evolves the current branch and its direct descendants, full evolves the current branch and all its direct and orphaned descendants',
        choices: ['self', 'directs', 'full'] as const,
        default: 'full' as const,
        type: 'string'
      }),
  handler: evolveImpl
};