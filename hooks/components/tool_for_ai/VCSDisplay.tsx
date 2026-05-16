// components/tool_for_ai/VCSDisplay.tsx
import React from 'react';

const FileList: React.FC<{ title: string; files: string[]; colorClass: string }> = ({ title, files, colorClass }) => {
    if (files.length === 0) return null;
    return (
        <div>
            <p>{title}:</p>
            <ul className="pl-4">
                {files.map(file => (
                    <li key={file} className={colorClass}>
                        {file}
                    </li>
                ))}
            </ul>
        </div>
    );
};


const VCSDisplay: React.FC<{ vcsState: any }> = ({ vcsState }) => {
    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg flex flex-col">
            <header className="p-3 border-b border-gray-700/50 flex-shrink-0">
                <h3 className="font-semibold text-gray-300">VCS Status</h3>
            </header>
            <main className="p-4 font-mono text-xs text-gray-300 space-y-2">
                <p>Branch: <span className="text-cyan-400">{vcsState.currentBranch}</span></p>
                <div>
                    <p>Changes:</p>
                    <div className="pl-4 mt-1 space-y-1">
                        {vcsState.status.staged?.length === 0 && vcsState.status.unstaged?.length === 0 ? (
                             <p className="text-gray-500 italic">Working tree is clean.</p>
                        ) : (
                           <>
                                <FileList title="Staged" files={vcsState.status.staged || []} colorClass="text-green-400" />
                                <FileList title="Unstaged" files={vcsState.status.unstaged || []} colorClass="text-yellow-400" />
                                <FileList title="Untracked" files={vcsState.status.untracked || []} colorClass="text-gray-400" />
                           </>
                        )}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default VCSDisplay;