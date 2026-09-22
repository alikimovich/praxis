import type { StoreOptions } from './core.js';
/** Versioned data contract for agent-authored panels. No CSS, code, or file paths. */
export type Scalar = string | number | boolean;
interface FieldBase {
    key: string;
    label: string;
    description?: string;
}
export type FieldRecipe = FieldBase & ({
    type: 'text' | 'textarea';
    required?: boolean;
} | {
    type: 'number';
    min?: number;
    max?: number;
    step?: number;
} | {
    type: 'toggle';
} | {
    type: 'select';
    options: string[];
});
export interface CollectionRecipe {
    key: string;
    itemLabelKey: string;
    addLabel?: string;
    defaults: Record<string, Scalar>;
    fields: FieldRecipe[];
}
export type SectionRecipe = {
    id: string;
    title: string;
    description?: string;
} & ({
    fields: FieldRecipe[];
    collection?: never;
} | {
    collection: CollectionRecipe;
    fields?: never;
});
export interface PanelRecipe {
    version: 1;
    id: string;
    title: string;
    sections: SectionRecipe[];
}
export interface ContentIssue {
    path: string;
    message: string;
    kind: 'shape' | 'value';
}
/** Reject unknown properties/versions. Returns a detached copy of a valid recipe. */
export declare function parseRecipe(input: unknown): PanelRecipe;
/** Validate shape and field constraints, retaining fields the recipe doesn't edit. */
export declare function inspectContent(recipe: PanelRecipe, input: unknown): ContentIssue[];
export declare function validateContent(recipe: PanelRecipe, input: unknown): string[];
/** Enforce the recipe on direct store.save() calls as well as the panel button. */
export declare function createRecipeStore<T extends object>(input: PanelRecipe, initial: T, options?: StoreOptions<T>): import("./core.js").Store<T>;
export {};
