import type { ReactNode } from 'react';
export interface CollectionProps<T extends {
    id: string;
}> {
    label: string;
    description?: string;
    value: T[];
    onChange: (value: T[]) => void;
    itemLabel: (item: T) => string;
    create: () => T;
    addLabel?: string;
    children: (item: T, update: (change: Partial<Omit<T, 'id'>>) => void) => ReactNode;
}
export declare function Collection<T extends {
    id: string;
}>(props: CollectionProps<T>): import("react").JSX.Element;
