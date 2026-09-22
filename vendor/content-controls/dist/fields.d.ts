import type { ButtonHTMLAttributes } from 'react';
export interface FieldProps<T> {
    label: string;
    value: T;
    onChange: (value: T) => void;
    description?: string;
    error?: string;
    disabled?: boolean;
}
export declare function TextField(props: FieldProps<string> & {
    multiline?: boolean;
}): import("react").JSX.Element;
export interface NumberFieldProps extends FieldProps<number> {
    min?: number;
    max?: number;
    step?: number;
}
export declare function NumberField(props: NumberFieldProps): import("react").JSX.Element;
export declare function ToggleField(props: FieldProps<boolean>): import("react").JSX.Element;
export interface SelectFieldProps extends FieldProps<string> {
    options: readonly {
        value: string;
        label: string;
    }[];
}
export declare function SelectField(props: SelectFieldProps): import("react").JSX.Element;
export interface ActionProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    primary?: boolean;
}
export declare function Action({ primary, className, type, ...props }: ActionProps): import("react").JSX.Element;
