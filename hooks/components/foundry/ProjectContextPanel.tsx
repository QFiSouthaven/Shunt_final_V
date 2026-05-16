// components/foundry/ProjectContextPanel.tsx
import React from 'react';
import { ClipboardDocumentListIcon, XMarkIcon } from '../icons';
import FileUpload from '../common/FileUpload';

interface ProjectFile {
    filename: string;
    content: string;
}

interface ProjectContextPanelProps {
    files: ProjectFile[];
    onUpdateFiles: (files: ProjectFile[]) => void;
    isLoading: boolean;
}

const ProjectContextPanel: React.FC<ProjectContextPanelProps> = ({ files, onUpdateFiles, isLoading }) => {

    const handleFilesUploaded = (uploadedFiles: Array<{ filename: string; content: string; file: File }>) => {
        const newFiles = uploadedFiles.map(f => ({ filename: f.filename, content: f.content }));
        onUpdateFiles([...files, ...newFiles]);
    };

    const removeFile = (index: number) => {
        onUpdateFiles(files.filter((_, i) => i !== index));
    };

    return (
        <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 flex flex-col shadow-lg flex-grow">
            <header className="p-3 border-b border-gray-700/50 flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <ClipboardDocumentListIcon className="w-5 h-5 text-cyan-400" />
                    <h2 className="font-semibold text-gray-300">Project Context ({files.length})</h2>
                </div>
            </header>
            <main className="p-3 flex flex-col gap-4 flex-grow overflow-hidden">
                <FileUpload
                    onFilesUploaded={handleFilesUploaded}
                    acceptedFileTypes={['.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.md', '.txt', '.py', '.sh', 'dockerfile', '.yml', '.yaml', '.svg', '.gitignore', '.xml', '.xsd', '.zip']}
                    maxFileSizeMB={20}
                    enableDirectoryUpload={true}
                />
                {files.length > 0 && (
                    <div className="space-y-2 flex-grow overflow-y-auto">
                        <h3 className="text-sm font-semibold text-gray-400">Attached Files:</h3>
                        <ul className="space-y-1 pr-1">
                            {files.map((file, index) => (
                                <li key={index} className="flex items-center justify-between bg-gray-900/50 p-2 rounded text-sm">
                                    <span className="text-gray-300 truncate font-mono text-xs" title={file.filename}>{file.filename}</span>
                                    <button onClick={() => removeFile(index)} disabled={isLoading} className="p-1 text-gray-500 hover:text-red-400 disabled:opacity-50">
                                        <XMarkIcon className="w-4 h-4" />
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </main>
        </div>
    );
};

export default ProjectContextPanel;