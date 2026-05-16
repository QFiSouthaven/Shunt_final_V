// components/terminal/Terminal.tsx
import React, { useState, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TerminalSession from './TerminalSession';
import { XMarkIcon } from '../icons';

interface Tab {
    id: string;
    name: string;
}

const Terminal: React.FC = () => {
    const [tabs, setTabs] = useState<Tab[]>([{ id: uuidv4(), name: 'bash' }]);
    const [activeTabId, setActiveTabId] = useState<string>(tabs[0].id);

    const addTab = useCallback(() => {
        const newTabId = uuidv4();
        const newTab: Tab = {
            id: newTabId,
            name: 'bash',
        };
        setTabs(prev => [...prev, newTab]);
        setActiveTabId(newTabId);
    }, []);

    const closeTab = useCallback((tabId: string) => {
        setTabs(prev => {
            const newTabs = prev.filter(tab => tab.id !== tabId);
            if (newTabs.length === 0) {
                const newTab: Tab = { id: uuidv4(), name: 'bash' };
                setActiveTabId(newTab.id);
                return [newTab];
            }
            if (activeTabId === tabId) {
                setActiveTabId(newTabs[newTabs.length - 1].id);
            }
            return newTabs;
        });
    }, [activeTabId]);

    return (
        <div className="flex flex-col h-full bg-black/80 text-gray-200 font-mono">
            {/* Tab Bar */}
            <div className="flex items-center bg-gray-900/70 border-b border-gray-700/50">
                {tabs.map((tab, index) => (
                    <div
                        key={tab.id}
                        onClick={() => setActiveTabId(tab.id)}
                        className={`flex items-center gap-2 px-4 py-2 border-r border-gray-700/50 cursor-pointer transition-colors ${
                            activeTabId === tab.id
                                ? 'bg-gray-800/50'
                                : 'bg-transparent hover:bg-gray-700/30'
                        }`}
                    >
                        <span>{`${tab.name}-${index + 1}`}</span>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                closeTab(tab.id);
                            }}
                            className="text-gray-500 hover:text-white rounded-full p-0.5 hover:bg-gray-600/50"
                        >
                            <XMarkIcon className="w-4 h-4" />
                        </button>
                    </div>
                ))}
                <button
                    onClick={addTab}
                    className="px-3 py-2 text-lg text-gray-400 hover:text-white hover:bg-gray-700/30"
                    title="New Tab"
                >
                    +
                </button>
            </div>

            {/* Terminal Sessions */}
            <div className="flex-grow relative">
                {tabs.map(tab => (
                    <div
                        key={tab.id}
                        className={`absolute inset-0 transition-opacity ${
                            activeTabId === tab.id ? 'opacity-100' : 'opacity-0 pointer-events-none'
                        }`}
                    >
                        {activeTabId === tab.id && <TerminalSession />}
                    </div>
                ))}
            </div>
        </div>
    );
};

export default Terminal;
