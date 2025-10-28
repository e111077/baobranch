/**
 * @module graph
 * Builds and manages the complete graph structure of Git branch relationships
 */

import { execCommand, logger, type Branch } from "../utils.js";
import { cleanupTags } from '../tags/cleanup.js';
import { findRootBranch } from './find-root-branch.js';
import { findChildren } from "./children.js";

/**
 * Builds a complete graph of the Git branch hierarchy
 *
 * This function:
 * 1. Determines if repo uses main or master as base branch
 * 2. Finds all local branches
 * 3. Builds branch relationships by finding root branches
 * 4. Constructs a complete graph with parent-child relationships
 *
 * @returns The root Branch object (main/master) containing the complete branch hierarchy
 *
 * @example
 * const graph = buildGraph();
 * // Returns:
 * // {
 * //   branchName: 'main',
 * //   children: [...childBranches],
 * //   parent: null,
 * //   orphaned: false,
 * //   stale: false
 * // }
 */
export async function buildGraph() {
  logger.debug('buildGraph: Starting to build branch graph');

  // Determine if repo uses main or master
  const masterOrMainBranch = execCommand('git branch --list main') ? 'main' : 'master';
  logger.debug(`buildGraph: Using base branch: ${masterOrMainBranch}`);

  // Get all branches except main/master
  const allBranches = execCommand('git branch --format="%(refname:short)"')
    .split('\n')
    .filter(branchName => branchName !== masterOrMainBranch);
  logger.debug(`buildGraph: Found ${allBranches.length} branches to process: ${allBranches.join(', ')}`);

  // Update merge base tags to track relationships
  logger.debug('buildGraph: Cleaning up tags');
  cleanupTags();

  // Create root branch object
  const root: Branch = {
    parent: null,
    branchName: masterOrMainBranch,
    children: [],
    orphaned: false,
    stale: false,
  };

  // Map to store root branches to prevent duplicates
  const rootBranches = new Map<string, Branch>();

  // Find root branches for all branches
  logger.debug('buildGraph: Finding root branches for all branches');
  await Promise.all(allBranches.map(async (branchName) => {
    const rootBranch = await findRootBranch(branchName);
    logger.debug(`buildGraph: Branch "${branchName}" has root "${rootBranch.branchName}"`);
    if (!rootBranches.has(rootBranch.branchName)) {
      rootBranches.set(rootBranch.branchName, rootBranch);
    }
  }));
  logger.debug(`buildGraph: Found ${rootBranches.size} unique root branches`);

  const allNodes = new Map<string, Branch>();
  allNodes.set(root.branchName, root);

  // Build complete hierarchy by crawling children
  logger.debug('buildGraph: Building complete hierarchy by crawling children');
  for (const rootBranch of rootBranches.values()) {
    logger.debug(`buildGraph: Crawling children for root branch: ${rootBranch.branchName}`);
    await crawlChildren(root, rootBranch, allNodes);
  }

  logger.debug(`buildGraph: Graph complete with ${allNodes.size} total nodes`);
  return {graph: root, allNodes};
}

/**
 * Recursively builds the branch hierarchy by finding and adding child branches
 *
 * @param parent - The parent branch to add children to
 * @param child - The child branch to process
 * @param nameNodeMap - A map of all branches by name
 *
 * @example
 * crawlChildren(parentBranch, childBranch);
 */
async function crawlChildren(parent: Branch, child: Branch, nameNodeMap: Map<string, Branch>) {
  logger.debug(`crawlChildren: Processing child "${child.branchName}" for parent "${parent.branchName}"`);
  nameNodeMap.set(parent.branchName, parent);
  nameNodeMap.set(child.branchName, child);
  // Check if child already exists in parent's children
  if (!parent.children.some(c => c.branchName === child.branchName)) {
    parent.children.push(child);
  }

  // Find all children of the current branch
  const grandChildren = await findChildren(child.branchName);
  logger.debug(`crawlChildren: Found ${grandChildren.length} grandchildren for "${child.branchName}"`);
  child.parent = parent;

  // Recursively process all grandchildren
  for (const grandchild of grandChildren) {
    grandchild.children = [];
    grandchild.parent = child;
    nameNodeMap.set(grandchild.branchName, grandchild);
    await crawlChildren(child, grandchild, nameNodeMap);
  }
}