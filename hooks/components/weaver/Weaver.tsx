
// components/weaver/Weaver.tsx
import React, { useState, useCallback, useEffect } from 'react';
import MemoryPanel from './MemoryPanel';
import PlanDisplay from './PlanDisplay';
import { generateDevelopmentPlan } from '../../../styles/services/aiService';
import { AiPlanResponse, Documentation } from '@/types';
import { useTelemetry } from '../../../styles/services/context/TelemetryContext';
import { INITIAL_DOCUMENTATION } from '../../../styles/services/context/constants';
import { SparklesIcon, XMarkIcon } from '../icons';
import Loader from '../Loader';
import { audioService } from '../../../styles/services/audioService';
import { useSubscription } from '../../../styles/services/context/SubscriptionContext';
import { parseApiError } from '@/utils/errorLogger';
import { useRealTimePrompt } from '../../useRealTimePrompt';
import { RealTimeFeedback } from '../common/RealTimeFeedback';

const WEAVER_MEMORY_STORAGE_KEY = 'weaver-project-memory';

const loadDocumentation = (): Documentation => {
    try {
        const stored = localStorage.getItem(WEAVER_MEMORY_STORAGE_KEY);
        if (stored) {
            return { ...INITIAL_DOCUMENTATION, ...JSON.parse(stored) };
        }
    } catch (e) {
        console.error("Failed to load Weaver memory:", e);
    }
    return INITIAL_DOCUMENTATION;
};


const Weaver: React.FC = () => {
  const [goal, setGoal] = useState(() => localStorage.getItem('weaver_goal') || '');
  const [plan, setPlan] = useState<AiPlanResponse | null>(() => {
    try {
        const saved = localStorage.getItem('weaver_plan');
        return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentation, setDocumentation] = useState<Documentation>(loadDocumentation);
  const [newlyGenerated, setNewlyGenerated] = useState(false);

  const { telemetryService, versionControlService, updateTelemetryContext } = useTelemetry();
  const { usage, tierDetails, incrementUsage } = useSubscription();

  // RT Prompt Hook
  const { feedback, isLoading: isRTLoading, applyFeedback, discardFeedback } = useRealTimePrompt(goal, setGoal);

  useEffect(() => {
    updateTelemetryContext({ tab: 'Weaver' });
  }, [updateTelemetryContext]);
  
  useEffect(() => {
      try {
          localStorage.setItem(WEAVER_MEMORY_STORAGE_KEY, JSON.stringify(documentation));
      } catch (e) {
          console.error("Failed to save Weaver memory:", e);
      }
  }, [documentation]);

  useEffect(() => { localStorage.setItem('weaver_goal', goal); }, [goal]);
  useEffect(() => {
      if (plan) {
          localStorage.setItem('weaver_plan', JSON.stringify(plan));
      } else {
          localStorage.removeItem('weaver_plan');
      }
  }, [plan]);

  const handleDocumentationChange = useCallback((field: keyof Documentation, value: string) => {
    setDocumentation(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleGeneratePlan = useCallback(async () => {
    if (tierDetails.weaverPlans !== 'unlimited' && usage.weaverPlans >= tierDetails.weaverPlans) {
        setError("You have reached your monthly limit for Weaver plans. Please upgrade your subscription.");
        audioService.playSound('error');
        return;
    }
    if (!goal.trim() || isLoading) return;

    setIsLoading(true);
    setError(null);
    setPlan(null);
    setNewlyGenerated(false);
    audioService.playSound('send');

    try {
      const generatedPlan = await generateDevelopmentPlan(goal, documentation.projectContext);
      setPlan(generatedPlan);
      setNewlyGenerated(true);
      incrementUsage('weaverPlans');
      audioService.playSound('receive');
      
      telemetryService?.recordEvent({
        eventType: 'ai_response',
        interactionType: 'generate_dev_plan',
        tab: 'Weaver',
        userInput: goal,
        aiOutput: JSON.stringify(generatedPlan.implementationTasks.map(t => t.description)),
        outcome: 'success',
        tokenUsage: generatedPlan.tokenUsage,
        modelUsed: ''
      });

      versionControlService?.captureVersion(
        'development_plan',
        `weaver_plan_${Date.now()}`,
        JSON.stringify(generatedPlan, null, 2),
        'ai_response',
        `Generated plan for goal: ${goal.substring(0, 50)}...`
      );

    } catch (e: any) {
      const userFriendlyMessage = parseApiError(e);
      setError(userFriendlyMessage);
      audioService.playSound('error');
      telemetryService?.recordEvent({
        eventType: 'ai_response',
        interactionType: 'generate_dev_plan',
        tab: 'Weaver',
        userInput: goal,
        outcome: 'error',
        customData: { error: userFriendlyMessage }
      });
    } finally {
      setIsLoading(false);
    }
  }, [goal, isLoading, documentation.projectContext, telemetryService, versionControlService, usage, tierDetails, incrementUsage]);
  
  useEffect(() => {
    if (newlyGenerated) {
      const timer = setTimeout(() => setNewlyGenerated(false), 1000);
      return () => clearTimeout(timer);
    }
  }, [newlyGenerated]);

  const plansUsed = usage.weaverPlans;
  const planLimit = tierDetails.weaverPlans;
  const isLimitReached = planLimit !== 'unlimited' && plansUsed >= planLimit;

  return (
    <div className="flex flex-col h-full p-4 md:p-6 gap-6">
      <div className="flex-shrink-0 bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 shadow-lg">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col md:flex-row items-center gap-4">
            <textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="Enter your high-level development goal here..."
                className="w-full flex-grow bg-gray-900/50 rounded-md border border-gray-700 p-3 text-gray-300 placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                rows={2}
                disabled={isLoading || isLimitReached}
            />
            <button
                onClick={handleGeneratePlan}
                disabled={isLoading || !goal.trim() || isLimitReached}
                className="w-full md:w-auto flex-shrink-0 px-6 py-3 bg-fuchsia-600 text-white font-semibold rounded-md hover:bg-fuchsia-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
                {isLoading ? <Loader /> : <SparklesIcon className="w-5 h-5" />}
                {isLoading ? 'Generating...' : 'Generate Plan'}
            </button>
          </div>
          <RealTimeFeedback 
             isLoading={isRTLoading} 
             feedback={feedback} 
             onApply={applyFeedback} 
             onDiscard={discardFeedback} 
          />
        </div>
        <div className="mt-2 text-right text-xs text-gray-400">
          Plans Used: {plansUsed} / {planLimit === 'unlimited' ? 'Unlimited' : planLimit}
        </div>
        {error && (
            <div className="mt-3 p-3 bg-red-900/50 border border-red-700/50 rounded-md text-sm text-red-300 flex items-center justify-between">
                <span>{error}</span>
                <button onClick={() => setError(null)} className="text-red-200 hover:text-white">
                    <XMarkIcon className="w-5 h-5" />
                </button>
            </div>
        )}
      </div>
      <div className="flex-grow grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
        <div className="h-full overflow-hidden">
            <MemoryPanel documentation={documentation} onDocumentationChange={handleDocumentationChange} />
        </div>
        <div className="h-full overflow-hidden">
            <PlanDisplay plan={plan} newlyGenerated={newlyGenerated} />
        </div>
      </div>
    </div>
  );
};

export default Weaver;
