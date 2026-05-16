
// components/foundry/Foundry.tsx
import React, { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TabFooter from '../common/TabFooter';
import { FoundryAgent, FoundryPhase, AgentName, LogEntry, LogEntryType } from '@/types';
import { BranchingIcon } from '../icons';
import Loader from '../Loader';
import MarkdownRenderer from '../common/MarkdownRenderer';
import { useTelemetry } from '../../../styles/services/context/TelemetryContext';
import AgentCard from './AgentCard';
import LiveLog from './LiveLog';
import { generateRawText } from '../../../styles/services/aiService';
import ProjectContextPanel from './ProjectContextPanel';
import { useRealTimePrompt } from '../../useRealTimePrompt';
import { RealTimeFeedback } from '../common/RealTimeFeedback';

interface ProjectFile {
    filename: string;
    content: string;
}

const AGENT_NAMES: AgentName[] = ['Architect', 'Refactor', 'Security', 'QA', 'UX', 'DevOps', 'Backend'];

const initialAgents: FoundryAgent[] = AGENT_NAMES.map(name => ({
    name,
    status: 'Idle',
}));

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

const Foundry: React.FC = () => {
    const [goal, setGoal] = useState(() => localStorage.getItem('foundry_goal') || 'Build a comprehensive oversight system for Kings Laundry.');
    const [projectFiles, setProjectFiles] = useState<ProjectFile[]>(() => {
        try {
            const saved = localStorage.getItem('foundry_projectFiles');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });
    const [phase, setPhase] = useState<FoundryPhase>('Idle');
    const [agents, setAgents] = useState<FoundryAgent[]>(initialAgents);
    const [log, setLog] = useState<LogEntry[]>([]);
    const [finalPlan, setFinalPlan] = useState<string | null>(null);
    const { updateTelemetryContext } = useTelemetry();

    // RT Prompt Hook
    const { feedback, isLoading: isRTLoading, applyFeedback, discardFeedback } = useRealTimePrompt(goal, setGoal);

    useEffect(() => {
        updateTelemetryContext({ tab: 'foundry' });
    }, [updateTelemetryContext]);

    useEffect(() => { localStorage.setItem('foundry_goal', goal); }, [goal]);
    useEffect(() => { localStorage.setItem('foundry_projectFiles', JSON.stringify(projectFiles)); }, [projectFiles]);


    const isLoading = phase !== 'Idle' && phase !== 'Converged';

    const addLogEntry = (message: string, type: LogEntryType) => {
        const newEntry: LogEntry = {
            id: uuidv4(),
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
            type,
            message,
        };
        setLog(prev => [...prev, newEntry]);
    };

    const updateAgentState = (name: AgentName, updates: Partial<FoundryAgent>) => {
        setAgents(prev => prev.map(a => a.name === name ? { ...a, ...updates } : a));
    };
    
    const parseScoreFromResult = (text: string): { content: string, score: number } => {
        const scoreMatch = text.match(/SCORE:\s*(\d+)/);
        const score = scoreMatch ? parseInt(scoreMatch[1], 10) : Math.floor(Math.random() * 10) + 75; // Fallback score
        const content = text.replace(/SCORE:\s*\d+/, '').trim();
        return { content, score };
    };

    const startForgingProcess = useCallback(async () => {
        if (!goal.trim() || isLoading) return;

        // Create project context string
        const projectContext = projectFiles.length > 0
            ? projectFiles.map(file => `--- FILE: ${file.filename} ---\n\n${file.content}`).join('\n\n---\n\n')
            : 'No project context files were provided.';

        // Reset state
        setLog([]);
        setFinalPlan(null);
        setAgents(AGENT_NAMES.map(name => ({ name, status: 'Idle' })));
        
        // --- AUDIT PHASE ---
        setPhase('Audit');
        addLogEntry("Phase 1: Homework - Commencing project audit via the AI provider...", 'PHASE');

        const auditResults: { name: AgentName, auditFindings: string }[] = [];
        for (const name of AGENT_NAMES) {
            updateAgentState(name, { status: 'Auditing', currentTask: 'Auditing project goal...' });
            const specialty = 
                name === 'Architect' ? 'system design and scalability' : 
                name === 'Refactor' ? 'code quality and maintainability' : 
                name === 'Security' ? 'security and compliance' :
                name === 'QA' ? 'quality assurance and testability' :
                name === 'UX' ? 'user experience and interface design' :
                name === 'DevOps' ? 'infrastructure as code (IaC), CI/CD, and deployment' :
                'backend microservices, APIs, and databases';
            const prompt = `You are the ${name} agent. Your specialty is ${specialty}. Audit the following project goal from your unique perspective, using the provided project context. Identify key considerations and risks. Provide a one-paragraph summary.\n\nPROJECT GOAL: "${goal}"\n\nPROJECT CONTEXT:\n---\n${projectContext}\n---`;
            
            try {
                // Audit can use Flash for speed
                const { resultText } = await generateRawText(prompt, '');
                updateAgentState(name, { status: 'Done', auditFindings: resultText, currentTask: 'Audit complete.' });
                addLogEntry(`${name} agent audit complete.`, 'SUCCESS');
                auditResults.push({ name, auditFindings: resultText });
            } catch (e) {
                updateAgentState(name, { status: 'Idle', currentTask: 'Audit failed.' });
                addLogEntry(`${name} agent audit failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'INFO');
                auditResults.push({ name, auditFindings: 'Audit failed.' });
            }
        }

        await sleep(1000);

        // --- DESIGN PHASE ---
        setPhase('Design');
        addLogEntry("Phase 2: Independent Design - Generating initial solutions...", 'PHASE');
        
        const designResults: { name: AgentName, design: string, designScore: number }[] = [];
        for (const { name, auditFindings } of auditResults) {
            updateAgentState(name, { status: 'Designing', currentTask: 'Generating initial design proposal...' });
            const prompt = `You are the ${name} agent. Based on the project goal, project context, and your audit, create a high-level design proposal in markdown.

**Mermaid Diagram Rules:**
If you include a Mermaid diagram (using \`\`\`mermaid), you MUST ensure it is syntactically correct.
1. Enclose any node text that contains special characters (like '()[]{}') or keywords in double quotes.
   - Correct: \`A["Node with (parentheses)"] --> B\`
   - Incorrect: \`A[Node with (parentheses)] --> B\`
2. Do not create self-referencing nodes (e.g., \`A --> A\`).

After the proposal, you MUST provide a self-assessed score (0-100) in the format: "SCORE: [number]".

\n\nPROJECT GOAL: "${goal}"\n\nPROJECT CONTEXT:\n---\n${projectContext}\n---\n\nYOUR AUDIT: "${auditFindings}"`;
            
            try {
                // Design uses the new Pro model
                const { resultText } = await generateRawText(prompt, '');
                const { content, score } = parseScoreFromResult(resultText);
                updateAgentState(name, { status: 'Done', design: content, designScore: score, currentTask: `Initial design ready. Score: ${score}` });
                addLogEntry(`${name} agent initial design ready. [Score: ${score}]`, 'SUCCESS');
                designResults.push({ name, design: content, designScore: score });
            } catch(e) {
                 updateAgentState(name, { status: 'Idle', currentTask: 'Design failed.' });
                addLogEntry(`${name} agent design failed: ${e instanceof Error ? e.message : 'Unknown error'}`, 'INFO');
                designResults.push({ name, design: 'Design generation failed.', designScore: 0 });
            }
        }

        setAgents(prev => prev.map(a => {
            const result = designResults.find(r => r.name === a.name);
            const baseAgent = { ...a };
            if(result) {
                baseAgent.design = result.design;
                baseAgent.designScore = result.designScore;
            }
            return baseAgent;
        }));
        
        let currentAgents: FoundryAgent[] = AGENT_NAMES.map(name => {
            const agent = agents.find(a => a.name === name)!;
            const auditResult = auditResults.find(ar => ar.name === name);
            const designResult = designResults.find(dr => dr.name === name);
            return { ...agent, ...auditResult, ...designResult };
        });


        await sleep(1000);

        // --- REFINEMENT GAUNTLET ---
        setPhase('Review');
        addLogEntry("Phase 3: Refinement Gauntlet - Entering iterative peer review and refinement cycle...", 'PHASE');
        const NUM_ROUNDS = 2;

        for (let round = 1; round <= NUM_ROUNDS; round++) {
            addLogEntry(`--- Refinement Round ${round} ---`, 'INFO');
            
            // Step 1: Gather all peer feedback
            addLogEntry(`Round ${round}: Gathering peer reviews...`, 'INFO');
            const allFeedback: { designOwner: AgentName, reviewer: AgentName, feedback: string }[] = [];

            for (let i = 0; i < currentAgents.length; i++) {
                const reviewer = currentAgents[i];
                const designOwnerIndex = (i + 1) % currentAgents.length;
                const designOwner = currentAgents[designOwnerIndex];

                updateAgentState(reviewer.name, { status: 'Reviewing', currentTask: `Reviewing ${designOwner.name}'s design...` });
                const prompt = `You are the ${reviewer.name} agent. Review the design from the ${designOwner.name} agent, considering the original goal and project context. Provide one paragraph of constructive, actionable feedback. Do NOT provide a score.\n\nORIGINAL GOAL: "${goal}"\n\nPROJECT CONTEXT:\n---\n${projectContext}\n---\n\nDESIGN TO REVIEW (by ${designOwner.name}):\n---\n${designOwner.design}\n---`;
                
                try {
                    const { resultText: feedback } = await generateRawText(prompt, '');
                    allFeedback.push({ designOwner: designOwner.name, reviewer: reviewer.name, feedback });
                    addLogEntry(`${reviewer.name} reviewed ${designOwner.name}'s design.`, 'SUCCESS');
                } catch (e) {
                    addLogEntry(`${reviewer.name} failed to review ${designOwner.name}'s design.`, 'INFO');
                } finally {
                    updateAgentState(reviewer.name, { status: 'Done', currentTask: `Finished review.` });
                }
            }

            await sleep(1000);

            // Step 2: Refine designs based on feedback
            addLogEntry(`Round ${round}: Refining designs based on feedback...`, 'INFO');
            
            const refinedAgents: FoundryAgent[] = [];
            for (const agent of currentAgents) {
                const feedbackForAgent = allFeedback
                    .filter(f => f.designOwner === agent.name)
                    .map(f => `- Feedback from ${f.reviewer}: ${f.feedback}`)
                    .join('\n');
                
                if (!feedbackForAgent) {
                    refinedAgents.push({ ...agent }); // No feedback, no change
                    continue;
                }

                updateAgentState(agent.name, { status: 'Refining', currentTask: `Refining design based on peer feedback...` });
                
                const prompt = `You are the ${agent.name} agent. Your current design has been reviewed by your peers. Refine your design by incorporating their feedback to improve it, keeping the original goal and project context in mind. Produce a new, improved version of your design and provide a new self-assessed score (0-100) in the format: "SCORE: [number]".

**Mermaid Diagram Rules:**
If you include a Mermaid diagram (using \`\`\`mermaid), you MUST ensure it is syntactically correct.
1. Enclose any node text that contains special characters (like '()[]{}') or keywords in double quotes.
   - Correct: \`A["Node with (parentheses)"] --> B\`
   - Incorrect: \`A[Node with (parentheses)] --> B\`
2. Do not create self-referencing nodes (e.g., \`A --> A\`).

\n\nORIGINAL GOAL: "${goal}"\n\nPROJECT CONTEXT:\n---\n${projectContext}\n---\n\nYOUR CURRENT DESIGN (Score: ${agent.designScore}):\n---\n${agent.design}\n---\n\nPEER FEEDBACK:\n---\n${feedbackForAgent}\n---\n\nREFINED DESIGN (in markdown):`;

                try {
                    // Refinement uses the new Pro model
                    const { resultText } = await generateRawText(prompt, '');
                    const { content: newDesign, score: newScore } = parseScoreFromResult(resultText);
                    addLogEntry(`${agent.name} refined design. Score: ${agent.designScore?.toFixed(0)} -> ${newScore}`, 'DECISION');
                    refinedAgents.push({ ...agent, design: newDesign, designScore: newScore, currentTask: `Refinement complete. New Score: ${newScore}` });
                } catch (e) {
                    addLogEntry(`${agent.name} failed to refine design.`, 'INFO');
                    refinedAgents.push({ ...agent }); // Return original agent state on failure
                }
            }
            currentAgents = refinedAgents;
            setAgents(currentAgents);

            await sleep(1000);
        }


        // --- CONVERGENCE PHASE ---
        setPhase('Converged');
        addLogEntry("Phase 4: Convergence - Review complete. Selecting best design.", 'PHASE');
        
        const winningAgent = currentAgents.reduce((best, current) => (current.designScore || 0) > (best.designScore || 0) ? current : best);

        const finalDesign = `# Final Converged Design (from ${winningAgent.name})\n\n**Final Score:** ${winningAgent.designScore?.toFixed(0)}/100\n\n---\n\n${winningAgent.design}`;
        setFinalPlan(finalDesign);
        addLogEntry(`Final design selected from ${winningAgent.name} agent.`, 'SUCCESS');
        setAgents(prev => prev.map(a => ({ ...a, status: 'Idle', currentTask: 'Process complete.' })));

    }, [goal, isLoading, agents, projectFiles]);

    return (
        <div className="flex flex-col h-full">
            <div className="flex-grow p-4 md:p-6 gap-6 flex overflow-hidden">
                {/* Left Panel */}
                <div className="w-1/3 flex flex-col gap-6 overflow-hidden">
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 shadow-lg flex-shrink-0">
                        <textarea
                            value={goal}
                            onChange={(e) => setGoal(e.target.value)}
                            placeholder="Enter your high-level goal..."
                            className="w-full flex-grow bg-gray-900/50 rounded-md border border-gray-700 p-3 text-gray-300 placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                            rows={5}
                            disabled={isLoading}
                        />
                        <RealTimeFeedback 
                             isLoading={isRTLoading} 
                             feedback={feedback} 
                             onApply={applyFeedback} 
                             onDiscard={discardFeedback} 
                        />
                        <button
                            onClick={startForgingProcess}
                            disabled={isLoading || !goal.trim()}
                            className="w-full mt-4 flex-shrink-0 px-6 py-3 bg-fuchsia-600 text-white font-semibold rounded-md hover:bg-fuchsia-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                        >
                            {isLoading ? <Loader /> : <BranchingIcon className="w-5 h-5" />}
                            {isLoading ? 'Forging...' : 'Start Forging'}
                        </button>
                    </div>
                    <ProjectContextPanel
                        files={projectFiles}
                        onUpdateFiles={setProjectFiles}
                        isLoading={isLoading}
                    />
                </div>

                {/* Right Panel */}
                <div className="w-2/3 bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg flex flex-col">
                    {finalPlan && phase === 'Converged' ? (
                        <>
                            <header className="p-4 border-b border-gray-700/50">
                                <h3 className="text-lg font-semibold text-white">Final Converged Plan</h3>
                            </header>
                            <div className="p-6 flex-grow overflow-y-auto">
                                <MarkdownRenderer content={finalPlan} />
                            </div>
                        </>
                    ) : (
                        <>
                            <header className="p-4 border-b border-gray-700/50">
                                <h3 className="text-lg font-semibold text-white">Agent Activity Monitor</h3>
                            </header>
                            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                                {agents.map(agent => <AgentCard key={agent.name} agent={agent} />)}
                            </div>
                            <div className="flex-grow border-t border-gray-700/50 overflow-hidden">
                                { log.length > 0 ? (
                                    <LiveLog log={log} isLoading={isLoading} />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-center text-gray-500 p-4">
                                        <div>
                                            <h4 className="font-semibold text-lg">Foundry Dashboard</h4>
                                            <p className="mt-2">The live process log and agent statuses will appear here once you start forging.</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
            <TabFooter />
        </div>
    );
};

export default Foundry;
