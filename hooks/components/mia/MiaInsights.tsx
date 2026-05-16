// components/mia/MiaInsights.tsx
import React from 'react';
import { SparklesIcon, BookIcon, BoltIcon } from '../icons';

const InsightCard: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="bg-white rounded-lg shadow p-4 border border-gray-200">
        <div className="flex items-center gap-3 mb-2">
            {icon}
            <h4 className="font-semibold text-gray-700">{title}</h4>
        </div>
        <div className="text-sm text-gray-600 space-y-2">
            {children}
        </div>
    </div>
);

const MiaInsights: React.FC = () => {
    return (
        <div className="p-4 space-y-4 bg-gray-50 h-full overflow-y-auto">
            {/* Sociability */}
            <InsightCard title="Thought for the Day" icon={<SparklesIcon className="w-5 h-5 text-purple-500" />}>
                <p className="italic">"The best way to predict the future is to invent it." - Alan Kay</p>
                <p>What are we inventing today?</p>
            </InsightCard>

            {/* Useful Tips */}
            <InsightCard title="Pro-Tips" icon={<BoltIcon className="w-5 h-5 text-yellow-500" />}>
                <ul className="list-disc list-inside">
                    <li>You can drag and drop Shunt actions onto each other to create powerful, two-step workflows.</li>
                    <li>Use the 'Diagnose Last Error' button in the chat to get an AI-powered analysis of recent critical issues.</li>
                    <li>Keep the 'PROJECT_CONTEXT.md' file in the Weaver module updated for more accurate development plans.</li>
                </ul>
            </InsightCard>

            {/* Analytics Updates - This is a mock */}
            <InsightCard title="Your Weekly Analytics" icon={<BookIcon className="w-5 h-5 text-blue-500" />}>
                <p>Your focus time this week is <span className="font-bold text-green-600">up by 15%</span> compared to last week. Great job!</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                    <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '75%' }}></div>
                </div>
            </InsightCard>
            
            {/* Breaking News */}
            <InsightCard title="Breaking News in AI" icon={<BookIcon className="w-5 h-5 text-green-500" />}>
                 <div>
                    <h5 className="font-semibold">New Google Model 'Veo' Challenges Sora</h5>
                    <p className="text-xs text-gray-500">Google has unveiled Veo, a new text-to-video generation model positioned as a direct competitor to OpenAI's Sora, capable of producing high-definition, minute-long videos...</p>
                </div>
                 <div>
                    <h5 className="font-semibold">Study Shows LLMs Can Learn from Video</h5>
                    <p className="text-xs text-gray-500">A recent paper from Stanford demonstrates that large language models can develop a more robust understanding of the physical world by training on video data...</p>
                </div>
            </InsightCard>
        </div>
    );
};

export default MiaInsights;