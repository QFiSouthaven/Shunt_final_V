
import React from 'react';
import { AiPlanResponse } from '@/types';
import { BookIcon, CodeIcon, EditIcon, KeywordsIcon, DocumentChartBarIcon } from '../icons';

interface PlanDisplayProps {
  plan: AiPlanResponse | null;
  newlyGenerated?: boolean;
}

const Section: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode }> = ({ title, icon, children }) => (
    <div className="mb-6">
        <div className="flex items-center gap-3 mb-3">
            <div className="bg-gray-700/50 p-2 rounded-md">{icon}</div>
            <h3 className="text-lg font-semibold text-gray-200">{title}</h3>
        </div>
        <div className="pl-10">{children}</div>
    </div>
);

const PlanDisplay: React.FC<PlanDisplayProps> = ({ plan, newlyGenerated }) => {
  if (!plan) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-800/50 rounded-lg border border-gray-700/50 p-6">
        <div className="text-center">
            <BookIcon className="w-12 h-12 text-gray-600 mx-auto mb-4" />
            <h3 className="font-semibold text-gray-400">Plan Output Panel</h3>
            <p className="text-sm text-gray-500 mt-1">
                The generated development plan will appear here.
            </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-gray-800/50 rounded-lg border p-6 h-full overflow-y-auto transition-colors duration-1000 ${newlyGenerated ? 'border-cyan-500' : 'border-gray-700/50'}`}>
        <h2 className="text-xl font-semibold text-white mb-6">Generated Development Plan</h2>
      <Section title="Clarifying Questions" icon={<KeywordsIcon className="w-5 h-5 text-cyan-400" />}>
        {plan.clarifyingQuestions && plan.clarifyingQuestions.length > 0 ? (
            <ul className="list-disc list-inside space-y-2 text-gray-300">
                {plan.clarifyingQuestions.map((q, i) => <li key={i}>{q}</li>)}
            </ul>
        ) : (
            <p className="text-gray-400 text-sm italic">No clarifying questions were provided.</p>
        )}
      </Section>

      <Section title="Architectural Proposal" icon={<BookIcon className="w-5 h-5 text-cyan-400" />}>
        {plan.architecturalProposal && plan.architecturalProposal.trim() ? (
            <p className="text-gray-300 whitespace-pre-wrap">{plan.architecturalProposal}</p>
        ) : (
            <p className="text-gray-400 text-sm italic">No architectural proposal was provided.</p>
        )}
      </Section>

      <Section title="Data Schema" icon={<DocumentChartBarIcon className="w-5 h-5 text-cyan-400" />}>
        {plan.dataSchema && plan.dataSchema.trim() ? (
            <pre className="text-xs text-gray-300 whitespace-pre-wrap p-2 bg-black/30 rounded-md font-mono">{plan.dataSchema}</pre>
        ) : (
            <p className="text-gray-400 text-sm italic">No data schema was provided.</p>
        )}
      </Section>

      <Section title="Implementation Tasks" icon={<CodeIcon className="w-5 h-5 text-cyan-400" />}>
        {plan.implementationTasks && plan.implementationTasks.length > 0 ? (
            <div className="space-y-4">
            {plan.implementationTasks.map((task, i) => (
                <div key={i} className="bg-gray-900/50 p-4 rounded-md border border-gray-700">
                    <p className="font-semibold text-cyan-300 font-mono text-sm">{task.filePath}</p>
                    <p className="text-gray-300 text-sm mt-1">{task.description}</p>
                    {task.details && (
                        <pre className="text-xs text-gray-400 mt-2 p-2 bg-black/30 rounded-md whitespace-pre-wrap font-mono">{task.details}</pre>
                    )}
                </div>
            ))}
            </div>
        ) : (
            <p className="text-gray-400 text-sm italic">No implementation tasks were provided.</p>
        )}
      </Section>

      <Section title="Test Cases" icon={<EditIcon className="w-5 h-5 text-cyan-400" />}>
        {plan.testCases && plan.testCases.length > 0 ? (
            <ul className="list-disc list-inside space-y-2 text-gray-300">
                {plan.testCases.map((tc, i) => <li key={i}>{tc}</li>)}
            </ul>
        ) : (
            <p className="text-gray-400 text-sm italic">No test cases were provided.</p>
        )}
      </Section>
    </div>
  );
};

export default PlanDisplay;
