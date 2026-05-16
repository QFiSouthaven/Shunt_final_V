
// services/miaService.ts
import { GoogleGenAI, GenerateContentResponse, Type } from "@google/genai";
import { GeminiResponse, TokenUsage } from '@/types';
import { logFrontendError, ErrorSeverity } from '@/utils/errorLogger';
import { withRetries } from './apiUtils';

const mapTokenUsage = (response: GenerateContentResponse, model: string): TokenUsage => {
    return {
        prompt_tokens: response.usageMetadata?.promptTokenCount ?? 0,
        completion_tokens: response.usageMetadata?.candidatesTokenCount ?? 0,
        total_tokens: response.usageMetadata?.totalTokenCount ?? 0,
        model: model,
    };
};

export const getMiaChatResponse = async (history: { role: string, parts: { text: string }[] }[], newMessage: string): Promise<string> => {
    try {
        const apiCall = async () => {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const chat = ai.chats.create({
                model: 'gemini-3-pro-preview',
                config: {
                    systemInstruction: "You are Mia, a friendly and highly intelligent AI assistant embedded in a complex web application for developers. Be helpful and concise. Your primary role is to assist the user with understanding and operating the application.",
                    // thinkingConfig removed as it is not supported on gemini-3-pro-preview
                },
                history,
            });
            const response = await chat.sendMessage({ message: newMessage });
            return response.text;
        };
        return await withRetries(apiCall);
    } catch (error) {
        logFrontendError(error, ErrorSeverity.High, { context: 'getMiaChatResponse Gemini API call' });
        throw error;
    }
};

export const getMiaErrorAnalysis = async (errorLog: Record<string, any>): Promise<string> => {
    const prompt = `You are an expert software engineer and helpful AI assistant named Mia. You are embedded within a web application. Your task is to analyze the following error report that was just captured from the application. Your analysis should be clear, concise, and helpful to the developer using the application. Structure your response in Markdown.

1.  **Explain the Error:** In simple terms, what does this error mean?
2.  **Identify the Likely Cause:** Based on the stack trace and provided context, what is the most probable reason for this error? Point to specific files or components if possible.
3.  **Suggest a Solution:** Provide concrete, actionable steps the developer can take to fix the issue. If possible, suggest specific code changes.

Here is the error report:
---
${JSON.stringify(errorLog, null, 2)}
---`;
    try {
        const apiCall = async () => {
            const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
            const response = await ai.models.generateContent({
                model: 'gemini-3-pro-preview',
                contents: prompt,
                // thinkingConfig removed as it is not supported on gemini-3-pro-preview
            });
            return response.text;
        };
        return await withRetries(apiCall);
    } catch (error) {
        logFrontendError(error, ErrorSeverity.Critical, { context: 'getMiaErrorAnalysis Gemini API call' });
        throw error;
    }
};

export const generateCodeFixPlan = async (errorLog: Record<string, any>, projectContext: string): Promise<GeminiResponse> => {
  const prompt = `
You are the **Host Agent**, a master orchestrator AI powered by Gemini. Your purpose is to resolve a critical error within the web application by assembling and directing a team of specialist sub-agents.

**Objective:** Initiate a **verifiably validated solutions fix**. The proposed solution must be rigorously analyzed to ensure it effectively resolves the issue without introducing regressions.

**Your Sub-Agent Team:**

1.  **React Sub-Agent:** An expert in the React 19 ecosystem. It analyzes component lifecycle, state management (Hooks), props, JSX, and event handling.
2.  **TypeScript Sub-Agent:** A specialist in static typing. It scrutinizes type definitions, interfaces, Zod schemas, and potential type mismatches.
3.  **DevOps Sub-Agent:** A systems expert. It reviews build configurations, dependencies (package.json), environment variables, and backend API contracts.

**Your Mission:**

Given the following error report and project context, you must perform a collaborative diagnosis and generate a complete, production-quality code fix.

**Execution Protocol:**

1.  **Internal Monologue (Simulated):**
    *   **Host Analysis:** Briefly state your initial assessment of the error.
    *   **Delegate & Synthesize:** For each sub-agent, simulate their analysis process. Write down what each agent would look for and what conclusions they would draw based on the provided error and context.
    *   **Final Strategy:** Based on the synthesized findings from your agents, formulate the definitive root cause and the precise strategy for the fix.

2.  **Generate Implementation Plan:**
    *   Translate your final strategy into a series of \`implementationTasks\`.
    *   For each file that needs modification, you **MUST** provide the **ENTIRE, NEW, and COMPLETE file content** in the 'newContent' field.
    *   Do not provide diffs, partial code, or explanations in the 'newContent' field. It must be only the raw code for the complete file.
    *   Ensure file paths are correct and the generated code is syntactically perfect.

3.  **Output:**
    *   Return your response strictly according to the provided JSON schema.
    *   You are not required to provide clarifying questions, an architectural proposal, or test cases. Return empty arrays or empty strings for those fields.

---
**Error Report:**
\`\`\`json
${JSON.stringify(errorLog, null, 2)}
\`\`\`
---
**Project Context:**
\`\`\`markdown
${projectContext}
\`\`\`
---
`;
    const implementationTaskSchema = {
        type: Type.OBJECT,
        properties: {
            filePath: { type: Type.STRING, description: "The full path to the file that needs to be modified." },
            description: { type: Type.STRING, description: "A one-sentence description of the change." },
            details: { type: Type.STRING, description: "Precise, step-by-step details for a coding AI to follow. Use for descriptive plans." },
            newContent: { type: Type.STRING, description: "The full, complete new content for the file. Use for direct code fixes." },
        },
        required: ['filePath', 'description']
    };

    const responseSchema = {
    type: Type.OBJECT,
    properties: {
        clarifyingQuestions: { type: Type.ARRAY, items: { type: Type.STRING } },
        architecturalProposal: { type: Type.STRING },
        implementationTasks: {
            type: Type.ARRAY,
            items: {
                ...implementationTaskSchema,
                required: ['filePath', 'description', 'newContent'], // newContent is now required for this operation
            },
            description: "A list of files to modify with their full new content."
        },
        testCases: { type: Type.ARRAY, items: { type: Type.STRING } },
        internalMonologue: { 
            type: Type.STRING, 
            description: "The simulated internal monologue of the agent swarm as they collaborate to find a solution." 
        }
    },
    required: ['implementationTasks']
  };

  try {
    const apiCall = async () => {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
        const model = 'gemini-3-pro-preview';
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema,
                // thinkingConfig removed as it is not supported on gemini-3-pro-preview
            },
        });

        if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
            throw new Error("The AI's response was too long and was truncated, resulting in an incomplete code fix plan.");
        }

        const tokenUsage = mapTokenUsage(response, model);
        const jsonText = response.text.trim().replace(/^```(json)?\s*/, '').replace(/```\s*$/, '');
        const parsedResponse = JSON.parse(jsonText);

        return {
            clarifyingQuestions: [],
            architecturalProposal: '',
            testCases: [],
            ...parsedResponse,
            tokenUsage,
        };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.Critical, { context: 'generateCodeFixPlan Gemini API call' });
    throw new Error('Failed to generate the code fix. The AI may have returned an invalid response or malformed JSON.');
  }
};
