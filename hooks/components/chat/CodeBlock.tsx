// components/chat/CodeBlock.tsx
import React, { useState } from 'react';
import { CopyIcon, CheckIcon, BoltIcon } from '../icons';

interface CodeBlockProps {
    language: string;
    code: string;
    onExecute?: (language: string, code: string) => void;
}

const CodeBlock: React.FC<CodeBlockProps> = ({ language, code, onExecute }) => {
    const [copied, setCopied] = useState(false);
    const isExecutable = onExecute && (language === 'javascript' || language === 'python' || language === 'js' || language === 'py');

    const handleCopy = () => {
        navigator.clipboard.writeText(code);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="bg-black/50 rounded-lg my-2 not-prose relative group">
            <div className="text-xs text-gray-400 px-4 py-2 border-b border-gray-600/50 flex justify-between items-center">
                <span>{language || 'code'}</span>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isExecutable && (
                        <button onClick={() => onExecute(language, code)} className="flex items-center gap-1 text-xs hover:text-white">
                            <BoltIcon className="w-4 h-4" /> Run Code
                        </button>
                    )}
                    <button onClick={handleCopy} className="flex items-center gap-1 text-xs hover:text-white">
                        {copied ? <CheckIcon className="w-4 h-4 text-green-400" /> : <CopyIcon className="w-4 h-4" />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                </div>
            </div>
            <pre className="p-4 text-sm text-gray-200 overflow-x-auto whitespace-pre-wrap font-mono">
                <code>{code}</code>
            </pre>
        </div>
    );
};

export default CodeBlock;
