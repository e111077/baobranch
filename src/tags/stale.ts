/**
 * @module stale
 * Handles the marking and cleanup of stale parent branches in Git
 */

import { execCommand } from "../utils.js";
import { retagMergeBase } from "./merge-base-master.js";

/**
 * Marks a commit as stale and manages stale parent tags
 *
 * When a branch is rebased or moved, its original commit becomes "stale". This function
 * marks these commits with special tags to maintain branch relationship history, particularly
 * useful for tracking orphaned branches.
 *
 * @param commit - The SHA of the commit to mark as stale
 * @param branchName - The name of the branch being marked
 * @param hasDirectChildren - Whether the commit has any direct child branches
 *
 * @example
 * // Mark a commit as stale when it has orphaned child branches
 * markStale("abc123", "feature-branch", true);
 */
export function markStale(commit: string, branchName: string, hasDirectChildren: boolean) {
  // If this commit has any direct children, then we want to mark it as stale so
  // that those children can be marked as orphans. We don't want to tag it
  // otherwise as that would have a hanging tag that offers nothing.
  if (hasDirectChildren) {
    // Get existing stale tags for this branch and find the highest number
    const staleTagsSplit = execCommand(`git tag | grep -E '^stale-parent--figbranch--${branchName}--figbranch--[0-9]+$'`)
        .split('\n')
        .filter(tag => tag.length)
        .map(tag => tag.split('--figbranch--')[2]);
    const lastStaleTagNum = staleTagsSplit.length ? parseInt(staleTagsSplit[staleTagsSplit.length - 1]) : -1;

    // Tag the current commit with a stale-parent tag
    execCommand(`git tag stale-parent--figbranch--${branchName}--figbranch--${lastStaleTagNum + 1} ${commit}`);
  }

  cleanupStaleParentTags();
  retagMergeBase();
}

/**
 * Cleans up stale parent tags that are no longer needed
 *
 * A stale parent tag is considered unnecessary when:
 * - The tagged commit no longer has any child branches
 * - The branch relationships it was tracking no longer exist
 *
 * This helps keep the repository clean of unused tags while maintaining
 * only the necessary relationship tracking information.
 *
 * @example
 * // Clean up any unnecessary stale parent tags
 * cleanupStaleParentTags();
 */
export function cleanupStaleParentTags() {
  // Get all stale-parent tags
  const staleTags = execCommand(`git tag | grep -E '^stale-parent--figbranch--.+$'`).split('\n');
  staleTags.forEach(tag => {
    // Check if there are any children of this tag
    const children = execCommand(`git branch --contains ${tag}`);
    if (children) {
      return;
    }

    // If no children, delete the tag
    execCommand(`git tag -d ${tag}`);
  });
}