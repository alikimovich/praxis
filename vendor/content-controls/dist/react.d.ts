import type { Snapshot, Store } from './core.js';
/** Subscribe to a stable primitive revision; return an isolated content snapshot. */
export declare function useContentStore<T>(store: Store<T>): Snapshot<T>;
