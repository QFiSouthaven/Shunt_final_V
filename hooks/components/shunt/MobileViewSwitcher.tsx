// components/shunt/MobileViewSwitcher.tsx
import React from 'react';
import { EditIcon, Cog6ToothIcon, DocumentIcon } from '../icons';

type MobileView = 'input' | 'controls' | 'output';

interface MobileViewSwitcherProps {
  activeView: MobileView;
  onViewChange: (view: MobileView) => void;
  hasOutput: boolean;
  hasError: boolean;
  isLoading: boolean;
}

const MobileViewSwitcher: React.FC<MobileViewSwitcherProps> = ({ activeView, onViewChange, hasOutput, hasError, isLoading }) => {
  const showOutputBadge = (hasOutput || hasError) && activeView !== 'output';

  const tabs: { view: MobileView; label: string; icon: React.ReactNode }[] = [
    { view: 'input', label: 'Input', icon: <EditIcon className="w-5 h-5" /> },
    { view: 'controls', label: 'Actions', icon: <Cog6ToothIcon className="w-5 h-5" /> },
    { view: 'output', label: 'Output', icon: <DocumentIcon className="w-5 h-5" /> },
  ];

  return (
    <div className="sticky top-0 z-20 xl:hidden bg-gray-900/95 backdrop-blur-sm border-b border-gray-700">
      <div className="flex">
        {tabs.map(tab => (
          <button
            key={tab.view}
            onClick={() => onViewChange(tab.view)}
            disabled={isLoading && activeView !== tab.view}
            className={`flex-1 flex items-center justify-center gap-2 min-h-[48px] px-3 py-3 text-sm font-medium transition-colors relative
              ${activeView === tab.view
                ? 'text-cyan-400 border-b-2 border-cyan-400'
                : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200 disabled:opacity-50 disabled:hover:bg-transparent'
              }`}
          >
            {tab.icon}
            <span className="hidden xs:inline">{tab.label}</span>
            {tab.view === 'output' && showOutputBadge && (
              <span className="absolute top-2 right-2 flex h-3 w-3">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-cyan-500"></span>
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
};

export default MobileViewSwitcher;
