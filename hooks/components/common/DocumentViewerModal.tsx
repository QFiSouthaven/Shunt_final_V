// components/common/DocumentViewerModal.tsx
import React, { useState, useEffect } from 'react';
import { DocumentIcon, CopyIcon, CheckIcon, XMarkIcon } from '../icons';

interface Document {
    name: string;
    content: string;
    base64Data?: string;
    mimeType?: string;
}

interface DocumentViewerModalProps {
    isOpen: boolean;
    onClose: () => void;
    document: Document;
}

const DocumentViewerModal: React.FC<DocumentViewerModalProps> = ({ isOpen, onClose, document }) => {
    const [isRendered, setIsRendered] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsRendered(true);
        } else {
            const timer = setTimeout(() => {
                setIsRendered(false);
                setCopied(false);
            }, 300); // Match animation duration
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const handleCopy = () => {
        navigator.clipboard.writeText(document.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (!isRendered) return null;

    return (
        <div
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop ${isOpen ? 'bg-black/70' : 'bg-black/0'}`}
            aria-modal="true"
            role="dialog"
        >
            <div className={`modal-content ${isOpen ? 'open' : ''} bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-3xl h-[80vh] flex flex-col`}>
                <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                    <div className="flex items-center gap-3 overflow-hidden">
                        <DocumentIcon className="w-6 h-6 text-cyan-400 flex-shrink-0" />
                        <h2 className="text-lg font-semibold text-gray-200 truncate" title={document.name}>{document.name}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                         <button onClick={handleCopy} disabled={!!document.base64Data} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-md transition-all duration-200 ${copied ? 'bg-green-500/20 text-green-300' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700/80'} disabled:opacity-50 disabled:cursor-not-allowed`}>
                            {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                            <span>{copied ? 'Copied' : 'Copy Text'}</span>
                        </button>
                        <button onClick={onClose} className="text-gray-400 hover:text-white transition-colors p-1 rounded-full hover:bg-gray-700/50">
                            <XMarkIcon className="w-6 h-6" />
                        </button>
                    </div>
                </header>
                <main className="p-4 flex-grow overflow-y-auto bg-gray-900/50 rounded-b-lg flex items-center justify-center">
                    {document.base64Data && document.mimeType ? (
                        <img src={`data:${document.mimeType};base64,${document.base64Data}`} alt={document.name} className="max-w-full max-h-full object-contain" />
                    ) : (
                        <pre className="text-sm text-gray-300 whitespace-pre-wrap break-words font-mono">
                            {document.content}
                        </pre>
                    )}
                </main>
            </div>
        </div>
    );
};

export default DocumentViewerModal;