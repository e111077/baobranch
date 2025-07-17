/**
 * @module stale
 * @description Handles the marking and cleanup of stale parent branches in Git.
 * When branches are rebased or moved, their original commits become "stale".
 * This module helps track these stale commits to maintain branch relationship history.
 */

import { execCommand } from "../utils.js";
import { cleanupTags } from "./cleanup.js";

/**
 * Creates a tag name for marking stale parent branches using a specific format
 * @param branchName - Name of the branch being marked as stale
 * @param tagNum - Numeric identifier for the stale tag
 * @param escape - Whether to escape the brackets in the tag name
 * @returns Formatted tag name in the format 'bbranch-stale-{{branchName}}-{{tagNum}}'
 */
export function makeStaleParentTag(branchName: string, tagNum: number|string) {
  return `bbranch-stale-{{${branchName}}}-{{${tagNum}}}`;
}

/**
 * Retrieves all stale parent tags for a given branch
 * Uses grep to find tags matching the stale parent format
 * @param branchName - Name of the branch to find stale tags for
 * @returns Array of stale tag names for the branch
 */
export function getStaleParentTags(branchName: string) {
  return execCommand(`git tag | grep -E '^${makeStaleParentTag(branchName, '[0-9]+')}$'`)
    .split('\n')
    .filter(tag => tag.length);
}

/**
 * Extracts branch name and tag number from a stale parent tag
 * @param tag - The stale parent tag to parse
 * @returns Object containing the branch name and numeric tag identifier
 * @example
 * parseStaleParentTag('bbranch-stale-{{feature}}-{{1}}')
 * // Returns { branchName: 'feature', tagNum: 1 }
 */
export function parseStaleParentTag(tag: string) {
  const regex = new RegExp(makeStaleParentTag('(.+?)', '([0-9]+)'));
  const [_, branchName, tagNum] = tag.match(regex) ?? [];
  return { branchName, tagNum: parseInt(tagNum) };
}

/**
 * Marks a commit as stale and manages stale parent tags
 *
 * When a branch is rebased or moved, its original commit becomes "stale". This function
 * tags these commits to maintain branch relationship history, particularly for tracking
 * orphaned branches.
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
  // Only tag commits that have direct children to avoid orphaned tags
  if (hasDirectChildren) {
    // Get existing stale tags and find highest number
    const staleTagNums = getStaleParentTags(branchName)
      .map(tag => parseStaleParentTag(tag).tagNum);

    const lastStaleTagNum = Math.max(...staleTagNums, -1);

    // Create new stale parent tag with incremented number
    execCommand(`git tag ${makeStaleParentTag(branchName, lastStaleTagNum + 1)} ${commit}`);
  }

  cleanupStaleParentTags();
  cleanupTags();
}

/**
 * Cleans up stale parent tags that are no longer needed
 *
 * A stale parent tag is considered unnecessary when:
 * - The tagged commit no longer has any child branches
 * - The branch relationships it was tracking no longer exist
 *
 * @example
 * // Clean up any unnecessary stale parent tags
 * cleanupStaleParentTags();
 */
export function cleanupStaleParentTags() {
  // Get all stale parent tags using a wildcard pattern
  const staleTags = getStaleParentTags('.+?');

  staleTags.forEach(tag => {
    // Check if tag still has any child branches
    const children = execCommand(`git branch --contains ${tag}`);

    if (children) {
      return;
    }

    // Remove tag if it has no children
    execCommand(`git tag -d ${tag}`);
  });
}

/**
 * Cleans up orphaned stale parent tags
 * A stale tag is orphaned if the branch it references no longer exists
 */
export function cleanupOrphanedStaleTags() {
  try {
    // Get all stale parent tags
    const staleTags = execCommand('git tag | grep "^bbranch-stale-"').split('\n').filter(tag => tag);
    
    staleTags.forEach(tag => {
      const parsed = parseStaleParentTag(tag);
      if (!parsed) return;
      
      // Check if the branch still exists
      try {
        execCommand(`git rev-parse --verify refs/heads/${parsed.branchName}`);
        // Branch exists, keep the tag
      } catch {
        // Branch doesn't exist, remove the stale tag
        try {
          execCommand(`git tag -d ${tag}`);
        } catch {
          // Ignore errors if tag already deleted
        }
      }
    });
  } catch {
    // No stale tags found or other error - ignore
  }
}