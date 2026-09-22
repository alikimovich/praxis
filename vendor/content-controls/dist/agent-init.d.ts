export type CliLocation = 'source' | 'installed';
/** Pure managed-block planner; the CLI owns filesystem inspection and writes. */
export declare function planAgentInstructions(before: string, location?: CliLocation): {
    before: string;
    after: string;
    changed: boolean;
    command: string;
};
