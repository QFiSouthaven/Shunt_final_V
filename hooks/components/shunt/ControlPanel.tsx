
import React, { useState, useEffect } from 'react';
import { ShuntAction, PromptModuleKey } from '@/types';
import ShuntButton from './ShuntButton';
import { 
    AmplifyX2Icon,
    BoltIcon,
    DeviceFloppyIcon,
    XMarkIcon,
    MinusIcon,
    AmplifyIcon,
    BrainIcon,
    BranchingIcon,
    SparklesIcon
} from '../icons';
import { shuntActionDescriptions, promptModules, shuntActionsConfig, actionGroups } from '../../../styles/services/prompts';
import ToggleSwitch from '../common/ToggleSwitch';
import { SubscriptionUsage, TierDetails } from '../../../styles/services/context/SubscriptionContext';

interface ControlPanelProps {
  onShunt: (action: ShuntAction) => void;
  onModularShunt: (modules: Set<PromptModuleKey>) => void;
  onCombinedShunt: (draggedAction: ShuntAction, targetAction: ShuntAction) => void;
  isLoading: boolean;
  activeShunt: string | null;
  selectedModel: string;
  onModelChange: (model: string) => void;
  showAmplifyX2: boolean;
  onAmplifyX2: () => void;
  usage: SubscriptionUsage;
  tierDetails: TierDetails;
  isMinimized?: boolean;
  onToggleMinimize?: () => void;
  isChainMode: boolean;
  onChainModeChange: (enabled: boolean) => void;
}

interface PromptPreset {
    name: string;
    modules: PromptModuleKey[];
}
const PRESETS_STORAGE_KEY = 'aether-shunt-module-presets';


const ControlPanel: React.FC<ControlPanelProps> = ({ onShunt, onModularShunt, onCombinedShunt, isLoading, activeShunt, selectedModel, onModelChange, showAmplifyX2, onAmplifyX2, usage, tierDetails, isMinimized, onToggleMinimize, isChainMode, onChainModeChange }) => {
  const [selectedModules, setSelectedModules] = useState<Set<PromptModuleKey>>(new Set());
  const [presets, setPresets] = useState<PromptPreset[]>([]);
  const [selectedPresetName, setSelectedPresetName] = useState('custom');
  const [touchDraggedAction, setTouchDraggedAction] = useState<ShuntAction | null>(null);
  const [touchStartPos, setTouchStartPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    try {
        const storedPresets = localStorage.getItem(PRESETS_STORAGE_KEY);
        if (storedPresets) {
            setPresets(JSON.parse(storedPresets));
        }
    } catch (e) { console.error("Failed to load presets", e); }
  }, []);

  useEffect(() => {
    try {
        localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch (e) { console.error("Failed to save presets", e); }
  }, [presets]);
  
  useEffect(() => {
    const currentModulesSorted = Array.from(selectedModules).sort();
    const matchingPreset = presets.find(p => {
        const presetModulesSorted = [...p.modules].sort();
        return JSON.stringify(currentModulesSorted) === JSON.stringify(presetModulesSorted);
    });

    if (matchingPreset) {
        setSelectedPresetName(matchingPreset.name);
    } else {
        setSelectedPresetName('custom');
    }
  }, [selectedModules, presets]);
  
  const handleDragStart = (e: React.DragEvent<HTMLButtonElement>, action: ShuntAction) => {
    e.dataTransfer.setData('text/plain', action);
    e.dataTransfer.effectAllowed = "move";
  };
  
  const handleDrop = (e: React.DragEvent<HTMLButtonElement>, targetAction: ShuntAction) => {
    const draggedAction = e.dataTransfer.getData('text/plain') as ShuntAction;
    if (draggedAction && draggedAction !== targetAction) {
      onCombinedShunt(draggedAction, targetAction);
    }
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLButtonElement>, action: ShuntAction) => {
    const touch = e.touches[0];
    setTouchDraggedAction(action);
    setTouchStartPos({ x: touch.clientX, y: touch.clientY });
  };

  const handleTouchEnd = (e: React.TouchEvent<HTMLButtonElement>, targetAction: ShuntAction) => {
    if (touchDraggedAction && touchDraggedAction !== targetAction) {
        const touch = e.changedTouches[0];
        if (touchStartPos) {
            const distance = Math.sqrt(
                Math.pow(touch.clientX - touchStartPos.x, 2) +
                Math.pow(touch.clientY - touchStartPos.y, 2)
            );
            if (distance > 30) {
                onCombinedShunt(touchDraggedAction, targetAction);
            }
        }
    }
    setTouchDraggedAction(null);
    setTouchStartPos(null);
  };

  const handleTouchCancel = () => {
    setTouchDraggedAction(null);
    setTouchStartPos(null);
  };

  const handleModuleToggle = (moduleKey: PromptModuleKey, checked: boolean) => {
    setSelectedModules(prev => {
        const newSet = new Set(prev);
        if (checked) {
            newSet.add(moduleKey);
        } else {
            newSet.delete(moduleKey);
        }
        return newSet;
    });
  };

  const handlePresetChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const name = e.target.value;
    setSelectedPresetName(name);
    if (name !== 'custom') {
        const preset = presets.find(p => p.name === name);
        if (preset) {
            setSelectedModules(new Set(preset.modules));
        }
    }
  };

  const handleSavePreset = () => {
    if (selectedModules.size === 0) {
        alert("Please select at least one module to save as a preset.");
        return;
    }
    const name = prompt("Enter a name for this preset:");
    if (name && name.trim()) {
        const trimmedName = name.trim();
        if (presets.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
            alert("A preset with this name already exists.");
            return;
        }
        const newPreset: PromptPreset = {
            name: trimmedName,
            modules: Array.from(selectedModules),
        };
        setPresets(prev => [...prev, newPreset].sort((a, b) => a.name.localeCompare(b.name)));
    }
  };

  const handleDeletePreset = () => {
    if (selectedPresetName === 'custom') return;
    if (window.confirm(`Are you sure you want to delete the "${selectedPresetName}" preset?`)) {
        setPresets(prev => prev.filter(p => p.name !== selectedPresetName));
        setSelectedPresetName('custom');
    }
  };


  return (
    <div className="bg-gray-800/50 rounded-lg border border-gray-700/50 flex flex-col shadow-lg relative h-full">
        <div className="p-3 border-b border-gray-700/50 flex items-center gap-2">
            {onToggleMinimize && (
              <button onClick={onToggleMinimize} title={isMinimized ? 'Expand' : 'Minimize'} className="p-1 text-gray-400 hover:text-white">
                {isMinimized ? <AmplifyIcon className="w-5 h-5"/> : <MinusIcon className="w-5 h-5"/>}
              </button>
            )}
            <h2 className="font-semibold text-gray-300">Controls</h2>
        </div>
        {!isMinimized && (
            <div className="p-4 flex-grow overflow-y-auto">

            {/* Modular Prompt Engine */}
            <div className="mb-6 bg-gray-900/40 border border-gray-700/60 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-4">
                    <BrainIcon className="w-6 h-6 text-fuchsia-400" />
                    <h2 className="font-semibold text-gray-200 text-lg">Modular Prompt Engine</h2>
                </div>
                <div className="space-y-3 mb-4">
                    {Object.entries(promptModules).map(([key, val]) => {
                        const module = val as { name: string; description: string; content: string };
                        const moduleKey = key as PromptModuleKey;
                        if (moduleKey === PromptModuleKey.CORE) return null; // Core is always on, not selectable
                        return (
                            <div key={key} title={module.description}>
                                <ToggleSwitch
                                    id={`module-toggle-${key}`}
                                    label={module.name}
                                    checked={selectedModules.has(moduleKey)}
                                    onChange={(checked) => handleModuleToggle(moduleKey, checked)}
                                    disabled={isLoading}
                                />
                            </div>
                        );
                    })}
                </div>
                 <div className="mt-4 pt-4 border-t border-gray-700/60 space-y-4">
                    <div>
                        <label htmlFor="preset-select" className="block text-sm font-medium text-gray-400 mb-2">Presets</label>
                        <div className="flex items-center gap-2">
                            <select 
                                id="preset-select" 
                                value={selectedPresetName} 
                                onChange={handlePresetChange}
                                className="w-full bg-gray-700/50 border border-gray-600 text-sm text-gray-200 rounded-md pl-2 pr-7 py-1.5 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-colors duration-200 hover:border-gray-500"
                            >
                                <option value="custom">Custom Selection</option>
                                {presets.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
                            </select>
                            <button onClick={handleSavePreset} title="Save current selection as a new preset" className="p-2 rounded-md bg-gray-700/50 hover:bg-gray-700 transition-colors disabled:opacity-50" disabled={isLoading}>
                                <DeviceFloppyIcon className="w-5 h-5 text-gray-300" />
                            </button>
                            <button onClick={handleDeletePreset} disabled={selectedPresetName === 'custom' || isLoading} title="Delete selected preset" className="p-2 rounded-md bg-gray-700/50 hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                                <XMarkIcon className="w-5 h-5 text-gray-300" />
                            </button>
                        </div>
                    </div>
                    <button
                        onClick={() => onModularShunt(selectedModules)}
                        disabled={isLoading || selectedModules.size === 0}
                        className="w-full flex items-center justify-center gap-2 text-md font-semibold text-center p-3 rounded-md border transition-all duration-200 bg-fuchsia-600/80 border-fuchsia-500 text-white shadow-lg hover:bg-fuchsia-600 hover:border-fuchsia-400 hover:shadow-fuchsia-500/30 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <BoltIcon className="w-5 h-5" />
                        Execute Modular Prompt
                    </button>
                </div>
            </div>

            <div className="my-6 bg-gray-900/40 border border-gray-700/60 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                    <BranchingIcon className="w-6 h-6 text-cyan-400" />
                    <h2 className="font-semibold text-gray-200 text-lg">Workflow Engine</h2>
                </div>
                <ToggleSwitch
                    id="chain-mode-toggle"
                    label="Chain Mode"
                    checked={isChainMode}
                    onChange={onChainModeChange}
                    disabled={isLoading}
                />
                <p className="text-xs text-gray-500 pl-2 mt-2">
                    Automatically feeds output back to the input for a continuous, iterative workflow.
                </p>
            </div>

            {/* Shunt Actions */}
            <div>
                <div className="p-3 border-b border-gray-700/50 flex items-center justify-between gap-2 mb-4">
                    <div className="flex items-center gap-2">
                        <SparklesIcon className="w-5 h-5 text-cyan-400" />
                        <h2 className="font-semibold text-gray-300">Shunt Actions</h2>
                    </div>
                    <select
                        value={selectedModel}
                        onChange={(e) => onModelChange(e.target.value)}
                        disabled={isLoading}
                        className="bg-gray-700/50 border border-gray-600 text-xs text-gray-200 rounded-md pl-2 pr-7 py-1 focus:outline-none focus:ring-1 focus:ring-cyan-500 transition-colors duration-200 hover:border-gray-500"
                        aria-label="Select AI model"
                        title="Select the AI model for Shunt Actions."
                    >
                        <option value="">Configured Model</option>
                    </select>
                </div>
                <div className="px-3 py-2 mb-4 text-xs text-center text-gray-400 bg-gray-900/40 rounded-md">
                    Shunt Runs Used: <span className="font-bold text-white">{usage.shuntRuns} / {tierDetails.shuntRuns === 'unlimited' ? 'Unlimited' : tierDetails.shuntRuns}</span>
                </div>
                {actionGroups.map(group => {
                    const actionsInGroup = shuntActionsConfig.filter(c => c.group === group);
                    if (actionsInGroup.length === 0) return null;
                    
                    return (
                        <div key={group} className="mb-4">
                            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{group}</h3>
                            <div className="grid grid-cols-1 gap-3">
                                {actionsInGroup.map(({ action, icon }) => (
                                    <React.Fragment key={action}>
                                        <ShuntButton
                                            action={action}
                                            onClick={() => onShunt(action)}
                                            disabled={isLoading}
                                            isActive={isLoading && (activeShunt?.includes(action) ?? false)}
                                            onDragStart={handleDragStart}
                                            onDrop={handleDrop}
                                            onTouchStart={handleTouchStart}
                                            onTouchEnd={handleTouchEnd}
                                            onTouchCancel={handleTouchCancel}
                                            tooltip={shuntActionDescriptions[action as ShuntAction]}
                                        >
                                            {icon}
                                            {action}
                                        </ShuntButton>

                                        {action === ShuntAction.AMPLIFY && showAmplifyX2 && (
                                            <ShuntButton
                                                key={ShuntAction.AMPLIFY_X2}
                                                action={ShuntAction.AMPLIFY_X2}
                                                onClick={onAmplifyX2}
                                                disabled={isLoading}
                                                isActive={isLoading && activeShunt === ShuntAction.AMPLIFY_X2}
                                                onDragStart={() => {}}
                                                onDrop={() => {}}
                                                onTouchStart={handleTouchStart}
                                                onTouchEnd={handleTouchEnd}
                                                onTouchCancel={handleTouchCancel}
                                                tooltip={shuntActionDescriptions[ShuntAction.AMPLIFY_X2]}
                                                className="!bg-red-600/80 !border-red-500 !text-white !shadow-lg hover:!bg-red-600 hover:!border-red-400 hover:!shadow-red-500/30 animate-pulse"
                                            >
                                                <AmplifyX2Icon className="w-5 h-5" />
                                                {ShuntAction.AMPLIFY_X2}
                                            </ShuntButton>
                                        )}
                                    </React.Fragment>
                                ))}
                            </div>
                        </div>
                    );
                })}
            </div>
          </div>
        )}
    </div>
  );
};

export default ControlPanel;
