import { execSync, type StdioOptions } from 'child_process';
import type { ArgumentsCamelCase, BuilderCallback, CommandModule } from 'yargs';
import { loadState, saveState } from './branch-state/state.js';

export interface Command<T = any, U = {}> {
  command: string|string[];
  description: string;
  impl: (argv: ArgumentsCamelCase<T>) => void;
  builder?: CommandModule<U, T>['builder']|BuilderCallback<U , T>;
}

export interface Branch {
  prNumber: number | null;
  branchName: string;
  parent: Branch | null;
  children: Branch[];
  orphaned: boolean;
}

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
 * Gets the parent branch information for a given branch
 * @param branchName - The name of the branch to find the parent for
 * @returns A Branch object representing the parent branch
 */
export function getParentBranch(branchName: string): Branch {
  let parentBranchName = execCommand(`git reflog show "${branchName}" | grep 'branch: Created from' | head -n1`)
    .replace(/.*Created from /, '');

  if (!parentBranchName || parentBranchName === 'HEAD') {
    parentBranchName = execCommand('git rev-parse --verify main >/dev/null 2>&1') ? 'main' : 'master';
  }

  const prNumber = getPrNumber(parentBranchName);

  // First, find children of the parent to update the cache
  const parentChildren = findChildren(parentBranchName);

  return {
    branchName: parentBranchName,
    prNumber: prNumber,
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
  // Mark all existing children as orphaned first
  if (stateChildren) {
    stateChildren.forEach(childBranch => {
      if (state.branches[childBranch]) {
        state.branches[childBranch].orphaned = true;
      }
    });
  }

  // Get current children from git
  const allBranches = execCommand('git for-each-ref refs/heads/ --format="%(refname:short)"')
    .split('\n')
    .filter(Boolean);

  const currentChildren = allBranches
    .filter(branchName => branchName !== parentBranchName)
    .filter(branchName => {
      // Get the first parent commit that's not in the child branch
      const revListCmd = `git rev-list ${parentBranchName} --not ${branchName} --first-parent --max-count=1`;
      const firstParentNotInChild = execCommand(revListCmd);
      const isChild = !firstParentNotInChild;

      // If it's a child, update state
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
  const parent: Branch = {
    branchName: parentBranchName,
    prNumber: getPrNumber(parentBranchName),
    parent: null,
    children: [],
    orphaned: state.branches[parentBranchName]?.orphaned || false
  }

  return allChildren.map(childBranch => {
    const prNumber = getPrNumber(childBranch);
    const child = {
      branchName: childBranch,
      prNumber,
      parent: parent,
      children: [],
      orphaned: state.branches[childBranch]?.orphaned || false,
    };

    parent.children.push(child);

    return child;
  });
}

/**
 * Creates a markdown link to a PR
 * @param branch - The name of the branch
 * @param prNum - The PR number
 * @returns A markdown formatted link to the PR
 */
export function createPrLink(branch: string, prNum: number): string {
  const repoName = execCommand('git remote get-url origin').replace(/.*\/([^/]*)\.git$/, '$1');
  return prNum ? `[#${prNum}](https://${process.env['GITHUB_DOMAIN']}/${repoName}/pull/${prNum})` : branch;
}