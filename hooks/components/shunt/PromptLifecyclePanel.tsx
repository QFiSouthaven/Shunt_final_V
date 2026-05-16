
import React from 'react';
import { HistoryEntry } from '@/types';
import { HistoryIcon, MinusIcon, AmplifyIcon, ArrowPathIcon } from '../icons';

interface PromptLifecyclePanelProps {
  history: HistoryEntry[];
  initialPrompt: string;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  onRestore?: (entry: HistoryEntry) => void;
}

const PromptLifecyclePanel: React.FC<PromptLifecyclePanelProps> = ({ history, initialPrompt, isMinimized, onToggleMinimize, onRestore }) => {
  if (history.length === 0 && !initialPrompt) {
    return null; // Don't render anything if there's no active chain
  }
  
  const getScoreColor = (score: number) => {
    if (score > 0) return 'text-green-400';
    if (score < 0) return 'text-red-400';
    return 'text-gray-400';
  };

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 shadow-lg">
      <header className="p-3 border-b border-gray-700/50 flex items-center gap-3">
        {onToggleMinimize && (
          <button onClick={onToggleMinimize} title={isMinimized ? 'Expand' : 'Minimize'} className="p-1 text-gray-400 hover:text-white">
            {isMinimized ? <AmplifyIcon className="w-5 h-5"/> : <MinusIcon className="w-5 h-5"/>}
          </button>
        )}
        <HistoryIcon className="w-5 h-5 text-fuchsia-400" />
        <h2 className="font-semibold text-gray-300">Prompt Lifecycle Grade Rating</h2>
      </header>
      {!isMinimized && (
        <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2">
              <h3 className="text-sm font-semibold text-gray-400 mb-2">Initial Prompt</h3>
              <p className="text-sm text-gray-300 bg-gray-900/50 p-3 rounded-md max-h-24 overflow-y-auto">
                  {initialPrompt || 'No prompt initiated.'}
              </p>
          </div>
          <div>
              <h3 className="text-sm font-semibold text-gray-400 mb-2">History State</h3>
              {history.length > 0 ? (
                  <div className="bg-gray-900/50 p-3 rounded-md max-h-64 overflow-y-auto custom-scrollbar">
                      <table className="w-full text-sm text-left border-collapse">
                          <thead className="sticky top-0 bg-gray-900 z-10">
                              <tr className="border-b border-gray-700">
                                  <th className="py-2 px-2">Run</th>
                                  <th className="py-2 px-2 text-right">Score</th>
                                  {onRestore && <th className="py-2 px-2 text-right">Action</th>}
                              </tr>
                          </thead>
                          <tbody>
                              {history.map((entry, index) => (
                                  <tr key={entry.id} className="border-b border-gray-800 last:border-0 hover:bg-gray-800/50 transition-colors">
                                      <td className="py-2 px-2 text-gray-400 max-w-[100px] truncate" title={entry.prompt}>Run {index + 1}</td>
                                      <td className={`py-2 px-2 font-bold text-right ${getScoreColor(entry.score)}`}>
                                          {entry.score > 0 ? '+' : ''}{entry.score}
                                      </td>
                                      {onRestore && (
                                          <td className="py-2 px-2 text-right">
                                              <button 
                                                onClick={() => onRestore(entry)} 
                                                className="p-1.5 rounded-md bg-cyan-900/30 text-cyan-500 hover:bg-cyan-600 hover:text-white transition-all duration-200 flex items-center justify-center ml-auto"
                                                title="Restore this state (Input & Output)"
                                              >
                                                  <ArrowPathIcon className="w-3.5 h-3.5" />
                                              </button>
                                          </td>
                                      )}
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              ) : (
                  <div className="flex items-center justify-center h-full text-sm text-gray-500 bg-gray-900/50 p-3 rounded-md">
                      No runs recorded yet.
                  </div>
              )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PromptLifecyclePanel;
