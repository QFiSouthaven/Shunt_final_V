// components/common/VersionHistoryPanel.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { useTelemetry } from '@/styles/services/context/TelemetryContext';
import { VersionRecord, VersionContentType } from '@/types/telemetry';
import { BookIcon } from '../icons';

interface VersionHistoryPanelProps {
    contentRef: string;
    contentType: VersionContentType;
    onVersionSelect: (content: string) => void;
    currentContent: string;
}

const VersionHistoryPanel: React.FC<VersionHistoryPanelProps> = ({
    contentRef,
    contentType,
    onVersionSelect,
    currentContent,
}) => {
    const { versionControlService } = useTelemetry();
    const [versions, setVersions] = useState<VersionRecord[]>([]);
    const [selectedVersion, setSelectedVersion] = useState<VersionRecord | null>(null);
    const [selectedVersionContent, setSelectedVersionContent] = useState<string | null>(null);
    const [diffView, setDiffView] = useState<string | null>(null);

    const fetchVersions = useCallback(() => {
        if (versionControlService) {
            const fetchedVersions = versionControlService.getVersions(contentRef);
            setVersions(fetchedVersions);
        }
    }, [versionControlService, contentRef]);

    useEffect(() => {
        fetchVersions();
        const interval = setInterval(fetchVersions, 5000);
        return () => clearInterval(interval);
    }, [fetchVersions]);

    useEffect(() => {
        if (selectedVersion && versionControlService) {
            const content = versionControlService.getVersionContent(selectedVersion.versionId);
            setSelectedVersionContent(content);
            setDiffView(versionControlService.generateDiff(content || '', currentContent));
        } else {
            setSelectedVersionContent(null);
            setDiffView(null);
        }
    }, [selectedVersion, versionControlService, currentContent]);


    const handleRevertClick = useCallback((versionId: string) => {
        if (versionControlService) {
            const content = versionControlService.revertToVersion(versionId);
            if (content) {
                onVersionSelect(content);
                setSelectedVersion(null);
                // Consider a less intrusive notification system in a real app
                alert('Content successfully reverted!');
            } else {
                alert('Failed to revert: content not found for this version.');
            }
        }
    }, [versionControlService, onVersionSelect]);

    if (!versionControlService) {
        return <div className="text-gray-500">Version control service not available.</div>;
    }

    const friendlyContentType = contentType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg flex flex-col h-full">
            <div className="p-3 border-b border-gray-700/50">
                <h3 className="font-semibold text-gray-300">Version History</h3>
            </div>
            <div className="flex-grow overflow-y-auto p-4">
                {versions.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center text-gray-500">
                        <BookIcon className="w-10 h-10 mb-2"/>
                        <p>No versions recorded for this {friendlyContentType}.</p>
                    </div>
                ) : (
                    <ul className="space-y-2">
                        {versions.map((version, index) => (
                            <li
                                key={version.versionId}
                                className={`p-3 rounded-md cursor-pointer transition-colors text-left ${
                                    selectedVersion?.versionId === version.versionId
                                        ? 'bg-cyan-900/50 border border-cyan-700'
                                        : 'bg-gray-900/50 border border-transparent hover:border-gray-600'
                                }`}
                                onClick={() => setSelectedVersion(selectedVersion?.versionId === version.versionId ? null : version)}
                            >
                                <p className="font-medium text-sm text-cyan-300">
                                    Version {versions.length - index}
                                </p>
                                <p className="text-gray-400 text-xs truncate" title={version.summary}>{version.summary}</p>
                                <p className="text-gray-500 text-xs mt-1">{new Date(version.timestamp).toLocaleString()}</p>
                                
                                {selectedVersion?.versionId === version.versionId && (
                                    <div className="mt-3 pt-3 border-t border-gray-700 text-sm">
                                        <p className="text-gray-400 mb-2 font-semibold">Diff (vs Current)</p>
                                        <pre className="text-xs text-gray-300 whitespace-pre-wrap break-all max-h-48 overflow-y-auto p-2 bg-black/30 rounded-md font-mono">
                                            {diffView ? diffView.split('\n').map((line, idx) => (
                                                <span key={idx} className={
                                                    line.startsWith('+') ? 'text-green-400' :
                                                    line.startsWith('-') ? 'text-red-400' :
                                                    'text-gray-400'
                                                }>
                                                    {line}<br/>
                                                </span>
                                            )) : "No changes detected."}
                                        </pre>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); handleRevertClick(version.versionId); }}
                                            className="mt-3 w-full px-4 py-1.5 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-500 transition-colors text-xs"
                                        >
                                            Revert to This Version
                                        </button>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

export default VersionHistoryPanel;
