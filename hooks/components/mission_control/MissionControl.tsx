
// components/mission_control/MissionControl.tsx
import React, { useState, lazy, Suspense } from 'react';
import {
    SparklesIcon, BrainIcon, BranchingIcon,
    PhotoIcon, GlobeAltIcon,
    HistoryIcon, StarIcon, Cog6ToothIcon, ShieldCheckIcon,
    ChatBubbleLeftRightIcon, AdjustmentsHorizontalIcon,
    BookIcon, FlagIcon, ServerStackIcon, BoltIcon
} from '../icons';
import { MissionControlTabKey } from '@/types';
import Loader from '../Loader';
import { ActiveTabProvider } from '../../../styles/services/context/ActiveTabContext';
import { useMiaContext } from '../../../styles/services/context/MiaContext';
import HeaderActions from './HeaderActions';
import ErrorBoundary from '../ErrorBoundary';

// Lazy loads for performance
const Hub = lazy(() => import('../hub/Hub'));
const ControlPanel = lazy(() => import('../control_panel/ControlPanel'));
const Journal = lazy(() => import('../nexus/Journal'));
const Goals = lazy(() => import('../nexus/Goals'));
const A2A = lazy(() => import('../nexus/A2A'));
const Evolution = lazy(() => import('../nexus/Evolution'));
const Shunt = lazy(() => import('../shunt/Shunt'));
const Weaver = lazy(() => import('../weaver/Weaver'));
const Foundry = lazy(() => import('../foundry/Foundry'));
const Chat = lazy(() => import('../chat/Chat'));
const ImageAnalysis = lazy(() => import('../image_analysis/ImageAnalysis'));
const Oraculum = lazy(() => import('../oraculum/Oraculum'));
const Subscription = lazy(() => import('../subscription/Subscription'));
const Documentation = lazy(() => import('../documentation/Documentation'));
const Settings = lazy(() => import('../settings/Settings'));
const Chronicle = lazy(() => import('../chronicle/Chronicle'));
const Mod = lazy(() => import('../mod/Mod'));
const ToolforAI = lazy(() => import('../tool_for_ai/ToolforAI'));
const Framework = lazy(() => import('../framework/Framework'));
const SystemDiagnostics = lazy(() => import('./SystemDiagnostics'));


interface NexusDockItemProps {
    icon: React.ReactNode;
    label: string;
    isActive: boolean;
    onClick: () => void;
}

const NexusDockItem: React.FC<NexusDockItemProps> = ({ icon, label, isActive, onClick }) => (
    <button
        onClick={onClick}
        className={`
            group relative flex items-center justify-center w-12 h-12 rounded-2xl transition-all duration-300 ease-out
            ${isActive 
                ? 'bg-white/10 text-white shadow-[0_0_20px_rgba(168,85,247,0.4)] scale-110 border border-white/20' 
                : 'text-gray-500 hover:text-white hover:bg-white/5 hover:scale-105 border border-transparent'}
        `}
    >
        {icon}
        {/* Tooltip */}
        <span className="absolute -top-10 left-1/2 -translate-x-1/2 px-2 py-1 bg-black/80 text-white text-[10px] font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap backdrop-blur-md border border-white/10 translate-y-2 group-hover:translate-y-0 duration-200 z-50">
            {label}
        </span>
        {/* Active Indicator */}
        {isActive && <div className="absolute -bottom-1 w-1 h-1 bg-fuchsia-500 rounded-full shadow-[0_0_10px_rgba(232,121,249,1)]"></div>}
    </button>
);

const MissionControl: React.FC = () => {
    // Default landing tab is 'shunt' — the SPA's original purpose is as a
    // personal text-transform tool (Shunt + Weaver/Foundry/Oraculum/Chronicle/
    // ImageAnalysis/MIA), all going SPA→aiService→LM Studio directly. Hub is
    // a coordination station that augments this *alongside* the personal tool,
    // not the front door to it. Hub stays reachable from the dock; landing on
    // it would only make sense once the Cloudflare hub-relay Worker is
    // deployed (`hub-cloudflare/`) and Splicer can actually connect to a peer.
    // (Supersedes COWORK_HANDOFF_2026-05-11.md §7.5 #7, which assumed the
    // Worker would ship in the same window as the Hub addition.)
    const [activeTabKey, setActiveTabKey] = useState<MissionControlTabKey>('shunt');
    const { toggleRTMode, isRTActive } = useMiaContext();

    const renderActiveComponent = () => {
        switch (activeTabKey) {
            case 'hub': return <Hub />;
            case 'control_panel': return <ControlPanel />;
            case 'journal': return <Journal />;
            case 'goals': return <Goals />;
            case 'a2a': return <A2A />;
            case 'evolution': return <Evolution />;
            case 'shunt': return <Shunt />;
            case 'weaver': return <Weaver />;
            case 'foundry': return <Foundry />;
            case 'chat': return <Chat />;
            case 'image_analysis': return <ImageAnalysis />;
            case 'oraculum': return <Oraculum />;
            case 'chronicle': return <Chronicle />;
            case 'subscription': return <Subscription />;
            case 'documentation': return <Documentation />;
            case 'settings': return <Settings />;
            case 'mod': return <Mod />;
            case 'tool_for_ai': return <ToolforAI />;
            case 'framework': return <Framework />;
            case 'diagnostics': return <SystemDiagnostics />;
            default: return <Shunt />;
        }
    };

    return (
        <div className="relative z-10 flex flex-col h-screen w-full text-gray-200">
            
            {/* Top Bar: Minimalist HUD */}
            <header className="absolute top-0 left-0 right-0 flex items-center justify-between px-8 py-6 z-50 pointer-events-none">
                <div className="flex items-center gap-4 pointer-events-auto">
                    <div className="flex flex-col">
                        <span className="font-bold text-lg tracking-tight text-white leading-none">Aether</span>
                        <span className="text-[10px] uppercase tracking-[0.3em] text-fuchsia-400">Nexus // {activeTabKey}</span>
                    </div>
                </div>

                <div className="flex items-center gap-4 pointer-events-auto">
                    {['shunt', 'weaver', 'foundry'].includes(activeTabKey) && (
                        <button
                            onClick={toggleRTMode}
                            className={`
                                flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold transition-all border backdrop-blur-md
                                ${isRTActive
                                    ? 'bg-fuchsia-500/10 border-fuchsia-500/50 text-fuchsia-300 shadow-[0_0_20px_rgba(217,70,239,0.2)]'
                                    : 'bg-black/20 border-white/10 text-gray-500 hover:text-gray-300 hover:border-white/20'
                                }
                            `}
                        >
                            <span className={`w-1.5 h-1.5 rounded-full ${isRTActive ? 'bg-fuchsia-400 animate-pulse' : 'bg-gray-600'}`} />
                            MIA LIVE
                        </button>
                    )}
                    <div className="glass-panel rounded-full px-2 py-1">
                        <HeaderActions onOpenFeedback={() => {}} onOpenMailbox={() => {}} />
                    </div>
                </div>
            </header>

            {/* Center Stage: The Work Surface */}
            <main className="flex-grow relative w-full h-full overflow-hidden pt-20 pb-24 px-4 md:px-8">
                <ActiveTabProvider activeTab={activeTabKey}>
                    <ErrorBoundary componentName={`Module: ${activeTabKey}`}>
                        <Suspense fallback={
                            <div className="flex flex-col items-center justify-center h-full gap-4">
                                <Loader className="w-8 h-8 text-fuchsia-500" />
                                <span className="text-xs text-gray-600 uppercase tracking-widest animate-pulse">Initializing Module...</span>
                            </div>
                        }>
                            <div className="w-full h-full glass-panel rounded-3xl overflow-hidden relative animate-slide-up shadow-2xl">
                                {renderActiveComponent()}
                            </div>
                        </Suspense>
                    </ErrorBoundary>
                </ActiveTabProvider>
            </main>

            {/* Bottom Dock: Navigation */}
            <div className="absolute bottom-6 left-0 right-0 flex justify-center z-50 pointer-events-none">
                <div className="glass-panel rounded-3xl px-3 py-2 flex items-center gap-2 pointer-events-auto transform hover:scale-105 transition-transform duration-300 shadow-2xl border border-white/10">
                    <NexusDockItem icon={<ChatBubbleLeftRightIcon className="w-6 h-6" />} label="Hub" isActive={activeTabKey === 'hub'} onClick={() => setActiveTabKey('hub')} />
                    <NexusDockItem icon={<AdjustmentsHorizontalIcon className="w-6 h-6" />} label="Control" isActive={activeTabKey === 'control_panel'} onClick={() => setActiveTabKey('control_panel')} />
                    <div className="w-px h-8 bg-white/10 mx-2" />
                    <NexusDockItem icon={<BookIcon className="w-5 h-5" />} label="Journal" isActive={activeTabKey === 'journal'} onClick={() => setActiveTabKey('journal')} />
                    <NexusDockItem icon={<FlagIcon className="w-5 h-5" />} label="Goals" isActive={activeTabKey === 'goals'} onClick={() => setActiveTabKey('goals')} />
                    <NexusDockItem icon={<ServerStackIcon className="w-5 h-5" />} label="A2A" isActive={activeTabKey === 'a2a'} onClick={() => setActiveTabKey('a2a')} />
                    <NexusDockItem icon={<BoltIcon className="w-5 h-5" />} label="Evolution" isActive={activeTabKey === 'evolution'} onClick={() => setActiveTabKey('evolution')} />
                    <div className="w-px h-8 bg-white/10 mx-2" />
                    <NexusDockItem icon={<SparklesIcon className="w-6 h-6" />} label="Flow" isActive={activeTabKey === 'shunt'} onClick={() => setActiveTabKey('shunt')} />
                    <NexusDockItem icon={<BrainIcon className="w-6 h-6" />} label="Plan" isActive={activeTabKey === 'weaver'} onClick={() => setActiveTabKey('weaver')} />
                    <NexusDockItem icon={<BranchingIcon className="w-6 h-6" />} label="Forge" isActive={activeTabKey === 'foundry'} onClick={() => setActiveTabKey('foundry')} />
                    <NexusDockItem icon={<PhotoIcon className="w-6 h-6" />} label="Vision" isActive={activeTabKey === 'image_analysis'} onClick={() => setActiveTabKey('image_analysis')} />
                    
                    <div className="w-px h-8 bg-white/10 mx-2" />
                    
                    <NexusDockItem icon={<GlobeAltIcon className="w-5 h-5" />} label="Oracle" isActive={activeTabKey === 'oraculum'} onClick={() => setActiveTabKey('oraculum')} />
                    <NexusDockItem icon={<HistoryIcon className="w-5 h-5" />} label="Chronicle" isActive={activeTabKey === 'chronicle'} onClick={() => setActiveTabKey('chronicle')} />
                    <NexusDockItem icon={<ShieldCheckIcon className="w-5 h-5" />} label="Diagnostics" isActive={activeTabKey === 'diagnostics'} onClick={() => setActiveTabKey('diagnostics')} />

                    <div className="w-px h-8 bg-white/10 mx-2" />

                    <NexusDockItem icon={<StarIcon className="w-5 h-5" />} label="Plan" isActive={activeTabKey === 'subscription'} onClick={() => setActiveTabKey('subscription')} />
                    <NexusDockItem icon={<Cog6ToothIcon className="w-5 h-5" />} label="Settings" isActive={activeTabKey === 'settings'} onClick={() => setActiveTabKey('settings')} />
                </div>
            </div>
        </div>
    );
};

export default MissionControl;
