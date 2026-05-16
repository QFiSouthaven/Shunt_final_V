
import React, { useState, useEffect } from 'react';
import { Documentation } from '@/types';
import { useDebounce } from '../../useDebounce';
import { useTelemetry } from '../../../styles/services/context/TelemetryContext';
import { INITIAL_DOCUMENTATION } from '../../../styles/services/context/constants';

interface MemoryPanelProps {
  documentation: Documentation;
  onDocumentationChange: (field: keyof Documentation, value: string) => void;
}

type DocKey = keyof Documentation;

const MemoryPanel: React.FC<MemoryPanelProps> = ({ documentation, onDocumentationChange }) => {
  const [activeTab, setActiveTab] = useState<DocKey>('projectContext');
  const { versionControlService } = useTelemetry();
  
  // Debounce the currently active text area content to avoid saving on every keystroke
  const debouncedContent = useDebounce(documentation[activeTab], 1500); // 1.5s delay
  const isInitialMount = React.useRef(true);


  useEffect(() => {
    // Prevent saving on initial mount or tab switch
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    // Check if the debounced content has actually changed from the initial state
    const hasChangedFromInitial = debouncedContent !== INITIAL_DOCUMENTATION[activeTab];

    if (debouncedContent && versionControlService && hasChangedFromInitial) {
        versionControlService.captureVersion(
            'weaver_memory_update',
            `weaver_memory_${String(activeTab)}`,
            debouncedContent,
            'user_action',
            `Updated project memory: ${String(activeTab)}`,
            { field: activeTab, length: debouncedContent.length }
        );
    }
  }, [debouncedContent, activeTab, versionControlService]);

  const tabs: { key: DocKey; name: string }[] = [
    { key: 'projectContext', name: 'Context' },
    { key: 'progressLog', name: 'Progress' },
    { key: 'decisions', name: 'Decisions' },
    { key: 'issuesAndFixes', name: 'Issues' },
    { key: 'featureTimeline', name: 'Timeline' },
  ];

  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 flex flex-col h-full shadow-lg">
      <div className="p-3 border-b border-gray-700/50">
        <h2 className="font-semibold text-gray-300">Project Memory</h2>
      </div>
      <div className="flex border-b border-gray-700/50 text-sm overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={String(tab.key)}
            onClick={() => setActiveTab(tab.key)}
            className={`px-4 py-2 font-medium transition-colors flex-shrink-0 ${
              activeTab === tab.key
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-gray-400 hover:bg-gray-700/50'
            }`}
          >
            {tab.name}
          </button>
        ))}
      </div>
      <div className="p-1 flex-grow">
        <textarea
          value={documentation[activeTab]}
          onChange={(e) => onDocumentationChange(activeTab, e.target.value)}
          className="w-full h-full bg-transparent text-gray-400 font-mono text-xs p-3 resize-none focus:outline-none"
        />
      </div>
    </div>
  );
};

export default MemoryPanel;
