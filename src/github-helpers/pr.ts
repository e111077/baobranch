import { execCommand, execCommandAsync, logger } from "../utils.js";

// Pull Request status types
export type PRStatus = 'OPEN' | 'MERGED' | 'CLOSED' | 'DRAFT' | 'unknown';

/**
 * Gets the PR number associated with a branch using GitHub CLI
 */
export function getPrNumber(branch: string): number | null {
  logger.debug(`getPrNumber: Looking up PR for branch "${branch}"`);
  const prNum = execCommand(`gh pr list --head "${branch}" --state all --json number --jq '.[0].number'`);
  const result = prNum === '' ? null : Number(prNum);
  logger.debug(`getPrNumber: Branch "${branch}" has PR ${result ?? 'none'}`);
  return result;
}

/**
 * Gets the current status of a PR using GitHub CLI
 */
export function getPrStatus(prNum: number): PRStatus {
  logger.debug(`getPrStatus: Getting status for PR #${prNum}`);
  const status = execCommand(`gh pr view ${prNum} --json state --jq '.state'`) as PRStatus;
  logger.debug(`getPrStatus: PR #${prNum} status is ${status}`);
  return status;
}

/**
 * Updates the base branch of a pull request
 *
 * Attempts to change the base branch of a PR using the GitHub CLI.
 * This is useful when branch hierarchies change and PRs need to be
 * retargeted to new parent branches.
 *
 * @param prNum - The PR number to update
 * @param baseBranch - The new base branch name
 * @returns Object indicating success status and optional error
 *
 * @example
 * // Update PR #123 to target main branch
 * const result = updateBaseBranch(123, 'main');
 * if (!result.success) {
 *   console.error('Failed to update base branch:', result.error);
 * }
 */
export async function updateBaseBranch(prNum: number, baseBranch: string): Promise<{success: boolean, error?: Error}> {
  logger.debug(`updateBaseBranch: Updating PR #${prNum} base branch to "${baseBranch}"`);
  try {
    await execCommandAsync(`gh pr edit ${prNum} --base ${baseBranch}`, true,{ stdio: ['pipe', 'pipe', 'pipe'] });
    logger.debug(`updateBaseBranch: Successfully updated PR #${prNum} base branch`);
    return {success: true};
  } catch (error: unknown) {
    logger.debug(`updateBaseBranch: Failed to update PR #${prNum} base branch: ${(error as Error).message}`);
    return {success: false, error: error as Error};
  }
}