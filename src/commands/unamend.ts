import type { Argv, CommandModule } from "yargs";
import { execCommand } from '../utils.js';
import inquirer from 'inquirer';

interface UnamendOptions {
  filename?: string;
}

async function unamendImpl({ filename }: UnamendOptions) {
  try {
    // Get files from last commit
    const lastCommitFiles = execCommand('git diff-tree --no-commit-id --name-status -r HEAD')
      .split('\n')
      .map(line => {
        const [status, path] = line.split('\t');
        return path ? { status, path } : null;
      })
      .filter((file): file is { status: string, path: string } => file !== null);

    if (filename) {
      // Find matches based on left-to-right path matching
      const matchingFiles = lastCommitFiles.filter(file => {
        if (filename.endsWith('/')) {
          return file.path.startsWith(filename);
        }
        const inputParts = filename.split('/');
        const fileParts = file.path.split('/');

        return inputParts.every((part, i) => fileParts[i] === part);
      });

      if (matchingFiles.length === 0) {
        console.error(`No files found in last commit matching: ${filename}`);
        process.exit(1);
      }

      // If multiple matches, confirm with user
      if (matchingFiles.length > 1) {
        console.log('Multiple files match:');
        matchingFiles.forEach(file => console.log(`  ${file.path}`));

        const { confirm } = await inquirer.prompt([{
          type: 'confirm',
          name: 'confirm',
          message: 'Unamend all these files?',
          default: false
        }]);

        if (!confirm) {
          console.log('Aborting unamend');
          process.exit(0);
        }
      }

      // Remove matching files from commit
      for (const file of matchingFiles) {
        execCommand(`git reset HEAD^ "${file.path}"`);
        console.log(`Removed ${file.path} from last commit`);
      }

      // Amend the commit without the removed files
      execCommand('git commit --amend --no-edit --allow-empty', true);
    } else {
      console.error('Please specify a file or directory to unamend');
      process.exit(1);
    }

  } catch (error) {
    if (error instanceof Error) {
      console.error('Error unamending commit:', error.message);
    }
    process.exit(1);
  }
}

export const unamend = {
  command: 'unamend <filename>',
  describe: 'Remove files from the last commit and move them to staging',
  builder: (yargs: Argv) =>
    yargs
      .positional('filename', {
        describe: 'File or directory path to remove from commit',
        type: 'string',
        demandOption: true
      } as const),
  handler: async (argv) => {
    await unamendImpl(argv as UnamendOptions);
  }
} as const satisfies CommandModule<{}, UnamendOptions>;