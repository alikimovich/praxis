import type { ReactNode } from 'react';
import type { Store } from './core.js';
export interface PanelProps<T> {
    title: string;
    store: Store<T>;
    children: ReactNode;
    open?: boolean;
    onClose?: () => void;
    saveLabel?: string;
    /** Additional display/Save-button validation; also validate in the host store. */
    validationErrors?: readonly string[];
    /** Disable in component catalogs or inline previews that should not take focus. */
    autoFocus?: boolean;
}
/** Nonmodal panel; the host owns positioning and the long-lived content store. */
export declare function Panel<T>({ title, store, children, open, onClose, saveLabel, validationErrors, autoFocus }: PanelProps<T>): import("react").JSX.Element;
