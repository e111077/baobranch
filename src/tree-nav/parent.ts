import { execCommand, type Branch } from "../utils.js";

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