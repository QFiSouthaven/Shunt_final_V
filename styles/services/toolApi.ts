
// services/toolApi.ts
import { createTwoFilesPatch } from 'diff';

// --- v3 Architecture: Interfaces & Types ---

export interface ExecutionContext {
    agentId: string;
    permissions: string[];
}

export interface StructuredError {
    type: 'VALIDATION' | 'EXECUTION' | 'NOT_FOUND' | 'AUTHORIZATION';
    message: string;
    details: object | null;
}

export interface ToolResult {
    success: boolean;
    data: any | null;
    error: StructuredError | null;
}

// The contract for all tools
interface Tool {
    getName(): string;
    getDescription(): string;
    getInputSchema(): object; // Using object for simplicity, could be JSONSchema
    getRequiredPermissions(): string[];
    execute(args: any): Promise<any>;
}


// --- Mock State ---
const initialFileSystem: Record<string, string> = {
    'src/auth.js': `
// Callback-based authentication
const db = require('./utils/db');

function loginUser(email, password, callback) {
    db.findUser({ email: email }, (err, user) => {
        if (err) { return callback(err); }
        if (!user || user.password !== password) { return callback(new Error('Invalid credentials')); }
        return callback(null, user);
    });
}

module.exports = { loginUser };
`,
    'src/utils/db.js': `
// Mock DB utility
const users = [{ email: 'test@example.com', password: 'password123' }];

function findUser(query) {
    return new Promise((resolve) => {
        setTimeout(() => {
            const user = users.find(u => u.email === query.email);
            resolve(user || null);
        }, 300);
    });
}
module.exports = { findUser };
`,
    'package.json': JSON.stringify({ name: 'test-project', version: '1.0.0', scripts: { test: 'echo "Running tests..." && exit 0' } }, null, 2),
};

// These represent the "committed" state of the files
let committedFileSystem: Record<string, string> = { ...initialFileSystem };
// This represents the live, working directory
let mockFileSystem: Record<string, string> = { ...initialFileSystem };
let mockScratchpad: Record<string, any> = {};
let mockVCS = {
    currentBranch: 'main',
    status: { staged: [] as string[], unstaged: [] as string[], untracked: [] as string[] },
};

// --- Helper Functions ---
const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

// --- v3 Architecture: Tool Implementations ---

class ReadFileTool implements Tool {
    getName = () => 'read_file';
    getDescription = () => 'Reads the content of a specific file.';
    getInputSchema = () => ({ type: 'object', properties: { path: { type: 'string' } }, required: ['path'] });
    getRequiredPermissions = () => ['filesystem:read'];
    async execute({ path }: { path: string }): Promise<string> {
        // Real-world Bridge: If MCP extension is present, use it.
        if (window.mcpExtension && window.mcpExtension.fs) {
            console.log(`[Tool: read_file] Delegating to MCP Extension for path: ${path}`);
            return await window.mcpExtension.fs.readFile(path);
        }

        // Fallback to Mock
        await sleep(200);
        if (path in mockFileSystem) return mockFileSystem[path];
        throw new Error(`File not found: ${path}`);
    }
}

class WriteFileTool implements Tool {
    getName = () => 'write_file';
    getDescription = () => 'Writes content to a specific file.';
    getInputSchema = () => ({ type: 'object', properties: { path: { type: 'string' }, content: { type: 'string' } }, required: ['path', 'content'] });
    getRequiredPermissions = () => ['filesystem:write'];
    async execute({ path, content }: { path: string, content: string }): Promise<{ path: string, diff: string }> {
        // Real-world Bridge: If MCP extension is present, use it.
        if (window.mcpExtension && window.mcpExtension.fs) {
            console.log(`[Tool: write_file] Delegating to MCP Extension for path: ${path}`);
            // Note: In a real implementation, we'd read the old content first to generate a diff before writing.
            // For now, we assume the agent already read it or we skip the diff for the return value in real-mode.
            let oldContent = '';
            try {
                oldContent = await window.mcpExtension.fs.readFile(path);
            } catch (e) { /* File might be new */ }
            
            await window.mcpExtension.fs.saveFile(path, content);
            const diff = createTwoFilesPatch(path, path, oldContent, content, 'Old', 'New');
            return { path, diff };
        }

        // Fallback to Mock
        await sleep(500);
        const oldContent = mockFileSystem[path] || '';
        mockFileSystem[path] = content;
        
        // Update VCS status
        if (!mockVCS.status.unstaged.includes(path)) {
            mockVCS.status.unstaged.push(path);
        }
        // If it was staged, a new edit makes it unstaged again
        mockVCS.status.staged = mockVCS.status.staged.filter(p => p !== path);

        const diff = createTwoFilesPatch(path, path, oldContent, content, 'Old', 'New');
        return { path, diff };
    }
}

class RunTestsTool implements Tool {
    getName = () => 'run_tests';
    getDescription = () => 'Runs the project\'s test suite.';
    getInputSchema = () => ({});
    getRequiredPermissions = () => ['execution:tests'];
    async execute() {
        await sleep(2000);
        return { success: true, passed: 12, failed: 0 };
    }
}

class ExecuteScriptTool implements Tool {
    getName = () => 'execute_script';
    getDescription = () => 'Executes a script file.';
    getInputSchema = () => ({ type: 'object', properties: { path: { type: 'string' } }, required: ['path'] });
    getRequiredPermissions = () => ['execution:scripts'];
    async execute({ path }: { path: string }) {
        await sleep(1500);
        if (path.startsWith('tests/')) return { stdout: 'Login test successful!', exit_code: 0 };
        throw new Error(`Cannot execute script: ${path}`);
    }
}

class ScratchpadSetTool implements Tool {
    getName = () => 'scratchpad.set';
    getDescription = () => 'Saves a key-value pair to the scratchpad.';
    getInputSchema = () => ({});
    getRequiredPermissions = () => ['scratchpad:write'];
    async execute({ key, value }: { key: string, value: any }) {
        await sleep(100);
        mockScratchpad[key] = value;
        return { status: 'ok', key, value };
    }
}

class GitAddTool implements Tool {
    getName = () => 'git.add';
    getDescription = () => 'Stages file changes for the next commit.';
    getInputSchema = () => ({ type: 'object', properties: { paths: { type: 'array', items: { type: 'string' } } }, required: ['paths'] });
    getRequiredPermissions = () => ['vcs:stage'];
    async execute({ paths }: { paths: string[] }) {
        await sleep(300);
        paths.forEach(path => {
            if (mockVCS.status.unstaged.includes(path)) {
                mockVCS.status.unstaged = mockVCS.status.unstaged.filter(p => p !== path);
                if (!mockVCS.status.staged.includes(path)) {
                    mockVCS.status.staged.push(path);
                }
            }
        });
        return { message: `Staged ${paths.length} file(s).` };
    }
}

class GitCreateBranchTool implements Tool {
    getName = () => 'git.create_branch';
    getDescription = () => 'Creates a new git branch.';
    getInputSchema = () => ({ type: 'object', properties: { branch_name: { type: 'string' } }, required: ['branch_name'] });
    getRequiredPermissions = () => ['vcs:branch'];
    async execute({ branch_name }: { branch_name: string }) {
        await sleep(400);
        mockVCS.currentBranch = branch_name;
        return { message: `Switched to a new branch '${branch_name}'` };
    }
}

class GitCommitTool implements Tool {
    getName = () => 'git.commit_changes';
    getDescription = () => 'Commits staged changes.';
    getInputSchema = () => ({ type: 'object', properties: { commit_message: { type: 'string' } }, required: ['commit_message'] });
    getRequiredPermissions = () => ['vcs:commit'];
    async execute({ commit_message }: { commit_message: string }) {
        await sleep(600);
        if (mockVCS.status.staged.length === 0) {
            return { message: "nothing to commit, working tree clean" };
        }
        // Update the "committed" state to match the current working directory for staged files
        mockVCS.status.staged.forEach(path => {
            committedFileSystem[path] = mockFileSystem[path];
        });
        mockVCS.status.staged = [];
        return { message: `Committed with message: "${commit_message}"` };
    }
}

class GetStatusTool implements Tool {
    getName = () => 'git.get_status';
    getDescription = () => 'Gets the git status by diffing against the last commit.';
    getInputSchema = () => ({});
    getRequiredPermissions = () => ['vcs:read'];
    async execute() {
        await sleep(200);
        // Recalculate unstaged based on diff with committed state, but preserve staged files
        const unstaged: string[] = [];
        for (const path in mockFileSystem) {
            if (mockFileSystem[path] !== committedFileSystem[path] && !mockVCS.status.staged.includes(path)) {
                unstaged.push(path);
            }
        }
        mockVCS.status.unstaged = unstaged;
        return mockVCS;
    }
}

class ResetStateTool implements Tool {
    getName = () => 'resetState';
    getDescription = () => 'Resets the entire simulation state.';
    getInputSchema = () => ({});
    getRequiredPermissions = () => ['system:admin'];
    async execute() {
        committedFileSystem = { ...initialFileSystem };
        mockFileSystem = { ...initialFileSystem };
        mockScratchpad = {};
        mockVCS = { currentBranch: 'main', status: { staged: [], unstaged: [], untracked: [] } };
        await sleep(100);
        return "State has been reset.";
    }
}

// --- v3 Architecture: Core Components ---

class ToolRegistry {
    private tools = new Map<string, Tool>();

    constructor() {
        [
            new ReadFileTool(), new WriteFileTool(), new RunTestsTool(),
            new ExecuteScriptTool(), new ScratchpadSetTool(), new GitAddTool(), 
            new GitCreateBranchTool(), new GitCommitTool(), new GetStatusTool(), 
            new ResetStateTool()
        ].forEach(tool => this.register(tool));
    }

    register(tool: Tool) { this.tools.set(tool.getName(), tool); }
    getTool(name: string): Tool | undefined { return this.tools.get(name); }
}

export const toolRegistry = new ToolRegistry();

export async function executeTool(toolName: string, args: any, context: ExecutionContext): Promise<ToolResult> {
    const tool = toolRegistry.getTool(toolName);
    if (!tool) {
        return { 
            success: false, 
            data: null, 
            error: { 
                type: 'NOT_FOUND', 
                message: `Tool '${toolName}' not found.`, 
                details: null 
            } 
        };
    }

    try {
        // 1. Authorization Check
        const requiredPermissions = tool.getRequiredPermissions();
        const missingPermissions = requiredPermissions.filter(p => !context.permissions.includes(p));
        if (missingPermissions.length > 0) {
            return { 
                success: false, 
                data: null, 
                error: { 
                    type: 'AUTHORIZATION', 
                    message: `Agent lacks required permissions: ${missingPermissions.join(', ')}`, 
                    details: { required: requiredPermissions, missing: missingPermissions } 
                } 
            };
        }

        // 2. Input Validation (Aggregated)
        const schema = tool.getInputSchema() as any;
        const missingArgs: string[] = [];
        
        if (schema.required && Array.isArray(schema.required)) {
            for (const key of schema.required) {
                if (args === null || typeof args !== 'object' || !(key in args) || args[key] === undefined) {
                    missingArgs.push(key);
                }
            }
        }

        if (missingArgs.length > 0) {
             return { 
                 success: false, 
                 data: null, 
                 error: { 
                     type: 'VALIDATION', 
                     message: `Missing required arguments: ${missingArgs.join(', ')}`, 
                     details: { missing: missingArgs } 
                 } 
             };
        }
        
        // 3. Safe Execution
        const data = await tool.execute(args);
        return { success: true, data, error: null };

    } catch (error: any) {
        // 4. Robust Error Handling
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        
        // Check if it's a known StructuredError type, otherwise default to EXECUTION
        const errorType = (error.type && ['VALIDATION', 'EXECUTION', 'NOT_FOUND', 'AUTHORIZATION'].includes(error.type)) 
            ? error.type 
            : 'EXECUTION';

        return { 
            success: false, 
            data: null, 
            error: { 
                type: errorType, 
                message, 
                details: error.details || (stack ? { stack } : null) 
            } 
        };
    }
}
