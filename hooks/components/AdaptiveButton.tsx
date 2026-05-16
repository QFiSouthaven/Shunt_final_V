
import React from 'react';
import { useAutonomous } from '@/context/AutonomousContext.tsx';
import { BoltIcon } from './icons';

interface AdaptiveButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    id: string; // Required for targeting by the Autonomous Engine
    label: string;
    icon?: React.ReactNode;
}

const AdaptiveButton: React.FC<AdaptiveButtonProps> = ({ id, label, icon, className = '', onClick, ...props }) => {
    const { activeDirectives, consumeDirective, dispatchTelemetryEvent } = useAutonomous();

    // Check for directives targeting this specific button
    const directive = activeDirectives.find(d => d.targetElementId === id);
    const isOptimized = directive?.type === 'OPTIMIZATION';
    const isSuggested = directive?.type === 'SUGGESTION';

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
        // Track interaction with context about its adaptive state
        dispatchTelemetryEvent({
            eventType: 'click',
            elementId: id,
            elementName: label,
            elementType: 'adaptive_button',
            context: { 
                wasSuggested: isSuggested,
                wasOptimized: isOptimized 
            }
        });

        // Consume the directive as the user has acted upon it
        if (directive) {
            consumeDirective(directive.id);
        }

        if (onClick) onClick(e);
    };

    // Base styles
    let styles = `relative group flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-300 overflow-hidden ${className}`;
    
    // Adaptive state styling
    if (isSuggested) {
        // High visibility for suggestions
        styles += ' bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white shadow-[0_0_20px_rgba(168,85,247,0.6)] animate-pulse border border-transparent';
    } else if (isOptimized) {
        // Tech-focused look for optimizations
        styles += ' bg-cyan-900/30 text-cyan-300 border border-cyan-500/50 hover:bg-cyan-900/50 hover:shadow-[0_0_15px_rgba(34,211,238,0.3)]';
    } else {
        // Fallback default style if no specific class provided
        if (!className.includes('bg-')) {
            styles += ' bg-gray-800/50 text-gray-300 border border-gray-700/50 hover:bg-gray-700/50 hover:text-white hover:border-gray-500';
        }
    }

    return (
        <button 
            id={id}
            onClick={handleClick}
            className={styles}
            {...props}
        >
            {/* Visual indicator for suggestions */}
            {isSuggested && (
                <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-fuchsia-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-fuchsia-500"></span>
                </span>
            )}
            
            {icon}
            
            {/* Allow label override from directive (e.g., "Try this instead") */}
            <span className="relative z-10">{directive?.payload?.labelOverride || label}</span>
            
            {/* Icon for optimizations */}
            {isOptimized && <BoltIcon className="w-4 h-4 text-cyan-400 ml-1 animate-bounce" />}
            
            {/* Hover glow effect */}
            <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
        </button>
    );
};

export default AdaptiveButton;