// Core Node.js imports for executing shell commands and handling paths
import { exec, execSync, type StdioOptions } from 'child_process';
import type { ArgumentsCamelCase, BuilderCallback, CommandModule } from 'yargs';
import { join } from 'path';

/**
 * Interface for command configuration used by the CLI
 * @template T - Type for command arguments
 * @template U - Type for command builder options
 */
export interface Command<T = any, U = {}> {
  command: string | string[];
  description: string;
  impl: (argv: ArgumentsCamelCase<T>) => void;
  builder?: CommandModule<U, T>['builder'] | BuilderCallback<U, T>;
}

/**
 * Represents a Git branch and its relationships
 * @property branchName - Name of the branch
 * @property parent - Reference to parent branch or null if root
 * @property children - Array of child branches
 * @property orphaned - Whether the branch is orphaned (parent no longer exists)
 * @property stale - Whether the branch is stale (outdated)
 */
export interface Branch {
  branchName: string;
  parent: Branch | null;
  children: Branch[];
  orphaned: boolean;
  stale: boolean;
}

// Pull Request status types
export type PRStatus = 'OPEN' | 'MERGED' | 'CLOSED' | 'DRAFT' | 'unknown';

/**
 * Interface for shell command execution errors
 */
interface ExecError extends Error {
  status: number;
}

/**
 * Executes a shell command and returns its output
 * @param command - The shell command to execute
 * @param throwOnError - Whether to throw an error if the command fails
 * @returns The command output as a string
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

/**
 * Type guard to check if an error is an ExecError
 */
function isExecError(error: unknown): error is ExecError {
  return error instanceof Error && 'status' in error;
}

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
 * Formats the output of git branch --contains into a Set of branch names
 */
function formatBranchContains(containsOutput: string, branchName: string) {
  return new Set(containsOutput.split('\n')
    .map((branch) => branch.replace('*', '').trim())
    .filter(branch => branch && branch !== branchName));
}

/**
 * Determines the parent branch of a given branch
 * Handles both regular parents and stale parents (tagged with stale-parent)
 */
export function getParentBranch(branchName: string): Branch {
  const parentCommit = execCommand(`git rev-parse ${branchName}^`);
  const parentBranchName = execCommand(`git branch --points-at ${parentCommit}`).trim();

  if (parentBranchName) {
    return {
      branchName: parentBranchName,
      parent: null,
      children: [],
      orphaned: false,
      stale: false,
    };
  }

  // Check for stale parent tags
  const staleTag = execCommand(`git tag --points-at ${parentCommit} | grep -E '^stale-parent--figbranch--.+$'`);
  const staleParentBranch = staleTag.split('--figbranch--')[1];

  return {
    branchName: staleParentBranch,
    parent: null,
    children: [],
    orphaned: false,
    stale: true,
  };
}

/**
 * Finds all child branches of a given parent branch
 * Handles both current children and orphaned children (via stale tags)
 */
export function findChildren(parentBranchName: string): Branch[] {
  // Find current direct children
  const parentCommit = execCommand(`git rev-parse ${parentBranchName}`);
  const possibleCurrentChildren = formatBranchContains(
    execCommand(`git branch --contains ${parentCommit}`),
    parentBranchName
  );

  const currentChildren = new Set<string>();
  possibleCurrentChildren.forEach(child => {
    const actualParentCommit = execCommand(`git rev-parse ${child}^`);
    if (parentCommit === actualParentCommit) {
      currentChildren.add(child);
    }
  });

  // Find orphaned children through stale tags
  const staleTags = execCommand(`git tag | grep -E '^stale-parent--figbranch--${parentBranchName}--figbranch--[0-9]+$'`).split('\n');
  const orphanedChildren = new Set<string>();

  staleTags.forEach(tag => {
    const tagCommit = execCommand(`git rev-parse ${tag}`);
    const children = formatBranchContains(
      execCommand(`git branch --contains $(git rev-parse ${tag})`),
      parentBranchName
    );
    children.forEach(child => {
      const parentCommit = execCommand(`git rev-parse ${child}^`);
      if (parentCommit === tagCommit) {
        orphanedChildren.add(child);
      }
    });
  });

  // Build branch objects for both current and orphaned children
  const children: Branch[] = [];
  const parent: Branch = {
    branchName: parentBranchName,
    parent: null,
    children,
    orphaned: false,
    stale: false,
  };

  const staleParent: Branch = {
    branchName: parentBranchName,
    parent: null,
    children,
    orphaned: false,
    stale: true,
  }

  // Add current children
  currentChildren.forEach(child => {
    children.push({
      branchName: child,
      parent: parent,
      children: [],
      orphaned: false,
      stale: false,
    });
  });

  // Add orphaned children
  orphanedChildren.forEach(child => {
    children.push({
      branchName: child,
      parent: staleParent,
      children: [],
      orphaned: true,
      stale: false,
    });
  });

  return children;
}

/**
 * Gets the GitHub repository URL from git remote
 * Handles both HTTPS and SSH remote URLs
 */
function getGithubUrl(): string {
  const remoteUrl = execCommand('git remote get-url origin')
    .replace(/.git$/, '');
  if (remoteUrl.startsWith('https://')) {
    return remoteUrl;
  } else {
    const [domain, orgAndRepo] = remoteUrl.split('@')[1].split(':');
    return `https://${domain}/${orgAndRepo}`;
  }
}

/**
 * Creates a markdown link to a PR
 */
export function createPrLink(branch: string, prNum: number): string {
  return prNum ? `[#${prNum}](${getGithubUrl()}/pull/${prNum})` : branch;
}

/**
 * Gets branch annotations including PR status, orphaned state, and stale state
 */
export function getBranchListAnnotations(branch: Branch) {
  const prNumber = getPrNumber(branch.branchName);
  const prStatus = prNumber === null ? 'unknown' : getPrStatus(prNumber);
  const prStatusString = prStatus !== 'unknown' ? `${prStatus}` : '';
  const orphanedString = branch.orphaned ? 'orphaned' : '';
  const staleString = branch.stale ? 'stale' : '';
  const joinedAnnotations = [prStatusString, orphanedString, staleString].filter(Boolean).join(' ').trim();
  return {
    prNumber,
    annotations: joinedAnnotations ? ` (${joinedAnnotations})` : '',
  }
};
