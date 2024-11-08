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

  function printTable(branch: Branch, parent?: {branch: Branch, prNumber: number|null}) {
    const branchPrNumber = getPrNumber(branch.branchName);

    // Print current branch with PR
    if (branchPrNumber) {
      console.log(`${branch.branchName} ${createPrLink(branch.branchName, branchPrNumber)}`);
    } else {
      console.log(branch.branchName);
    }

    // Print table headers
    console.log(`
| Parent | Children |
| -- | -- |`);

  let parentDisplay = '';

  if (!parent) {
    const parentBranch = getParentBranch(branch.branchName);
    parent = {branch: parentBranch, prNumber: getPrNumber(parentBranch.branchName)};
  }

  const prNumber = parent.prNumber;
  const parentBranch = parent.branch;

  parentDisplay = prNumber ?
    createPrLink(parentBranch.branchName, prNumber) :
    parentBranch.branchName;

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

    childDisplay = childDisplay.replace(/,\s*$/, '');  // Remove trailing comma

    console.log(`| ${parentDisplay} | ${childDisplay} |

`);

    // Recursively print children
    for (const child of children) {
      printTable(child.branch, {branch, prNumber: branchPrNumber});
    }
  }

  printTable(hierarchy);
}

export const tables: Command = {
  command: 'tables',
  description: 'Generate markdown tables showing PR relationships',
  impl: generateTables
};