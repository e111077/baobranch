export interface BranchState {
  timestamp: number;
  branches: {
    [branchName: string]: {
      parent: string | null;
      children: string[];
      lastKnownParentCommit?: string;
      orphaned: boolean;
    }
  }
}