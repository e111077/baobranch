import { retagMergeBase } from "../tags/merge-base-master.js";
import { execCommand, type Branch } from "../utils.js";

/**
 * Determines the parent branch of a given branch
 * Handles both regular parents and stale parents (tagged with stale-parent)
 */
export function getParentBranch(branchName: string): Branch {
  const parentCommit = execCommand(`git rev-parse ${branchName}^`);
  let parentBranchName = execCommand(`git branch --points-at ${parentCommit}`).trim();

  if (parentBranchName) {
    return {
      branchName: parentBranchName,
      parent: null,
      children: [],
      orphaned: false,
      stale: false,
    };
  }

  retagMergeBase();

  // Check for stale parent tags
  const staleTag = execCommand(`git tag --points-at ${parentCommit} | grep -E '^stale-parent--figbranch--.+$'`);
  const staleParentBranch = staleTag.split('--figbranch--')[1];
  const mergeBaseParent = execCommand(`git tag --points-at ${parentCommit} | grep -E '^merge-base-master-.+$'`);
  const mainOrMaster = execCommand('git branch --list main') ? 'main' : 'master';
  parentBranchName = staleParentBranch ?? (mergeBaseParent ? mainOrMaster : '');

  if (!parentBranchName) {
    parentBranchName = mainOrMaster;
  }

  return {
    branchName: parentBranchName,
    parent: null,
    children: [],
    orphaned: false,
    stale: true,
  };
}