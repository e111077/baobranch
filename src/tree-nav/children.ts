import { makeMergeBaseTag } from "../tags/merge-base-master.js";
import { makeStaleParentTag } from "../tags/stale.js";
import { getParentBranch } from "./parent.js";
import { execCommand, type Branch } from "../utils.js";

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
  const possibleCurrentChildren = formatBranchContains(
    execCommand(`git branch --contains ${parentCommit}`),
    parentBranchName
  );

  // Find additional possible children from stale tags
  const additionalPossibleChildren = new Set<string>();
  
  try {
    const staleTags = execCommand(`git tag | grep -E '^${makeStaleParentTag(parentBranchName, '[0-9]+')}$'`).split('\n').filter(tag => tag);
    
    staleTags.forEach(tag => {
      const tagCommit = execCommand(`git rev-parse ${tag}`);
      const children = formatBranchContains(
        execCommand(`git branch --contains ${tagCommit}`),
        parentBranchName
      );
      children.forEach(child => additionalPossibleChildren.add(child));
    });

    // For master/main, also check merge-base tags
    if (parentBranchName === 'master' || parentBranchName === 'main') {
      const staleMergeBaseTags = execCommand(`git tag | grep -E '^${makeMergeBaseTag('[0-9]+')}$'`).split('\n').filter(tag => tag);
      staleMergeBaseTags.forEach(tag => {
        const tagCommit = execCommand(`git rev-parse ${tag}`);
        const children = formatBranchContains(
          execCommand(`git branch --contains ${tagCommit}`),
          parentBranchName
        );
        children.forEach(child => additionalPossibleChildren.add(child));
      });
    }
  } catch {
    // Ignore errors from stale tag processing
  }

  // Combine all possible children and check their parents in parallel
  const allPossibleChildren = new Set([...possibleCurrentChildren, ...additionalPossibleChildren]);
  
  const parentChecks = Array.from(allPossibleChildren).map(async (child) => {
    try {
      // getParentBranch can be slow so parallelization is important
      const childParent = getParentBranch(child);
      return {
        child,
        parent: childParent.branchName,
        isStale: childParent.stale
      };
    } catch {
      return { child, parent: null, isStale: false };
    }
  });

  const parentResults = await Promise.all(parentChecks);

  const currentChildren = new Set<string>();
  const orphanedChildren = new Set<string>();
  
  parentResults.forEach(({ child, parent, isStale }) => {
    if (parent === parentBranchName) {
      if (isStale) {
        orphanedChildren.add(child);
      } else {
        currentChildren.add(child);
      }
    }
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
