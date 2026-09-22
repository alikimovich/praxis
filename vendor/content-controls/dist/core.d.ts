/** Values must be plain JSON data. Unknown fields are retained by the store. */
export interface Snapshot<T> {
    value: T;
    dirty: boolean;
    saving: boolean;
    canUndo: boolean;
    errors: string[];
    saveError: string | null;
}
export interface StoreOptions<T> {
    validate?: (value: T) => string[];
    save?: (value: T) => void | Promise<void>;
    historyLimit?: number;
}
export interface Store<T> {
    /** Monotonic revision for framework subscriptions. */
    getVersion(): number;
    getSnapshot(): Snapshot<T>;
    set(value: T): void;
    update(change: (value: T) => T): void;
    undo(): void;
    reset(): void;
    save(): Promise<void>;
    subscribe(listener: (snapshot: Snapshot<T>) => void): () => void;
}
export interface Binding<T> {
    get(): T;
    set(value: T): void;
    subscribe(listener: (value: T) => void): () => void;
}
export declare function createStore<T>(initial: T, options?: StoreOptions<T>): Store<T>;
/** A typed lens; write must return the full document, preserving unrelated fields. */
export declare function bind<T, V>(store: Store<T>, read: (value: T) => V, write: (value: T, next: V) => T): Binding<V>;
/** Stable IDs are supplied by the host. No index is used as item identity. */
export declare function updateItem<T extends {
    id: string;
}>(items: T[], id: string, change: Partial<Omit<T, 'id'>>): T[];
export declare function moveItem<T extends {
    id: string;
}>(items: T[], id: string, offset: -1 | 1): T[];
