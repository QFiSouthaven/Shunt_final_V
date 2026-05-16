// services/diagramService.ts

interface ProjectFile {
    filename: string;
    content: string;
}

/**
 * Generates a text-based file tree from a list of file paths.
 */
export const generateFileTree = (files: { filename: string }[]): string => {
    const root: any = {};

    for (const file of files) {
        const parts = file.filename.split('/');
        let current = root;
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!current[part]) {
                current[part] = i === parts.length - 1 ? null : {};
            }
            current = current[part];
        }
    }

    const buildTreeString = (node: any, prefix = ''): string => {
        let result = '';
        const keys = Object.keys(node);
        keys.forEach((key, index) => {
            const isLast = index === keys.length - 1;
            result += `${prefix}${isLast ? '└── ' : '├── '}${key}\n`;
            if (node[key] !== null) {
                result += buildTreeString(node[key], `${prefix}${isLast ? '    ' : '│   '}`);
            }
        });
        return result;
    };

    return `\`\`\`
${buildTreeString(root)}
\`\`\``;
};

/**
 * Generates a Mermaid.js graph syntax for the component hierarchy.
 */
export const generateComponentDiagram = (files: ProjectFile[]): string => {
    // A more robust regex to capture component names (including dot notation like React.Fragment)
    // and avoid capturing attributes or other characters.
    const componentRegex = /<([A-Z][a-zA-Z0-9_.]*)/g;
    const dependencies: { [parent: string]: Set<string> } = {};

    const getComponentName = (path: string): string => {
        const parts = path.split('/');
        const filename = parts[parts.length - 1];
        if (filename === 'index.tsx' && parts.length > 1) {
            return parts[parts.length - 2];
        }
        return filename.replace(/\.tsx$/, '');
    };

    for (const file of files) {
        if (!file.filename.endsWith('.tsx')) continue;

        const parentComponent = getComponentName(file.filename);
        if (!dependencies[parentComponent]) {
            dependencies[parentComponent] = new Set();
        }

        // This comment stripping logic was buggy and could corrupt string literals,
        // leading to parsing errors. It's safer to run the regex on the full content.
        const contentWithoutComments = file.content;

        let match;
        // Reset regex state for each new file content being processed.
        componentRegex.lastIndex = 0;
        while ((match = componentRegex.exec(contentWithoutComments)) !== null) {
            const childComponent = match[1];

            // Explicitly skip self-references to prevent cycles.
            if (childComponent === parentComponent) {
                continue;
            }
            
            // The regex already ensures the name starts with a capital,
            // so we just add it to the dependency set.
            dependencies[parentComponent].add(childComponent);
        }
    }

    let mermaidGraph = 'graph TD;\n';
    for (const parent in dependencies) {
        if (dependencies[parent].size > 0) {
            dependencies[parent].forEach(child => {
                // Final safeguard against cycles before writing to the graph string.
                if (parent !== child) {
                    // Ensure strings are properly quoted to handle names like `React.Fragment`.
                    mermaidGraph += `    "${parent}" --> "${child}";\n`;
                }
            });
        }
    }

    return mermaidGraph;
};