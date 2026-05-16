
// components/mod/Mod.tsx
import React, { useState, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import TabFooter from '../common/TabFooter';
import FileUpload from '../common/FileUpload';
import { CubeTransparentIcon, XMarkIcon, FolderIcon } from '../icons';
import { useTelemetry } from '@/styles/services/context/TelemetryContext';
import ToggleSwitch from '../common/ToggleSwitch';

interface ModPackage {
    id: string;
    name: string;
    version: string;
    description: string;
    fileCount: number;
    isEnabled: boolean;
    timestamp: string;
}

const Mod: React.FC = () => {
    const { updateTelemetryContext } = useTelemetry();
    const [mods, setMods] = useState<ModPackage[]>(() => {
        try {
            const saved = localStorage.getItem('installed_mods');
            return saved ? JSON.parse(saved) : [];
        } catch { return []; }
    });

    useEffect(() => {
        updateTelemetryContext({ tab: 'mod' });
    }, [updateTelemetryContext]);

    useEffect(() => {
        try {
            localStorage.setItem('installed_mods', JSON.stringify(mods));
        } catch (e) { console.error("Failed to save mods", e); }
    }, [mods]);

    const handleFilesUploaded = (files: Array<{ filename: string; content: string; file: File }>) => {
        // Logic to detect a "project" structure or package.json
        const packageJsonFile = files.find(f => f.filename.endsWith('package.json'));
        let modName = 'Unnamed Extension';
        let modVersion = '1.0.0';
        let modDescription = 'No description provided.';

        if (packageJsonFile) {
            try {
                const pkg = JSON.parse(packageJsonFile.content);
                modName = pkg.name || modName;
                modVersion = pkg.version || modVersion;
                modDescription = pkg.description || modDescription;
            } catch (e) {
                console.warn("Failed to parse package.json", e);
            }
        } else if (files.length > 0) {
            // Use root folder name if possible, or just first file's dir
            const firstPath = files[0].filename;
            const rootDir = firstPath.split('/')[0];
            if (rootDir && rootDir !== firstPath) {
                modName = rootDir;
            } else {
                modName = `Extension Bundle ${new Date().toLocaleTimeString()}`;
            }
        }

        const newMod: ModPackage = {
            id: uuidv4(),
            name: modName,
            version: modVersion,
            description: modDescription,
            fileCount: files.length,
            isEnabled: true,
            timestamp: new Date().toLocaleString(),
        };

        setMods(prev => [newMod, ...prev]);
    };

    const toggleMod = (id: string, enabled: boolean) => {
        setMods(prev => prev.map(m => m.id === id ? { ...m, isEnabled: enabled } : m));
    };

    const removeMod = (id: string) => {
        if (window.confirm("Are you sure you want to remove this mod?")) {
            setMods(prev => prev.filter(m => m.id !== id));
        }
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex-grow p-4 md:p-6 overflow-y-auto space-y-6">
                <header>
                    <h2 className="text-2xl font-semibold text-white flex items-center gap-3">
                        <CubeTransparentIcon className="w-7 h-7 text-fuchsia-400" />
                        Mod Manager
                    </h2>
                    <p className="text-gray-400 mt-2">
                        Extend the capabilities of Aether Shunt by uploading external React/TypeScript project bundles.
                    </p>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Upload Section */}
                    <div className="lg:col-span-1 space-y-4">
                        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 shadow-lg">
                            <h3 className="text-lg font-semibold text-gray-200 mb-4">Upload Extension</h3>
                            <FileUpload 
                                onFilesUploaded={handleFilesUploaded}
                                acceptedFileTypes={['.zip', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.md']}
                                maxFileSizeMB={50}
                                enableDirectoryUpload={true}
                            />
                            <p className="text-xs text-gray-500 mt-3">
                                Supports directory uploads or .zip archives containing standard package.json structures.
                            </p>
                        </div>
                        
                        <div className="bg-gray-900/30 border border-gray-700/30 rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-gray-300 mb-2">Extension Guidelines</h4>
                            <ul className="text-xs text-gray-400 list-disc list-inside space-y-1">
                                <li>Ensure a valid <code>package.json</code> is at the root.</li>
                                <li>React components should export a default export.</li>
                                <li>Limit bundle size to under 50MB for browser performance.</li>
                                <li>Extensions are sandboxed (simulation mode).</li>
                            </ul>
                        </div>
                    </div>

                    {/* Mod List Section */}
                    <div className="lg:col-span-2">
                        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 shadow-lg h-full flex flex-col">
                            <h3 className="text-lg font-semibold text-gray-200 mb-4 flex justify-between items-center">
                                <span>Installed Mods</span>
                                <span className="text-xs font-normal text-gray-400 bg-gray-700 px-2 py-1 rounded-full">{mods.length} Active</span>
                            </h3>
                            
                            {mods.length === 0 ? (
                                <div className="flex-grow flex flex-col items-center justify-center text-gray-500 py-10">
                                    <CubeTransparentIcon className="w-12 h-12 mb-3 opacity-50" />
                                    <p>No extensions installed.</p>
                                    <p className="text-xs">Upload a project folder to get started.</p>
                                </div>
                            ) : (
                                <div className="space-y-3 overflow-y-auto pr-2 max-h-[600px]">
                                    {mods.map(mod => (
                                        <div key={mod.id} className={`p-4 rounded-lg border transition-colors ${mod.isEnabled ? 'bg-gray-700/30 border-gray-600' : 'bg-gray-900/30 border-gray-800 opacity-70'}`}>
                                            <div className="flex justify-between items-start gap-4">
                                                <div className="flex items-start gap-3">
                                                    <div className={`p-2 rounded-md ${mod.isEnabled ? 'bg-fuchsia-900/30 text-fuchsia-400' : 'bg-gray-800 text-gray-500'}`}>
                                                        <CubeTransparentIcon className="w-6 h-6" />
                                                    </div>
                                                    <div>
                                                        <h4 className="text-base font-bold text-gray-200 flex items-center gap-2">
                                                            {mod.name}
                                                            <span className="text-xs font-normal text-gray-500 border border-gray-600 px-1.5 rounded">v{mod.version}</span>
                                                        </h4>
                                                        <p className="text-sm text-gray-400 mt-1">{mod.description}</p>
                                                        <div className="flex items-center gap-4 mt-2 text-xs text-gray-500 font-mono">
                                                            <span className="flex items-center gap-1"><FolderIcon className="w-3 h-3"/> {mod.fileCount} files</span>
                                                            <span>Installed: {mod.timestamp}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div className="flex flex-col items-end gap-3">
                                                    <ToggleSwitch 
                                                        id={`mod-toggle-${mod.id}`}
                                                        label={mod.isEnabled ? "Enabled" : "Disabled"}
                                                        checked={mod.isEnabled}
                                                        onChange={(checked) => toggleMod(mod.id, checked)}
                                                    />
                                                    <button 
                                                        onClick={() => removeMod(mod.id)}
                                                        className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1 transition-colors"
                                                    >
                                                        <XMarkIcon className="w-3 h-3" /> Remove
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            <TabFooter />
        </div>
    );
};

export default Mod;
