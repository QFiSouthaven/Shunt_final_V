
// hooks/useShuntProcessor.ts
import React, { useState, useCallback } from 'react';
import { ShuntAction, TokenUsage, PromptModuleKey, HistoryEntry } from '@/types';
import { performShunt, executeModularPrompt, gradeOutput, synthesizeDocuments } from '../styles/services/aiService';
import { parseSkillPackagePlan } from '../styles/services/skillParser';
import { logFrontendError, ErrorSeverity, parseApiError } from '@/utils/errorLogger';
import { useSubscription } from '../styles/services/context/SubscriptionContext';
import { useSettings } from '../styles/services/context/SettingsContext';
import { useMailbox } from '../styles/services/context/MailboxContext';
import { sanitizeInput } from '@/utils/security';
import { audioService } from '../styles/services/audioService';
import { executeTool, ExecutionContext, ToolResult } from '../styles/services/toolApi';
import { v4 as uuidv4 } from 'uuid';

interface UseShuntProcessorProps {
    inputText: string;
    setInputText: (text: string) => void;
    bulletinDocuments: { name: string; content: string }[];
    setBulletinDocuments: React.Dispatch<React.SetStateAction<{ name: string; content: string }[]>>;
    history: HistoryEntry[];
    setHistory: React.Dispatch<React.SetStateAction<HistoryEntry[]>>;
    initialPrompt: string;
    setInitialPrompt: (text: string) => void;
    priority: string;
    selectedModel: string;
    settings: any; // Using any to avoid circular dependency or complex type imports for now
    usage: any;
    tierDetails: any;
    incrementUsage: (metric: string) => void;
}

export const useShuntProcessor = ({
    inputText,
    setInputText,
    bulletinDocuments,
    setBulletinDocuments,
    history,
    setHistory,
    initialPrompt,
    setInitialPrompt,
    priority,
    selectedModel,
    settings,
    usage,
    tierDetails,
    incrementUsage
}: UseShuntProcessorProps) => {
    const [isLoading, setIsLoading] = useState(false);
    const [isEvolving, setIsEvolving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outputText, setOutputText] = useState('');
    const [activeShunt, setActiveShunt] = useState<string | null>(null);
    const [showAmplifyX2, setShowAmplifyX2] = useState(false);
    const [modulesForLastRun, setModulesForLastRun] = useState<string[] | null>(null);
    const [lastTokenUsage, setLastTokenUsage] = useState<TokenUsage | null>(null);
    const { deliverFiles } = useMailbox();

    // Helper to format bulletin context
    const getBulletinContext = useCallback(() => {
        if (bulletinDocuments.length === 0) return undefined;
        return bulletinDocuments
          .map(doc => {
              const content = settings.inputSanitizationEnabled ? sanitizeInput(doc.content) : doc.content;
              return `--- Reference Document: ${doc.name} ---\n\n${content}`;
          })
          .join('\n\n---\n\n');
    }, [bulletinDocuments, settings.inputSanitizationEnabled]);

    const handleApiError = useCallback((e: any, telemetryContext: Record<string, any>) => {
        logFrontendError(e, ErrorSeverity.High, telemetryContext);
        const userFriendlyMessage = parseApiError(e);
        setError(userFriendlyMessage);
        setShowAmplifyX2(false);
        audioService.playSound('error');
    }, []);

    // --- Core Shunt Execution ---
    const handleShunt = useCallback(async (action: ShuntAction | string, textToProcess: string = inputText) => {
        if (tierDetails.shuntRuns !== 'unlimited' && usage.shuntRuns >= tierDetails.shuntRuns) {
            setError("You've reached your monthly limit for Shunt runs. Please upgrade your plan in the Subscription tab.");
            audioService.playSound('error');
            return;
        }

        setIsLoading(true);
        setError(null);
        setOutputText('');
        setModulesForLastRun(null);
        setShowAmplifyX2(false);
        setActiveShunt(action);
        audioService.playSound('send');
        
        if (history.length === 0) setInitialPrompt(textToProcess);

        if (action === ShuntAction.CALL_TOOL) {
             try {
                const { toolName, args } = JSON.parse(textToProcess);
                const executionContext: ExecutionContext = { agentId: 'shunt-direct-caller', permissions: ['system:admin', 'filesystem:read', 'filesystem:write', 'scratchpad:write', 'vcs:read', 'vcs:stage', 'vcs:branch', 'vcs:commit', 'execution:tests', 'execution:scripts'] };
                const result: ToolResult = await executeTool(toolName, args, executionContext);
                setOutputText(JSON.stringify(result, null, 2));
                audioService.playSound(result.success ? 'receive' : 'error');
            } catch (e: any) {
                handleApiError(e, { context: 'Shunt.handleShunt.tool_call', action });
            } finally {
                setIsLoading(false);
                setActiveShunt(null);
            }
            return;
        }
        
        const sanitizedText = settings.inputSanitizationEnabled ? sanitizeInput(textToProcess) : textToProcess;
        const bulletinContext = getBulletinContext();
    
        try {
            const { resultText, tokenUsage } = await performShunt(sanitizedText, action as ShuntAction, selectedModel, bulletinContext, priority, settings.promptInjectionGuardEnabled);
    
            if (action === ShuntAction.BUILD_A_SKILL) {
                const files = parseSkillPackagePlan(resultText);
                if (files.length > 0) {
                    await deliverFiles(files);
                    setOutputText(`✅ Skill package generated! ${files.length} files delivered to Mailbox.`);
                    audioService.playSound('success');
                } else {
                    setOutputText(`⚠️ Could not parse files. Raw output:\n${resultText}`);
                    audioService.playSound('error');
                }
            } else {
                setOutputText(resultText);
                if (action === ShuntAction.AMPLIFY && resultText) setShowAmplifyX2(true);
                audioService.playSound('receive');
            }
          
            incrementUsage('shuntRuns');
            setLastTokenUsage(tokenUsage);
        } catch (e: any) {
            handleApiError(e, { context: 'Shunt.handleShunt', action, selectedModel, priority });
        } finally {
            setIsLoading(false);
            setActiveShunt(null);
        }
      }, [inputText, history.length, getBulletinContext, priority, selectedModel, settings, tierDetails, usage, incrementUsage, handleApiError, deliverFiles, setInitialPrompt]);

    // --- Modular Shunt Execution ---
    const handleModularShunt = useCallback(async (modules: Set<PromptModuleKey>) => {
        setIsLoading(true);
        setError(null);
        setOutputText('');
        setShowAmplifyX2(false);
        setActiveShunt('Modular Prompt');
        audioService.playSound('send');
        
        if (history.length === 0) setInitialPrompt(inputText);
        
        const sanitizedText = settings.inputSanitizationEnabled ? sanitizeInput(inputText) : inputText;
        const bulletinContext = getBulletinContext();
    
        try {
          setModulesForLastRun(Array.from(modules));
          const { resultText, tokenUsage } = await executeModularPrompt(sanitizedText, modules, bulletinContext, priority, settings.promptInjectionGuardEnabled);
          setOutputText(resultText);
          audioService.playSound('receive');
          incrementUsage('shuntRuns');
          setLastTokenUsage(tokenUsage);
        } catch (e: any) {
           handleApiError(e, { context: 'Shunt.handleModularShunt' });
        } finally {
          setIsLoading(false);
          setActiveShunt(null);
        }
    }, [inputText, history.length, getBulletinContext, priority, settings, incrementUsage, handleApiError, setInitialPrompt]);

    // --- Iterative Evolution ---
    const handleGradeAndIterate = useCallback(async () => {
        if (!outputText) return;
        setIsEvolving(true);
        try {
            const { score } = await gradeOutput(outputText, history.length > 0 ? history[history.length-1].prompt : initialPrompt);
            const newHistoryEntry: HistoryEntry = {
                id: uuidv4(),
                prompt: history.length > 0 ? history[history.length-1].output : initialPrompt,
                output: outputText,
                score: score,
            };
            setHistory(prev => [...prev, newHistoryEntry]);
            setInputText(outputText);
            setOutputText('');
            setError(null);
            setModulesForLastRun(null);
        } catch (e: any) {
            handleApiError(e, { context: 'Shunt.handleGradeAndIterate' });
        } finally {
            setIsEvolving(false);
        }
    }, [outputText, history, initialPrompt, setHistory, setInputText, handleApiError]);

    // --- Synthesis ---
    const handleSynthesize = useCallback(async () => {
        if (bulletinDocuments.length === 0) return;
        setIsLoading(true);
        setError(null);
        setOutputText('');
        setActiveShunt('Synthesize Notes');
        try {
            const combinedContent = bulletinDocuments.map(doc => {
                const content = settings.inputSanitizationEnabled ? sanitizeInput(doc.content) : doc.content;
                return `--- ${doc.name} ---\n${content}`;
            }).join('\n\n');
            const { resultText } = await synthesizeDocuments(combinedContent, selectedModel);
            const newDoc = { name: `synthesis.md`, content: resultText };
            setBulletinDocuments(prev => [...prev, newDoc]);
            setInputText(resultText);
            setOutputText('Synthesis complete. Added to Bulletin Board.');
            audioService.playSound('success');
        } catch(e) { 
            handleApiError(e, {context: 'synthesize'}); 
        } finally { 
            setIsLoading(false); 
            setActiveShunt(null); 
        }
      }, [bulletinDocuments, selectedModel, handleApiError, setBulletinDocuments, setInputText, settings.inputSanitizationEnabled]);

    return {
        isLoading,
        isEvolving,
        error,
        setError,
        outputText,
        setOutputText,
        activeShunt,
        setActiveShunt,
        showAmplifyX2,
        modulesForLastRun,
        lastTokenUsage,
        handleShunt,
        handleModularShunt,
        handleGradeAndIterate,
        handleSynthesize
    };
};
