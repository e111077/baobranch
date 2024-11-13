// File: tables.ts
// Purpose: Generates markdown tables showing Git branch and PR relationships

import { type Branch, type Command, createPrLink, execCommand, findChildren, getParentBranch, getPrNumber, getPrStatus } from "../utils.js";

/**
 * Builds a complete branch hierarchy starting from a given branch by recursively finding child branches
 * @param branchName - The name of the branch to start from
 * @param visited - Set of already visited branches to prevent infinite recursion in case of circular references
 * @param parent - Optional parent branch reference to maintain the hierarchy structure
 * @returns A Branch object containing the complete branch tree structure
 */
function buildBranchHierarchy(
  branchName: string,
  visited = new Set<string>(),
  parent?: Branch
): Branch {
  // Prevent infinite recursion by checking if branch was already processed
  if (visited.has(branchName)) {
    return {
      branchName,
      children: [],
      parent: parent ?? null,
      orphaned: false,
      stale: false
    };
  }

  // Mark branch as visited
  visited.add(branchName);

  // Create the current branch object
  const branch: Branch = {
    branchName,
    children: [],
    parent: parent ?? null,
    orphaned: false,
    stale: false
  };

  // Find and recursively process all child branches
  const childBranches = findChildren(branchName);
  branch.children = childBranches.map(child =>
    buildBranchHierarchy(child.branchName, visited, branch)
  );

  return branch;
}

/**
 * Generates markdown tables showing branch relationships
 * Each table shows:
 * - The current branch name and its PR (if exists)
 * - A table with parent and children information
 * - Recursively shows tables for all child branches
 */
function generateTables(): void {
  // Get the current git branch
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');

  // Build complete branch hierarchy starting from current branch
  const hierarchy = buildBranchHierarchy(currentBranch);

  /**
   * Recursively prints markdown tables for a branch and all its children
   * @param branch - The current branch to print information for
   * @param parent - Optional parent branch information including PR number
   */
  function printTable(branch: Branch, parent?: {branch: Branch, prNumber: number|null}) {
    const branchPrNumber = getPrNumber(branch.branchName);

    // Print branch name with PR link if available
    if (branchPrNumber) {
      console.log(`${branch.branchName} ${createPrLink(branch.branchName, branchPrNumber)}`);
    } else {
      console.log(branch.branchName);
    }

    // Print markdown table headers
    console.log(`
| Parent | Children |
| -- | -- |`);

    let parentDisplay = '';

    // If parent not provided, find it using git
    if (!parent) {
      const parentBranch = getParentBranch(branch.branchName);
      parent = {branch: parentBranch, prNumber: getPrNumber(parentBranch.branchName)};
    }

    // Format parent display with PR link if available
    const prNumber = parent.prNumber;
    const parentBranch = parent.branch;
    parentDisplay = prNumber ?
      createPrLink(parentBranch.branchName, prNumber) :
      parentBranch.branchName;

    // Process all children and their PRs
    let childDisplay = '';
    const children: {branch: Branch, prNumber: number|null}[] = [];

    for (const child of branch.children) {
      const prNumber = getPrNumber(child.branchName);
      children.push({branch: child, prNumber});

      childDisplay += prNumber ?
        createPrLink(child.branchName, prNumber) :
        child.branchName;
      childDisplay += ', ';
    }

    // Clean up trailing comma from child display
    childDisplay = childDisplay.replace(/,\s*$/, '');

    // Print the table row with parent and children
    console.log(`| ${parentDisplay} | ${childDisplay} |

`);

    // Recursively print tables for all children
    for (const child of children) {
      printTable(child.branch, {branch, prNumber: branchPrNumber});
    }
  }

  // Start printing tables from the root of the hierarchy
  printTable(hierarchy);
}

// Export the command configuration
export const tables: Command = {
  command: 'tables',
  description: 'Generate markdown tables showing PR relationships',
  impl: generateTables
};