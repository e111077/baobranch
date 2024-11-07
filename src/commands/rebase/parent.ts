import { loadState, saveState } from "../../branch-state/state.js";
import { type Command, execCommand, findChildren, getParentBranch } from "../../utils.js";
import inquirer from 'inquirer';

/**
 * Rebases the current branch onto its parent branch after user confirmation
 */
async function impl(): Promise<void> {
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  const state = loadState();
  const parent = getParentBranch(currentBranch);

  const { confirm } = await inquirer.prompt([{
    type: 'confirm',
    name: 'confirm',
    message: `attempt rebase on ${parent.branchName}?`,
    default: false
  }]);

  if (confirm) {
    console.log(`Rebasing onto ${parent.branchName}...`);
    try {
      findChildren(currentBranch);
      execCommand(`git rebase ${parent.branchName}`, true);
    } catch (error) {
      // Only exit with error if the rebase actually failed
      process.exit(1);
    }
  } else {
    console.log('Rebase cancelled');
    process.exit(0);
  }
}

export const rebaseParent: Command = {
  command: 'rebase parent',
  description: 'Rebase the current branch onto its parent branch',
  impl
}