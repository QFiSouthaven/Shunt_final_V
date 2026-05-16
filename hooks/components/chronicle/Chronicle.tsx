
// components/chronicle/Chronicle.tsx
import React, { useState, useEffect, useCallback, useMemo, Suspense } from 'react';
import { useTelemetry } from '../../../styles/services/context/TelemetryContext';
import { VersionRecord, VersionContentType } from '@/types/telemetry';
import { HistoryIcon, CopyIcon, CheckIcon, DocumentDuplicateIcon } from '../icons';
import TabFooter from '../common/TabFooter';

const DiffViewer = React.lazy(() => import('./DiffViewer'));

type FilterType = 'All' | VersionContentType;

// Memoized list item to prevent re-renders on selection change
const VersionItem = React.memo(({ version, isSelected, onSelect }: { version: VersionRecord, isSelected: boolean, onSelect: (v: VersionRecord) => void }) => (
    <button onClick={() => onSelect(version)} className={`w-full text-left p-3 rounded-md transition-colors ${isSelected ? 'bg-fuchsia-900/50' : 'bg-gray-800/50 hover:bg-gray-700/50'}`}>
        <p className="font-semibold text-sm text-fuchsia-300 truncate">{version.summary}</p>
        <p className="text-xs text-gray-400 mt-1">{version.contentType.replace(/_/g, ' ')}</p>
        <p className="text-xs text-gray-500 mt-1">{new Date(version.timestamp).toLocaleString()}</p>
    </button>
));


const Chronicle: React.FC = () => {
    const { versionControlService, updateTelemetryContext } = useTelemetry();
    const [versions, setVersions] = useState<VersionRecord[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<VersionRecord | null>(null);
    const [filter, setFilter] = useState<FilterType>('All');
    const [copied, setCopied] = useState(false);
    const [isDiffModalOpen, setIsDiffModalOpen] = useState(false);
    const [diffData, setDiffData] = useState<{ oldContent: string; newContent: string } | null>(null);


    useEffect(() => {
        updateTelemetryContext({ tab: 'Chronicle' });
    }, [updateTelemetryContext]);
    
    const fetchVersions = useCallback(() => {
        if (versionControlService) {
            const allVersions = versionControlService.getAllVersions();
            setVersions(allVersions);
        }
    }, [versionControlService]);

    useEffect(() => {
        fetchVersions();
        const interval = setInterval(fetchVersions, 5000);
        return () => clearInterval(interval);
    }, [fetchVersions]);

    const handleCopy = () => {
        if (selectedVersion && versionControlService) {
            const content = versionControlService.getVersionContent(selectedVersion.versionId);
            if (content) {
                navigator.clipboard.writeText(content);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
            }
        }
    };
    
    const handleViewDiff = useCallback((version: VersionRecord) => {
        if (!versionControlService) return;

        const versionIndex = versions.findIndex(v => v.versionId === version.versionId);
        const previousVersion = versions[versionIndex + 1];

        if (previousVersion && previousVersion.contentRef === version.contentRef) {
            const newContent = versionControlService.getVersionContent(version.versionId);
            const oldContent = versionControlService.getVersionContent(previousVersion.versionId);

            if (newContent && oldContent) {
                setDiffData({ oldContent, newContent });
                setIsDiffModalOpen(true);
            } else {
                alert("Could not retrieve content for one of the versions.");
            }
        } else {
            alert("No previous version found to compare against.");
        }
    }, [versionControlService, versions]);

    const availableFilters = useMemo(() => {
        const contentTypes = new Set(versions.map(v => v.contentType));
        return ['All', ...Array.from(contentTypes)] as FilterType[];
    }, [versions]);

    const filteredVersions = useMemo(() => {
        if (filter === 'All') return versions;
        return versions.filter(v => v.contentType === filter);
    }, [versions, filter]);
    
    const renderContent = (version: VersionRecord) => {
        if (!versionControlService) return <p>Service not available.</p>;
        const content = versionControlService.getVersionContent(version.versionId);
        if (!content) return <p className="text-gray-500 italic">Content not available for this version.</p>;
        
        // Pretty print if it's a shunt interaction (JSON)
        if (version.contentType === 'shunt_interaction' || version.contentType === 'chat_export' || version.contentType === 'developer_canvas_snapshot') {
            try {
                const parsed = JSON.parse(content);
                return <pre className="text-sm text-gray-300 whitespace-pre-wrap break-all font-mono">{JSON.stringify(parsed, null, 2)}</pre>;
            } catch {
                return <pre className="text-sm text-gray-300 whitespace-pre-wrap break-all font-mono">{content}</pre>;
            }
        }
        return <pre className="text-sm text-gray-300 whitespace-pre-wrap break-all font-mono">{content}</pre>;
    };

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 border-b border-gray-700/50 flex-shrink-0">
                <div className="flex items-center gap-2">
                    <HistoryIcon className="w-6 h-6 text-fuchsia-400" />
                    <h2 className="font-semibold text-lg text-gray-300">Application Chronicle</h2>
                </div>
            </div>
            <div className="flex-grow flex flex-col md:flex-row h-full overflow-hidden">
                {/* Left Panel: Filters & List */}
                <div className="w-full md:w-1/3 border-r border-gray-700/50 flex flex-col overflow-y-auto">
                    <div className="p-3 border-b border-gray-700/50">
                        <p className="text-sm font-semibold text-gray-400 mb-2">Filter by Type</p>
                        <div className="flex flex-wrap gap-2">
                            {availableFilters.map(f => (
                                <button key={f} onClick={() => setFilter(f)} className={`px-2 py-1 text-xs rounded-md ${filter === f ? 'bg-fuchsia-500 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'}`}>
                                    {f.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                                </button>
                            ))}
                        </div>
                    </div>
                    <ul className="p-2 space-y-2 flex-grow">
                        {filteredVersions.map(version => (
                            <li key={version.versionId}>
                               <VersionItem
                                    version={version}
                                    isSelected={selectedVersion?.versionId === version.versionId}
                                    onSelect={setSelectedVersion}
                               />
                            </li>
                        ))}
                    </ul>
                </div>
                {/* Right Panel: Details */}
                <div className="w-full md:w-2/3 flex flex-col h-full overflow-y-auto">
                    {selectedVersion ? (
                        <>
                            <div className="p-4 border-b border-gray-700/50 flex-shrink-0">
                                <div className='flex justify-between items-center'>
                                    <h3 className="text-lg font-semibold text-gray-200 truncate">{selectedVersion.summary}</h3>
                                    <button onClick={handleCopy} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-md transition-all duration-200 ${copied ? 'bg-green-500/20 text-green-300' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700/80'}`}>
                                        {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                                        {copied ? 'Copied' : 'Copy Content'}
                                    </button>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">ID: <span className='font-mono'>{selectedVersion.versionId}</span></p>
                            </div>
                            <div className="p-4 space-y-4 flex-grow">
                                <div>
                                    <h4 className="font-semibold text-gray-400 mb-2">Content</h4>
                                    <div className="bg-gray-900/50 rounded-md p-3 max-h-96 overflow-y-auto">
                                        {renderContent(selectedVersion)}
                                    </div>
                                    {selectedVersion.contentType === 'developer_canvas_snapshot' && (
                                        <div className="mt-4">
                                            <button
                                                onClick={() => handleViewDiff(selectedVersion)}
                                                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gray-700/50 border border-gray-600 rounded-md text-gray-300 hover:bg-gray-700 transition-colors"
                                            >
                                                <DocumentDuplicateIcon className="w-5 h-5 text-fuchsia-400" />
                                                View Visual Diff
                                            </button>
                                        </div>
                                    )}
                                </div>
                                {selectedVersion.diff && (
                                     <div>
                                        <h4 className="font-semibold text-gray-400 mb-2">Diff (vs Previous)</h4>
                                        <div className="bg-gray-900/50 rounded-md p-3 max-h-96 overflow-y-auto">
                                            <pre className="text-xs font-mono whitespace-pre-wrap">
                                                {selectedVersion.diff.split('\n').map((line, idx) => (
                                                    <span key={idx} className={
                                                        line.startsWith('+') ? 'text-green-400 bg-green-900/20 block' :
                                                        line.startsWith('-') ? 'text-red-400 bg-red-900/20 block' :
                                                        line.startsWith('@@') ? 'text-fuchsia-400 block' :
                                                        'text-gray-400 block'
                                                    }>
                                                        {line}
                                                    </span>
                                                ))}
                                            </pre>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                            <HistoryIcon className="w-12 h-12 mb-4" />
                            <p className="font-semibold">Select a version from the list to view its details.</p>
                        </div>
                    )}
                </div>
            </div>
            <TabFooter />
             <Suspense fallback={
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
                    <p className="text-white">Loading Diff Viewer...</p>
                </div>
            }>
                {isDiffModalOpen && diffData && (
                    <DiffViewer
                        isOpen={isDiffModalOpen}
                        onClose={() => setIsDiffModalOpen(false)}
                        oldContent={diffData.oldContent}
                        newContent={diffData.newContent}
                    />
                )}
            </Suspense>
        </div>
    );
};

export default Chronicle;
