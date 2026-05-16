
// components/weaver/MailboxModal.tsx
import React, { useState, useEffect } from 'react';
import { useMailbox } from '../../../styles/services/context/MailboxContext';
import { MailboxFile } from '@/types';
import { XMarkIcon, MailboxIcon, CopyIcon, CheckIcon } from '../icons';

interface MailboxModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const FileDetailView: React.FC<{ file: MailboxFile; onBack: () => void }> = ({ file, onBack }) => {
    const [copied, setCopied] = useState(false);

    const handleCopy = () => {
        navigator.clipboard.writeText(file.content);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col h-full">
            <header className="p-4 border-b border-gray-700 flex-shrink-0">
                <div className="flex items-center justify-between">
                    <div className='flex items-center gap-2'>
                        <button onClick={onBack} className="text-gray-400 hover:text-white">&larr; Back</button>
                        <h3 className="font-mono text-fuchsia-300" title={file.path}>{file.path}</h3>
                    </div>
                    <button onClick={handleCopy} className={`flex items-center gap-2 text-sm px-3 py-1.5 rounded-md transition-all duration-200 ${copied ? 'bg-green-500/20 text-green-300' : 'bg-gray-700/50 text-gray-300 hover:bg-gray-700/80'}`}>
                        {copied ? <CheckIcon className="w-4 h-4" /> : <CopyIcon className="w-4 h-4" />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">Received: {new Date(file.timestamp).toLocaleString()}</p>
            </header>
            <main className="flex-grow p-4 overflow-y-auto bg-gray-900/50">
                 <pre className="text-sm text-gray-300 whitespace-pre-wrap break-words font-mono">
                    <code>{file.content}</code>
                </pre>
            </main>
        </div>
    );
};


const MailboxModal: React.FC<MailboxModalProps> = ({ isOpen, onClose }) => {
    const { files, markAsRead, clearMailbox } = useMailbox();
    const [selectedFile, setSelectedFile] = useState<MailboxFile | null>(null);
    const [isRendered, setIsRendered] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setIsRendered(true);
        } else {
            // Delay unmounting for animation
            const timer = setTimeout(() => setIsRendered(false), 300);
            return () => clearTimeout(timer);
        }
    }, [isOpen]);
    
    const handleFileSelect = (file: MailboxFile) => {
        setSelectedFile(file);
        markAsRead(file.id);
    };

    const handleClose = () => {
        setSelectedFile(null);
        onClose();
    };

    if (!isRendered) return null;

    return (
        <div 
            className={`fixed inset-0 z-50 flex items-center justify-center p-4 modal-backdrop ${isOpen ? 'bg-black/70' : 'bg-black/0'}`} 
            aria-modal="true" 
            role="dialog"
        >
            <div className={`modal-content ${isOpen ? 'open' : ''} bg-gray-800 border border-gray-700 rounded-lg shadow-xl w-full max-w-4xl h-[90vh] flex flex-col`}>
                {selectedFile ? (
                    <FileDetailView file={selectedFile} onBack={() => setSelectedFile(null)} />
                ) : (
                    <>
                        <header className="flex items-center justify-between p-4 border-b border-gray-700 flex-shrink-0">
                            <div className="flex items-center gap-3">
                                <MailboxIcon className="w-6 h-6 text-fuchsia-400" />
                                <h2 className="text-lg font-semibold text-gray-200">Mailbox</h2>
                            </div>
                             <div className="flex items-center gap-4">
                                {files.length > 0 && (
                                    <button onClick={clearMailbox} className="text-sm text-gray-400 hover:text-red-400 transition-colors">Clear All</button>
                                )}
                                <button onClick={handleClose} className="text-gray-400 hover:text-white transition-colors">
                                    <XMarkIcon className="w-6 h-6" />
                                </button>
                            </div>
                        </header>
                        <main className="p-4 overflow-y-auto flex-grow">
                           {files.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-full text-gray-500">
                                    <MailboxIcon className="w-12 h-12 mb-4" />
                                    <p className="font-semibold">Your mailbox is empty.</p>
                                    <p className="text-sm mt-1">Generated skill files will appear here.</p>
                                </div>
                            ) : (
                                <ul className="space-y-3">
                                    {files.map(file => (
                                        <li key={file.id}>
                                            <button onClick={() => handleFileSelect(file)} className="w-full text-left p-4 rounded-md bg-gray-900/50 border border-gray-700/50 hover:border-fuchsia-500/50 transition-colors flex items-start justify-between gap-4">
                                                <div className="flex-grow overflow-hidden">
                                                    <p className="font-mono text-fuchsia-300 truncate" title={file.path}>{file.path}</p>
                                                    <p className="text-xs text-gray-500 mt-1">{new Date(file.timestamp).toLocaleString()}</p>
                                                </div>
                                                {!file.isRead && (
                                                     <div className="flex-shrink-0 mt-1">
                                                        <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-fuchsia-500/20 text-fuchsia-300">New</span>
                                                    </div>
                                                )}
                                            </button>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </main>
                    </>
                )}
            </div>
        </div>
    );
};

export default MailboxModal;
