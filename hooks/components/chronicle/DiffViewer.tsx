// components/chronicle/DiffViewer.tsx
//
// Modal that compares two strings line-by-line. Uses the `diff` package (already a project dep).
// Replaces the previous import from the deleted `developers/` directory.

import React, { useMemo } from 'react';
import { diffLines, Change } from 'diff';

interface DiffViewerProps {
    isOpen: boolean;
    onClose: () => void;
    oldContent: string;
    newContent: string;
}

const lineColor = (change: Change): string => {
    if (change.added) return 'bg-green-900/30 text-green-200 border-l-2 border-green-500';
    if (change.removed) return 'bg-red-900/30 text-red-200 border-l-2 border-red-500';
    return 'text-gray-400';
};

const linePrefix = (change: Change): string => {
    if (change.added) return '+';
    if (change.removed) return '-';
    return ' ';
};

const DiffViewer: React.FC<DiffViewerProps> = ({ isOpen, onClose, oldContent, newContent }) => {
    const changes = useMemo(
        () => (isOpen ? diffLines(oldContent ?? '', newContent ?? '') : []),
        [isOpen, oldContent, newContent],
    );

    if (!isOpen) return null;

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={onClose}
        >
            <div
                className="bg-gray-900 border border-gray-700 rounded-lg shadow-2xl w-full max-w-5xl max-h-[80vh] flex flex-col"
                onClick={e => e.stopPropagation()}
            >
                <header className="p-3 border-b border-gray-700 flex justify-between items-center flex-shrink-0">
                    <h3 className="font-semibold text-gray-200">Diff</h3>
                    <button
                        onClick={onClose}
                        className="text-gray-400 hover:text-white text-2xl leading-none"
                        aria-label="Close diff"
                    >
                        ×
                    </button>
                </header>
                <div className="flex-grow overflow-auto font-mono text-xs leading-relaxed">
                    {changes.map((change, idx) => {
                        const lines = change.value.replace(/\n$/, '').split('\n');
                        return lines.map((line, lineIdx) => (
                            <div
                                key={`${idx}-${lineIdx}`}
                                className={`px-3 py-0.5 whitespace-pre-wrap break-all ${lineColor(change)}`}
                            >
                                <span className="select-none mr-2 opacity-60">{linePrefix(change)}</span>
                                {line || ' '}
                            </div>
                        ));
                    })}
                    {changes.length === 0 && (
                        <div className="p-6 text-center text-gray-500">No differences.</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default DiffViewer;
