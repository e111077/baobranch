/**
 * @module push/chain
 * @description Pushes the current branch and all its child branches to origin with dependency-aware parallelism.
 * Force pushes are used to ensure branch state consistency. Parents are pushed before children; ready branches may push concurrently up to a limit.
 */

import type { Argv, CommandModule } from "yargs";
import { execCommand, execCommandAsync } from "../../utils.js";
import { findChildren } from "../../tree-nav/children.js";

/**
 * Implements the chain push functionality
 * Pushes the current branch and all its descendants to origin
 *
 * @throws {Error} If git push fails for any branch
 */
export async function pushChainImpl(options: PushChainOptions) {
  // Get the current branch name
  const startBranch = execCommand('git rev-parse --abbrev-ref HEAD').trim();
  const isMasterOrMain = startBranch === 'master' || startBranch === 'main';
  const isBranchlessHead = startBranch === 'HEAD';
  const shouldSkipCurrentBranch = (isMasterOrMain && !options.includeMain) || isBranchlessHead;

  const parallelInput = options.maxParallel ?? 8;

  const maxParallel = Math.max(1, parallelInput);

  const visited = new Set<string>();
  const failed = new Set<string>();
  const pushed: string[] = [];

  function createLimiter(max: number) {
    let active = 0;
    const queue: Array<() => void> = [];
    const next = () => {
      while (active < max && queue.length) {
        const fn = queue.shift()!;
        active++;
        fn();
      }
    };
    return function runLimited<T>(task: () => Promise<T>): Promise<T> {
      return new Promise<T>((resolve, reject) => {
        const run = () => {
          task()
            .then((v) => { active--; next(); resolve(v); })
            .catch((e) => { active--; next(); reject(e); });
        };
        queue.push(run);
        next();
      });
    };
  }

  const runLimited = createLimiter(maxParallel);

  async function getQualifiedChildNames(branch: string): Promise<string[]> {
    const children = await findChildren(branch);
    return children.filter(c => !c.orphaned).map(c => c.branchName.trim());
  }

  let pending = 0;
  let idleResolvers: Array<() => void> = [];
  const onTaskDone = () => {
    pending--;
    if (pending === 0) {
      const resolvers = idleResolvers;
      idleResolvers = [];
      resolvers.forEach((r) => r());
    }
  };
  function waitForIdle(): Promise<void> {
    return pending === 0 ? Promise.resolve() : new Promise(res => idleResolvers.push(res));
  }

  function scheduleBranch(branch: string) {
    if (visited.has(branch)) return;
    visited.add(branch);
    pending++;
    runLimited(async () => {
      try {
        await execCommandAsync(`git push origin ${branch} -f`, true);
        pushed.push(branch);
        console.log(`✔ Pushed ${branch}`);
        if (options.postPush) {
          await options.postPush(branch);
        }
        const childNames = await getQualifiedChildNames(branch);
        for (const child of childNames) {
          scheduleBranch(child);
        }
      } catch (e) {
        failed.add(branch);
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`✖ Failed ${branch}: ${msg}`);
        // Do not schedule children on failure
      }
    }).catch(() => {
      // Keep scheduler running; error already logged
    }).finally(onTaskDone);
  }

  const initialBranches = shouldSkipCurrentBranch
    ? await getQualifiedChildNames(startBranch)
    : [startBranch];

  initialBranches.forEach(scheduleBranch);

  await waitForIdle();

  // Compute skipped descendants of failed branches for summary
  const skipped = new Set<string>();
  async function collectDescendants(root: string, acc: Set<string>) {
    const kids = await getQualifiedChildNames(root);
    for (const k of kids) {
      if (!acc.has(k)) {
        acc.add(k);
        await collectDescendants(k, acc);
      }
    }
  }
  for (const f of failed) {
    await collectDescendants(f, skipped);
  }
  // Remove any that actually ran
  for (const b of pushed) skipped.delete(b);
  for (const f of failed) skipped.delete(f);

  // Sort lists for readability
  pushed.sort((a, b) => a.localeCompare(b));
  const failedList = Array.from(failed).sort((a, b) => a.localeCompare(b));
  const skippedList = Array.from(skipped).sort((a, b) => a.localeCompare(b));

  console.log('Chain push operation complete\n');
  console.log('Summary:');
  console.log(`- Pushed (${pushed.length})`);
  for (const b of pushed) console.log(`  - ${b}`);
  if (failedList.length) {
    console.log(`- Failed (${failedList.length})`);
    for (const b of failedList) console.log(`  - ${b}`);
  }
  if (skippedList.length) {
    console.log(`- Skipped due to parent failure (${skippedList.length})`);
    for (const b of skippedList) console.log(`  - ${b}`);
  }
  if (!failedList.length && !skippedList.length) {
    console.log(`- No failures or skipped descendants`);
  }

  execCommand(`git checkout ${startBranch}`);
}

/**
 * Note: helper removed in favor of dependency-aware scheduler.
 */

/**
 * Command configuration for chain push
 *
 * @example
 * // Push current branch and all its children
 * fb push chain
 * // or
 * fb push c
 */
export const pushChain = {
  command: ['chain', 'c'],
  describe: 'Force pushes the current branch and all its descendants to origin',
  handler: pushChainImpl,
  builder: (yargs: Argv) =>
    yargs
      .option('include-main', {
        alias: 'm',
        type: 'boolean',
        default: false,
        describe: 'Include main/master branches in the chain push operation',
      })
      .option('max-parallel', {
        alias: 'j',
        type: 'number',
        default: 8,
        describe: 'Maximum number of concurrent pushes when dependencies allow',
      }),
} as const satisfies CommandModule<{}, PushChainOptions>;

interface PushChainOptions {
  includeMain?: boolean;
  yesToAll?: boolean;
  postPush?: (branch: string) => Promise<void>;
  maxParallel?: number;
}