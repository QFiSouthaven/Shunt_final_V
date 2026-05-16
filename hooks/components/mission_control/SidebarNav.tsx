import React from 'react';
import { MissionControlTab, MissionControlTabKey } from '@/types';
import { AppIcon } from '../icons';

interface SidebarNavProps {
    tabs: MissionControlTab[];
    activeTab: MissionControlTabKey;
    onTabClick: (tabKey: MissionControlTabKey) => void;
    isOpen: boolean; // New prop
}

const SidebarNav: React.FC<SidebarNavProps> = ({ tabs, activeTab, onTabClick, isOpen }) => {
    return (
        <nav 
            className={`bg-gray-900/50 border border-gray-700/50 flex-shrink-0 flex flex-col h-full
                       transition-all duration-300 ease-in-out overflow-hidden rounded-lg
                       ${isOpen ? 'w-64' : 'w-12'}
            `}
        >
            <div className={`border-b border-gray-700/50 flex items-center gap-3 ${isOpen ? 'p-5' : 'py-3 px-2 justify-center'}`}>
                <AppIcon className="w-8 h-8 text-fuchsia-400 flex-shrink-0" />
                {isOpen && (
                    <h1 className="text-xl font-bold tracking-wider text-gray-100 whitespace-nowrap">
                        Aether <span className="text-fuchsia-400">Shunt</span>
                    </h1>
                )}
            </div>
            <ul className={`flex-grow space-y-1 ${isOpen ? 'p-3' : 'py-3 px-1'}`}>
                {tabs.map(tab => (
                    <li key={tab.key}>
                        <button
                            onClick={() => onTabClick(tab.key)}
                            title={tab.label}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors 
                                ${activeTab === tab.key
                                ? 'bg-fuchsia-500/10 text-fuchsia-300'
                                : 'text-gray-400 hover:bg-gray-700/50 hover:text-gray-200'
                                }
                                ${!isOpen ? 'justify-center' : ''} /* Center icon when collapsed */
                            `}
                        >
                            {tab.icon}
                            {isOpen && <span>{tab.label}</span>}
                        </button>
                    </li>
                ))}
            </ul>
        </nav>
    );
};

export default React.memo(SidebarNav);