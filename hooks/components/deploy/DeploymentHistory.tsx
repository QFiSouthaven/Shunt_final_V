// components/deploy/DeploymentHistory.tsx
import React from 'react';
import { HistoryIcon } from '../icons';

interface HistoryEntry {
    id: string;
    env: string;
    version: string;
    status: 'Success' | 'Pending' | 'Failed';
    timestamp: string;
    user: string;
}

interface DeploymentHistoryProps {
    history: HistoryEntry[];
}

const getStatusClasses = (status: HistoryEntry['status']) => {
    switch (status) {
        case 'Success': return 'bg-green-500/20 text-green-300';
        case 'Pending': return 'bg-yellow-500/20 text-yellow-300';
        case 'Failed': return 'bg-red-500/20 text-red-300';
        default: return 'bg-gray-700 text-gray-300';
    }
};

const DeploymentHistory: React.FC<DeploymentHistoryProps> = ({ history }) => {
    return (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 shadow-lg">
            <header className="p-4 border-b border-gray-700/50 flex items-center gap-3">
                <HistoryIcon className="w-5 h-5 text-fuchsia-400" />
                <h3 className="text-lg font-semibold text-gray-200">Deployment History</h3>
            </header>
            <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-gray-400">
                    <thead className="text-xs text-gray-400 uppercase bg-gray-900/30">
                        <tr>
                            <th scope="col" className="px-6 py-3">Environment</th>
                            <th scope="col" className="px-6 py-3">Status</th>
                            <th scope="col" className="px-6 py-3">Version</th>
                            <th scope="col" className="px-6 py-3">Timestamp</th>
                            <th scope="col" className="px-6 py-3">Triggered By</th>
                        </tr>
                    </thead>
                    <tbody>
                        {history.length > 0 ? history.map(entry => (
                            <tr key={entry.id} className="border-b border-gray-700/50 hover:bg-gray-700/20">
                                <td className="px-6 py-4 font-medium text-gray-200">{entry.env}</td>
                                <td className="px-6 py-4">
                                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusClasses(entry.status)}`}>
                                        {entry.status}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-mono">{entry.version}</td>
                                <td className="px-6 py-4">{entry.timestamp}</td>
                                <td className="px-6 py-4">{entry.user}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={5} className="text-center py-8 text-gray-500">No deployment history found.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default DeploymentHistory;