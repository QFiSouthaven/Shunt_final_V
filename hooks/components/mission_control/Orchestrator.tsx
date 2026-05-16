// components/mission_control/Orchestrator.tsx
import React from 'react';
import TabFooter from '../common/TabFooter';
import { BranchingIcon } from '../icons';

const Orchestrator: React.FC = () => {
    return (
        <div className="flex flex-col h-full bg-gray-800/30">
            <div className="flex-grow p-4 md:p-6 flex flex-col items-center justify-center text-center">
                <BranchingIcon className="w-16 h-16 text-gray-600 mb-4" />
                <h2 className="text-2xl font-bold text-gray-400">Orchestrator Module</h2>
                <p className="mt-2 text-gray-500 max-w-md">
                    This module is currently under development. It will provide a visual interface for creating and managing complex AI agent workflows.
                </p>
            </div>
            <TabFooter />
        </div>
    );
};

export default Orchestrator;
