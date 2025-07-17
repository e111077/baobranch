/**
 * @module evolve/self
 * Implements self-evolution of a single branch by rebasing it onto its parent
 */

import type { ArgumentsCamelCase } from "yargs";
import { execCommand } from "../../utils.js";
import { getParentBranch } from "../../tree-nav/parent.js";
import { rebaseImpl } from '../rebase/index.js';
import type { EvolveOptions } from "./options.js";

/**
 * Evolves a single branch by rebasing it onto its parent
 *
 * This function:
 * 1. Gets the current branch name
 * 2. Finds its parent branch
 * 3. Performs a rebase operation onto the parent
 *
 * @param options - Command options from yargs
 * @param options.continue - Whether to continue a previous rebase
 * @param options.abort - Whether to abort the current rebase
 *
 * @example
 * // Normal evolution
 * evolveSelfImpl({ scope: 'self' });
 *
 * @example
 * // Continue after resolving conflicts
 * evolveSelfImpl({ scope: 'self', continue: true });
 */
export async function evolveSelfImpl(options: ArgumentsCamelCase<EvolveOptions>) {
    // Get current branch name
    const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
    const parent = getParentBranch(currentBranch);
    const flag = options.continue ? 'continue' : options.abort ? 'abort' : null;

    await rebaseImpl({ from: currentBranch, to: parent.branchName, flag });
}