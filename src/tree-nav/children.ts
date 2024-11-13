import { execCommand, type Branch } from "../utils.js";

/**
 * Formats the output of git branch --contains into a Set of branch names
 */
function formatBranchContains(containsOutput: string, branchName: string) {
  return new Set(containsOutput.split('\n')
    .map((branch) => branch.replace('*', '').trim())
    .filter(branch => branch && branch !== branchName));
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