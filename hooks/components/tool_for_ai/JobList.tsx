
// components/tool_for_ai/JobList.tsx
import React, { useState, useEffect } from 'react';
import { Job, JobStatus } from '@/types';
import { XMarkIcon } from '../icons';
import Loader from '../Loader';

interface JobListProps {
    jobs: Job[];
    onSelect: (job: Job) => void;
    onCancel: (jobId: string) => void;
    selectedJobId: string | null;
}

const getStatusStyles = (status: JobStatus) => {
    switch (status) {
        case 'Pending': return 'bg-yellow-500/20 text-yellow-300';
        case 'Running': return 'bg-cyan-500/20 text-cyan-300';
        case 'Completed': return 'bg-green-500/20 text-green-300';
        case 'Failed': return 'bg-red-500/20 text-red-300';
        case 'Cancelled': return 'bg-gray-600/20 text-gray-400';
    }
};

const JobItem: React.FC<{ job: Job; onSelect: () => void; onCancel: () => void; isSelected: boolean }> = React.memo(({ job, onSelect, onCancel, isSelected }) => {
    const [duration, setDuration] = useState('');

    useEffect(() => {
        const updateDuration = () => {
            const end = job.endTime || Date.now();
            const diffSeconds = Math.round((end - job.startTime) / 1000);
            setDuration(`${diffSeconds}s`);
        };
        
        updateDuration();
        if (job.status === 'Running') {
            const interval = setInterval(updateDuration, 1000);
            return () => clearInterval(interval);
        }
    }, [job.startTime, job.endTime, job.status]);

    const canCancel = job.status === 'Pending' || job.status === 'Running';

    return (
        <li 
            onClick={onSelect} 
            className={`p-3 rounded-md transition-colors cursor-pointer flex items-center justify-between gap-4 group ${isSelected ? 'bg-fuchsia-900/50' : 'bg-gray-900/50 hover:bg-gray-700/50'}`}
        >
            <div className="flex-grow overflow-hidden">
                <p className="font-mono text-xs text-gray-400 truncate" title={job.id}>{job.id}</p>
                <p className="text-sm text-gray-300 truncate mt-1" title={job.prompt}>{job.prompt}</p>
            </div>
            <div className="flex-shrink-0 flex items-center gap-3">
                <span className="font-mono text-xs text-gray-500 w-12 text-right">{duration}</span>
                <span className={`px-2 py-0.5 text-xs font-semibold rounded-full w-24 text-center ${getStatusStyles(job.status)}`}>
                    {job.status}
                </span>
                {canCancel ? (
                    <button 
                        onClick={(e) => { e.stopPropagation(); onCancel(); }} 
                        className="p-1 rounded-full text-gray-500 hover:bg-red-500/50 hover:text-white opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Cancel Job"
                    >
                        <XMarkIcon className="w-4 h-4" />
                    </button>
                ) : (
                    <div className="w-6 h-6"></div> // Placeholder for alignment
                )}
            </div>
        </li>
    );
});


const JobList: React.FC<JobListProps> = ({ jobs, onSelect, onCancel, selectedJobId }) => {
    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg flex flex-col h-full overflow-hidden">
            <header className="p-3 border-b border-gray-700/50 flex-shrink-0">
                <h3 className="font-semibold text-gray-300">Job History</h3>
            </header>
            <main className="flex-grow overflow-y-auto">
                {jobs.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-500">
                        <p>No jobs have been submitted yet.</p>
                    </div>
                ) : (
                    <ul className="p-2 space-y-2">
                        {jobs.map(job => (
                            <JobItem 
                                key={job.id}
                                job={job}
                                onSelect={() => onSelect(job)}
                                onCancel={() => onCancel(job.id)}
                                isSelected={selectedJobId === job.id}
                            />
                        ))}
                    </ul>
                )}
            </main>
        </div>
    );
};

export default JobList;
