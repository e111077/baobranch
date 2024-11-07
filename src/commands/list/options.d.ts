export type FormatOptions = {
  format: 'pr' | 'branch' | 'both';
};

interface ListOptions extends FormatOptions {
  target: 'parent' | 'children';
}