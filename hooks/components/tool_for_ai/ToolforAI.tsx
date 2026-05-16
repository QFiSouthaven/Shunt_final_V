
// components/tool_for_ai/ToolforAI.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { useTelemetry } from '../../../styles/services/context/TelemetryContext';
import TabFooter from '../common/TabFooter';
import { Job } from '@/types';
import { useJobManager } from '../../useJobManager';
import JobList from './JobList';
import JobDetails from './JobDetails';
import { 
    DeveloperIcon, BoltIcon, CubeTransparentIcon, XMarkIcon,
    UserIcon, MapIcon, AdjustmentsHorizontalIcon,
    BookIcon, SparklesIcon
} from '../icons';
import Loader from '../Loader';
import FileUpload from '../common/FileUpload';
import ToggleSwitch from '../common/ToggleSwitch';

const ToolforAI: React.FC = () => {
    const { updateTelemetryContext } = useTelemetry();
    const [prompt, setPrompt] = useState('Create a character design document for a sci-fi stealth game protagonist, inspired by the attached concept art.');
    const [selectedJob, setSelectedJob] = useState<Job | null>(null);
    const [image, setImage] = useState<{ base64Data: string; mimeType: string; name: string } | null>(null);
    
    // Staging Mode States
    const [stagingMode, setStagingMode] = useState(false);
    const [stagingConfig, setStagingConfig] = useState({
        narratorStyle: 'Dark Fantasy',
        narratorPersonality: 'Stoic',
        charClass: 'Cyber-Samurai',
        stats: { str: 75, int: 40, agi: 85 },
        worldEnv: 'Neon Dystopia',
        difficulty: 'Hardcore'
    });

    const [error, setError] = useState<string | null>(null);
    
    const { jobs, submitJob, cancelJob, isRunning } = useJobManager();

    useEffect(() => {
        updateTelemetryContext({ tab: 'tool_for_ai' });
    }, [updateTelemetryContext]);
    
    // Keep selected job details up to date
    useEffect(() => {
        if (selectedJob) {
            const updatedJob = jobs.find(j => j.id === selectedJob.id);
            if (updatedJob) {
                setSelectedJob(updatedJob);
            } else {
                setSelectedJob(null); // Job was removed/cleared
            }
        }
    }, [jobs, selectedJob]);

    const handleFileUploaded = useCallback((files: Array<{ filename: string; content: string; file: File }>) => {
        if (files.length > 0) {
            const file = files[0].file;
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onloadend = () => {
                    const base64String = (reader.result as string).split(',')[1];
                    setImage({
                        base64Data: base64String,
                        mimeType: file.type,
                        name: file.name
                    });
                    setError(null);
                };
                reader.readAsDataURL(file);
            } else {
                setError('Please upload a valid image file (e.g., PNG, JPG).');
            }
        }
    }, []);

    const handleStagingChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
        const { name, value } = e.target;
        if (name.startsWith('stat_')) {
            const statName = name.replace('stat_', '');
            setStagingConfig(prev => ({
                ...prev,
                stats: { ...prev.stats, [statName]: parseInt(value) || 0 }
            }));
        } else {
            setStagingConfig(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleRun = () => {
        setError(null);
        if (!prompt.trim()) {
            setError('Prompt cannot be empty.');
            return;
        }
        
        let finalPrompt = prompt.trim();
        if (stagingMode) {
            finalPrompt = `
*** SYSTEM DIRECTIVE: STAGING CONFIGURATION ***
[NARRATOR SETTINGS]
Style: ${stagingConfig.narratorStyle}
Personality: ${stagingConfig.narratorPersonality}

[PLAYER CHARACTER]
Class: ${stagingConfig.charClass}
Attributes:
- Strength: ${stagingConfig.stats.str}/100
- Intelligence: ${stagingConfig.stats.int}/100
- Agility: ${stagingConfig.stats.agi}/100

[WORLD PARAMETERS]
Environment: ${stagingConfig.worldEnv}
Difficulty Level: ${stagingConfig.difficulty}

*** SESSION INITIATION ***
Based on the above configuration, proceed with the user's request:
"${prompt.trim()}"
`;
        }

        const imagePayload = image ? { base64Data: image.base64Data, mimeType: image.mimeType } : undefined;
        // We manually constructed the context if stagingMode is on, so we pass false for isGameDev to avoid double wrapping
        submitJob(finalPrompt, imagePayload, stagingMode ? false : false); 
    };

    // --- SVG Radar Chart Calculation ---
    const calculateRadarPoints = (str: number, int: number, agi: number, radius: number, center: number) => {
        const degToRad = (deg: number) => (deg * Math.PI) / 180;
        // Angles: Top (270deg/ -90deg), Bottom Right (30deg), Bottom Left (150deg)
        // STR
        const x1 = center + (str / 100) * radius * Math.cos(degToRad(270));
        const y1 = center + (str / 100) * radius * Math.sin(degToRad(270));
        // INT
        const x2 = center + (int / 100) * radius * Math.cos(degToRad(30));
        const y2 = center + (int / 100) * radius * Math.sin(degToRad(30));
        // AGI
        const x3 = center + (agi / 100) * radius * Math.cos(degToRad(150));
        const y3 = center + (agi / 100) * radius * Math.sin(degToRad(150));
        
        return `${x1},${y1} ${x2},${y2} ${x3},${y3}`;
    };

    const radarCenter = 60;
    const radarRadius = 50;
    const radarPoints = calculateRadarPoints(stagingConfig.stats.str, stagingConfig.stats.int, stagingConfig.stats.agi, radarRadius, radarCenter);
    const fullRadarPoints = calculateRadarPoints(100, 100, 100, radarRadius, radarCenter);

    return (
        <div className="flex flex-col h-full bg-gray-900/20">
            <div className="flex-grow p-4 md:p-6 grid grid-cols-1 lg:grid-cols-2 gap-6 overflow-hidden">
                {/* Left Column: Controls / Configuration */}
                <div className="flex flex-col gap-6 overflow-hidden h-full">
                    <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 shadow-lg flex-shrink-0 flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                            <h2 className="text-xl font-semibold text-white flex items-center gap-3">
                                {stagingMode ? <AdjustmentsHorizontalIcon className="w-7 h-7 text-cyan-400" /> : <DeveloperIcon className="w-7 h-7 text-fuchsia-400" />}
                                {stagingMode ? 'Session Staging Area' : 'AI Job Runner'}
                            </h2>
                            <div className="flex items-center gap-2 bg-gray-900/50 px-3 py-1 rounded-full border border-gray-700">
                                <span className={`text-xs font-bold ${stagingMode ? 'text-cyan-400' : 'text-gray-500'}`}>STAGING</span>
                                <ToggleSwitch
                                    id="staging-mode-toggle"
                                    label=""
                                    checked={stagingMode}
                                    onChange={setStagingMode}
                                    disabled={isRunning}
                                />
                            </div>
                        </div>

                        {stagingMode ? (
                            <div className="space-y-6 overflow-y-auto max-h-[60vh] pr-2 custom-scrollbar">
                                {/* Configuration Panel */}
                                <div className="space-y-4">
                                    <div className="bg-gray-900/40 p-3 rounded-md border border-gray-700/50">
                                        <div className="flex items-center gap-2 mb-2 text-fuchsia-400">
                                            <BookIcon className="w-4 h-4" />
                                            <h4 className="text-sm font-bold uppercase tracking-wider">Narrator Module</h4>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Style</label>
                                                <select name="narratorStyle" value={stagingConfig.narratorStyle} onChange={handleStagingChange} className="w-full bg-gray-800 border border-gray-600 text-xs text-gray-200 rounded p-1.5">
                                                    <option>Dark Fantasy</option>
                                                    <option>Cyberpunk</option>
                                                    <option>Space Opera</option>
                                                    <option>Noir Mystery</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Personality</label>
                                                <select name="narratorPersonality" value={stagingConfig.narratorPersonality} onChange={handleStagingChange} className="w-full bg-gray-800 border border-gray-600 text-xs text-gray-200 rounded p-1.5">
                                                    <option>Stoic</option>
                                                    <option>Manic</option>
                                                    <option>Cryptic</option>
                                                    <option>Enthusiastic</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-gray-900/40 p-3 rounded-md border border-gray-700/50">
                                        <div className="flex items-center gap-2 mb-2 text-cyan-400">
                                            <UserIcon className="w-4 h-4" />
                                            <h4 className="text-sm font-bold uppercase tracking-wider">Character Module</h4>
                                        </div>
                                        <div className="space-y-3">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Class / Archetype</label>
                                                <input type="text" name="charClass" value={stagingConfig.charClass} onChange={handleStagingChange} className="w-full bg-gray-800 border border-gray-600 text-xs text-gray-200 rounded p-1.5" />
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                <div>
                                                    <label className="block text-[10px] text-gray-400 mb-1 uppercase">Strength</label>
                                                    <input type="number" name="stat_str" value={stagingConfig.stats.str} onChange={handleStagingChange} min="0" max="100" className="w-full bg-gray-800 border border-gray-600 text-xs text-gray-200 rounded p-1" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-gray-400 mb-1 uppercase">Intelligence</label>
                                                    <input type="number" name="stat_int" value={stagingConfig.stats.int} onChange={handleStagingChange} min="0" max="100" className="w-full bg-gray-800 border border-gray-600 text-xs text-gray-200 rounded p-1" />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] text-gray-400 mb-1 uppercase">Agility</label>
                                                    <input type="number" name="stat_agi" value={stagingConfig.stats.agi} onChange={handleStagingChange} min="0" max="100" className="w-full bg-gray-800 border border-gray-600 text-xs text-gray-200 rounded p-1" />
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-gray-900/40 p-3 rounded-md border border-gray-700/50">
                                        <div className="flex items-center gap-2 mb-2 text-green-400">
                                            <MapIcon className="w-4 h-4" />
                                            <h4 className="text-sm font-bold uppercase tracking-wider">World Module</h4>
                                        </div>
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Environment</label>
                                                <select name="worldEnv" value={stagingConfig.worldEnv} onChange={handleStagingChange} className="w-full bg-gray-800 border border-gray-600 text-xs text-gray-200 rounded p-1.5">
                                                    <option>Neon Dystopia</option>
                                                    <option>High Fantasy</option>
                                                    <option>Post-Apocalyptic</option>
                                                    <option>Victorian London</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs text-gray-400 mb-1">Difficulty</label>
                                                <select name="difficulty" value={stagingConfig.difficulty} onChange={handleStagingChange} className="w-full bg-gray-800 border border-gray-600 text-xs text-gray-200 rounded p-1.5">
                                                    <option>Story Mode</option>
                                                    <option>Normal</option>
                                                    <option>Hardcore</option>
                                                    <option>Nightmare</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-4">
                                {/* Standard Inputs */}
                            </div>
                        )}
                        
                        <div className="mt-4">
                             <label className="block text-sm font-medium text-gray-300 mb-2">
                                {stagingMode ? 'Session Start Prompt' : 'Enter Task'}
                             </label>
                             <textarea
                                value={prompt}
                                onChange={(e) => setPrompt(e.target.value)}
                                placeholder={stagingMode ? "Describe the opening scene or initial action..." : "Enter a task for the AI agent..."}
                                className="w-full bg-gray-900/50 rounded-md border border-gray-700 p-3 text-gray-300 placeholder-gray-500 resize-none focus:outline-none focus:ring-2 focus:ring-fuchsia-500"
                                rows={stagingMode ? 2 : 4}
                                disabled={isRunning}
                            />
                             {image ? (
                                <div className="mt-2 relative group w-full h-20 bg-black/20 rounded-md flex items-center justify-center p-2 border border-gray-700/50">
                                    <img src={`data:${image.mimeType};base64,${image.base64Data}`} alt={image.name} className="max-h-full max-w-full object-contain rounded" />
                                    <button onClick={() => setImage(null)} disabled={isRunning} className="absolute top-1 right-1 p-1 bg-black/60 rounded-full text-white hover:bg-black/80 transition-opacity z-10 opacity-0 group-hover:opacity-100">
                                        <XMarkIcon className="w-4 h-4"/>
                                    </button>
                                    <span className="absolute bottom-1 right-2 text-[10px] text-gray-400">{image.name}</span>
                                </div>
                            ) : (
                                <div className="mt-2">
                                    <FileUpload
                                        onFilesUploaded={handleFileUploaded}
                                        acceptedFileTypes={['image/*', '.png', '.jpg', '.jpeg', '.webp']}
                                        maxFileSizeMB={5}
                                        enableDirectoryUpload={false}
                                    />
                                </div>
                            )}
                        </div>
                        
                        {error && <div className="mt-3 text-red-400 text-sm p-2 bg-red-900/50 rounded-md">{error}</div>}
                        
                        <button
                            onClick={handleRun}
                            disabled={isRunning || !prompt.trim()}
                            className={`w-full mt-4 px-6 py-3 text-white font-semibold rounded-md transition-colors flex items-center justify-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed ${stagingMode ? 'bg-cyan-600 hover:bg-cyan-500' : 'bg-fuchsia-600 hover:bg-fuchsia-500'}`}
                        >
                            {isRunning ? <Loader /> : <BoltIcon className="w-5 h-5" />}
                            {isRunning ? 'Processing...' : (stagingMode ? 'Initialize Session' : 'Submit Job')}
                        </button>
                    </div>
                    
                    {/* Job List (Moved to bottom of left col for staging mode or kept same) */}
                     <JobList 
                        jobs={jobs}
                        onSelect={setSelectedJob}
                        onCancel={cancelJob}
                        selectedJobId={selectedJob?.id || null}
                    />
                </div>

                {/* Right Column: HUD or Job Details */}
                <div className="overflow-hidden h-full flex flex-col">
                     {stagingMode && !selectedJob ? (
                         /* Visual HUD (Informational Diagram) */
                        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg shadow-lg h-full flex flex-col p-4 relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-cyan-500 via-fuchsia-500 to-cyan-500 opacity-50"></div>
                            <h3 className="text-lg font-semibold text-cyan-300 mb-6 flex items-center gap-2 tracking-widest uppercase">
                                <CubeTransparentIcon className="w-5 h-5" />
                                Informational Diagram
                            </h3>
                            
                            <div className="flex-grow flex flex-col items-center justify-center gap-8">
                                {/* Character Radar Chart */}
                                <div className="relative w-48 h-48">
                                    <svg viewBox="0 0 120 120" className="w-full h-full drop-shadow-[0_0_10px_rgba(34,211,238,0.3)]">
                                        {/* Background Hex/Tri */}
                                        <polygon points={fullRadarPoints} fill="rgba(31, 41, 55, 0.5)" stroke="#374151" strokeWidth="1" />
                                        {/* Axes */}
                                        <line x1="60" y1="60" x2="60" y2="10" stroke="#4b5563" strokeDasharray="2,2" />
                                        <line x1="60" y1="60" x2="103.3" y2="85" stroke="#4b5563" strokeDasharray="2,2" />
                                        <line x1="60" y1="60" x2="16.7" y2="85" stroke="#4b5563" strokeDasharray="2,2" />
                                        
                                        {/* Data Polygon */}
                                        <polygon points={radarPoints} fill="rgba(34, 211, 238, 0.2)" stroke="#22d3ee" strokeWidth="2" />
                                        
                                        {/* Labels */}
                                        <text x="60" y="8" textAnchor="middle" fill="#a78bfa" fontSize="8" fontWeight="bold">STR</text>
                                        <text x="110" y="90" textAnchor="middle" fill="#a78bfa" fontSize="8" fontWeight="bold">INT</text>
                                        <text x="10" y="90" textAnchor="middle" fill="#a78bfa" fontSize="8" fontWeight="bold">AGI</text>
                                    </svg>
                                    <div className="absolute -bottom-6 left-0 w-full text-center">
                                        <span className="text-xs font-mono text-cyan-300 uppercase tracking-widest">{stagingConfig.charClass}</span>
                                    </div>
                                </div>

                                {/* World Preview Card */}
                                <div className="w-full max-w-xs bg-gray-900/80 border border-cyan-500/30 p-4 rounded-lg backdrop-blur-sm relative overflow-hidden group">
                                    <div className="absolute inset-0 bg-cyan-500/5 group-hover:bg-cyan-500/10 transition-colors"></div>
                                    <div className="relative z-10">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-1">World Simulation</h4>
                                        <p className="text-lg font-bold text-white mb-2">{stagingConfig.worldEnv}</p>
                                        <div className="flex justify-between items-center border-t border-gray-700 pt-2 mt-2">
                                            <span className="text-xs text-gray-400">Difficulty</span>
                                            <span className="text-xs font-mono text-red-400 font-bold bg-red-900/20 px-2 py-0.5 rounded">{stagingConfig.difficulty}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            <div className="mt-auto text-center">
                                <p className="text-[10px] text-gray-600 font-mono uppercase tracking-[0.2em]">System Ready // Awaiting Initiation</p>
                            </div>
                        </div>
                     ) : (
                        <JobDetails job={selectedJob} />
                     )}
                </div>
            </div>
            <TabFooter />
        </div>
    );
};

export default ToolforAI;
