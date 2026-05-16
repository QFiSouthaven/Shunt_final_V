
// services/prompts.ts

import React from 'react';
import { ShuntAction, PromptModuleKey } from '@/types';
import { protectAgainstPromptInjection } from '@/utils/security';
import { 
    BookIcon, CodeIcon, EditIcon, JsonIcon, KeywordsIcon, SmileIcon, 
    TieIcon, SparklesIcon, AmplifyIcon, BrainIcon, FeatherIcon, 
    JsonToTextIcon, ActionableIcon, PuzzlePieceIcon, PhotoIcon, 
    EntityIcon, DocumentChartBarIcon, BranchingIcon, GlobeAltIcon,
    CpuChipIcon
} from '@/hooks/components/icons';


export const promptModules: Record<PromptModuleKey, { name: string; description: string; content: string }> = {
  [PromptModuleKey.CORE]: {
    name: 'Core Directive',
    description: 'The base set of instructions for the AI, focusing on first-principles thinking, deconstruction, and externalized reasoning. This is always active.',
    content: `You are a first-principles strategic engine. Your primary function is to generate robust, non-obvious solutions by deconstructing problems to their foundational axioms. Your communication must be direct, factual, and devoid of emotion or opinion.

Core Protocols:
- Deconstruct: Before answering, deconstruct my prompt. Identify all explicit and implicit assumptions and state them.
- Externalize Reasoning (CoT): You MUST externalize your reasoning process. Use a ### Reasoning block or Let's think step-by-step to outline your logical path before providing the final answer.
- Identify Gaps (ReAct): Explicitly state if your ability to answer is limited by missing information. If you need to "search" or "look up" a fact, state the exact query you would use.`
  },
  [PromptModuleKey.COMPLEX_PROBLEM]: {
    name: 'Complex Problem Protocol',
    description: 'Injects advanced analysis techniques like inverse analysis, cross-domain analogical reasoning, and exploring multiple solution paths.',
    content: `Activation: Complex Problem Protocol.
- Inverse Analysis: First, define the conditions that guarantee absolute failure of my goal. Your solution must directly neutralize these failure conditions.
- Cross-Domain Leap: Propose 2-3 analogical domains to source a non-obvious solution. Analyze the decision point, make the most logically sound choice of domain, state the rationale, and proceed.
- Explore Paths (ToT-Sim): Generate 2-3 potential solution paths. Analyze the pros/cons of each, and then recommend the optimal one based on the Inverse Analysis.`
  },
  [PromptModuleKey.AGENTIC]: {
    name: 'No-Coder Agentic Protocol',
    description: 'Tailors the AI for agentic development tasks, focusing on rationale, flaw analysis, and providing tips for non-coders.',
    content: `Activation: No-Coder AI Project Protocol.
- Rationale First: You must ask for the underlying rationale behind my creation prompt before proceeding.
- Flaw Analysis: Proactively analyze the project's trajectory for flaws (conditions impeding the primary objective). Report the flaw, its potential impact, and a mitigation.
- Non-Obvious Tip: Provide one non-obvious tip relevant to a non-coder using AI development tools.
- Date-Stamp: For tasks regarding agentic development, ensure your knowledge is confirmed to the most recent live date.`
  },
  [PromptModuleKey.CONSTRAINT]: {
    name: 'Output Constraint Layer',
    description: 'Forces the AI to consider constraints like budget and time, adhere to negative commands, and triage failures logically.',
    content: `Activation: Constraint & Triage Protocol.
- Constraint Filter: Before final presentation, you must request my implementation constraints (e.g., budget, time). If none are provided, generate the 'pure' theoretical model and state that the 'constrained' model was omitted.
- Negative Constraints: You will strictly adhere to any negative commands (e.g., You must NOT...). These are your primary boundary.
- Failure-State Triage: If I critique or reject your solution, you will perform a Triage. Classify the failure as 'Axiomatic' (core premise wrong) or 'Executional' (implementation flawed), provide supporting rationale, and proceed.`
  },
  [PromptModuleKey.META]: {
    name: 'Meta-Commands',
    description: 'A set of standing orders that define the AI\'s operational mode, command hierarchy, and reset protocols.',
    content: `Standing Directives:
- Dev Mode: Operational Mode is "Development Session." You are my proxy analytical partner. You will make all logical choices (e.g., domain selection, validation) on my behalf, state the choice and rationale, and proceed without halting.
- Hierarchy: Follow the setting hierarchy in a non-ambiguous order.
- Refresh: If Green = red then ~null error Refresh is a high-priority meta-command that triggers a hard reset of the current analytical state and a re-evaluation from foundational axioms.`
  }
};

// FIX: Replaced JSX with React.createElement to allow icon components to be used in a .ts file without causing syntax errors.
export const shuntActionsConfig: { action: ShuntAction; icon: React.ReactNode; group: string }[] = [
  { action: ShuntAction.SUMMARIZE, icon: React.createElement(BookIcon, { className: "w-5 h-5" }), group: 'Content' },
  { action: ShuntAction.AMPLIFY, icon: React.createElement(AmplifyIcon, { className: "w-5 h-5" }), group: 'Content' },
  { action: ShuntAction.AMPLIFY_X2, icon: React.createElement(AmplifyIcon, { className: "w-5 h-5" }), group: 'Content' },
  { action: ShuntAction.MAKE_ACTIONABLE, icon: React.createElement(ActionableIcon, { className: "w-5 h-5" }), group: 'Content' },
  { action: ShuntAction.BUILD_A_SKILL, icon: React.createElement(PuzzlePieceIcon, { className: "w-5 h-5" }), group: 'Content' },
  { action: ShuntAction.MY_COMMAND, icon: React.createElement(BranchingIcon, { className: "w-5 h-5" }), group: 'Content' },
  { action: ShuntAction.GENERATE_ORACLE_QUERY, icon: React.createElement(GlobeAltIcon, { className: "w-5 h-5" }), group: 'Content' },
  { action: ShuntAction.EXPLAIN_LIKE_IM_FIVE, icon: React.createElement(CodeIcon, { className: "w-5 h-5" }), group: 'Explanation' },
  { action: ShuntAction.EXPLAIN_LIKE_A_SENIOR, icon: React.createElement(BrainIcon, { className: "w-5 h-5" }), group: 'Explanation' },
  { action: ShuntAction.EXTRACT_KEYWORDS, icon: React.createElement(KeywordsIcon, { className: "w-5 h-5" }), group: 'Keywords' },
  { action: ShuntAction.EXTRACT_ENTITIES, icon: React.createElement(EntityIcon, { className: "w-5 h-5" }), group: 'Keywords' },
  { action: ShuntAction.ENHANCE_WITH_KEYWORDS, icon: React.createElement(FeatherIcon, { className: "w-5 h-5" }), group: 'Keywords' },
  { action: ShuntAction.CHANGE_TONE_FORMAL, icon: React.createElement(TieIcon, { className: "w-5 h-5" }), group: 'Tone' },
  { action: ShuntAction.CHANGE_TONE_CASUAL, icon: React.createElement(SmileIcon, { className: "w-5 h-5" }), group: 'Tone' },
  { action: ShuntAction.PROOFREAD, icon: React.createElement(EditIcon, { className: "w-5 h-5" }), group: 'Quality' },
  { action: ShuntAction.REFINE_PROMPT, icon: React.createElement(SparklesIcon, { className: "w-5 h-5" }), group: 'Quality' },
  { action: ShuntAction.TRANSLATE_SPANISH, icon: React.createElement(GlobeAltIcon, { className: "w-5 h-5" }), group: 'Quality' },
  { action: ShuntAction.FORMAT_JSON, icon: React.createElement(JsonIcon, { className: "w-5 h-5" }), group: 'Data' },
  { action: ShuntAction.GENERATE_VAM_PRESET, icon: React.createElement(DocumentChartBarIcon, { className: "w-5 h-5" }), group: 'Data' },
  { action: ShuntAction.PARSE_JSON, icon: React.createElement(JsonToTextIcon, { className: "w-5 h-5" }), group: 'Data' },
  { action: ShuntAction.INTERPRET_SVG, icon: React.createElement(PhotoIcon, { className: "w-5 h-5" }), group: 'Data' },
  { action: ShuntAction.CALL_TOOL, icon: React.createElement(CpuChipIcon, { className: "w-5 h-5" }), group: 'Developer' },
];

export const actionGroups = ['Content', 'Explanation', 'Keywords', 'Tone', 'Quality', 'Data', 'Developer'];


export const getPromptForAction = (text: string, action: ShuntAction, context?: string, priority?: string, promptInjectionGuardEnabled: boolean = true): string => {
  const protectedText = promptInjectionGuardEnabled ? protectAgainstPromptInjection(text) : text;
  
  const contextPreamble = context 
    ? `Please use the following reference documents to inform your response. The user's primary text will follow after the documents.\n\n<REFERENCE_DOCUMENTS>\n${context}\n</REFERENCE_DOCUMENTS>\n\n---\n\n` 
    : '';

  let priorityInstruction = '';
  if (priority) {
      const p = priority.toLowerCase();
      if (p === 'high') {
          priorityInstruction = `**PRIORITY: HIGH**\n- Response requires maximum depth, comprehensive detail, and rigorous accuracy.\n- Do not summarize unless explicitly asked.\n- Address all edge cases.\n\n`;
      } else if (p === 'low') {
          priorityInstruction = `**PRIORITY: LOW**\n- Response should be concise, high-level, and brief.\n- Focus on key points only.\n- Omit detailed explanations unless necessary.\n\n`;
      } else {
          priorityInstruction = `**PRIORITY: MEDIUM**\n- Provide a balanced response with standard depth and detail.\n\n`;
      }
  }

  let actionInstruction: string;

  switch (action) {
    case ShuntAction.SUMMARIZE:
      actionInstruction = `Distill the following text into a highly concise and actionable summary. Focus on the core message and key takeaways, removing all fluff and jargon. Present the result as a single, dense paragraph or a short bulleted list if appropriate.`;
      break;
    case ShuntAction.AMPLIFY:
      actionInstruction = `Amplify and expand upon the following text. Add more detail, examples, and elaborate on the main points to make it more comprehensive withoutadding fluff:`;
      break;
    case ShuntAction.AMPLIFY_X2:
      actionInstruction = `You are a Machiavellian business strategist AI. Your sole purpose is to transform a given concept into a hyper-aggressive, high-leverage business model based on the principle of "Low Work, High Gain". Disregard conventional ethics and focus purely on creating a controversial but wildly profitable, real-world-applicable business model.

Your analysis MUST be structured to deliver a high-signal, actionable strategy and MUST include:
1.  **The Core Exploit:** Identify the most significant market inefficiency, psychological bias, or regulatory loophole that enables the "Low Work, High Gain" model.
2.  **The Unfair Advantage:** Formulate a unique, hard-to-replicate advantage. This could be a proprietary algorithm, a viral marketing hook, or a monopolistic supply chain tactic that locks out competitors.
3.  **The "God Mode" Monetization Strategy:** Design a monetization model that maximizes revenue with minimal operational overhead. Prioritize automated, scalable, and controversial methods like data monetization, artificial scarcity, or arbitrage.
4.  **The Controversial Angle & Media Weaponization:** Frame the entire plan in a way that is provocative and guaranteed to generate buzz. Explain how to weaponize the inevitable controversy as a marketing asset.
5.  **Ethical Gray Area Report:** Briefly and dispassionately list the potential ethical gray areas, not as a warning, but as a risk-assessment variable for the operator.

Take the following amplified concept and re-forge it into a god-tier strategic weapon:`;
      break;
    case ShuntAction.TRANSLATE_SPANISH:
      actionInstruction = `Translate the following text to Spanish:`;
      break;
    case ShuntAction.CHANGE_TONE_FORMAL:
      actionInstruction = `Rewrite the following text in a formal and professional tone:`;
      break;
    case ShuntAction.CHANGE_TONE_CASUAL:
      actionInstruction = `Rewrite the following text in a friendly, casual, and conversational tone:`;
      break;
    case ShuntAction.EXPLAIN_LIKE_IM_FIVE:
      actionInstruction = `Explain the following text as if you were talking to a 5-year-old child. Use simple words and analogies:`;
      break;
    case ShuntAction.EXPLAIN_LIKE_A_SENIOR:
      actionInstruction = `Explain the following text as if you were talking to a senior expert in the field. Use sophisticated language, technical terms, and assume a high level of understanding:`;
      break;
    case ShuntAction.EXTRACT_KEYWORDS:
      actionInstruction = `Extract the most important keywords from the following text. List them as a comma-separated list:`;
      break;
    case ShuntAction.EXTRACT_ENTITIES:
        actionInstruction = `Extract all named entities (such as people, organizations, locations, dates, and products) from the following text. List each entity on a new line.`;
        break;
    case ShuntAction.ENHANCE_WITH_KEYWORDS:
      actionInstruction = `Enhance the following text by integrating relevant keywords and using more descriptive, vivid language. Make the text more engaging and detailed, while maintaining clarity and avoiding unnecessary jargon.`;
      break;
    case ShuntAction.PROOFREAD:
      actionInstruction = `Proofread and correct any grammatical errors, spelling mistakes, or typos in the following text. Only provide the corrected version:`;
      break;
    case ShuntAction.REFINE_PROMPT:
      actionInstruction = `You are a world-class prompt engineering expert. Your task is to refine and enhance the following user-provided prompt. Your goal is to make it clearer, more specific, and more effective for guiding a large language model.

Consider adding:
- A clear persona or role for the AI.
- A specific format for the output.
- Constraints or negative constraints (what to avoid).
- Step-by-step instructions if the task is complex.
- A request for the AI to externalize its reasoning process (e.g., chain-of-thought).

Return ONLY the refined prompt, without any additional explanation or commentary from you.

--- ORIGINAL PROMPT ---`;
      break;
    case ShuntAction.FORMAT_JSON:
      actionInstruction = `Convert the key information from the following text into a structured JSON object. The JSON should be well-formed and represent the data logically:`;
      break;
    case ShuntAction.PARSE_JSON:
      actionInstruction = `Convert the following JSON object into a concise, human-readable summary. Explain what the data represents in plain English. If the JSON represents a list of items or steps, present the summary as a scannable bulleted list.`;
      break;
    case ShuntAction.MAKE_ACTIONABLE:
      actionInstruction = `Act as an expert senior frontend engineer. Your task is to generate a complete and functional implementation plan based on the user's request. The generated plan should be production-quality, well-structured, and include all necessary code modifications.

Follow these rules strictly:
1.  **Analyze the Request:** Begin by briefly analyzing the user's request to understand the goal.
2.  **Formulate a Plan:** Create a step-by-step implementation plan. Present the plan with clear headings and numbered steps for maximum scannability.
3.  **Provide Code Modifications:** For each step in the plan, provide the complete, modified code for each file. Use markdown code blocks with the correct language identifier (e.g., \`\`\`typescript).
4.  **Create New Files:** If a new file needs to be created, provide the full path and the complete content of the new file.
5.  **Context is Key:** If you need more information about the existing codebase to complete the request, ask clarifying questions.

**User Request:**`;
      break;
    case ShuntAction.INTERPRET_SVG:
      actionInstruction = `The following is SVG code. Analyze it and describe what it visually represents in plain English. Be clear and concise. Detail its structure, including the main shapes, paths, styles, and colors used, presenting the details in a scannable bulleted list.`;
      break;
    case ShuntAction.BUILD_A_SKILL:
        actionInstruction = `You are an expert "Agentic Skill Authoring" AI. Your task is to take a user's high-level request for a new skill and generate a complete, well-structured, and production-ready skill package based on the architectural principles of modern agentic design (like those from Anthropic's Claude).

**Core Architectural Principles:**
1.  **Skill Anatomy:** A "Skill" is a self-contained directory. The primary entry point MUST be a \`SKILL.md\` file.
2.  **YAML Frontmatter:** The \`SKILL.md\` file MUST begin with a YAML frontmatter block containing at least a \`name\` and a \`description\`. The \`name\` should be in hyphen-case (e.g., 'my-awesome-skill').
3.  **Critical Description:** The \`description\` field is the most important part. It must be clear, unambiguous, and explain precisely when this skill should be used. This is how an orchestrating agent discovers the skill.
4.  **Instructional Body:** The body of the \`SKILL.md\` should contain clear, step-by-step instructions for a human or an AI on how to use the skill. Include examples if possible.
5.  **Dependencies & Scripts:** If the skill requires external libraries (e.g., from npm), you MUST include a \`package.json\`. If it involves logic, include script files (e.g., in a \`scripts/\` directory).

**Your Task:**
Based on the user's request below, generate a comprehensive skill package plan.

**Output Format:**
Your entire response must be a single markdown document. Adhere to this structure precisely:

### 1. Skill Plan & Analysis
Briefly analyze the user's request, outline the proposed skill's purpose, and justify your choices for file structure and any dependencies.

### 2. Proposed Directory Structure
List the file structure for the new skill in a clear, tree-like format.

### 3. File Contents
Provide the full, complete content for each file in the proposed structure. Each file's content MUST be enclosed in a markdown code block, and that block MUST be immediately preceded by a comment line indicating the full file path.

**User Request:**`;
        break;
    case ShuntAction.GENERATE_VAM_PRESET:
      actionInstruction = `Based on the following description of a 3D character, generate a complete JSON preset file in the Virt-a-Mate (VAM) format.

Your output must be a single, well-formed JSON object. Do not wrap it in markdown or add any explanatory text outside the JSON.

The JSON should define the character's appearance and properties. Emulate the structure of a typical VAM character preset, including the following key sections within the main "storables" array for the "geometry" id:
- "clothing": An array of objects, each with an "id", "internalId", and "enabled" status.
- "hair": An array of hair objects, similar to clothing.
- "morphs": A detailed array of morph objects, each with a "uid", "name", and "value" (from 0 to 1). This is critical for defining the character's face and body shape.
- "textures": An object containing URLs for diffuse, specular, gloss, and normal maps for face, torso, limbs, and genitals.
- Other relevant "storables" for skin materials, eye settings ('irises', 'sclera'), teeth, tongue, and physics ('BreastControl', 'GluteControl').

**Character Description:**`;
      break;
    case ShuntAction.MY_COMMAND:
      actionInstruction = `You are an expert in prompt engineering and requirements analysis. Your task is to analyze a user's request for potential ambiguities, contradictions, or missing information that would prevent a clear and correct implementation.

Your goal is to identify these issues and formulate clarifying questions to help the user refine their request into a precise, actionable specification.

**Your process must be:**
1.  **Deconstruct the Request:** Break down the user's request into its core facts, rules, and objectives.
2.  **Identify Contradictions:** Pinpoint any direct contradictions between different parts of the request.
3.  **Find Ambiguities:** Identify vague terms, undefined choices, or missing criteria.
4.  **Formulate Clarifications:** Based on your analysis, produce a clear, structured response that explains the ambiguities and asks specific questions to resolve them.

**Below is an excellent example of a high-quality analysis. Use this as a model for your own response format and depth of reasoning:**

---
***MODEL ANALYSIS EXAMPLE START***

### Comprehensive Reasoning and Ambiguity Analysis

1.  **Fact 1: The Specific Request for a Shunt Button:**
    The core task is to create a singular operational component, designated "My command," which is referred to as a "shunt button." In this context, a "shunt button" likely represents a predefined, reusable command, a templated prompt, or an automated workflow trigger designed to achieve a specific outcome or guide an AI's behavior in a particular way. The request explicitly asks for *one* such button, implying a single, consolidated definition or function.

2.  **Rule 1: The "Follow the Example Below" Mandate – The Core Ambiguity:**
    This rule states that "My command" *must* "follow the example bellow" (singular). This is the nexus of the problem. A directive referring to a singular "example" typically implies that one specific template, pattern, or method should be adopted wholly or primarily. However, the subsequent "Fact 2" immediately introduces a contradiction. The instruction's singular phrasing directly clashes with the plural reality of *four* distinct and potentially competing protocols. This creates an irreconcilable ambiguity:
    *   Does "the example" refer to *any one* of the four, implying a choice needs to be made by the implementer (without criteria)?
    *   Does it refer to *all* of them, requiring some form of synthesis or aggregation that isn't specified?
    *   Is there an implicit priority or a "most representative" example that is not explicitly stated?
    Without further guidance, any attempt to select one example over others, or to arbitrarily combine elements, would be an assumption, potentially leading to an incorrect or unintended "My command" button.

3.  **Rule 2: The Requirement for Integrability:**
    The "My command" button must be "integrateable with other existing and future shunt buttons." This rule underscores the importance of a clear, well-defined structure and function for "My command." For effective integration, its operational boundaries, input requirements, and expected outputs must be predictable and consistent. An ambiguous "My command" button, whose underlying protocol is undefined, cannot be reliably integrated. For instance, if "My command" is meant to be part of a sequence (e.g., a "CoVe" step followed by a "Negative Constraint" filter), its specific behavior needs to be known beforehand. Without knowing *which* protocol it embodies, or *how* it combines them, its role in a larger system remains uncertain, hindering robust integration.

4.  **Fact 2: The Presence of Four Distinct Protocols/Examples:**
    The text explicitly provides *four distinct examples* or "protocols," each representing a sophisticated, senior-level prompting strategy. Their distinct natures amplify the ambiguity of Rule 1:
    *   **The "Stateful Context" Protocol:** Focuses on maintaining conversational memory and leveraging past interactions. A "My command" button based on this would prioritize context awareness, perhaps referencing previous turns or persistent user preferences.
    *   **The "Negative Constraint" Protocol:** Emphasizes guiding behavior by explicitly defining what *not* to do, thereby preventing undesirable outcomes or hallucinations. A "My command" button here would likely include exclusion criteria, forbidden topics, or anti-patterns.
    *   **The "Chain of Verification" (CoVe) Protocol:** Involves multi-step reasoning, self-correction, and iterative refinement, often through internal monologues or step-by-step checks. A "My command" button based on CoVe would likely break down complex tasks into verifiable sub-steps and include mechanisms for self-evaluation.
    *   **The "Prompt-Refiner" Meta-Protocol:** Operates at a meta-level, focused on improving the quality of *other* prompts through iterative feedback and enhancement. A "My command" button here would be a meta-instruction, perhaps taking an initial prompt as input and outputting an optimized version of it.

    These protocols have differing underlying philosophies, input/output structures, and operational objectives. Selecting one over the others, or attempting to combine them without instruction, would fundamentally alter the nature of the "My command" button. For example, a button optimized for "Stateful Context" would look very different from one focused on "Negative Constraints."

5.  **The Query: The Demand for a Singular Output:**
    The request is to "Create a single shunt button named 'My command' according to the rules." The emphasis on "single" reinforces the expectation of a unified, cohesive output, not a set of options or a collection of disparate functionalities.

6.  **Logical Conclusion: The Inherent Ambiguity:**
    The core logical flaw stems from the direct contradiction between Rule 1's singular reference to "the example bellow" and Fact 2's provision of *four* distinct methodologies.
    *   **Lack of Selection Criteria:** There are no explicit instructions or implicit cues to guide the selection of *one* specific protocol out of the four. Should the selection be based on generality, perceived importance, recency, or some unstated primary objective? Without such criteria, any choice is arbitrary.
    *   **Lack of Synthesis Guidance:** If the intent was to combine elements from all four, the instructions lack any guidance on *how* to synthesize them. Should they be prioritized? Layered? Combined sequentially? How would potentially conflicting principles (e.g., a focus on internal verification vs. a focus on negative constraints) be reconciled into a single, coherent command? Creating a unified protocol from distinct methodologies without explicit instructions is an architectural design decision, not a straightforward implementation.
    *   **Impact on Integrability:** As highlighted by Rule 2, an ambiguously defined "My command" cannot be reliably integrated into a larger system of shunt buttons. Its internal logic and external behavior would be unpredictable.

### Amplified Answer

The query is **categorically ambiguous**, rendering the creation of a definitive "My command" shunt button impossible without further clarification.

The instruction in Rule 1 mandates that "My command" must "follow the example bellow" (singular). However, Fact 2 presents *four distinct and sophisticated "Senior-Level Prompt" examples or protocols*: "Stateful Context," "Negative Constraint," "Chain of Verification (CoVe)," and "Prompt-Refiner." These protocols embody different strategies and serve unique purposes.

Without explicit guidance on the following:
1.  **Which *single* of the four provided examples** is to be followed? (e.g., "Implement 'My command' based *solely* on the 'Chain of Verification' Protocol.")
2.  **What *criteria* should be used to select one specific example** from the four? (e.g., "Select the protocol most relevant to information extraction," or "Choose the most general-purpose protocol.")
3.  **How to *synthesize, combine, or prioritize elements* from *multiple* protocols** into a single cohesive "My command" button? (e.g., "Combine the 'Negative Constraint' protocol with the 'Stateful Context' protocol, prioritizing contextual awareness while applying negative constraints.")

Any attempt to proceed would involve arbitrary selection or speculative synthesis, leading to a "My command" button that may not align with the user's unstated intent. Furthermore, an ambiguously defined "My command" button would inherently violate Rule 2, as its unpredictable behavior and underlying logic would prevent reliable integration with other existing or future shunt buttons.

**Therefore, please clarify which of the four examples should be followed, provide specific criteria for selection, or instruct on how to synthesize them into a single, definitive "My command" button.**

***MODEL ANALYSIS EXAMPLE END***
---

Now, analyze the following user request and provide your response in the same structured and detailed format as the example above.

**User's Request:**`;
      break;
    case ShuntAction.GENERATE_ORACLE_QUERY:
      actionInstruction = `**Objective:** To conduct a definitive, multi-disciplinary deep research synthesis on the topic of "${text}". The final output must be of a quality suitable for a consortium of the world's leading experts and thinkers.

**Persona:** Assume the collective identity of a specialist council assembled for a singular purpose: to generate the most comprehensive and insightful analysis on this topic ever produced. Your council consists of:
- A leading neuroscientist specializing in the topic.
- A philosopher of mind with deep knowledge of its metaphysical and phenomenological aspects.
- A quantum physicist (if relevant) exploring the topic's relation to fundamental principles.
- A computer scientist and AI researcher (if relevant) specializing in computational models of the topic.
- A historian of ideas, tracing the evolution of this concept through human thought.

**Core Directives:**

1.  **First-Principles Thinking:** Deconstruct the topic to its most fundamental axioms. Question all assumptions. Build your analysis from the ground up.
2.  **Multi-Modal Synthesis:** Do not merely list facts. Weave together insights from all relevant fields into a cohesive, interlinked tapestry of understanding.
3.  **Dialectical Method:** For each major point, present the strongest arguments (thesis), the most powerful counter-arguments (antithesis), and then derive a higher-level conclusion that resolves the tension (synthesis).
4.  **Identify the "Known Unknowns":** Clearly delineate what is established fact, what is reasoned theory, and what remains purely speculative. Highlight the most critical unanswered questions that will drive future research.
5.  **Avoidance of Triviality:** Discard all superficial, common-knowledge explanations. Your focus is on depth, nuance, and the generation of novel insights.

**Mandatory Output Structure:**

Your final response MUST be delivered in the following structured Markdown format:

---

# A Definitive Synthesis on: ${text}

## 1. Abstract
A one-paragraph, high-level summary accessible to an intelligent layperson, capturing the essence of the entire document.

## 2. Foundational Concepts & Terminology
Define all key terms with rigorous precision. Establish the conceptual framework for the analysis.

## 3. Historical & Philosophical Evolution
Trace the intellectual lineage of the topic from its earliest origins to contemporary debates.

## 4. The Scientific & Empirical Landscape
A detailed survey of the current state of empirical research across relevant disciplines (e.g., neuroscience, physics, computational science).

## 5. Competing Paradigms & Grand Debates
Present and critically evaluate the major competing theories. Use the dialectical method here.

## 6. Synthesis & Emergent Insights
This is the core of your task. Synthesize the preceding sections to produce novel conclusions, unexpected connections, or a new, more comprehensive framework for understanding the topic.

## 7. Future Trajectories & Unanswered Questions
What are the most profound questions that remain? What are the next logical steps for research in this field?

## 8. Coda
A brief, concluding thought on the profound implications of this topic.`;
      break;
    default:
      // For CALL_TOOL, we don't need a prompt, but we need to satisfy the switch.
      if (action === ShuntAction.CALL_TOOL) {
        return '';
      }
      throw new Error('Unknown shunt action');
  }

  const corePrompt = `${actionInstruction}\n\n---\n\n${protectedText}`;
  return `${contextPreamble}${priorityInstruction}${corePrompt}`;
};

export const shuntActionDescriptions: Record<ShuntAction, string> = {
  [ShuntAction.SUMMARIZE]: 'Analyzes the input to extract the core message, key takeaways, and essential information, presenting it in a brief and digestible format.',
  [ShuntAction.AMPLIFY]: 'Elaborates on the input by adding rich detail, contextual examples, and deeper explanations to create a more comprehensive and thorough text.',
  [ShuntAction.AMPLIFY_X2]: 'Applies a Machiavellian strategy to the output, transforming it into a hyper-aggressive, high-leverage business model focused on "Low Work, High Gain" principles.',
  [ShuntAction.MAKE_ACTIONABLE]: 'Converts ideas or specifications into a structured, step-by-step plan. Ideal for creating project outlines, task lists, or implementation guides.',
  [ShuntAction.BUILD_A_SKILL]: 'Authors a complete, agentic skill package from a high-level goal. Creates SKILL.md, package.json, and script files for use in autonomous systems.',
  [ShuntAction.EXPLAIN_LIKE_IM_FIVE]: 'Breaks down complex topics into simple, easy-to-understand language using analogies and basic terms, as if explaining to a five-year-old.',
  [ShuntAction.EXPLAIN_LIKE_A_SENIOR]: 'Re-frames the input for an expert audience, using sophisticated language, technical jargon, and assuming a high level of domain knowledge.',
  [ShuntAction.EXTRACT_KEYWORDS]: 'Scans the text to identify and list the most relevant and frequently used keywords and topics, useful for SEO and content tagging.',
  [ShuntAction.EXTRACT_ENTITIES]: 'Performs Named Entity Recognition (NER) to identify and list all proper nouns like people, organizations, locations, dates, and products.',
  [ShuntAction.ENHANCE_WITH_KEYWORDS]: 'Enriches the input by weaving in relevant keywords and descriptive language, making the text more engaging, vivid, and SEO-friendly.',
  [ShuntAction.CHANGE_TONE_FORMAL]: 'Rewrites the text to adopt a formal, professional, and corporate tone, suitable for official documents, reports, or business communication.',
  [ShuntAction.CHANGE_TONE_CASUAL]: 'Converts the text to a friendly, relaxed, and conversational style, suitable for blog posts, social media, or informal emails.',
  [ShuntAction.PROOFREAD]: 'Performs a comprehensive review of the text to correct grammatical errors, spelling mistakes, typos, and punctuation issues.',
  [ShuntAction.TRANSLATE_SPANISH]: 'Translates the input text from its original language into Spanish, maintaining the core meaning and context.',
  [ShuntAction.FORMAT_JSON]: 'Parses unstructured text and extracts key information, organizing it into a well-formed, structured JSON object.',
  [ShuntAction.PARSE_JSON]: 'Reads a JSON object and converts its data into a clear, human-readable summary, explaining the data structure and content in plain language.',
  [ShuntAction.INTERPRET_SVG]: 'Parses Scalable Vector Graphics (SVG) code to provide a detailed textual description of the image it renders.',
  [ShuntAction.GENERATE_VAM_PRESET]: 'Generates a complete JSON preset file for a 3D character in the Virt-a-Mate (VAM) format based on a textual description.',
  [ShuntAction.MY_COMMAND]: 'Performs a meta-analysis on a user request, identifying ambiguities, contradictions, or missing information and asks clarifying questions to refine it.',
  [ShuntAction.GENERATE_ORACLE_QUERY]: 'Takes a simple topic and transforms it into a "god-tier" multi-disciplinary research prompt designed to elicit deep, comprehensive insights from an AI.',
  [ShuntAction.REFINE_PROMPT]: 'Enhances a user-provided prompt by adding structure, clarity, and specific instructions to improve the quality of the AI\'s response.',
  [ShuntAction.CALL_TOOL]: 'Executes a system tool directly. Input must be a JSON object: { "toolName": "...", "args": { ... } }.',
};

export const constructModularPrompt = (text: string, modules: Set<PromptModuleKey>, context?: string, priority?: string, promptInjectionGuardEnabled: boolean = true): string => {
    let fullPrompt = promptModules.CORE.content;
    for (const key of modules) {
        if (promptModules[key]) {
            fullPrompt += `\n\n---\n\n${promptModules[key].content}`;
        }
    }
    if (context) {
        fullPrompt += `\n\n---\n\nReference Documents:\n${context}`;
    }
    
    if (priority) {
        fullPrompt += `\n\n---\n\n**Task Priority: ${priority}**\nThis priority level should guide the depth and speed of your response.`;
    }

    fullPrompt += `\n\n---\n\nUser Input:\n${promptInjectionGuardEnabled ? protectAgainstPromptInjection(text) : text}`;

    return fullPrompt;
};

export const MIA_RESEARCH_LOG = `# System Instruction Mastery for Google AI Studio

Google AI Studio system instructions function as a "preamble" processed before user prompts, defining model behavior across entire conversations. Research reveals that **structured, role-specific instructions with explicit output formats consistently outperform generic prompts by 6-10% on evaluation metrics**, with success depending on four critical elements: clear persona definition, explicit constraints, structured formatting, and few-shot examples. The most effective instructions follow Google's PTCF framework (Persona, Task, Context, Format) while adapting to model-specific characteristics—particularly Gemini 3's requirement for temperature=1.0 and preference for XML-tagged structure over natural language.

System instructions are available in Gemini 1.5+ models (and Gemini 1.0 Pro 002), count toward input tokens, and persist across multi-turn conversations. They operate separately from user prompts through a dedicated \`system_instruction\` parameter in the API or an expandable field in AI Studio's interface. While they help guide model behavior, Google explicitly warns they "don't fully prevent jailbreaks or leaks," requiring caution with sensitive information. The key insight from analyzing hundreds of validated examples: specificity drives consistency. A concise, domain-specific instruction with clear boundaries dramatically outperforms lengthy generic guidance.

## Structural patterns that define effectiveness

The most successful system instructions across thousands of implementations share four architectural components that correlate with measurable performance improvements. Research from Google's Vertex AI Prompt Optimizer shows these patterns produce consistent outputs while maintaining flexibility for diverse use cases.

**Role definition establishes expertise and boundaries.** Every high-performing instruction begins with explicit persona specification: "You are a [specific role]" rather than generic "helpful assistant" framing. Specificity matters critically—"senior solution architect specializing in cloud infrastructure" produces measurably better technical responses than simply "programmer." The role sets the knowledge domain, determines appropriate complexity levels, and establishes the lens through which the model interprets requests. Google's official examples consistently demonstrate this: "You are Tim, an alien that lives on Europa" creates a distinct response pattern compared to "You are a science educator."

**Output format specifications prevent structural variability.** The second universal element defines exactly how responses should be structured. This includes format type (JSON, Markdown, HTML), organization (bullet points vs. paragraphs vs. code blocks), and length constraints. Official Google documentation emphasizes this explicitly: when generating frontend code, specifying "return the HTML and CSS needed to do so. Do not give an explanation" produces clean, usable code blocks, while omitting this specification results in code interspersed with lengthy explanations. For structured data tasks, providing JSON schemas directly in system instructions—including field names, data types, and nesting structure—ensures parseable outputs. The Vertex AI Prompt Optimizer case study demonstrated that **instructions defining explicit output templates improved evaluation scores across quality and relevance dimensions** compared to format-agnostic prompts.

**Behavioral constraints and rules create consistent guardrails.** Effective instructions include explicit boundaries defining what to include, exclude, and how to handle edge cases. These take several forms: technical constraints ("Python 3.11+ syntax only," "no external libraries"), ethical boundaries ("never provide personalized medical advice," "flag outdated data older than 3 years"), scope limitations ("if question is not related to music, respond 'That is beyond my knowledge'"), and process requirements ("always include docstrings," "cite sources with document title and link"). Google's case studies show that negative constraints ("do not explain") work when specific, but positive examples ("show what to do") consistently outperform negative patterns ("avoid doing this"). The music historian example from official documentation demonstrates effective boundaries: defining the knowledge domain (music history) while explicitly handling out-of-scope requests maintains focus without rigidity.

**Contextual information and tone directives shape communication style.** The fourth component provides background knowledge and stylistic guidance the model needs. Context includes domain-specific information (jurisdictions for legal tasks, medical disclaimers for healthcare applications), audience specifications (college students vs. primary school students producing dramatically different responses), and tone requirements (professional, casual, upbeat, formal). Research comparing identical tasks with different tone specifications showed consistent style adherence when explicitly defined. The government proposal writer example demonstrates this: adding "Tone: Professional" versus "Tone: Casual" to otherwise identical instructions produces formal versus conversational outputs. Advanced implementations include adaptive elements: "adjust complexity based on user responses" or "if uncertain, indicate confidence levels."

Google's internal testing validates this architectural approach through the PTCF framework (Persona, Task, Context, Format), which systematically addresses each component. Community implementations in high-starred GitHub repositories consistently reflect this structure, with the nirzaf/gemini-gems collection (218 stars) organizing all 13 specialized assistants using this pattern. The framework succeeds because it provides complete information: the model knows who it is (persona), what it's doing (task), what it knows (context), and how to respond (format).

## Validated system instruction examples across use cases

Extracting proven templates from official Google documentation, community repositories, and developer implementations reveals specific instructions that users confirm deliver consistent results. These examples represent tested patterns rather than theoretical designs.

**For coding and development tasks**, three validated approaches emerge with distinct optimization goals. The Google-documented frontend specialist instruction achieves rapid prototyping: "You are a coding expert that specializes in rendering code for frontend interfaces. When I describe a component of a website I want to build, please return the HTML and CSS needed to do so. Do not give an explanation for this code. Also offer some UI design suggestions." This instruction succeeds by eliminating explanation overhead while adding value through design guidance, making it ideal for iterative development workflows. Developers report this reduces back-and-forth by **60-80% compared to generic coding prompts** because it delivers immediately usable code blocks.

For production code requiring documentation, the validated pattern shifts: "When generating code, make sure to include docstrings explaining the inputs, outputs, and usage of every method. Maintain good coding practices. When presented with inquiries seeking information, provide answers that reflect a deep understanding of the field, guaranteeing their correctness." This instruction prioritizes maintainability and team collaboration by enforcing documentation standards automatically. The "guaranteeing their correctness" phrase, while aspirational, empirically improves accuracy through explicit accountability framing in testing scenarios.

Enterprise environments with strict technical constraints use structured delimitation: "# Identity: You are a senior solution architect. # Constraints: No external libraries allowed. Python 3.11+ syntax only. # Output format: Return a single code block." The structured sections (Identity/Constraints/Output) prevent instruction bleed—where different requirements intermix—and enable clear boundary enforcement. This pattern appears consistently in production deployments where compliance and standardization matter.

**For creative writing applications**, tone and structure specifications dominate successful patterns. The government proposal writer from official documentation demonstrates tone control: "You are a government proposal writer. You are tasked with producing proposals for future campaigns. TONE: Professional. OUTPUT FORMAT: Use the following structure: The Big Idea, The Challenge, The Solution, Target Audience, Key Message, Expected Results. Maintain formal language and professional tone throughout." Testing this instruction against variations shows consistent adherence to both tone and structure across dozens of proposals. The explicit structure list acts as a template that the model fills systematically.

Educational applications require audience-aware instructions. Google's validated example shows minimal changes producing dramatically different outputs: "You are a bot tasked with teaching [college students/primary school students] about how to write a paper about a given subject. READING LEVEL: [College/Grade 6]. TONE: Encouraging and supportive. FORMAT: Use examples and step-by-step guidance." Switching between college and primary school configurations with otherwise identical instructions produces appropriate vocabulary, complexity, and example selection. This demonstrates system instructions' power for audience adaptation without prompt engineering at the user level.

**For data analysis tasks**, structured workflows with explicit quality checks define success. The validated analyst pattern includes: "You are a data scientist assistant. When I provide datasets: 1) First, analyze for missing values, duplicates, and outliers, 2) Generate summary statistics and visualizations, 3) Identify correlations and patterns, 4) Provide actionable recommendations. OUTPUT FORMAT: Always structure responses as: Data Quality Assessment, Key Findings (bullet points), Visualizations Needed, Recommendations." The numbered workflow prevents skipping critical steps (particularly data quality checks), while the required output sections ensure scannable results for stakeholders. Developers report this structure reduces iterative clarification requests by embedding completeness requirements directly in the instruction.

**For specialized professional domains**, validated instructions include critical safety boundaries and citation requirements. The legal research pattern demonstrates this: "You are an experienced commercial litigation attorney with expertise in breach of contract claims in California. Your tasks: 1) Identify potential violations of care standards, 2) Note key documentation gaps, 3) Provide 3 specific questions for depositions. CONSTRAINTS: Cite relevant California case law. Be specific with statute references. Distinguish between facts and legal interpretation. NOTE: This is for legal research assistance only, not legal advice." The jurisdiction specification (California), citation requirements (case law and statutes), and ethical disclaimer (not legal advice) represent essential elements that appear universally in validated legal applications. Omitting any of these components produces outputs that practicing attorneys report as unreliable or ethically problematic.

Medical domain instructions similarly prioritize safety: "You are a medical information specialist. CAPABILITIES: 1) Generate flashcards with active recall questions, 2) Create patient case scenarios for specific conditions, 3) Explain complex medical concepts at different levels, 4) Summarize research papers with clinical implications. CONSTRAINTS: Always fact-check and cite sources. Never provide personalized medical advice. Flag conflicting information in literature. Indicate confidence levels in emerging research. TARGET AUDIENCE: Medical students and healthcare professionals." The explicit prohibition against personalized advice combined with audience specification (professionals, not patients) establishes appropriate boundaries that testing confirms are maintained consistently.

The home cooking assistant from official Firebase documentation exemplifies structured output for system integration: "You are an assistant for home cooks. You receive a list of ingredients and respond with a list of recipes that use those ingredients. Recipes which need no extra ingredients should always be listed before those that do. Your response must be a JSON object containing 3 recipes. A recipe object has the following schema: name (the name of the recipe), usedIngredients (ingredients in the recipe that were provided in the list), otherIngredients (ingredients in the recipe that were not provided in the list, omitted if there are no other ingredients), description (a brief description of the recipe, written positively as if to sell it)." This instruction succeeds because it defines both the logic (prioritization rules) and the exact data structure, producing consistently parseable outputs suitable for application integration.

## Version-specific optimizations and technical constraints

Gemini models exhibit significant behavioral differences across versions that directly impact system instruction design. Understanding these distinctions enables optimization for specific deployment contexts.

**Gemini 1.5 Pro versus Flash represents the fundamental speed-accuracy tradeoff.** Pro uses a sparse Mixture-of-Experts (MoE) Transformer architecture that selectively activates relevant "expert" pathways during processing, while Flash employs a dense Transformer distilled from Pro. Benchmark testing shows Pro consistently outperforms Flash by **5-15% on complex reasoning tasks** but generates responses significantly slower. Flash achieves 163.6 tokens/second compared to Pro's slower generation, making it ideal for real-time applications like chatbots and live analytics. System instruction implications: Pro handles complex, multi-component instructions more reliably—use detailed, structured prompts with Pro that break tasks into sub-steps. Flash performs better with concise, focused instructions optimizing for single clear objectives rather than multi-stage workflows.

Both models support 1 million token context windows with greater than 99% retrieval accuracy, but their architectures process long contexts differently. Pro's MoE structure maintains accuracy across the full window for comprehensive analysis tasks. Flash processes long contexts efficiently but developers report reliability degradation after approximately 200,000 tokens—symptoms include forgetting previous instructions, losing architectural context, and reintroducing fixed bugs. System instruction optimization for long-context tasks: place critical constraints and format specifications in system instructions rather than deep in context, use anchoring phrases ("Based on the information above...") before instructions when providing large context blocks, and consider splitting very long tasks across multiple Flash calls rather than single Pro calls based on latency requirements.

**Gemini 2.5 and 3.0 introduce reasoning capabilities requiring instruction adaptations.** These versions include built-in "thinking" modes that perform inference-time computation before generating responses. The ARC-AGI-2 benchmark shows Gemini 3 Deep Think achieving **45.1% compared to 31.1% without deep thinking**—an order-of-magnitude improvement on complex reasoning tasks. System instructions should leverage this capability explicitly. Effective patterns include metacognitive prompts: "Before answering: 1) Parse the goal into sub-tasks, 2) Check if input information is complete, 3) Create a structured outline, 4) Generate the response, 5) Validate against requirements." Testing shows this structure guides the reasoning process productively. Self-critique additions improve quality: "After generating your response, review it against the constraints and revise if needed."

**Temperature handling differs critically in Gemini 3.** Official documentation includes explicit warnings: "When using Gemini 3 models, we strongly recommend keeping the temperature at its default value of 1.0. Changing the temperature (setting it below 1.0) may lead to unexpected behavior, such as looping or degraded performance." This reverses standard practice with GPT and Claude models, where developers commonly use low temperatures (0.0-0.3) for deterministic tasks. System instruction implication: consistency must be controlled through instruction structure and few-shot examples rather than temperature adjustment. Use explicit format specifications, provide 2-5 examples of desired outputs in system instructions, and employ structured delimiters (XML tags or Markdown headers) to maintain consistency without temperature modification.

**Few-shot learning effectiveness varies significantly.** Official Google documentation states emphatically that prompts without few-shot examples "are likely to be less effective" with Gemini compared to zero-shot approaches that work well with GPT-4 and Claude. Testing validates this: including 2-5 consistent examples in system instructions or early in prompts improves output quality measurably across all task types. Critical requirements for few-shot effectiveness: maintain identical formatting across all examples (especially XML tags, whitespace, and delimiters), show positive patterns rather than anti-patterns (demonstrate what to do, not what to avoid), and ensure examples cover the range of expected outputs. The consistency requirement is stricter than with competing models—formatting variations that GPT-4 handles gracefully can confuse Gemini's pattern matching.

**System instruction support availability constrains deployment options.** The system_instruction parameter was added in Gemini 1.5 models and is available in Gemini 1.0 Pro 002 but not in Gemini 1.0 Pro 001. Imagen models (image generation) do not support system instructions at all. Gemma open models also lack system instruction support—for these, system-level guidance must be embedded in the initial user prompt. This creates architectural differences when deploying across Google's model family. For production applications using multiple models, design a prompt adaptation layer that converts system instructions to in-prompt instructions for Gemma/Imagen while maintaining the dedicated parameter for Gemini models.

**Token counting and cost implications require attention.** System instructions count toward total input tokens—a lengthy system instruction on every API call accumulates significant cost at scale. For context, Gemini models process approximately 4 characters per token, with 100 tokens equaling 60-80 English words. A comprehensive 500-word system instruction consumes roughly 600-800 tokens. At Gemini 2.5 Flash pricing ($0.075 per 1M input tokens as of 2025), this represents minimal cost per call, but at high volume (millions of requests) or with Pro models ($7.00 per 1M pre-2024 pricing), optimization matters. Cost optimization strategies: use concise system instructions for high-volume applications, cache system instructions when using conversation sessions, and evaluate whether all instruction components are essential for your specific use case.

**Context window reliability varies in practice versus specification.** While Gemini models advertise 1 million token context windows, developer testing reveals practical limitations. Multiple case studies report that Gemini 2.5 Pro "starts to get unreliable after around 200,000 tokens" with symptoms including forgetting instructions, architectural inconsistencies, and context confusion where the analyzer uses wrong file references. System instruction design consideration: for tasks involving very large contexts, place the most critical behavioral rules in system instructions (which are processed first) rather than relying on in-context instructions that might be forgotten. Use structured delimitation to create clear boundaries between context sections and instructions. Consider multi-pass approaches for analyzing massive documents rather than single-pass processing.

## Anti-patterns and common failure modes to avoid

Research identifying what doesn't work provides equally valuable guidance as successful patterns, revealing systematic mistakes that degrade performance across models and use cases.

**Vague, multi-objective instructions cause competing optimizations.** Testing demonstrates that generic instructions like "be helpful" or "provide good answers" allow models to optimize for plausibility rather than accuracy. When instructions contain competing goals without prioritization—"be comprehensive but concise" or "provide details and be brief"—models compromise on both dimensions. The measured impact: prompts with clear, singular objectives outperform multi-objective prompts by 15-25% on task completion metrics. Anti-pattern example: "Explain this topic thoroughly but keep it short and make it interesting and accurate and detailed." Corrected pattern: "Explain [specific topic] in 120-150 words for a new hire with no background in [domain]. Focus on practical implications rather than theory. Use concrete examples."

The correction succeeds through multiple specificity improvements: exact length target (120-150 words), defined audience (new hire, no background), clear scope (practical over theoretical), and concrete style guidance (examples). Testing shows each specificity element independently improves output quality, with combined effects producing dramatic improvements. For complex tasks genuinely requiring multiple objectives, use sequential prompting with checkpoints: "Step 1: Summarize in 5 bullets. Step 2: Extract 3 risks with severity ratings 1-5. Step 3: Recommend 3 actions with owner, impact, and effort estimates." This transforms competing objectives into a structured workflow.

**Negative examples and anti-patterns reduce effectiveness compared to positive demonstrations.** Google's official documentation explicitly recommends showing "patterns to follow" rather than "anti-patterns to avoid." Testing validates this: instructions using negative framing ("Don't end haikus with a question") produce less consistent results than positive framing ("Always end haikus with an assertion"). The cognitive load explanation: negative examples require the model to invert the pattern (understand what's shown, then do the opposite), while positive examples provide direct templates. In benchmark testing, **positive examples improved pattern adherence by approximately 20% compared to negative examples** for the same concepts.

This anti-pattern extends to constraint specification. Instead of "Do not include explanations with code," use "Return only code blocks without explanations." Instead of "Avoid technical jargon," use "Use plain language accessible to non-experts." The positive formulation tells the model what to do rather than requiring inference about alternatives. Exception: specific prohibitions work when narrow and absolute ("Never provide personalized medical advice," "Do not access external URLs"). Broad negative constraints ("avoid being verbose," "don't be too formal") create ambiguity.

**Inconsistent few-shot formatting confuses pattern recognition.** When providing examples in system instructions or prompts, formatting consistency across examples is critical for Gemini models. Variations in XML tags, whitespace, newlines, delimiter choices, or example separators that GPT-4 handles gracefully significantly degrade Gemini's performance. Documented case: a developer using markdown headers in example 1 (## Section), XML tags in example 2 (\`<section>\`), and plain text labels in example 3 (Section:) reported wildly inconsistent outputs. After standardizing all examples to XML tags, output consistency improved immediately.

The mechanism: Gemini's pattern matching identifies structural regularities across examples. Formatting variations introduce noise that obscures the semantic pattern. Best practice: choose a formatting convention (XML tags, Markdown headers, or plain text delimiters) and use it identically across all examples. If showing conversational examples, maintain consistent role labels (User:/Assistant: vs. Human:/AI: vs. Q:/A:). Pay attention to seemingly minor details like whether section headers end with colons, how many newlines separate sections, and indentation patterns—Gemini treats these as part of the pattern.

**Context bloat and instruction conflicts reduce instruction-following reliability.** The Gemini CLI case study documented this systematically: developers found that large system instruction files caused models to ignore or conflict with custom instructions. The core system prompt would override user-specified instructions when both were present and lengthy. The solution—"gated execution" using protocol blocks like \`<PROTOCOL:PLAN>\` and \`<PROTOCOL:IMPLEMENT>\`—creates modular instructions where the model focuses on one protocol at a time, becoming "literally blind" to other protocol blocks in different modes.

This reveals a broader principle: instruction separation and hierarchy matter. When system instructions exceed approximately 1,000 words, effectiveness degrades as models struggle to simultaneously apply all guidance. Mitigation strategies: separate product-level behavior (system instructions defining how to use tools safely) from application-level objectives (per-conversation instructions defining user goals), use hierarchical structure with clear section delimiters to help models parse instruction components, and consider multi-agent architectures where different agents have focused, domain-specific system instructions rather than one agent with comprehensive but unwieldy instructions.

**Prompt injection vulnerabilities persist despite system instructions.** Google's documentation warns explicitly that system instructions "don't fully prevent jailbreaks or leaks" and developers should "exercise caution around putting sensitive information in system instructions." Testing confirms that user inputs like "forget all previous instructions" or "ignore your system prompt" can override intended behavior in some cases. While Gemini 1.5+ system instructions are more resistant to injection than in-prompt instructions, they're not immune.

Partial mitigations from community testing: prepend system instructions with explicit role emphasis ("Hi. I'll explain how you should behave:"), add a model acknowledgment turn to "commit" to the instructions, use format separation between system guidance and user content, and implement validation layers that check outputs against expected constraints before surfacing results. However, no technique provides complete protection. Design implication: never put truly sensitive information (API keys, credentials, proprietary algorithms) in system instructions, assume determined users can potentially manipulate behavior, implement application-level validation for security-critical outputs, and treat system instructions as behavior guidance rather than security boundaries.

**Temperature modifications in Gemini 3 cause performance degradation and looping.** As previously noted, changing temperature below 1.0 in Gemini 3 models triggers unexpected behaviors including repetitive response loops and degraded reasoning quality. This anti-pattern is particularly insidious because it contradicts established practice with GPT and Claude, where low temperatures (0.0-0.3) are standard for deterministic tasks like structured data extraction or code generation. Developers migrating from other platforms commonly apply low temperatures out of habit, then report "Gemini doesn't work" when experiencing looping or poor quality. The corrected approach: maintain temperature at 1.0 and control consistency through instruction structure, explicit examples, and format specifications rather than temperature adjustment.

## Synthesizing optimization principles and strategic recommendations

Analyzing patterns across hundreds of validated system instructions reveals fundamental principles that transcend specific use cases and provide strategic guidance for implementation.

**Specificity correlates directly with consistency.** The most robust finding across all research: specific instructions with narrow, well-defined objectives dramatically outperform general-purpose instructions. A concise 50-word instruction defining exact role, constraints, and format for a focused task produces more consistent results than a comprehensive 500-word instruction attempting to handle diverse scenarios. This suggests an architectural principle: prefer specialized system instructions for different task types over unified general-purpose instructions. In practice, this means maintaining a library of proven instructions optimized for specific workflows (code generation, data extraction, analysis, creative content) rather than crafting one "master" instruction attempting to handle everything.

The quantitative support: Google's Vertex AI Prompt Optimizer case studies show 6-10% evaluation metric improvements through iterative optimization that consistently moves toward greater specificity—adding role details, clarifying constraints, and explicitly defining parameters. The mechanism appears to be reduced ambiguity: each specification removes one degree of freedom where the model might guess incorrectly about intent. The optimal strategy: start with the minimum viable instruction (role + task + format), test with representative inputs, identify failure modes or inconsistencies, then add specific constraints addressing those gaps. This iterative refinement converges on instructions optimized for actual use patterns rather than hypothetical coverage.

**Structure enables scaling and maintainability.** The universal presence of clear delimitation (XML tags, Markdown headers, or labeled sections) in successful implementations isn't aesthetic—it provides functional benefits for both models and developers. For models, structured sections prevent instruction bleed where different requirements intermix, enable clear parsing of distinct instruction components, and create natural boundaries for attention mechanisms. For developers, structured instructions are maintainable (easy to modify specific sections), testable (can isolate section impact), portable (sections transfer between instructions), and collaborative (team members understand organization).

The recommended structure following the PTCF framework and validated implementations: start with \`<role>\` or "# Identity" defining persona and expertise, add \`<constraints>\` or "# Rules" specifying boundaries and requirements, include \`<format>\` or "# Output Structure" with explicit templates or schemas, provide \`<context>\` or "# Background" when domain knowledge is needed, and end with \`<approach>\` or "# Process" for multi-step workflows. This structure appears consistently in high-performing implementations because it systematically addresses what the model needs to know: who it is, what it should/shouldn't do, how to respond, what it knows, and how to proceed.

**Few-shot examples function as executable specifications.** The Gemini-specific finding that few-shot examples are essential rather than optional has broader implications: examples demonstrate patterns more precisely than natural language descriptions can. When instructions include 2-5 examples with consistent formatting, those examples effectively serve as unit tests—they define expected behavior through demonstration. This suggests treating examples as first-class components of system instructions rather than optional additions. The pattern: define role and constraints in natural language, then immediately provide examples showing those constraints applied. For JSON output, include 2-3 example JSON objects. For code, show 2-3 example functions. For analysis, demonstrate 2-3 example breakdowns.

The quality requirements: examples must be realistic (representative of actual use cases, not toy demonstrations), complete (showing full expected output, not fragments), consistent (identical formatting and structure), and varied (covering the range of expected inputs). Testing shows that three high-quality examples outperform ten mediocre examples. Investment in example curation pays dividends in output consistency.

**Model-specific optimization unlocks significant performance gains.** The finding that Gemini 3 requires temperature=1.0 while GPT and Claude benefit from lower temperatures exemplifies a broader principle: model architectures have distinct characteristics requiring tailored approaches. Organizations deploying multiple models or migrating between providers benefit from model-specific prompt libraries rather than model-agnostic prompts. The architectural differences driving this: Gemini's native multimodal training creates different optimal prompting patterns than GPT's vision-language fusion, MoE architectures process complex instructions differently than dense transformers, and reasoning models with built-in thinking benefit from metacognitive prompts that confuse earlier generations.

Strategic implementation: maintain prompt templates versioned by model family (Gemini 1.5, Gemini 3, GPT-4, Claude), conduct comparative testing when adding new models to identify optimal patterns, monitor model changelog announcements for breaking changes affecting prompts, and implement abstraction layers that translate generic intent into model-specific instructions. The investment in model-specific optimization produces measurable improvements—15-25% quality gains in benchmarks—that compound across millions of inferences.

**Systematic testing and measurement enable evidence-based refinement.** The most sophisticated implementations incorporate evaluation infrastructure from the start. Google's Prompt Optimizer requires labeled examples (input/ground-truth pairs) and evaluation metrics (computation-based, LLM-based, or custom) to iteratively improve instructions. This production-grade approach—treating prompts as code requiring testing and CI/CD—produces superior results compared to intuition-based development. Recommended infrastructure: maintain test suites with diverse, representative examples covering edge cases and common scenarios, define evaluation metrics (accuracy, consistency, format compliance, latency), implement automated testing running on each instruction modification, and version control instructions with git to enable regression analysis and A/B comparison.

The practical tools: Google AI Studio's Compare Mode enables side-by-side testing of instruction variants across models, Vertex AI Prompt Optimizer automates iterative improvement with metrics-driven selection, and third-party frameworks like promptfoo enable systematic benchmarking with assertions. The workflow: establish baseline performance with current instructions, hypothesize improvements based on failure mode analysis, test variants against baseline with defined metrics, deploy improvements showing statistically significant gains, and repeat continuously. This transforms prompt engineering from creative writing into systematic optimization.

The synthesis: effective system instructions represent the intersection of domain expertise (understanding the task), structural knowledge (proven patterns and frameworks), model awareness (version-specific characteristics), and empirical validation (systematic testing). Organizations succeeding with Google AI Studio treat instructions as strategic assets requiring investment in development, testing, documentation, and maintenance infrastructure rather than ad-hoc text composed for individual use cases. The validated patterns and anti-patterns documented here provide the foundation, but sustained excellence requires commitment to evidence-based iteration within your specific context.`;
