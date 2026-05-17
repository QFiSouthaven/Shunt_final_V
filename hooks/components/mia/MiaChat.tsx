
// components/mia/MiaChat.tsx
import React, { useState, useEffect, useRef } from 'react';
import { useMiaContext } from '../../../styles/services/context/MiaContext';
import { BrainIcon, CodeIcon, BoltIcon } from '../icons';
import { ShuntAction } from '@/types';
import { performShunt } from '../../../styles/services/aiService';
import { useSettings } from '../../../styles/services/context/SettingsContext';

const commandToAction: { [key: string]: ShuntAction } = {
    'summarize': ShuntAction.SUMMARIZE,
    'amplify': ShuntAction.AMPLIFY,
    'eli5': ShuntAction.EXPLAIN_LIKE_IM_FIVE,
    'explain-expert': ShuntAction.EXPLAIN_LIKE_A_SENIOR,
    'keywords': ShuntAction.EXTRACT_KEYWORDS,
    'entities': ShuntAction.EXTRACT_ENTITIES,
    'enhance': ShuntAction.ENHANCE_WITH_KEYWORDS,
    'formal': ShuntAction.CHANGE_TONE_FORMAL,
    'casual': ShuntAction.CHANGE_TONE_CASUAL,
    'proofread': ShuntAction.PROOFREAD,
    'to-spanish': ShuntAction.TRANSLATE_SPANISH,
    'to-json': ShuntAction.FORMAT_JSON,
    'parse-json': ShuntAction.PARSE_JSON,
    'actionable': ShuntAction.MAKE_ACTIONABLE,
    'interpret-svg': ShuntAction.INTERPRET_SVG,
    'build-skill': ShuntAction.BUILD_A_SKILL,
};

const getLogLineClass = (line: string): string => {
    if (line.includes('[React Agent]')) return 'react';
    if (line.includes('[TypeScript Agent]')) return 'typescript';
    if (line.includes('[DevOps Agent]')) return 'devops';
    if (line.includes('[Host]')) return 'host';
    return '';
}

const MiaChat: React.FC = () => {
  const { messages, sendMessage, diagnoseLastError, isLoading, alerts, generateFixAttempt, applyFix, isApplyingFix, activePlan, addMessage, isGeneratingPlan, agentLog, activeTab } = useMiaContext();
  const [input, setInput] = useState<string>('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isShuntLoading, setIsShuntLoading] = useState(false);
  const { settings } = useSettings();

  const hasCriticalError = alerts.some(a => a.severity === 'critical');

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, isApplyingFix, isShuntLoading, isGeneratingPlan, agentLog]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const messageText = input.trim();
    if (messageText === '' || isLoading || isShuntLoading) return;
    
    setInput('');

    const commandMatch = messageText.match(/^(\w+):\s*(.*)/s);
    if (commandMatch) {
        const [, command, text] = commandMatch;
        const action = commandToAction[command.toLowerCase()];
        
        if (action && text) {
            addMessage({ id: Date.now().toString(), sender: 'user', text: messageText, timestamp: new Date().toISOString() });
            setIsShuntLoading(true);
            try {
                const result = await performShunt(text, action, '', undefined, undefined, settings.promptInjectionGuardEnabled);
                addMessage({ id: Date.now().toString(), sender: 'mia', text: result.resultText, timestamp: new Date().toISOString() });
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
                addMessage({ id: Date.now().toString(), sender: 'system-error', text: `Shunt command failed: ${errorMessage}`, timestamp: new Date().toISOString() });
            } finally {
                setIsShuntLoading(false);
            }
        } else {
            sendMessage(messageText);
        }
    } else {
        sendMessage(messageText);
    }
  };
  
  const handleDiagnose = () => {
    if (isLoading) return;
    diagnoseLastError();
  };
  
  const combinedIsLoading = isLoading || isShuntLoading || isGeneratingPlan;

  const contextualActions: { [key: string]: { label: string; command: string } } = {
    shunt: { label: "Analyze Shunt's Input", command: 'summarize: ' },
    weaver: { label: 'Summarize Weaver Goal', command: 'summarize: ' },
    image_analysis: { label: 'Describe current image', command: 'describe: ' },
  };

  const suggestion = activeTab ? contextualActions[activeTab] : null;

  return (
    <div className="mia-chat-container">
      <div className="mia-chat-messages">
        {messages.map(msg => (
          <div key={msg.id} className={`mia-message ${msg.sender === 'user' ? 'user' : msg.sender.startsWith('system') ? 'mia' : 'mia'}`}>
            {msg.sender === 'system-progress' && <p className="text-sm italic opacity-80">{msg.text}</p>}
            {msg.sender !== 'system-progress' && (msg.isHtml ? (<div dangerouslySetInnerHTML={{ __html: msg.text }} />) : (<p>{msg.text}</p>))}
            
            {msg.diagnosableError && (
                 <button
                    onClick={() => generateFixAttempt(msg.diagnosableError!)}
                    disabled={combinedIsLoading}
                    className="mia-action-button !bg-fuchsia-600 !text-white !border-fuchsia-500 hover:!bg-fuchsia-500 flex items-center justify-center gap-2"
                >
                    <BoltIcon className="w-4 h-4" />
                    Auto-Fix
                </button>
            )}

            {msg.fixProposal && (
              <div className="mt-3 pt-3 border-t border-gray-300">
                <h4 className="font-semibold text-sm mb-2 flex items-center gap-2"><CodeIcon className="w-4 h-4" /> Proposed Fix:</h4>
                <ul className="text-xs list-disc list-inside pl-2 space-y-1">
                  {msg.fixProposal.implementationTasks.map(task => (
                    <li key={task.filePath} className="font-mono" title={task.description}>{task.filePath}</li>
                  ))}
                </ul>
                <button
                    onClick={() => applyFix()}
                    disabled={isApplyingFix || combinedIsLoading}
                    className="mia-action-button !mt-4 !w-full text-center !bg-green-100 !text-green-800 !border-green-400 hover:!bg-green-200"
                >
                    {isApplyingFix ? 'Applying...' : 'Apply Fix & Write Files'}
                </button>
              </div>
            )}
            
            <span className="mia-message-timestamp">{new Date(msg.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
          </div>
        ))}
        {isGeneratingPlan && agentLog.length > 0 && (
          <div className="mia-message mia mia-agent-swarm-log-container">
            <div className="mia-agent-swarm-log-header">
                AI Agent Swarm: Real-time Analysis Log
            </div>
            <div className="mia-agent-swarm-log-content">
              {agentLog.map((line, index) => (
                <p key={index} className={`mia-agent-swarm-log-line ${getLogLineClass(line)}`}>
                  {line}
                </p>
              ))}
              <p className="mia-agent-swarm-log-thinking">Synthesizing final plan...</p>
            </div>
          </div>
        )}
        {(isLoading || isShuntLoading) && !isApplyingFix && !isGeneratingPlan && ( <div className="mia-message mia"><p>Mia is thinking...</p></div> )}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-2 border-t border-gray-200 bg-white">
        {suggestion && !combinedIsLoading && (
            <div className="mb-2">
                <button
                    onClick={() => {
                        setInput(suggestion.command);
                        inputRef.current?.focus();
                    }}
                    className="w-full text-xs text-left px-3 py-1.5 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                >
                    <strong>Suggestion:</strong> {suggestion.label}
                </button>
            </div>
        )}
        {hasCriticalError && !activePlan && (
             <button
                onClick={handleDiagnose}
                disabled={combinedIsLoading}
                className="w-full text-sm flex items-center justify-center gap-2 px-3 py-2 mb-2 rounded-md bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200 disabled:opacity-60 disabled:cursor-not-allowed"
            >
                <BrainIcon className="w-5 h-5"/>
                Diagnose Last Error
            </button>
        )}
        <form onSubmit={handleSendMessage} className="mia-chat-input-form !p-0">
          <input ref={inputRef} type="text" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask a question or use a command (e.g. summarize: text)..." disabled={combinedIsLoading || isApplyingFix}/>
          <button type="submit" disabled={combinedIsLoading || isApplyingFix || !input.trim()}>Send</button>
        </form>
      </div>
    </div>
  );
};

export default MiaChat;
