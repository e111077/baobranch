// tree.ts

import type { CommandModule } from "yargs";
import { execCommand } from "../../utils.js";
import { cleanupStaleParentTags, makeStaleParentTag } from '../../tags/stale.js'
import { makeMergeBaseTag, retagMergeBase } from "../../tags/merge-base-master.js";

/**
 * Prints a visual tree representation of the Git branch structure with colors
 */
function handler(): void {
  try {
    // Force Git to use colors even when output is not a terminal
    process.env.FORCE_COLOR = '1';
    retagMergeBase();
    cleanupStaleParentTags();
    const masterOrMainBranch = execCommand('git branch --list main') ? 'main' : 'master';
    // Execute the tree command with color preservation
    const rawTree = execCommand(`
MERGE_BASE=$(git merge-base --octopus $(git branch --format='%(refname)'))

if git rev-parse $MERGE_BASE^ >/dev/null 2>&1; then
    # Prints the git log, in the format of <hash> (decorations) and only keeps
    # the commits that have tags, HEAD, a local branch, or a
    # (origin/remote, local-name) decoration. Then cuts the decorations off.
    COMMITS_OF_INTEREST=$(git log --simplify-by-decoration --decorate --oneline --branches \${MERGE_BASE}~..  --format="%h%d" | \
        grep -E "^.+(tag)|(HEAD)|(\\([^/]+\\))|(\\([^/]+, ?origin/.+\\))|(\\(?origin/.+\\,[^/]+)).*$" | \
        cut -d' ' -f1)
else
    # No parent (root commit) - use range to include merge-base. Find all commits that are only on remote branches
    COMMITS_OF_INTEREST=$(git log --simplify-by-decoration --decorate --oneline --branches \${MERGE_BASE}^@  --format="%h%d" | \
        grep -E "^.+(tag)|(HEAD)|(\\([^/]+\\))|(\\([^/]+, ?origin/.+\\))|(\\(?origin/.+\\,[^/]+)).*$" | \
        cut -d' ' -f1)
fi

if git rev-parse $MERGE_BASE^ >/dev/null 2>&1; then
    # Has parent - use ~.. to show from merge-base up. Then only keeps the
    # commits of interest and the lines that don't have a commit (the branching)
    git -c color.ui=always log --simplify-by-decoration --decorate --oneline --graph --branches \${MERGE_BASE}~.. | grep -E "$COMMITS_OF_INTEREST|(^[^*]*$)"
else
    # No parent (root commit) - use range to include merge-base
    git -c color.ui=always log --simplify-by-decoration --decorate --oneline --graph --branches \${MERGE_BASE}^@  | grep -E "$COMMITS_OF_INTEREST|(^[^*]*$)"
fi`);

    const staleParentRegex = new RegExp(`tag:.+${makeStaleParentTag('(.+?)', '[0-9]+')}`, 'g');
    const mergeBaseRegex = new RegExp(`tag:.+${makeMergeBaseTag('[0-9]+')}`, 'g');
    const tree = rawTree
      .replaceAll(staleParentRegex, '$1 - STALE REF')
      .replaceAll(mergeBaseRegex, `${masterOrMainBranch} - OLD TIP`);
    console.log(tree);
  } catch (error) {
    console.error('Error generating branch tree:', error);
  }
}

// Export the command configuration
export const listTree = {
  command: ['tree', 't'],
  describe: 'Display a visual tree of all branches',
  handler
} satisfies CommandModule<{}, {}>;