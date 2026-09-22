import type { Store } from './core.js';
import type { PanelRecipe } from './recipe.js';
export interface RecipePanelProps<T extends object> {
    recipe: PanelRecipe;
    store: Store<T>;
    open?: boolean;
    onClose?: () => void;
    saveLabel?: string;
    autoFocus?: boolean;
}
/** Canonical renderer: recipes choose content, this component owns presentation. */
export declare function RecipePanel<T extends object>({ recipe: input, store, ...props }: RecipePanelProps<T>): import("react").JSX.Element;
