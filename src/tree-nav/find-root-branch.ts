/**
 * @module find-root-branch
 * Provides functionality to find the root branch in a branch hierarchy
 */

import type { Branch } from "../utils";
import { getParentBranch } from "./parent.js";

/**
 * Recursively finds the root branch by traversing up the parent hierarchy
 *
 * Starting from a given branch, this function:
 * 1. Creates a Branch object if none provided
 * 2. Gets the parent branch
 * 3. Updates orphaned status based on parent's stale state
 * 4. Recursively traverses up until reaching master/main or a branch without a parent
 *
 * @param branchName - Name of the branch to start from
 * @param currentBranch - Optional current branch object being processed
 * @returns {Branch} The root branch of the hierarchy
 *
 * @example
 * const root = await findRootBranch('feature-123');
 * // Returns root branch (usually main/master) with full branch hierarchy
 */
export async function findRootBranch(branchName: string, currentBranch?: Branch): Promise<Branch> {
  // Create new branch object if none provided
  const branch = currentBranch ?? {
    branchName,
    parent: null,
    children: [],
    orphaned: false,
    stale: false,
  };

  // Get and set parent branch
  const parent = await getParentBranch(branchName);
  branch.parent = parent;
  branch.orphaned = parent.stale;

  // Return if we've reached the root (main/master or no parent)
  if (!parent.branchName ||
      parent.branchName === 'master' ||
      parent.branchName === 'main') {
    return branch;
  }

  // Recursively find root branch
  return await findRootBranch(parent.branchName, parent);
}