import { loadState } from "../branch-state/state.js";
import { type Branch, type Command, createPrLink, execCommand, findChildren, getParentBranch, getPrNumber, getPrStatus } from "../utils.js";

/**
 * Builds a complete branch hierarchy starting from a given branch
 * @param branchName - The name of the branch to start from
 * @param visited - Set of already visited branches to prevent cycles
 * @param parent - Optional parent branch reference
 * @returns A Branch object representing the complete hierarchy
 */
function buildBranchHierarchy(
  branchName: string,
  orphaned: boolean,
  visited = new Set<string>(),
  parent?: Branch
): Branch {
  if (visited.has(branchName)) {
    return {
      branchName,
      children: [],
      parent: parent ?? null,
      orphaned
    };
  }

  visited.add(branchName);

  const branch: Branch = {
    branchName,
    children: [],
    parent: parent ?? null,
    orphaned
  };

  const childBranches = findChildren(branchName);
  branch.children = childBranches.map(child =>
    buildBranchHierarchy(child.branchName, child.orphaned, visited, branch) // Pass current branch as parent
  );

  return branch;
}

/**
 * Generates tables showing branch relationships in the same format as the original shell script
 */
function generateTables(): void {
  const state = loadState();
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');

  // Build the branch hierarchy starting from current branch
  const hierarchy = buildBranchHierarchy(currentBranch, state.branches[currentBranch]?.orphaned || false);
  const heirarchyPrNumber = getPrNumber(hierarchy.branchName);

  // Print current branch with PR
  if (heirarchyPrNumber) {
    console.log(`${hierarchy.branchName} ${createPrLink(hierarchy.branchName, heirarchyPrNumber)}`);
  } else {
    console.log(hierarchy.branchName);
  }
  console.log();

  // Print table headers
  console.log("| Parent | Children |");
  console.log("| -- | -- |");

  // Get and process parent display
  let parentDisplay: string;
  const parentBranch = getParentBranch(currentBranch);  // Get parent directly

  if (parentBranch.branchName !== 'main' && parentBranch.branchName !== 'master') {
    const prNumber = getPrNumber(parentBranch.branchName);
    parentDisplay = prNumber ?
      createPrLink(parentBranch.branchName, prNumber) :
      parentBranch.branchName;
  } else {
    parentDisplay = "(tip)";
  }

  // Process children
  if (hierarchy.children.length > 0) {
    // Display first child in table
    const firstChild = hierarchy.children[0];
    const prNumber = getPrNumber(firstChild.branchName);
    const childDisplay = prNumber ?
      createPrLink(firstChild.branchName, prNumber) :
      firstChild.branchName;

    console.log(`| ${parentDisplay} | ${childDisplay} |`);
    console.log();

    // Process each child
    for (const child of hierarchy.children) {
      const prNumber = getPrNumber(child.branchName);
      if (prNumber) {
        console.log(`${child.branchName} ${createPrLink(child.branchName, prNumber)}`);
      } else {
        console.log(child.branchName);
      }
      console.log();

      console.log("| Parent | Children |");
      console.log("| -- | -- |");

      const currentDisplay = heirarchyPrNumber ?
        createPrLink(hierarchy.branchName, heirarchyPrNumber) :
        hierarchy.branchName;

      console.log(`| ${currentDisplay} | '' |`);
      console.log();
    }
  } else {
    console.log(`| ${parentDisplay} | '' |`);
  }
}

export const tables: Command = {
  command: 'tables',
  description: 'Generate markdown tables showing PR relationships',
  impl: generateTables
};