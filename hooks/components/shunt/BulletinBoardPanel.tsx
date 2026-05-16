

// components/shunt/BulletinBoardPanel.tsx
import React from 'react';
import { ClipboardDocumentListIcon, XMarkIcon, MinusIcon, AmplifyIcon, BrainIcon, DocumentArrowDownIcon } from '../icons';
import FileUpload from '../common/FileUpload';

interface Document {
    name: string;
    content: string;
}
interface BulletinBoardPanelProps {
    documents: Document[];
    onUpdateDocuments: (documents: Document[]) => void;
    isMinimized?: boolean;
    onToggleMinimize?: () => void;
    isLoading: boolean;
    onSynthesize: () => void;
    onViewDocument: (document: Document) => void;
}

const BulletinBoardPanel: React.FC<BulletinBoardPanelProps> = ({ documents, onUpdateDocuments, isMinimized, onToggleMinimize, isLoading, onSynthesize, onViewDocument }) => {

    const handleFilesUploaded = (files: Array<{ filename: string; content: string; file: File }>) => {
        const newDocs = files.map(f => ({ name: f.filename, content: f.content }));
        onUpdateDocuments([...documents, ...newDocs]);
    };

    const removeDocument = (index: number) => {
        onUpdateDocuments(documents.filter((_, i) => i !== index));
    };

    const handleDownload = (doc: Document) => {
        const blob = new Blob([doc.content], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = doc.name;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 flex flex-col shadow-lg">
            <header className="p-3 border-b border-gray-700/50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    {onToggleMinimize && (
                      <button onClick={onToggleMinimize} title={isMinimized ? 'Expand' : 'Minimize'} className="p-1 text-gray-400 hover:text-white">
                        {isMinimized ? <AmplifyIcon className="w-5 h-5"/> : <MinusIcon className="w-5 h-5"/>}
                      </button>
                    )}
                    <ClipboardDocumentListIcon className="w-5 h-5 text-cyan-400" />
                    <h2 className="font-semibold text-gray-300">Bulletin Board</h2>
                </div>
            </header>
            {!isMinimized && (
                <main className="p-3 flex flex-col gap-4">
                    <FileUpload
                        onFilesUploaded={handleFilesUploaded}
                        acceptedFileTypes={['.txt', '.md', '.json', '.js', '.py', '.html', '.css', '.ts']}
                        maxFileSizeMB={2}
                    />
                    <button
                        onClick={onSynthesize}
                        disabled={isLoading || documents.length === 0}
                        className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-center p-2 rounded-md border transition-all duration-200 bg-cyan-600/80 border-cyan-500 text-white shadow-lg hover:bg-cyan-600 hover:border-cyan-400 hover:shadow-cyan-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Synthesize all attached documents into a single, cohesive markdown file."
                    >
                        <BrainIcon className="w-5 h-5" />
                        Synthesize Notes
                    </button>
                    {documents.length > 0 && (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                            <h3 className="text-sm font-semibold text-gray-400">Attached Documents:</h3>
                            <ul className="space-y-1">
                                {documents.map((doc, index) => (
                                    <li key={index} className="flex items-center justify-between bg-gray-900/50 p-2 rounded text-sm group">
                                        <button onClick={() => onViewDocument(doc)} className="text-left flex-grow truncate">
                                            <span className="text-gray-300 group-hover:text-cyan-400 transition-colors" title={doc.name}>{doc.name}</span>
                                        </button>
                                        <div className="flex items-center flex-shrink-0">
                                            <button onClick={() => handleDownload(doc)} className="p-1 text-gray-500 hover:text-cyan-400" title="Download Document">
                                                <DocumentArrowDownIcon className="w-4 h-4" />
                                            </button>
                                            <button onClick={() => removeDocument(index)} className="p-1 text-gray-500 hover:text-red-400" title="Remove Document">
                                                <XMarkIcon className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                </main>
            )}
        </div>
    );
};

export default BulletinBoardPanel;