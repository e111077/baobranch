// commit.ts

import type { CommandModule } from "yargs";;
import { execCommand } from "../utils.js";
import inquirer from "inquirer";

interface CommitOptions {
  branch?: string;
  message?: string;
}

export async function commitImpl(argv: CommitOptions) {
  let branchName = argv.branch;

  // If no branch name provided via flag, prompt for one
  if (!branchName) {
    const response = await inquirer.prompt([{
      type: 'input',
      name: 'branchName',
      message: 'Enter new branch name:',
      validate: (input: string) => {
        if (input.trim().length === 0) {
          return 'Branch name cannot be empty';
        }
        return true;
      }
    }]);
    branchName = response.branchName;
    if (!branchName) {
      return;
    }
  }

  branchName = branchName.trim().replaceAll(' ', '-');
  const currentBranch = execCommand('git rev-parse --abbrev-ref HEAD');

  // Create and checkout new branch
  try {
    execCommand(`git checkout -b ${branchName}`, true);
  } catch (error: any) {
    if (error.stderr) {
      process.stderr.write(error.stderr);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }

  // Handle commit
  try {
    if (argv.message) {
      // If message provided, use it directly
      execCommand(`git commit --allow-empty -m "${argv.message}"`, true);
    } else {
      // Otherwise open the default git commit editor
      execCommand('git commit --allow-empty', true);
    }
  } catch (error: any) {
    execCommand(`git checkout ${currentBranch} && git branch -D ${branchName}`, true);
    if (error.stderr) {
      process.stderr.write(error.stderr);
    } else {
      console.error(error.message);
    }
    process.exit(1);
  }
}

export const commit = {
  command: 'commit',
  describe: 'Create a new branch and commit changes',
  builder: (yargs) => {
    return yargs
      .option('branch', {
        alias: 'b',
        type: 'string',
        description: 'Name of the new branch'
      })
      .option('message', {
        alias: 'm',
        type: 'string',
        description: 'Commit message'
      });
  },
  handler: commitImpl
} satisfies CommandModule<{}, CommitOptions>;