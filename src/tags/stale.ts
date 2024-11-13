import { execCommand } from "../utils.js";
import { retagMergeBase } from "./merge-base-master.js";

export function markStale(commit: string, branchName: string, hasNonOrphanedChildren: boolean) {
  if (hasNonOrphanedChildren) {
    // tag current commit with stale-parent--branchName--[0-9]+
    const staleTagsSplit = execCommand(`git tag | grep -E '^stale-parent--figbranch--${branchName}--figbranch--[0-9]+$'`)
        .split('\n')
        .filter(tag => tag.length)
        .map(tag => tag.split('--figbranch--')[2]);
    const lastStaleTagNum = staleTagsSplit.length ? parseInt(staleTagsSplit[staleTagsSplit.length - 1]) : -1;

    // Tag the current commit with a stale-parent tag
    execCommand(`git tag stale-parent--figbranch--${branchName}--figbranch--${lastStaleTagNum + 1} ${commit}`);
  }

  if (!hasNonOrphanedChildren) {
    clearStaleParentTags(commit);
  }
}

export function clearStaleParentTags(commit: string) {
  retagMergeBase();
  // crawl up chain until we get to a merge-base-master-[0-9]+ tag or a branch tip and delete the stale-parent tags
  const chain = execCommand(`git rev-list --first-parent ${commit}`).split('\n');

  for (let i = 1; i < chain.length; i++) {
    const chainedCommit = chain[i];
    // Check if the commit is tagged with a stale-parent tag
    const staleBranchTag = execCommand(`git tag --points-at ${chainedCommit} | grep -E '^stale-parent--figbranch--.+$'`);
    const mergeBaseMaster = execCommand(`git tag --points-at ${chainedCommit} | grep -E '^merge-base-master-.+$'`);

    const commitHasOtherChildren = execCommand(`git branch --contains ${chainedCommit}`);

    if (i == 1 && mergeBaseMaster && !commitHasOtherChildren) {
      execCommand(`git tag -d ${mergeBaseMaster}`);
    }

    // break if not a stale-parent tag such as merge-base-master-[0-9]+
    if (!staleBranchTag || commitHasOtherChildren) {
      break;
    }

    // Delete the stale-parent tag
    execCommand(`git tag -d ${staleBranchTag}`);
  }

  retagMergeBase();
}