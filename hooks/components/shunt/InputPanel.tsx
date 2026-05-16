
import React from 'react';
import { useMCPContext } from '@/styles/services/context/MCPContext';
import { MCPConnectionStatus } from '@/types/mcp';
import FileUpload from '../common/FileUpload';
import Loader from '../Loader';
import { ClipboardDocumentListIcon, MinusIcon, AmplifyIcon } from '../icons';
import { useRealTimePrompt } from '@/hooks/useRealTimePrompt';
import { RealTimeFeedback } from '../common/RealTimeFeedback';

interface InputPanelProps {
  value: string;
  onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onBlur: () => void;
  onPasteDemo: () => void;
  onFileLoad: (text: string) => void;
  onClearFile: () => void;
  error?: string | null;
  maxLength?: number;
  isLoading: boolean;
  onToggleScratchpad: () => void;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  priority: string;
  onPriorityChange: (priority: string) => void;
  onPasteToolDemo: () => void;
}

const InputPanel: React.FC<InputPanelProps> = ({ value, onChange, onBlur, onPasteDemo, onFileLoad, onClearFile, error, maxLength, isLoading, onToggleScratchpad, isMinimized, onToggleMinimize, priority, onPriorityChange, onPasteToolDemo }) => {
  const hasError = !!error;
  
  const handleFilesUploaded = (files: Array<{ filename: string; content: string; file: File }>) => {
    const combinedContent = files.map(f => `--- From: ${f.filename} ---\n\n${f.content}`).join('\n\n');
    onFileLoad(combinedContent);
  };

  // Use the hook for RT logic
  const { feedback, isLoading: isRTLoading, applyFeedback, discardFeedback, isRTActive } = useRealTimePrompt(value, (text) => {
       const event = { target: { value: text } } as React.ChangeEvent<HTMLTextAreaElement>;
       onChange(event);
  });

  return (
    <div className={`bg-gray-800/50 rounded-lg border ${hasError ? 'border-red-500/80' : 'border-gray-700/50'} flex flex-col h-full shadow-lg transition-colors relative`}>
      {isLoading && !isMinimized && (
        <div className="absolute inset-0 flex flex-col justify-center items-center bg-gray-800/80 backdrop-blur-sm z-10 rounded-lg">
          <Loader />
          <p className="mt-4 text-gray-400">Locked during processing...</p>
        </div>
      )}
      <div className="p-3 border-b border-gray-700/50 flex justify-between items-center">
        <div className="flex items-center gap-2">
            {onToggleMinimize && (
              <button onClick={onToggleMinimize} title={isMinimized ? 'Expand' : 'Minimize'} className="p-1 text-gray-400 hover:text-white">
                {isMinimized ? <AmplifyIcon className="w-5 h-5"/> : <MinusIcon className="w-5 h-5"/>}
              </button>
            )}
            <h2 className="font-semibold text-gray-300">Input Content</h2>
            <button 
                onClick={onToggleScratchpad}
                title="Open a floating notepad for temporary notes and snippets"
                className="p-1 rounded-full text-gray-400 hover:bg-gray-700/50 hover:text-cyan-400 transition-colors"
            >
                <ClipboardDocumentListIcon className="w-5 h-5"/>
            </button>
            
            <div className="ml-2">
                <label htmlFor="shunt-priority" className="text-xs text-gray-400 mr-2">Priority:</label>
                <select
                  id="shunt-priority"
                  name="priority"
                  value={priority}
                  onChange={(e) => onPriorityChange(e.target.value)}
                  disabled={isLoading}
                  className="bg-gray-700/50 border border-gray-600 text-xs text-gray-200 rounded-md pl-2 pr-7 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-colors duration-200 hover:border-gray-500"
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                </select>
            </div>
        </div>
         <div className="flex items-center gap-2">
            <button
                onClick={onClearFile}
                title="Clear all content from the input panel"
                className="text-xs bg-red-600/50 text-red-200 px-2 py-1 rounded hover:bg-red-600/80 transition-colors"
            >
                Clear Content
            </button>
            <button
                onClick={onPasteDemo}
                title="Load a sample feature specification into the input panel to try out Shunt actions"
                className="text-xs bg-fuchsia-600/50 text-fuchsia-200 px-2 py-1 rounded hover:bg-fuchsia-600/80 transition-colors"
            >
                Paste Demo Text
            </button>
            <button
                onClick={onPasteToolDemo}
                title="Load a sample tool call into the input panel"
                className="text-xs bg-cyan-600/50 text-cyan-200 px-2 py-1 rounded hover:bg-cyan-600/80 transition-colors"
            >
                Paste Tool Demo
            </button>
         </div>
      </div>
      {!isMinimized && (
        <div className="p-3 flex-grow flex flex-col gap-4 relative">
          <textarea
            value={value}
            onChange={onChange}
            onBlur={onBlur}
            placeholder="Paste, type, or drop a file here..."
            className={`w-full flex-grow bg-gray-900/50 rounded-md border border-gray-700 p-3 text-gray-300 placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-fuchsia-500 transition-all duration-300 ${isRTActive && (feedback || isRTLoading) ? 'h-1/2' : 'h-full'}`}
            maxLength={maxLength}
          />
          
          <RealTimeFeedback 
             isLoading={isRTLoading} 
             feedback={feedback} 
             onApply={applyFeedback} 
             onDiscard={discardFeedback} 
          />

          <FileUpload 
              onFilesUploaded={handleFilesUploaded}
              acceptedFileTypes={['.txt', '.md', '.json', '.svg', '.js', '.py', '.pdf', '.zip', '.xml', '.xsd', '.html', '.sh', '.css', '.ts', '.jsx', '.tsx', '.yml', '.yaml', '.gitignore', 'dockerfile']}
              maxFileSizeMB={10}
          />
          <div className="flex justify-end items-center px-1 pb-1 text-xs h-4">
              {error ? (
                  <span className="text-red-400">{error}</span>
              ) : (
                  <span />
              )}
              {maxLength !== undefined && (
                  <span className={`ml-auto ${value.length > maxLength ? 'text-red-400 font-semibold' : 'text-gray-500'}`}>
                      {value.length} / {maxLength}
                  </span>
              )}
          </div>
        </div>
      )}
    </div>
  );
};

export default InputPanel;
