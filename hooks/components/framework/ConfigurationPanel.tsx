// components/framework/ConfigurationPanel.tsx
import React from 'react';
import { Cog6ToothIcon } from '../icons';
import { Hyperparameters } from './types';

interface ConfigurationPanelProps {
    params: Hyperparameters;
    onParamChange: React.Dispatch<React.SetStateAction<Hyperparameters>>;
    isRunning: boolean;
}

const ParamSlider: React.FC<{
    label: string;
    name: keyof Hyperparameters;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled: boolean;
    displayFormat?: (val: number) => string;
}> = ({ label, name, value, min, max, step, onChange, disabled, displayFormat }) => (
    <div>
        <label htmlFor={name} className="flex justify-between text-sm font-medium text-gray-300 mb-1">
            <span>{label}</span>
            <span className="font-mono">{displayFormat ? displayFormat(value) : value}</span>
        </label>
        <input
            id={name}
            name={name}
            type="range"
            min={min}
            max={max}
            step={step}
            value={value}
            onChange={onChange}
            disabled={disabled}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed accent-fuchsia-500"
        />
    </div>
);

const ConfigurationPanel: React.FC<ConfigurationPanelProps> = ({ params, onParamChange, isRunning }) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const { name, value } = e.target;
        onParamChange(prev => ({ ...prev, [name]: parseFloat(value) }));
    };

    return (
        <div className="bg-gray-800/50 border border-gray-700/50 rounded-lg p-4 shadow-lg">
            <h3 className="text-lg font-semibold text-gray-200 mb-4 flex items-center gap-3">
                <Cog6ToothIcon className="w-6 h-6 text-gray-400" />
                Hyperparameters
            </h3>
            <div className="space-y-4">
                <ParamSlider 
                    label="Learning Rate"
                    name="learningRate"
                    value={params.learningRate}
                    min={0.0001} max={0.01} step={0.0001}
                    onChange={handleChange}
                    disabled={isRunning}
                    displayFormat={v => v.toFixed(4)}
                />
                <ParamSlider 
                    label="Epsilon Decay"
                    name="epsilonDecay"
                    value={params.epsilonDecay}
                    min={0.99} max={0.999} step={0.0001}
                    onChange={handleChange}
                    disabled={isRunning}
                    displayFormat={v => v.toFixed(4)}
                />
                <ParamSlider 
                    label="Discount Factor (Gamma)"
                    name="gamma"
                    value={params.gamma}
                    min={0.9} max={0.999} step={0.001}
                    onChange={handleChange}
                    disabled={isRunning}
                    displayFormat={v => v.toFixed(3)}
                />
                 <ParamSlider 
                    label="Training Episodes"
                    name="numEpisodes"
                    value={params.numEpisodes}
                    min={100} max={2000} step={100}
                    onChange={handleChange}
                    disabled={isRunning}
                />
            </div>
        </div>
    );
};

export default ConfigurationPanel;
