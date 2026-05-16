
// components/tool_for_ai/JobDetails.tsx
import React, { useRef, useEffect } from 'react';
import { Job } from '@/types';
import MarkdownRenderer from '../common/MarkdownRenderer';
import { DeveloperIcon } from '../icons';

interface JobDetailsProps {
    job: Job | null;
}

const JobDetails: React.FC<JobDetailsProps> = ({ job }) => {
    const logEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [job?.logs]);

    if (!job) {
        return (
            <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg h-full flex items-center justify-center text-center text-gray-500">
                <div>
                    <DeveloperIcon className="w-12 h-12 mx-auto mb-4" />
                    <p className="font-semibold">Select a job to view its details.</p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg h-full flex flex-col overflow-hidden">
            <header className="p-4 border-b border-gray-700/50 flex-shrink-0">
                <h3 className="font-semibold text-gray-200">Job Details</h3>
                <p className="font-mono text-xs text-gray-500 mt-1 truncate">{job.id}</p>
            </header>
            <main className="p-4 flex-grow overflow-y-auto space-y-4">
                <div>
                    <h4 className="text-sm font-semibold text-gray-400 mb-2">Prompt</h4>
                    <div className="p-3 bg-gray-900/50 rounded-md text-sm text-gray-300">
                        {job.prompt}
                    </div>
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-gray-400 mb-2">Execution Log</h4>
                    <div className="p-3 bg-black/30 rounded-md font-mono text-xs text-gray-400 max-h-48 overflow-y-auto space-y-1">
                        {job.logs.map((log, i) => (
                            <div key={i} className="flex gap-3">
                                <span className="text-gray-600">{log.timestamp}</span>
                                <span>{log.message}</span>
                            </div>
                        ))}
                         <div ref={logEndRef} />
                    </div>
                </div>
                <div>
                    <h4 className="text-sm font-semibold text-gray-400 mb-2">Result</h4>
                    <div className="p-3 bg-gray-900/50 rounded-md">
                        {job.result ? (
                            <MarkdownRenderer content={job.result} />
                        ) : (
                            <p className="text-gray-500 text-sm italic">
                                {job.status === 'Running' || job.status === 'Pending' ? 'Awaiting result...' : 'No result generated.'}
                            </p>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default JobDetails;
