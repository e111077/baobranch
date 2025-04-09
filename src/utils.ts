// Core Node.js imports for executing shell commands and handling paths
import { execSync, exec, type ExecSyncOptions, type StdioOptions } from 'child_process';
import type { ArgumentsCamelCase, BuilderCallback, CommandModule } from 'yargs';
import { getPrNumber, getPrStatus } from './github-helpers/pr.js';

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

/**
 * Interface for shell command execution errors
 */
interface ExecError extends Error {
  status: number;
}

let lastRepoRoot: string | null = null;
/**
 * Gets the git repository root directory
 * @returns The absolute path to the git repository root
 */
export function getGitRepoRoot(): string {
  if (lastRepoRoot) {
    return lastRepoRoot;
  }
  try {
    lastRepoRoot = execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).toString().trim();
    return lastRepoRoot;
  } catch (error) {
    console.error('Error finding git repository root:', error);
    return process.cwd();
  }
}

/**
 * Executes a shell command and returns its output
 * @param command - The shell command to execute
 * @param throwOnError - Whether to throw an error if the command fails
 * @returns The command output as a string
 */
export function execCommand(
  command: string,
  throwOnError: boolean = false,
  options: { stdio?: StdioOptions; useGitRoot?: boolean } = {}
): string {
  try {
    const defaultOptions = {
      encoding: 'utf8',
      stdio: throwOnError ? ['inherit', 'inherit', 'pipe'] : 'pipe',
      useGitRoot: command.startsWith('git ')
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    const { useGitRoot, ...execOptions } = mergedOptions as ExecSyncOptions & { useGitRoot?: boolean };
    
    // For git commands, ensure we're in the git repository root
    if (useGitRoot) {
      const gitRoot = getGitRepoRoot();
      execOptions.cwd = gitRoot;
    }
    
    return execSync(command, execOptions).toString().trim();
  } catch (error) {
    if (throwOnError && isExecError(error)) {
      throw error;
    }
    return '';
  }
}

export async function execCommandAsync(
  command: string,
  throwOnError: boolean = false,
  options: { stdio?: StdioOptions; useGitRoot?: boolean } = {}
): Promise<string> {
  try {
    const defaultOptions = {
      encoding: 'utf8',
      stdio: throwOnError ? ['inherit', 'inherit', 'pipe'] : 'pipe',
      useGitRoot: command.startsWith('git ')
    };
    
    const mergedOptions = { ...defaultOptions, ...options };
    const { useGitRoot, ...execOptions } = mergedOptions as ExecSyncOptions & { useGitRoot?: boolean };
    
    // For git commands, ensure we're in the git repository root
    if (useGitRoot) {
      const gitRoot = getGitRepoRoot();
      execOptions.cwd = gitRoot;
    }
    
    const res = new Promise<string>((resolve, reject) =>
      exec(command, execOptions, (err, stdout) => err ? reject(err) : resolve(stdout))
    );
    return (await res).toString().trim();
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
 * Gets branch annotations including PR status, orphaned state, and stale state
 */
export function getBranchListAnnotations(branch: Branch) {
  const prNumber = getPrNumber(branch.branchName);
  const prStatus = prNumber === null ? 'unknown' : getPrStatus(prNumber);
  const prStatusString = prStatus !== 'unknown' ? `${prStatus}` : '';
  const orphanedString = branch.orphaned ? 'orphaned' : '';
  const staleString = branch.stale ? 'stale-reference' : '';
  const joinedAnnotations = [prStatusString, orphanedString, staleString].filter(Boolean).join(' ').trim();
  return {
    prNumber,
    annotations: joinedAnnotations ? ` (${joinedAnnotations})` : '',
  }
};
