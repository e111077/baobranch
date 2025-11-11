import { makeMergeBaseTag } from "../tags/merge-base-master.js";
import { makeStaleParentTag } from "../tags/stale.js";
import { getParentBranch } from "./parent.js";
import { execCommand, execCommandAsync, logger, type Branch } from "../utils.js";

/**
 * Formats the output of git branch --contains into a Set of branch names
 */
function formatBranchContains(containsOutput: string, branchName: string) {
  return new Set(containsOutput.split('\n')
    .map((branch) => branch.replace('*', '').trim())
    .filter(branch =>
      branch &&
      branch !== branchName &&
      !branch.startsWith('(HEAD detached at') &&
      branch !== 'master' &&
      branch !== 'main'
    ));
}

/**
 * Finds all child branches of a given parent branch
 * Uses async getParentBranch calls to efficiently determine parent-child relationships
 */
export async function findChildren(parentBranchName: string): Promise<Branch[]> {
  // Find all possible children (branches that contain the parent commit)
  const parentCommit = execCommand(`git rev-parse ${parentBranchName}`);
  logger.debug(`\nfindChildren called with: "${parentBranchName}"`);
  logger.debug(`Resolved to commit: ${parentCommit}`);

  const possibleCurrentChildren = formatBranchContains(
    execCommand(`git branch --contains ${parentCommit}`),
    parentBranchName
  );
  logger.debug(`Possible children found: ${Array.from(possibleCurrentChildren).join(', ') || '(none)'}`);

  // Find additional possible children from stale tags
  const additionalPossibleChildren = new Set<string>();
  const staleCommits = new Set<string>();

  try {
    const staleTags = execCommand(`git tag | grep -E '^${makeStaleParentTag(parentBranchName, '[0-9]+')}$'`).split('\n').filter(tag => tag);
    logger.debug(`Stale tags found for parent "${parentBranchName}": ${staleTags.join(', ') || '(none)'}`);

    await Promise.all(staleTags.map(async tag => {
      logger.debug(`Processing stale tag: ${tag}`);
      const tagCommit = await execCommandAsync(`git rev-parse ${tag}`);
      staleCommits.add(tagCommit);
      const children = formatBranchContains(
        await execCommandAsync(`git branch --contains ${tagCommit}`),
        parentBranchName
      );
      children.forEach(child => additionalPossibleChildren.add(child));
    }));

    // For master/main, also check merge-base tags
    if (parentBranchName === 'master' || parentBranchName === 'main') {
      logger.debug(`Parent is "${parentBranchName}", checking merge-base tags as well.`);
      const staleMergeBaseTags = execCommand(`git tag | grep -E '^${makeMergeBaseTag('[0-9]+')}$'`).split('\n').filter(tag => tag);
      await Promise.all(staleMergeBaseTags.map(async (tag) => {
        logger.debug(`Processing merge-base tag: ${tag}`);
        const tagCommit = await execCommandAsync(`git rev-parse ${tag}`);
        const children = formatBranchContains(
          await execCommandAsync(`git branch --contains ${tagCommit}`),
          parentBranchName
        );
        children.forEach(child => additionalPossibleChildren.add(child));
      }));
    }
  } catch {
    // Ignore errors from stale tag processing
  }

  // Combine all possible children and check their parents in parallel
  const allPossibleChildren = new Set([...possibleCurrentChildren, ...additionalPossibleChildren]);

  // Cache to avoid redundant getParentBranch calls for children with same immediate parent
  const parentBranchCache = new Map<string, Promise<Branch>>();

  const parentChecks = Array.from(allPossibleChildren).map(async (child) => {
    try {
      logger.debug(`Determining parent for possible child: ${child}`);
      const childImmediateParentCommit = await execCommandAsync(`git rev-parse ${child}^`);

      // Check cache to avoid redundant getParentBranch calls
      if (!parentBranchCache.has(childImmediateParentCommit)) {
        logger.debug(`Cache miss for commit ${childImmediateParentCommit}, calling getParentBranch`);
        parentBranchCache.set(childImmediateParentCommit, getParentBranch(child));
      } else {
        logger.debug(`Cache hit for commit ${childImmediateParentCommit}, reusing result`);
      }

      const childParent = await parentBranchCache.get(childImmediateParentCommit)!;
      const childParentCommit = await execCommandAsync(`git rev-parse ${childParent.branchName}`);

      logger.debug(`Checking child: ${child}`);
      logger.debug(`  - Immediate parent commit: ${childImmediateParentCommit}`);
      logger.debug(`  - getParentBranch returned: ${childParent.branchName} (stale: ${childParent.stale})`);
      logger.debug(`  - Parent branch resolves to commit: ${childParentCommit}`);
      logger.debug(`  - Match with parentCommit ${parentCommit}? ${childParentCommit === parentCommit}`);
      logger.debug(`  - Immediate parent matches? ${childImmediateParentCommit === parentCommit}`);

      return {
        child,
        parent: childParent.branchName,
        parentCommit: childParentCommit,
        immediateParentCommit: childImmediateParentCommit,
        isStale: childParent.stale
      };
    } catch {
      return { child, parent: null, parentCommit: null, immediateParentCommit: null, isStale: false };
    }
  });

  const parentResults = await Promise.all(parentChecks);

  const currentChildren = new Set<string>();
  const orphanedChildren = new Set<string>();

  parentResults.forEach(({ child, immediateParentCommit, isStale }) => {
    // Check if immediate parent matches current commit or any stale commit
    const matchesCurrentCommit = immediateParentCommit === parentCommit;
    const matchesStaleCommit = staleCommits.has(immediateParentCommit ?? '');

    if (matchesCurrentCommit) {
      if (isStale) {
        orphanedChildren.add(child);
      } else {
        currentChildren.add(child);
      }
    } else if (matchesStaleCommit) {
      // Child's parent is a stale commit, so it's orphaned
      orphanedChildren.add(child);
    }
  });

  logger.debug(`\nResults:`);
  logger.debug(`  - Current children: ${Array.from(currentChildren).join(', ') || '(none)'}`);
  logger.debug(`  - Orphaned children: ${Array.from(orphanedChildren).join(', ') || '(none)'}\n`);

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
