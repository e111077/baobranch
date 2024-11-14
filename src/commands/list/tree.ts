// tree.ts

import type { CommandModule } from "yargs";
import { execCommand } from "../../utils.js";
import { cleanupStaleParentTags } from '../../tags/stale.js'

/**
 * Prints a visual tree representation of the Git branch structure with colors
 */
function handler(): void {
  try {
    // Force Git to use colors even when output is not a terminal
    process.env.FORCE_COLOR = '1';

    cleanupStaleParentTags();
    const masterOrMainBranch = execCommand('git branch --list main') ? 'main' : 'master';
    // Execute the tree command with color preservation
    const rawTree = execCommand(`
MERGE_BASE=$(git merge-base --octopus $(git branch --format='%(refname)'))
if git rev-parse $MERGE_BASE^ >/dev/null 2>&1; then
    # Has parent - use ~.. to show from merge-base up
    git -c color.ui=always log --simplify-by-decoration --decorate --oneline --graph --branches \${MERGE_BASE}~..
else
    # No parent (root commit) - use range to include merge-base
    git -c color.ui=always log --simplify-by-decoration --decorate --oneline --graph --branches \${MERGE_BASE}^@
fi`);

    const tree = rawTree
      .replaceAll(/tag:.+stale-parent--figbranch--(.+?)--figbranch--[0-9]+/g, '$1 - STALE REF')
      .replaceAll(/tag:.+merge-base-master-[0-9]+/g, `${masterOrMainBranch} - OLD TIP`);
    console.log(tree);
  } catch (error) {
    console.error('Error generating branch tree:', error);
  }
}

// Export the command configuration
export const listTree = {
  command: ['tree', 'tr'],
  describe: 'Display a visual tree of all branches',
  handler
} satisfies CommandModule<{}, {}>;