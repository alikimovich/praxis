export { planAgentInstructions } from './agent-init.js';
import type { PanelRecipe, ContentIssue } from './recipe.js';
export declare const versions: Readonly<{
    readonly apiVersion: 1;
    readonly packageName: string;
    readonly packageVersion: string;
    readonly recipeVersion: 1;
}>;
export type ErrorCode = 'ERR_INVALID_ARGUMENT' | 'ERR_UNKNOWN_COMMAND' | 'ERR_NOT_FOUND' | 'ERR_INVALID_RECIPE' | 'ERR_INVALID_CONTENT' | 'ERR_READ_FILE' | 'ERR_INVALID_JSON' | 'ERR_DIAGNOSTIC_FAILED' | 'ERR_PROJECT_SETUP' | 'ERR_MANAGED_BLOCK' | 'ERR_INIT_CONFLICT' | 'ERR_INIT_WRITE';
export interface ApiError {
    code: ErrorCode;
    message: string;
    suggestions?: string[];
}
export type Response<T = unknown> = typeof versions & {
    ok: boolean;
    type: string;
    data: T;
    error?: ApiError;
};
export declare function success<T>(type: string, data: T): Response<T>;
export declare function failure(code: ErrorCode, message: string, suggestions?: string[]): Response<null>;
export declare function manifest(): Response<{
    commands: ({
        readOnly: boolean;
        flags: {
            name: string;
            type: string;
            default: boolean;
        }[];
        name: "init";
        arguments: readonly [{
            readonly name: "directory";
            readonly type: "directory";
            readonly required: false;
        }];
        responseType: "init.result";
        description: "Add or refresh a managed AGENTS.md block in an installed project. Supports --dry-run.";
    } | {
        readOnly: boolean;
        flags: {
            name: string;
            type: string;
            default: boolean;
        }[];
        name: "manifest";
        arguments: readonly [];
        responseType: "manifest";
        description: "List capabilities and versions.";
    } | {
        readOnly: boolean;
        flags: {
            name: string;
            type: string;
            default: boolean;
        }[];
        name: "search";
        arguments: readonly [{
            readonly name: "query";
            readonly type: "string";
            readonly required: true;
        }];
        responseType: "search.results";
        description: "Rank catalog entries; no model or network calls.";
    } | {
        readOnly: boolean;
        flags: {
            name: string;
            type: string;
            default: boolean;
        }[];
        name: "component get";
        arguments: readonly [{
            readonly name: "id";
            readonly type: "string";
            readonly required: true;
        }];
        responseType: "component.detail";
        description: "Get props, usage, and a Storybook reference.";
    } | {
        readOnly: boolean;
        flags: {
            name: string;
            type: string;
            default: boolean;
        }[];
        name: "recipe get";
        arguments: readonly [{
            readonly name: "id";
            readonly type: "string";
            readonly required: true;
        }];
        responseType: "recipe.detail";
        description: "Get a reviewed recipe and example content.";
    } | {
        readOnly: boolean;
        flags: {
            name: string;
            type: string;
            default: boolean;
        }[];
        name: "validate";
        arguments: readonly [{
            readonly name: "recipe";
            readonly type: "json-file";
            readonly required: true;
        }, {
            readonly name: "content";
            readonly type: "json-file";
            readonly required: false;
        }];
        responseType: "validation.result";
        description: "Validate a recipe and optional content; never writes files.";
    } | {
        readOnly: boolean;
        flags: {
            name: string;
            type: string;
            default: boolean;
        }[];
        name: "doctor";
        arguments: readonly [];
        responseType: "doctor.result";
        description: "Check catalog and this installed package’s build artifacts, not site integration.";
    })[];
    flags: {
        name: string;
        type: string;
        default: boolean;
    }[];
    readOnly: boolean;
    catalog: {
        components: string[];
        recipes: string[];
    };
    conventions: {
        renderer: string;
        store: string;
        stylesheet: string;
        layout: string;
    };
    errorCodes: string[];
    storybookPath: string;
    workflow: string[];
    capabilities: {
        discovery: boolean;
        validation: boolean;
        mount: boolean;
        persistence: boolean;
        mcp: boolean;
    };
}>;
export declare function component(id: string): Response<null> | Response<import("./catalog.js").ComponentDoc>;
export declare function recipe(id: string): Response<null> | Response<{
    kind: "recipe";
    id: string;
    description: string;
    keywords: string[];
    storyId: string;
    recipe: PanelRecipe;
    exampleContent: {
        headline: string;
        projects: {
            id: string;
            title: string;
            description: string;
            year: number;
            status: string;
            featured: boolean;
        }[];
    };
    usage: string;
}>;
export declare function search(query: string): Response<null> | Response<{
    query: string;
    results: {
        kind: "recipe" | "component";
        id: string;
        description: string;
        storyId: string;
        score: number;
        next: string;
    }[];
    hint: string;
}>;
export declare function validate(input: unknown, content?: unknown): Response<{
    recipe: PanelRecipe;
    issues: ContentIssue[];
} | null> & {
    errors: string[];
    version?: number;
    id?: string;
};
export interface Diagnostic {
    id: string;
    ok: boolean;
    message: string;
}
/** IO adapters supply observed artifact checks; no implicit filesystem access. */
export declare function doctor(artifacts?: Diagnostic[]): {
    error?: ApiError;
    ok: boolean;
    apiVersion: 1;
    packageName: string;
    packageVersion: string;
    recipeVersion: 1;
    type: string;
    data: {
        checks: Diagnostic[];
        scope: string;
        limitations: string[];
    };
};
