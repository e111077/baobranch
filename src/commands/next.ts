import inquirer from 'inquirer';
import { type Command, execCommand } from "../utils.js";
import { findChildren } from "../tree-nav/children.js";

/**
 * Interactively checks out to a child branch
 * If there's only one child branch, checks out directly
 * If there are multiple child branches, prompts for selection
 * @returns Promise that resolves when the checkout is complete
 */
async function impl(): Promise<void> {
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');
  const children = findChildren(currentBranch);

  if (!children.length) {
    console.log('No child branches found');
    return;
  }

  if (children.length === 1) {
    console.log(execCommand(`git checkout ${children[0].branchName}`));
    return;
  }

  const { choice } = await inquirer.prompt([{
    type: 'list',
    name: 'choice',
    message: 'Select child branch:',
    choices: [
      ...children.map((branch, i) => ({
        name: `${i + 1}. ${branch.branchName}${branch.orphaned ? ' (orphaned?)' : ''}`,
        value: branch.branchName
      })),
      { name: 'Cancel', value: 'cancel' }
    ]
  }]);

  if (choice === 'cancel') {
    return;
  }

  try {
    console.log(execCommand(`git checkout ${choice}`));
  } catch (e: unknown) {
    console.error((e as Error).message);
  }
}

export const next: Command = {
  command: 'next',
  description: 'Check out to a child branch',
  impl
}