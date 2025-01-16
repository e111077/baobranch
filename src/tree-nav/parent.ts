import { makeMergeBaseTag, retagMergeBase } from "../tags/merge-base-master.js";
import { makeStaleParentTag, parseStaleParentTag } from "../tags/stale.js";
import { execCommand, type Branch } from "../utils.js";

/**
 * Determines the parent branch of a given branch
 * Handles both regular parents and stale parents (tagged with stale-parent)
 */
export function getParentBranch(branchNameOrCommit: string): Branch {
  const parentCommit = execCommand(`git rev-parse ${branchNameOrCommit}^`);
  let parentBranchName = execCommand(`git branch --format="%(refname:short)" --points-at ${parentCommit}`)
      .replace(/\(HEAD detached at .+\)/, '')
      .trim();

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
  const staleTag = execCommand(`git tag --points-at ${parentCommit} | grep -E '^${makeStaleParentTag('.+?', '.+?')}$'`);
  const staleParentBranch = parseStaleParentTag(staleTag)?.branchName;
  const mergeBaseParent = execCommand(`git tag --points-at ${parentCommit} | grep -E '^${makeMergeBaseTag('.+?')}$'`);
  const mainOrMaster = execCommand('git branch --list main') ? 'main' : 'master';
  parentBranchName = staleParentBranch ?? (mergeBaseParent ? mainOrMaster : '');

  if (!parentBranchName) {
    return getParentBranch(parentCommit);
  }

  return {
    branchName: parentBranchName,
    parent: null,
    children: [],
    orphaned: false,
    stale: true,
  };
}