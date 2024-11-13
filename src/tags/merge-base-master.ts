import { execCommand } from "../utils.js";

/**
 * Updates merge-base tags for tracking branch relationships
 * This helps maintain branch hierarchy information even when branches are deleted
 */
export function retagMergeBase() {
  const masterOrMainBranch = execCommand('git rev-parse --verify main 2>/dev/null') !== '' ? 'main' : 'master';

  // This script will:
  // 1. Remove all existing numbered merge-base tags
  // 2. Find merge-bases with master / main and tag them with incrementing numbers
  execCommand(`
# Remove all existing numbered merge-base tags
git tag | grep '^merge-base-master-[0-9]\+$' | xargs -r git tag -d

# Find merge-bases and tag them with incrementing numbers
MERGE_BASES=$(git branch --format='%(refname:short)' | while read branch; do
    if [ "$branch" != "${masterOrMainBranch}" ]; then
        git merge-base ${masterOrMainBranch} $branch
    fi
done | sort -u | while read commit; do
    if ! git branch --contains $commit | grep -q "^[* ] $commit$" && \
      [ "$commit" != "$(git rev-parse ${masterOrMainBranch})" ]; then
        echo $commit
    fi
done)

counter=1
echo "$MERGE_BASES" | while read commit; do
    git tag -f merge-base-master-$counter $commit
    counter=$((counter + 1))
done
  `);
}