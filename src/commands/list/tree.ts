// tree.ts

import type { ArgumentsCamelCase, Argv, CommandModule } from "yargs";
import { execCommand } from "../../utils.js";
import { cleanupStaleParentTags, makeStaleParentTag } from '../../tags/stale.js'
import { makeMergeBaseTag } from "../../tags/merge-base-master.js";
import { cleanupTags } from "../../tags/cleanup.js";
import { makeSplitBranchTag } from "../../tags/split-branch.js";
import { createPrTerminalLink } from "../../github-helpers/links.js";

/**
 * Prints a visual tree representation of the Git branch structure with colors
 */
function handler(options: ArgumentsCamelCase<ListTreeOptions>): void {
  try {
    // Force Git to use colors even when output is not a terminal
    process.env.FORCE_COLOR = '1';
    cleanupTags();
    cleanupStaleParentTags();
    const masterOrMainBranch = execCommand('git branch --list main') ? 'main' : 'master';
    const format = options.simple ? '--format="%h%C(auto)%d"' : '';
    // Execute the tree command with color preservation
    const rawTree = execCommand(`
# grep filters out output like (HEAD detached at 123456)
BRANCHES=$(git branch --format='%(refname)' | grep "^refs/")
HEAD_COMMIT=$(git rev-parse HEAD)
MERGE_BASE=$(git merge-base --octopus $BRANCHES $HEAD_COMMIT)

if git rev-parse $MERGE_BASE^ >/dev/null 2>&1; then
    # Prints the git log, in the format of <hash> (decorations) and only keeps
    # the commits that have tags, HEAD, a local branch, or a
    # (origin/remote, local-name) decoration. Then cuts the decorations off.
    COMMITS_OF_INTEREST=$(git log --simplify-by-decoration --decorate --oneline --branches \${MERGE_BASE}~..  --format="%h%d" | \
        grep -E "^.+(tag)|(HEAD)|(\\([^/]+\\))|(\\([^/]+, ?origin/.+\\))|(\\(?origin/.+\\,[^/]+)).*$" | \
        cut -d' ' -f1)
else
    # No parent (root commit) - use range to include merge-bas (^@ vs ~..). Find all commits that are only on remote branches
    COMMITS_OF_INTEREST=$(git log --simplify-by-decoration --decorate --oneline --branches \${MERGE_BASE}^@  --format="%h%d" | \
        grep -E "^.+(tag)|(HEAD)|(\\([^/]+\\))|(\\([^/]+, ?origin/.+\\))|(\\(?origin/.+\\,[^/]+)).*$" | \
        cut -d' ' -f1)
fi

if git rev-parse $MERGE_BASE^ >/dev/null 2>&1; then
    # Has parent - use ~.. to show from merge-base up. Then only keeps the
    # commits of interest and the lines that don't have a commit (the branching)
    git -c color.ui=always log --simplify-by-decoration --decorate --oneline --graph --branches ${format} \${MERGE_BASE}~.. | grep -E "$COMMITS_OF_INTEREST|(^[^*]*$)"
else
    # No parent (root commit) - use range to include merge-base
    git -c color.ui=always log --simplify-by-decoration --decorate --oneline --graph --branches ${format} \${MERGE_BASE}^@  | grep -E "$COMMITS_OF_INTEREST|(^[^*]*$)"
fi`);

    const splitBranchTagRegex = new RegExp(`tag:.+?${makeSplitBranchTag('(.+?)')}`, 'g');
    const staleParentRegex = new RegExp(`tag:.+?${makeStaleParentTag('(.+?)', '[0-9]+')}`, 'g');
    const mergeBaseRegex = new RegExp(`tag:.+?${makeMergeBaseTag('[0-9]+')}`, 'g');
    const originRegex = /(?:origin\/[^,)]+,.)|(?:,.*origin\/[^)]+)/g;

    let tree = rawTree
      .replaceAll(staleParentRegex, '$1 - STALE REF')
      .replaceAll(splitBranchTagRegex, 'SPLIT ROOT OF: $1')
      .replaceAll(mergeBaseRegex, `${masterOrMainBranch} - OLD TIP`);

    if (!options.showRemotes) {
      tree = tree.replaceAll(originRegex, '');
    }

    // Linkify PR numbers in commit messages (e.g., #123456)
    tree = tree.replace(/#(\d+)/g, (_match, prNum) => {
      return createPrTerminalLink(parseInt(prNum, 10));
    });

    console.log(tree);
  } catch (error) {
    console.error('Error generating branch tree:', error);
  }
}

// Export the command configuration
export const listTree = {
  command: ['tree', 't'],
  describe: 'Display a visual tree of all branches',
  handler,
  builder: (yargs: Argv) =>
    yargs
    .option('show-remotes', {
      alias: 'r',
      describe: 'Show remote branches from origin/branch-name',
      type: 'boolean',
      default: false,
    })
    .option('simple', {
      alias: 's',
      describe: 'Hide the description of each branch',
      type: 'boolean',
      default: false,
    }),
} as const satisfies CommandModule<{}, ListTreeOptions>;

interface ListTreeOptions {
  showRemotes?: boolean;
  simple?: boolean;
}