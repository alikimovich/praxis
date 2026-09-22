export interface ComponentDoc {
    kind: 'component';
    id: string;
    description: string;
    keywords: string[];
    storyId: string;
    import: string;
    props: Record<string, string>;
    usage: string;
}
/** Detached catalog snapshots. No DOM, filesystem, model, or network access. */
export declare function getCatalog(): {
    components: ComponentDoc[];
    recipes: {
        kind: "recipe";
        id: string;
        description: string;
        keywords: string[];
        storyId: string;
        recipe: import("./recipe.js").PanelRecipe;
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
    }[];
};
