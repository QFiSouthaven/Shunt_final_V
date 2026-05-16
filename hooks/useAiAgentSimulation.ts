
// hooks/useAiAgentSimulation.ts
import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { executeTool, ToolResult, ExecutionContext } from '../styles/services/toolApi';

export interface Log { id: string; timestamp: string; action: string; request: any; response?: ToolResult; status: 'pending' | 'success' | 'error'; }
export interface FileChange { path: string; diff: string; newContent?: string; }

interface SimulationCallbacks {
    addLog: (log: Log) => void;
    updateLog: (log: Log) => void;
    setFileChanges: (change: FileChange) => void;
    setScratchpad: (scratchpad: Record<string, any>) => void;
    setVcsState: (state: any) => void;
    setExecutionContext: (context: ExecutionContext) => void;
    clearState: () => void;
}

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export const useAiAgentSimulation = (callbacks: SimulationCallbacks) => {
    const [isRunning, setIsRunning] = useState(false);
    const isRunningRef = useRef(false);
    const executionContextRef = useRef<ExecutionContext>({ agentId: 'agent-007', permissions: [] });

    const runApiCall = async (toolName: string, args: any): Promise<ToolResult> => {
        const logId = uuidv4();
        const logEntry: Log = {
            id: logId,
            timestamp: new Date().toLocaleTimeString(),
            action: toolName,
            request: args,
            status: 'pending',
        };
        callbacks.addLog(logEntry);
        
        const response = await executeTool(toolName, args, executionContextRef.current);
        
        callbacks.updateLog({ ...logEntry, response, status: response.success ? 'success' : 'error' });
        
        if (!response.success) {
            throw new Error(response.error!.message);
        }
        return response;
    };

    const run = useCallback(async () => {
        if (isRunningRef.current) return;
        setIsRunning(true);
        isRunningRef.current = true;
        callbacks.clearState();
        
        const updateContext = (permissions: string[]) => {
            executionContextRef.current = { ...executionContextRef.current, permissions };
            callbacks.setExecutionContext(executionContextRef.current);
        };

        try {
            // --- Phase 1: Initial Setup ---
            updateContext(['system:admin']);
            await runApiCall('resetState', {});
            await sleep(500);

            // --- Phase 2: Refactoring & First Write ---
            updateContext(['filesystem:read', 'filesystem:write', 'scratchpad:write', 'vcs:read']);
            await runApiCall('read_file', { path: 'src/auth.js' });
            
            const plan = "1. Refactor auth.js to use async/await. 2. Stage and commit changes to a new branch.";
            await runApiCall('scratchpad.set', { key: "plan", value: plan });
            callbacks.setScratchpad({ plan });
            
            const refactoredContent = `// Refactored to use async/await
const db = require('./utils/db');

async function loginUser(email, password) {
    const user = await db.findUser({ email: email });
    if (!user || user.password !== password) {
        throw new Error('Invalid credentials');
    }
    return user;
}

module.exports = { loginUser };
`;
            const writeResult = await runApiCall('write_file', { path: 'src/auth.js', content: refactoredContent });
            if (writeResult.success && writeResult.data) callbacks.setFileChanges(writeResult.data);
            await sleep(1000);

            // --- Phase 3: Version Control Workflow ---
            updateContext(['vcs:read', 'vcs:stage', 'vcs:branch', 'vcs:commit']);

            // 3a. Check status (should be unstaged)
            let statusResult = await runApiCall('git.get_status', {});
            if (statusResult.success) callbacks.setVcsState(statusResult.data);
            await sleep(1500);

            // 3b. Stage changes
            await runApiCall('git.add', { paths: ['src/auth.js'] });
            statusResult = await runApiCall('git.get_status', {});
            if (statusResult.success) callbacks.setVcsState(statusResult.data);
            await sleep(1500);

            // 3c. Create branch and commit
            await runApiCall('git.create_branch', { branch_name: 'feature/promise-refactor' });
            statusResult = await runApiCall('git.get_status', {});
            if (statusResult.success) callbacks.setVcsState(statusResult.data);
            await sleep(1000);

            await runApiCall('git.commit_changes', { commit_message: 'refactor(auth): Convert to async/await' });
            statusResult = await runApiCall('git.get_status', {});
            if (statusResult.success) callbacks.setVcsState(statusResult.data);
            
            // Final log message
            callbacks.addLog({
                id: uuidv4(),
                timestamp: new Date().toLocaleTimeString(),
                action: 'agent.complete',
                request: { message: "Workflow complete. Changes committed to new branch." },
                status: 'success'
            });

        } catch (error) {
            console.error("Simulation failed:", error);
            const errorLog: Log = { id: uuidv4(), timestamp: new Date().toLocaleTimeString(), action: 'agent.error', request: { message: "Simulation halted due to an unrecoverable error." }, status: 'error', response: { success: false, data: null, error: { type: 'EXECUTION', message: (error as Error).message, details: null } } };
            callbacks.addLog(errorLog);
        } finally {
            setIsRunning(false);
            isRunningRef.current = false;
        }
    }, [callbacks]);
    
    const reset = useCallback(() => {
        callbacks.clearState();
        executeTool('resetState', {}, { agentId: 'admin', permissions: ['system:admin'] });
    }, [callbacks]);

    return { run, reset, isRunning };
};
