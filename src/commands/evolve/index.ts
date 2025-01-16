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
import { execCommand } from "../../utils.js";
import { rebaseImpl } from "../rebase/index.js";
import { getParentBranch } from "../../tree-nav/parent.js";
import { makeMergeBaseTag } from "../../tags/merge-base-master.js";

/**
 * Main implementation of the evolve command
 * @param options - Command line arguments and options
 */
async function evolveImpl(options: ArgumentsCamelCase<EvolveOptions>) {
  // Handle abort case
  if (options.abort) {
    clearAllEvolveTags();
    evolveSelfImpl(options);
    return;
  }

  const status = getEvolveStatus();
  const isContinuingSelf = options.continue && status?.scope === 'self';

  // Handle self evolution
  if (options.scope === 'self' || isContinuingSelf) {
    evolveSelfImpl(options);
    clearAllEvolveTags();
    return;
  }

  const initialBranch = execCommand('git rev-parse --abbrev-ref HEAD');

  // Handle continue case
  if (status && options.continue) {
    console.log('Resuming evolve operation...');
    const tagToResume = generateEvolveTag(status.step, status.scope);
    const branchToResume = execCommand(`git branch --format="%(refname:short)" --points-at ${tagToResume}`).trim();
    const rebaseInProgress = execCommand(
      `git status | grep -E '(all conflicts fixed: run "git rebase --continue")|(fix conflicts and then run "git rebase --continue")'`
    );
    const flag = rebaseInProgress ? 'continue' : null;

    evolveChain({
      currentBranch: branchToResume,
      scope: options.scope,
      flag,
      step: status.step
    });

    execCommand(`git checkout ${initialBranch}`);
    return;
  }

  // Handle new evolution
  await tagEvolveBranches(initialBranch, options.scope);

  evolveChain({
    currentBranch: initialBranch,
    scope: options.scope,
    flag: null
  });

  execCommand(`git checkout ${initialBranch}`);
}

/**
 * Recursively evolves a chain of branches
 * @param params - Parameters for chain evolution
 * @param params.currentBranch - The branch currently being evolved
 * @param params.scope - The scope of evolution (full or directs)
 * @param params.flag - Optional flag for rebase operation
 * @param params.step - Current step in the evolution process
 */
function evolveChain({
  currentBranch,
  scope,
  flag,
  step = 0
}: {
  currentBranch: string;
  scope: 'full' | 'directs';
  flag: 'continue' | null;
  step?: number;
}): void {
  const isMasterOrMain = currentBranch === 'master' || currentBranch === 'main';
  const isBranchlessHead = currentBranch === 'HEAD';

  const parent = flag === 'continue' ?
    {branchName: ''} :
    getParentBranch(currentBranch);

  // don't do a rebase, just go to next branch if is master or main because we
  // never tag it as in-progress evolve
  if (!isMasterOrMain && !isBranchlessHead) {
    // Rebase current branch onto parent
    rebaseImpl({
      from: currentBranch,
      to: parent.branchName,
      flag,
      silent: true
    });

    // Clean up completed step
    execCommand(`git tag -d ${generateEvolveTag(step, scope)}`);

    step++;
  }

  // Find next branch to evolve
  const nextBranch = execCommand(`git branch --format="%(refname:short)" --points-at ${generateEvolveTag(step, scope)}`).trim();

  if (!nextBranch) {
    console.log('Evolve operation complete.');
    clearAllEvolveTags();
    return;
  }

  // Continue chain with next branch
  evolveChain({
    currentBranch: nextBranch,
    scope,
    flag: null,
    step
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