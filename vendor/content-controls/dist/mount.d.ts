import type { ReactNode } from 'react';
/** Mount React controls into an empty container owned by the host (e.g. Svelte). */
export declare function mountControls(container: HTMLElement, content: ReactNode): {
    render(next: ReactNode): void;
    unmount(): void;
};
