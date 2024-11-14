export interface EvolveOptions {
  scope: 'self' | 'directs' | 'full';
  continue?: boolean;
  abort?: boolean;
}