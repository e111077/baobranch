import { execSync, type StdioOptions } from 'child_process';
import type { ArgumentsCamelCase, BuilderCallback, CommandModule } from 'yargs';
import { loadState, saveState } from './branch-state/state.js';
import { join } from 'path';

export interface Command<T = any, U = {}> {
  command: string|string[];
  description: string;
  impl: (argv: ArgumentsCamelCase<T>) => void;
  builder?: CommandModule<U, T>['builder']|BuilderCallback<U , T>;
}

export interface Branch {
  prNumber: number | null;
  prStatus: PRStatus;
  branchName: string;
  parent: Branch | null;
  children: Branch[];
  orphaned: boolean;
}

export type PRStatus = 'OPEN'|'MERGED'|'CLOSED'|'DRAFT'|'unknown';

/**
 * Type guard to check if an error is an ExecError
 */
interface ExecError extends Error {
  status: number;
}

/**
 * Executes a shell command and returns its output
 * @param command - The shell command to execute
 * @param throwOnError - Whether to throw an error if the command fails
 * @returns The command output as a string
 * @throws If throwOnError is true and the command fails with a non-zero exit code
 */
export function execCommand(command: string, throwOnError: boolean = false): string {
  try {
    const options: { encoding: 'utf8', stdio: StdioOptions } = {
      encoding: 'utf8',
      stdio: throwOnError ? ['inherit', 'inherit', 'pipe'] : 'pipe'
    };
    return execSync(command, options).toString().trim();
  } catch (error) {
    if (throwOnError && isExecError(error)) {
      throw error;
    }
    return '';
  }
}

function isExecError(error: unknown): error is ExecError {
  return error instanceof Error && 'status' in error;
}

/**
 * Retrieves the PR number for a given branch
 * @param branch - The name of the branch
 * @returns The PR number as a string, or empty string if no PR exists
 */
export function getPrNumber(branch: string): number | null {
  const prNum = execCommand(`gh pr list --head "${branch}" --state all --json number --jq '.[0].number'`);
  return prNum === '' ? null : Number(prNum);
}

/**
 * Retrieves the status of a given PR
 *
 * @param prNum The PR number to get the status of
 * @returns The status of the PR
 */
export function getPrStatus(prNum: number): PRStatus {
  return execCommand(`gh pr view ${prNum} --json state --jq '.state'`) as PRStatus;
}

/**
 * Gets the parent branch information for a given branch
 * @param branchName - The name of the branch to find the parent for
 * @returns A Branch object representing the parent branch
 */
export function getParentBranch(branchName: string): Branch {
  // Get previous commit
  const previousCommit = execCommand(`git rev-parse ${branchName}^`);
  // Get branch name for that commit
  const branchNameParts = execCommand(`git name-rev --name-only ${previousCommit}`).split('/');
  let parentBranchName = branchNameParts[branchNameParts.length - 1];

  if (!parentBranchName || parentBranchName === 'HEAD') {
    const mainExists = execCommand('git rev-parse --verify main 2>/dev/null') !== '';
    parentBranchName = mainExists ? 'main' : 'master';
  }

  const prNumber = getPrNumber(parentBranchName);
  const parentChildren = findChildren(parentBranchName);

  return {
    branchName: parentBranchName,
    prNumber: prNumber,
    prStatus: prNumber === null ? 'unknown' : getPrStatus(prNumber),
    parent: null,
    children: parentChildren,
    orphaned: parentChildren[0]?.parent?.orphaned || false
  };
}

/**
 * Finds all child branches of a given parent branch
 * @param parentBranchName - The name of the parent branch
 * @returns An array of Branch objects representing the child branches
 */
export function findChildren(parentBranchName: string): Branch[] {

  const state = loadState();
  const stateChildren = state.branches[parentBranchName]?.children || [];

  // Get current children from git
  const allBranches = execCommand('git for-each-ref refs/heads/ --format="%(refname:short)"')
    .split('\n')
    .filter(Boolean);

  const currentChildren = allBranches
    .filter(branchName => branchName !== parentBranchName)
    .filter(branchName => {
      // Instead of checking for any divergent commits, we should:
      // 1. Find the merge base (common ancestor) of the two branches
      // 2. Check if that merge base is the same as the parent's HEAD

      // Get merge base
      const mergeBaseCmd = `git merge-base ${parentBranchName} ${branchName}`;
      const mergeBase = execCommand(mergeBaseCmd);

      // Get parent's HEAD commit
      const parentHeadCmd = `git rev-parse ${parentBranchName}`;
      const parentHead = execCommand(parentHeadCmd);

      const isChild = mergeBase === parentHead;

      if (isChild) {
        state.branches[branchName] = {
          ...state.branches[branchName] || {},
          parent: parentBranchName,
          children: state.branches[branchName]?.children || [],
          orphaned: false
        };
      }

      return isChild;
    });

  const allChildren = Array.from(new Set([...stateChildren, ...currentChildren]));

  // Update parent's children in state
  state.branches[parentBranchName] = {
    ...state.branches[parentBranchName] || {},
    children: allChildren
  };

  saveState(state);
  const prNumber = getPrNumber(parentBranchName);
  const parent: Branch = {
    branchName: parentBranchName,
    prNumber: prNumber,
    prStatus: prNumber === null ? 'unknown' : getPrStatus(prNumber),
    parent: null,
    children: [],
    orphaned: state.branches[parentBranchName]?.orphaned || false
  }

  return allChildren.map(childBranch => {
    const prNumber = getPrNumber(childBranch);
    const child = {
      branchName: childBranch,
      prNumber,
      prStatus: prNumber === null ? 'unknown' : getPrStatus(prNumber),
      parent: parent,
      children: [],
      orphaned: state.branches[childBranch]?.orphaned || false,
    };

    parent.children.push(child);

    return child;
  });
}

/**
 * Gets the domain of the GitHub repository
 *
 * @returns The domain of the GitHub repository
 */
function getGithubUrl(): string {
  const remoteUrl = execCommand('git remote get-url origin')
    // remove .git from the end of the URL
    .replace(/.git$/, '');
  if (remoteUrl.startsWith('https://')) {
    // For HTTPS remotes: https://github.com/org/repo
    return remoteUrl;
  } else {
    // For SSH remotes: git@github.com:org/repo
    const [domain, orgAndRepo] = remoteUrl.split('@')[1].split(':');

    return `https://${domain}/${orgAndRepo}`;
  }
}

/**
 * Creates a markdown link to a PR
 * @param branch - The name of the branch
 * @param prNum - The PR number
 * @returns A markdown formatted link to the PR
 */
export function createPrLink(branch: string, prNum: number): string {
  return prNum ? `[#${prNum}](${getGithubUrl()}/pull/${prNum})` : branch;
}

const GIT_ROOT = execCommand('git rev-parse --git-dir');

/**
 * The path to the user's .git/env file
 */
export const USER_ENV_LOCATION = join(GIT_ROOT, 'figbranch-user-env');

/**
 * Determines the state of a branch and returns a string representing its state
 * as formatted annotations
 *
 * @param branch The branch from which to get annotations
 * @returns A string containing annotations for the branch
 */
export function getBranchListAnnotations(branch: Branch) {
  const prStatusString = branch.prStatus !== 'unknown' ? `${branch.prStatus}` : '';
  const orphanedString = branch.orphaned ? 'orphaned?' : '';
  const joinedAnnotations = [prStatusString, orphanedString].filter(Boolean).join(' ').trim();
  return joinedAnnotations ? ` (${joinedAnnotations})` : '';
};