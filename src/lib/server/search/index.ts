/**
 * Global search's public surface (#12, ADR 0002): one function, one result shape.
 * Callers import from here and never from a file inside.
 */
export { search } from './search';
export type { SearchGroup, SearchGroupKey, SearchHit, SearchResult } from './search';
