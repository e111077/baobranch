import { type Argv, type CommandModule } from "yargs";
import { execCommand, execCommandAsync } from "../../utils.js";
import { getParentBranch } from "../../tree-nav/parent.js";
import { join as pathJoin, } from 'path';
import { commitImpl } from '../commit.js'
import inquirer from "inquirer";
import { findChildren } from "../../tree-nav/children.js";
import { makeSplitBranchBranchName, makeSplitBranchTag, parseSplitBranchBranchName } from "../../tags/split-branch.js";
import { pushChainImpl } from "../push/chain.js";
import { CreateFileError, ExternalEditor, LaunchEditorError, ReadFileError } from 'external-editor';

export async function splitImpl(options: SplitOptions) {
  const originBranch = execCommand('git rev-parse --abbrev-ref HEAD').toString().trim()
  const sourceBranch = options.branch ?? originBranch;

  if (sourceBranch === 'main' || sourceBranch === 'master') {
    console.error('Cannot split from main or master branch');
    process.exit(1);
  }

  if (!sourceBranch) {
    console.error(`Unable to determine current branch: ${sourceBranch}`);
    process.exit(1);
  }

  const sourceBranchExists = doesBranchExist(sourceBranch);
  const emptyRootBranchName = makeSplitBranchBranchName(sourceBranch);

  if (options.publish) {
    let rootBranchName = emptyRootBranchName;
    const { sourceBranch: potentialSourceBranchName }
      = parseSplitBranchBranchName(sourceBranch);

    // We want to accept doing this from the empty root or from the source
    // branch for DX.
    if (potentialSourceBranchName) {
      rootBranchName = sourceBranch;
    }

    await publishSplitBranches(rootBranchName);
    process.exit(0);
  }

  if (options.clean) {
    await clean(emptyRootBranchName, true);
    process.exit(0);
  }

  if (!sourceBranchExists) {
    console.error(`Branch ${sourceBranch} does not exist`);
    process.exit(1);
  }

  const parentBranch = getParentBranch(sourceBranch);

  if (!parentBranch || !parentBranch.branchName) {
    console.error(`Unable to determine parent branch for ${sourceBranch}`);
    process.exit(1);
  }

  const editedFiles = execCommand(`git diff-tree --no-commit-id --name-only -r refs/heads/${sourceBranch}`).split('\n');
  if (editedFiles.length === 1 && !editedFiles[0]) {
    execCommand(`git diff-tree --no-commit-id --name-only -r refs/heads/${sourceBranch}`, true)
    process.exit(1);
  }

  // A map of directories to files that were edited in that directory.
  // e.g. an input of files like:
  //   src/commands/commit.ts
  //   src/commands/split/index.ts
  //   asdf.js
  //   src/asdf.js
  //
  // And a fileSplitter of 'src' would result in:
  //  {
  //    'commands': ['src/commands/commit.ts', 'src/commands/split/index.ts'],
  //    '__nomatch__': ['asdf.js']
  //    '__root__': ['src/asdf.js']
  //  }
  const dirToFiles = new Map<string, string[]>();

  // Adds a / to the end of the fileSplitter if it doesn't already have one
  const fileSplitter = pathJoin(options.fileSplitter, '/');

  // console.log(sourceBranch, fileSplitter, editedFiles);
  for (const file of editedFiles) {
    // If the file splitter is '/' this will never match because the files in
    // git don't start with `/` so we have to specially handle it here
    if (!file.startsWith(fileSplitter) && fileSplitter.length !== 1) {
      if (!dirToFiles.has('__nomatch__')) {
        dirToFiles.set('__nomatch__', []);
      }

      dirToFiles.get('__nomatch__')!.push(file);
      continue;
    }

    // We want to get the subpath and check the first dir. e.g. if we are given:
    //   src/commands/commit.ts
    //   src/commands/split/index.ts
    //   src/qwer/asdf.js
    //
    // If the fileSplitter is 'src' we want to get the subpath of the file which
    // would be:
    //   commands/commit.ts
    //   commands/split/index.ts
    //   qwer/asdf.js
    //
    // But again if the fileSplitter is '/' we want to get the full path and we
    // don't want to split it with '/' so we handle that case separately.
    const subpath = fileSplitter.length === 1 ? file : file.split(fileSplitter)[1];
    const parts = subpath.split('/');

    // No directories, so these are root files like /src/asdf.js vs
    // /src/commands/commit.ts
    if (parts.length === 1) {
      if (!dirToFiles.has('__root__')) {
        dirToFiles.set('__root__', []);
      }

      dirToFiles.get('__root__')!.push(file);
      continue;
    }

    // It's not a non-match or a root file, so we can get the first directory
    const dir = parts[0];

    if (!dirToFiles.has(dir)) {
      dirToFiles.set(dir, []);
    }

    dirToFiles.get(dir)!.push(file);
  }

  const keys = [...dirToFiles.keys()];

  if (!keys.length) {
    console.error(`No changes found in branch ${sourceBranch}. Exiting.`);
    process.exit(1);
  }

  let chosenDirs = { dirs: keys as string[] };

  if (!options.yesToAll) {
    try {
      chosenDirs = await inquirer.prompt([{
        type: 'checkbox',
        name: 'dirs',
        message: `${keys.length} splits found. Select directories to split into their own commits.`,
        choices: [
          ...keys.map((dir, i) => ({
            name: `${i + 1}. ${`${dir
              .replace('__nomatch__', `Non-matching files`)
              .replace('__root__', `Files at root of "${fileSplitter}"`)}`
              } (${dirToFiles.get(dir)!.length} files)`,
            value: dir,
            checked: true
          }))
        ]
      }]);
    } catch {
      console.error('Cancelling split.');
      process.exit(1);
    }
  }

  if (!chosenDirs.dirs.length) {
    console.error('No directories selected. Exiting.');
    process.exit(0);
  }

  const doesEmptyRootBranchExist = doesBranchExist(emptyRootBranchName);

  // It exists, we need to ask whether we want to delete them and start over.
  if (doesEmptyRootBranchExist) {
    let startOver = true;
    if (!options.yesToAll) {
      const result = await inquirer.prompt([{
        type: 'confirm',
        name: 'startOver',
        message: `A split is already in progress. Delete the existing branches and start over?`,
        default: false
      }]);

      startOver = result.startOver;
    }

    if (!startOver) {
      console.log('Exiting.');
      process.exit(0);
    }

    await clean(emptyRootBranchName, false);
  }

  console.log(`Creating ${chosenDirs.dirs.length} new commits from ${sourceBranch}`);

  // Switch to parent branch, create an empty branch commit in which to create
  // split children branch commits
  execCommand(`git checkout ${parentBranch.branchName}`, true);

  // create an empty branch commit for management and then create split branches
  // from this commit
  commitImpl({
    branch: emptyRootBranchName,
    message: `[split-commit] Migration of branch \\\`${sourceBranch}\\\`

Empty commit. This commit was created from splitting \\\`${sourceBranch}\\\` into multiple commits. See the \\\`${sourceBranch}\\\` branch for the full commit, and each child branch for the current status of this migration.`
  });

  const splitBranchTag = makeSplitBranchTag(sourceBranch);
  execCommand(`git tag ${splitBranchTag} ${emptyRootBranchName}`, true);

  const sourceCommitMessage = execCommand(`git log -1 --pretty=%B ${sourceBranch}`).toString().trim();

  execCommand(`git checkout ${emptyRootBranchName}`, true);
  // Get all commit changes from source branch and put them in staging
  execCommand(`git cherry-pick --no-commit ${sourceBranch}`, true);
  // Unstage all changes because we only want to stage the files we want to
  // commit per split
  execCommand(`git restore --staged .`, true);

  let message = options.message ?
    options.message :
    `${sourceCommitMessage ?? `[split-commit] Split commit from \\\`${sourceBranch}\\\` – \\\`{{BB_DIRECTORY}}\``}

This PR is manually generated with [baobranch](https://www.npmjs.com/package/baobranch) by splitting branch [\\\`${sourceBranch}\\\`](../tree/${sourceBranch}) into multiple PRs. See branch [\\\`${sourceBranch}\\\`](../tree/${sourceBranch}) for the full commit, or see the PR for parent branch \\\`${emptyRootBranchName}\\\` to track the status of all split branches.`;

  if (!options.yesToAll && !options.message) {
    let editor: ExternalEditor | null = null;
    try {
      editor = new ExternalEditor(message);
      message = editor.run()

      if (editor.last_exit_status !== 0) {
        console.log('The editor exited with a non-zero code, cancelling split.');
        return;
      }
    } catch (err: unknown) {
      if (err instanceof CreateFileError) {
        console.log('Failed to create the temporary file. Cancelling split.');
        return;
      } else if (err instanceof ReadFileError) {
        console.log('Failed to read the temporary file. Cancelling split.');
        return;
      } else if (err instanceof LaunchEditorError) {
        console.log('Failed to launch your editor. Cancelling split.');
        return;
      }

      throw err;
    } finally {
      editor?.cleanup?.();
    }
  }

  for (const dir of chosenDirs.dirs) {
    const files = dirToFiles.get(dir)!;
    const branchName = `${sourceBranch}--split--${dir}`;

    execCommand(`git add ${files.join(' ')}`, true);

    const displayedDir = dir
      .replace('__nomatch__', 'non-matching files')
      .replace('__root__', `${fileSplitter}`);

    commitImpl({
      branch: branchName,
      message: message.replaceAll(/\{\{\s*?BB_DIRECTOR\s*?\}\}/g, displayedDir)
    });

    console.log(`Successfully created branch ${branchName} with ${files.length} changes.`);

    execCommand(`git checkout ${emptyRootBranchName}`, true);
  }

  // clean up extra files from staging not incldued by previous prompt
  execCommand(`git clean -fd`, true);

  execCommand(`git checkout ${sourceBranch}`, true);
}

/**
 * Determines if a branch exists locally.
 *
 * @param branchName Branch to verify existence
 * @returns True if the branch exists locally. False otherwise.
 */
function doesBranchExist(branchName: string) {
  return execCommand(`git show-ref --verify --quiet refs/heads/${branchName}; echo $?`).toString().trim() === '0'
}

/**
 * Cleans up split branches by deleting the root and all of it's direct children.
 *
 * @param emptyRootBranchName The empty root branch name from which to crawl from
 * @param checkBranchExists Whether or not to check if the branch exists before
 *    cleaning. If true, it will also prompt the user to confirm the deletion of
 *    the branches.
 */
async function clean(emptyRootBranchName: string, checkBranchExists: boolean) {
  if (checkBranchExists) {
    const branchExists = doesBranchExist(emptyRootBranchName);

    if (!branchExists) {
      console.error(`Branch ${emptyRootBranchName} does not exist. Nothing to clean up. Exiting.`);
      process.exit(1);
    }
  }

  const children = findChildren(emptyRootBranchName);

  if (checkBranchExists) {
    const { confirm } = await inquirer.prompt([{
      type: 'confirm',
      name: 'confirm',
      message: `Found ${children.length + 1} branches to delete:
  ${children.map(branch => branch.branchName).join('\n  ')}
  ${emptyRootBranchName}
`,
      default: false
    }]);

    if (!confirm) {
      console.log('Exiting.');
      process.exit(0);
    }
  }

  if (children.length) {
    execCommand(`git branch -D ${children.map(child => child.branchName).join(' ')}`, true);
  }

  execCommand(`git branch -D ${emptyRootBranchName}`, true);
  const { sourceBranch } = parseSplitBranchBranchName(emptyRootBranchName);
  execCommand(`git tag -d ${makeSplitBranchTag(sourceBranch)}`, true);
}

async function publishSplitBranches(rootBranchName: string) {
  if (!doesBranchExist(rootBranchName)) {
    console.error(`Branch ${rootBranchName} does not exist. Exiting.`);
    process.exit(1);
  }

  execCommand(`git checkout ${rootBranchName}`, true);

  const promises: Promise<unknown>[] = [];

  const postPush = async (branch: string) => {
    let baseBranch = rootBranchName;
    if (branch === rootBranchName) {
      const parent = getParentBranch(branch);
      const mainOrMaster = execCommand('git branch --list main').toString().trim() ? 'main' : 'master';
      baseBranch = parent?.branchName ?? mainOrMaster;
    }

    // push with a base and a head given, but open in a browser
    promises.push(execCommandAsync(`gh pr create -B ${baseBranch} -w --head ${branch}`));
  };

  await pushChainImpl({ includeMain: false, postPush, yesToAll: false });

  await Promise.all(promises);
}

/**
 * Rebase command module for baobranch.
 * Handles rebasing the current branch onto a target branch after user confirmation.
 * Updates state to mark child branches as orphaned since they'll need to be rebased too.
 *
 * Usage: fb rebase <branch>
 * Example: fb rebase main
 */
export const split = {
  command: 'split [fileSplitter]',
  describe: 'Split the current commit at HEAD into multiple commits based on ' +
    'the start of a filepath. e.g. given a fileSplitter of src/ a commit with ' +
    'changes to src/commands/commit.ts and src/commands/split/index.ts would be ' +
    'split into two commits, one for each directory.',
  builder: (yargs: Argv) =>
    yargs
      .positional('fileSplitter', {
        describe: 'The directory from which to split the commit',
        type: 'string',
        default: '/'
      })
      .option('branch', {
        alias: 'b',
        describe: 'The branch from which to split from. Default is current branch',
        type: 'string'
      })
      .option('message', {
        describe: 'The commit message to use for the split commits. Use {{BB_DIRECTORY}} to ' +
          'insert the directory name into the message. If not provided, you will be prompted ' +
          'to enter a message for all split commits.',
        type: 'string',
        alias: 'm'
      })
      .option('yes-to-all', {
        describe: 'Automatically split all directories without prompting. This will also ' +
          'use a default commit message if one is not provided with the --message option.',
        type: 'boolean',
        alias: 'y'
      })
      .option('clean', {
        describe: 'Only clean up split branches and exit',
        type: 'boolean',
        alias: 'c'
      })
      .option('publish', {
        describe: 'Publish the split branches to the remote. This can be done' +
          ' from either the empty root branch or the source branch',
        type: 'boolean',
        alias: 'p'
      }),
  handler: splitImpl
} as const satisfies CommandModule<{}, SplitOptions>;

interface SplitOptions {
  branch?: string;
  fileSplitter: string;
  yesToAll?: boolean;
  clean?: boolean;
  publish?: boolean;
  message?: string;
}
