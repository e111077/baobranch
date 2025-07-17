/**
 * @module cleanup
 * @description Centralized tag cleanup functionality.
 * Coordinates cleanup of all tag types.
 */

import { retagMergeBase } from "./merge-base-master.js";
import { cleanupOrphanedStaleTags } from "./stale.js";

/**
 * Performs all tag cleanup operations
 * - Retags merge-base commits
 * - Cleans up orphaned stale parent tags
 */
export function cleanupTags() {
  retagMergeBase();
  cleanupOrphanedStaleTags();
}