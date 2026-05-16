// components/settings/Settings.tsx
import React from 'react';
import { useSettings } from '@/styles/services/context/SettingsContext';
import TabFooter from '../common/TabFooter';
import ToggleSwitch from '../common/ToggleSwitch';
import { useMCPContext } from '@/styles/services/context/MCPContext';
import { MCPConnectionStatus } from '@/types/mcp';
import { BoltIcon, ServerStackIcon, XMarkIcon, CpuChipIcon } from '../icons';
import Loader from '../Loader';
import PatternZPanel from './PatternZPanel';

const Settings: React.FC = () => {
    const { settings, updateSetting } = useSettings();
    const { status, extensionVersion, connect, disconnect } = useMCPContext();

    const handleSettingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value, type } = e.target;
        if (type === 'checkbox') {
            const { checked } = e.target as HTMLInputElement;
            updateSetting(name as keyof typeof settings, checked);
        } else {
            updateSetting(name as keyof typeof settings, value);
        }
    };

    const isConnecting = status === MCPConnectionStatus.Connecting;

    return (
        <div className="flex flex-col h-full">
            <div className="p-4 md:p-6 space-y-6 flex-grow overflow-y-auto">
                <div className="max-w-2xl mx-auto">
                    <h2 className="text-xl font-semibold text-white mb-6">Global Settings</h2>

                    <div className="space-y-6">
                        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
                            <h3 className="font-semibold text-lg text-gray-200 mb-4 flex items-center gap-2">
                                <ServerStackIcon className="w-6 h-6 text-cyan-400" />
                                MCP Browser Extension
                            </h3>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-gray-300">Status: <span className={`font-semibold ${status === MCPConnectionStatus.Connected ? 'text-green-400' : 'text-yellow-400'}`}>{status}</span></p>
                                    {extensionVersion && <p className="text-xs text-gray-500">Version: {extensionVersion}</p>}
                                </div>
                                {status === MCPConnectionStatus.Connected ? (
                                    <button
                                        onClick={disconnect}
                                        disabled={isConnecting}
                                        className="px-4 py-2 bg-red-600 text-white font-semibold rounded-md hover:bg-red-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                    >
                                        <XMarkIcon className="w-5 h-5" />
                                        Disconnect
                                    </button>
                                ) : (
                                    <button
                                        onClick={connect}
                                        disabled={isConnecting || status === MCPConnectionStatus.NotFound}
                                        className="px-4 py-2 bg-cyan-600 text-white font-semibold rounded-md hover:bg-cyan-500 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                                    >
                                        {isConnecting ? <Loader /> : <BoltIcon className="w-5 h-5" />}
                                        {isConnecting ? 'Connecting...' : 'Connect'}
                                    </button>
                                )}
                            </div>
                            {status === MCPConnectionStatus.NotFound && (
                                <p className="text-xs text-yellow-400 mt-2">Searching for MCP extension...</p>
                            )}
                            {status === MCPConnectionStatus.Disconnected && (
                                <p className="text-xs text-gray-400 mt-2">
                                    Connect to enable direct file system access. If not installed, a mock will be used for demonstration.
                                </p>
                            )}
                            {status === MCPConnectionStatus.Connected && extensionVersion?.includes('mock') && (
                                <p className="text-xs text-cyan-400 mt-2">
                                    Connected to mock extension. File operations will be simulated in the browser console.
                                </p>
                            )}
                        </div>

                        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
                            <h3 className="font-semibold text-lg text-gray-200 mb-4">Security & Exploit Protection</h3>
                            <div className="space-y-4">
                               <ToggleSwitch
                                    id="inputSanitizationEnabled"
                                    label="Input Sanitization"
                                    checked={settings.inputSanitizationEnabled}
                                    onChange={(checked) => updateSetting('inputSanitizationEnabled', checked)}
                                />
                                <p className="text-xs text-gray-500 pl-2 -mt-2">Strips potentially malicious code (e.g., script tags) from user input before processing.</p>
                                
                                <ToggleSwitch
                                    id="promptInjectionGuardEnabled"
                                    label="Prompt Injection Guard"
                                    checked={settings.promptInjectionGuardEnabled}
                                    onChange={(checked) => updateSetting('promptInjectionGuardEnabled', checked)}
                                />
                                <p className="text-xs text-gray-500 pl-2 -mt-2">Wraps user input with instructions to the AI to prevent malicious prompt hijacking.</p>

                                <ToggleSwitch
                                    id="clientSideRateLimitingEnabled"
                                    label="Client-Side Rate Limiting"
                                    checked={settings.clientSideRateLimitingEnabled}
                                    onChange={(checked) => updateSetting('clientSideRateLimitingEnabled', checked)}
                                />
                                <p className="text-xs text-gray-500 pl-2 -mt-2">Prevents abuse by temporarily limiting rapid, repeated requests from the interface.</p>
                            </div>
                        </div>

                        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
                            <h3 className="font-semibold text-lg text-gray-200 mb-4 flex items-center gap-2">
                                <CpuChipIcon className="w-6 h-6 text-yellow-400" />
                                AI Provider
                            </h3>
                            <p className="text-xs text-gray-500 -mt-2 mb-4">All AI calls go through one OpenAI-compatible HTTP endpoint. Defaults target LM Studio at <code className="text-gray-400">http://localhost:1234</code>. Point at any compatible server (LM Studio, Ollama, OpenAI, OpenRouter, Groq, Together).</p>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="aiBaseUrl" className="block text-sm font-medium text-gray-400">Base URL (Chat Completions)</label>
                                    <input
                                        type="text"
                                        id="aiBaseUrl"
                                        name="aiBaseUrl"
                                        value={settings.aiBaseUrl}
                                        onChange={handleSettingChange}
                                        placeholder="http://localhost:1234/v1/chat/completions"
                                        className="mt-1 w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200 font-mono text-sm"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="aiModel" className="block text-sm font-medium text-gray-400">Model</label>
                                    <input
                                        type="text"
                                        id="aiModel"
                                        name="aiModel"
                                        value={settings.aiModel}
                                        onChange={handleSettingChange}
                                        placeholder="local-model"
                                        className="mt-1 w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200 font-mono text-sm"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="aiApiKey" className="block text-sm font-medium text-gray-400">API Key (optional)</label>
                                    <input
                                        type="password"
                                        id="aiApiKey"
                                        name="aiApiKey"
                                        value={settings.aiApiKey}
                                        onChange={handleSettingChange}
                                        placeholder="leave blank for LM Studio / Ollama"
                                        className="mt-1 w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200 font-mono text-sm"
                                        autoComplete="off"
                                    />
                                </div>
                            </div>
                        </div>

                        <PatternZPanel />

                        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
                            <h3 className="font-semibold text-lg text-gray-200 mb-4">Appearance</h3>
                            <div className="space-y-4">
                                <div>
                                    <label htmlFor="backgroundColor" className="block text-sm font-medium text-gray-400">Background Color</label>
                                    <input
                                        type="color"
                                        id="backgroundColor"
                                        name="backgroundColor"
                                        value={settings.backgroundColor}
                                        onChange={handleSettingChange}
                                        className="mt-1 w-full h-10 p-1 bg-gray-700 border border-gray-600 rounded-md cursor-pointer"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="miaFontColor" className="block text-sm font-medium text-gray-400">Mia's Font Color</label>
                                    <input
                                        type="color"
                                        id="miaFontColor"
                                        name="miaFontColor"
                                        value={settings.miaFontColor}
                                        onChange={handleSettingChange}
                                        className="mt-1 w-full h-10 p-1 bg-gray-700 border border-gray-600 rounded-md cursor-pointer"
                                    />
                                </div>
                                <div>
                                    <label htmlFor="backgroundImage" className="block text-sm font-medium text-gray-400">Background Image URL</label>
                                    <input
                                        type="text"
                                        id="backgroundImage"
                                        name="backgroundImage"
                                        value={settings.backgroundImage}
                                        onChange={handleSettingChange}
                                        placeholder="Enter image URL or leave blank for none"
                                        className="mt-1 w-full p-2 bg-gray-900 border border-gray-600 rounded-md text-gray-200"
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-6">
                             <h3 className="font-semibold text-lg text-gray-200 mb-4">Preferences</h3>
                             <div className="space-y-4">
                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="text-gray-300">Enable Animations</span>
                                    <input
                                        type="checkbox"
                                        name="animationsEnabled"
                                        checked={settings.animationsEnabled}
                                        onChange={handleSettingChange}
                                        className="h-4 w-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
                                    />
                                </label>
                                <label className="flex items-center justify-between cursor-pointer">
                                    <span className="text-gray-300">Enable Audio Feedback</span>
                                    <input
                                        type="checkbox"
                                        name="audioFeedbackEnabled"
                                        checked={settings.audioFeedbackEnabled}
                                        onChange={handleSettingChange}
                                        className="h-4 w-4 rounded border-gray-300 text-fuchsia-600 focus:ring-fuchsia-500"
                                    />
                                </label>
                             </div>
                        </div>
                    </div>
                </div>
            </div>
            <TabFooter />
        </div>
    );
};

export default Settings;