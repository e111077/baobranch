import { execCommand } from "../utils.js";

// Pull Request status types
export type PRStatus = 'OPEN' | 'MERGED' | 'CLOSED' | 'DRAFT' | 'unknown';

/**
 * Gets the PR number associated with a branch using GitHub CLI
 */
export function getPrNumber(branch: string): number | null {
  const prNum = execCommand(`gh pr list --head "${branch}" --state all --json number --jq '.[0].number'`);
  return prNum === '' ? null : Number(prNum);
}

/**
 * Gets the current status of a PR using GitHub CLI
 */
export function getPrStatus(prNum: number): PRStatus {
  return execCommand(`gh pr view ${prNum} --json state --jq '.state'`) as PRStatus;
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
export function updateBaseBranch(prNum: number, baseBranch: string): {success: boolean, error?: Error} {
  try {
    execCommand(`gh pr edit ${prNum} --base ${baseBranch}`, true,{ stdio: ['pipe', 'pipe', 'pipe'] });
    return {success: true};
  } catch (error: unknown) {
    return {success: false, error: error as Error};
  }
}