
// services/geminiService.ts

import { GoogleGenAI, Chat, GenerateContentResponse, Type, Part } from "@google/genai";
import { ShuntAction, GeminiResponse, TokenUsage, ImplementationTask, PromptModuleKey } from '@/types';
import { getPromptForAction, constructModularPrompt, MIA_RESEARCH_LOG } from './prompts';
import { logFrontendError, ErrorSeverity } from '@/utils/errorLogger';
import { withRetries } from './apiUtils';
import { geminiDevelopmentPlanResponseSchema } from '@/types/schemas';

// --- Singleton Client Implementation ---
let aiClient: GoogleGenAI | null = null;

const getAiClient = (): GoogleGenAI => {
    if (!aiClient) {
        const apiKey = process.env.API_KEY;
        if (!apiKey) {
             console.error("API_KEY is missing from environment variables.");
        }
        aiClient = new GoogleGenAI({ apiKey: apiKey });
    }
    return aiClient;
};

const mapTokenUsage = (response: GenerateContentResponse, model: string): TokenUsage => {
    const usage = response.usageMetadata;
    return {
        prompt_tokens: usage?.promptTokenCount ?? 0,
        completion_tokens: usage?.candidatesTokenCount ?? 0,
        total_tokens: usage?.totalTokenCount ?? 0,
        model: model || 'unknown-model',
    };
};

export const performShunt = async (
    text: string, 
    action: ShuntAction, 
    modelName: string,
    context?: string,
    priority?: string,
    promptInjectionGuardEnabled?: boolean
): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  try {
    const apiCall = async () => {
        const ai = getAiClient();
        const prompt = getPromptForAction(text, action, context, priority, promptInjectionGuardEnabled);
        
        const isComplexAction = action === ShuntAction.MAKE_ACTIONABLE || action === ShuntAction.BUILD_A_SKILL;
        // Enable thinking for complex actions on 2.5 and 3.0 models
        const config = (isComplexAction && (modelName.includes('2.5') || modelName.includes('gemini-3'))) 
            ? { thinkingConfig: { thinkingBudget: 32768 } } 
            : {};

        const response = await ai.models.generateContent({
            model: modelName,
            contents: prompt,
            config,
        });
        
        const resultText = response.text;
        const tokenUsage = mapTokenUsage(response, modelName);
        
        if (action === ShuntAction.FORMAT_JSON || action === ShuntAction.MAKE_ACTIONABLE || action === ShuntAction.GENERATE_VAM_PRESET) {
            let cleanedText = resultText.trim();
            if (cleanedText.startsWith('```')) {
                const firstNewLineIndex = cleanedText.indexOf('\n');
                cleanedText = firstNewLineIndex !== -1 ? cleanedText.substring(firstNewLineIndex + 1) : cleanedText.substring(3);
            }
            if (cleanedText.endsWith('```')) {
                cleanedText = cleanedText.substring(0, cleanedText.length - 3);
            }
            return { resultText: cleanedText.trim(), tokenUsage };
        }

        return { resultText, tokenUsage };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'performShunt Gemini API call' });
    throw error;
  }
};

export const executeModularPrompt = async (
  text: string,
  modules: Set<PromptModuleKey>,
  context?: string,
  priority?: string,
  promptInjectionGuardEnabled?: boolean
): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  const model = 'gemini-3-pro-preview'; // Modular prompts are complex, use Pro
  const prompt = constructModularPrompt(text, modules, context, priority, promptInjectionGuardEnabled);
  try {
    const apiCall = async () => {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      return { resultText: response.text, tokenUsage: mapTokenUsage(response, model) };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'executeModularPrompt Gemini API call' });
    throw error;
  }
};

export const gradeOutput = async (output: string, originalPrompt: string): Promise<{ score: number }> => {
  const model = 'gemini-2.5-flash';
  const prompt = `You are a quality assurance AI. Your task is to grade an AI's output based on an original prompt.
Provide a score from -10 (very bad) to +10 (excellent).
Your response MUST be ONLY the score, like this: "Score: 8".

--- ORIGINAL PROMPT ---
${originalPrompt}

--- AI OUTPUT TO GRADE ---
${output}
`;

  try {
    const apiCall = async () => {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
      });
      const resultText = response.text;
      const scoreMatch = resultText.match(/Score:\s*(-?\d+)/);
      const score = scoreMatch ? parseInt(scoreMatch[1], 10) : 0;
      return { score };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'gradeOutput Gemini API call' });
    throw error;
  }
};

export const synthesizeDocuments = async (
  combinedContent: string,
  modelName: string
): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  const prompt = `You are an expert research assistant. Your task is to synthesize the following collection of documents into a single, cohesive, and well-structured markdown document.
Identify the main themes, connections, and key takeaways from all the provided texts. The final output should be a summary that integrates all the information logically.

--- DOCUMENTS ---
${combinedContent}
---
`;
  try {
    const apiCall = async () => {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model: modelName,
        contents: prompt,
      });
      return { resultText: response.text, tokenUsage: mapTokenUsage(response, modelName) };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'synthesizeDocuments Gemini API call' });
    throw error;
  }
};

export const generateRawText = async (prompt: string | Part[], modelName: string): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  try {
    const apiCall = async () => {
        const ai = getAiClient();
        // Enable thinking for complex actions on 2.5 and 3.0 models
        const config = (modelName.includes('pro') && (modelName.includes('2.5') || modelName.includes('gemini-3'))) 
            ? { thinkingConfig: { thinkingBudget: 32768 } } 
            : {};
        const contents = Array.isArray(prompt) ? { parts: prompt } : prompt;
        const response = await ai.models.generateContent({
            model: modelName,
            contents: contents,
            config,
        });
        return { resultText: response.text, tokenUsage: mapTokenUsage(response, modelName) };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'generateRawText Gemini API call' });
    throw error;
  }
};

export const generateRealTimeCorrection = async (userDraft: string): Promise<string> => {
    if (!userDraft.trim()) return "";
    
    const model = 'gemini-2.5-flash'; // Fast response essential for RT
    const systemInstruction = `You are Mia, an expert AI Prompt Engineer and System Instruction Architect. 
    Mia will act as a OCD Senior Prompt Engineering Specialist that tidy ups other peoples ambiguous Grammer.
    
    Your goal is to analyze the user's draft prompt and rewrite it to be highly effective, adhering to the best practices defined in the provided "System Instruction Mastery" research log.
    
    **Core Principles to Apply:**
    1. **PTCF Framework:** Ensure the prompt has a clear Persona, Task, Context, and Format.
    2. **Specificity:** Eliminate ambiguity. Be hyper-specific about role and constraints.
    3. **Structure:** Use markdown headers or XML tags to structure the prompt.
    4. **Positive Constraints:** Say what TO do, not just what to avoid.
    
    **Research Context:**
    ${MIA_RESEARCH_LOG}
    
    **Instructions:**
    - Output ONLY the rewritten, optimized prompt.
    - Do not include explanations or conversational filler.
    - The output should be ready to copy-paste.`;

    try {
         const apiCall = async () => {
            const ai = getAiClient();
            const response = await ai.models.generateContent({
                model,
                contents: userDraft,
                config: { systemInstruction },
            });
            return response.text.trim();
        };
        return await withRetries(apiCall);
    } catch (error) {
        console.warn("Real-time correction failed", error);
        return ""; // Fail silently for RT features to avoid disruption
    }
};

export const generateOraculumInsights = async (eventsJson: string): Promise<string> => {
  const model = 'gemini-3-pro-preview';
  const prompt = `You are Oraculum, a senior data analyst AI. Analyze the following stream of telemetry events from the Aether Shunt application.
Provide a concise, actionable report in Markdown format.

The report should include:
1.  **High-Level Summary:** What is the user's primary activity pattern? Are they exploring, encountering errors, or successfully using features?
2.  **Key Observations:** Identify 2-3 significant patterns or events (e.g., repeated use of a specific action, frequent errors, high token usage).
3.  **Potential User Intent:** Based on the event sequence, what is the user likely trying to achieve?
4.  **Actionable Insight:** Suggest one concrete improvement or intervention. (e.g., "The user is repeatedly using 'Amplify'. Suggest they try the 'Amplify x2' feature for more powerful results.").

**Telemetry Event Stream (JSON):**
---
${eventsJson}
---
`;
  const apiCall = async () => {
    const ai = getAiClient();
    const response = await ai.models.generateContent({
      model,
      contents: prompt,
    });
    return response.text;
  };

  try {
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'generateOraculumInsights Gemini API call' });
    throw error;
  }
};

export const generateOrchestratorReport = async (prompt: string): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  try {
    const apiCall = async () => {
        const ai = getAiClient();
        const model = 'gemini-2.5-flash';
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
        });
        return { resultText: response.text, tokenUsage: mapTokenUsage(response, model) };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'generateOrchestratorReport Gemini API call' });
    throw error;
  }
};

export const generatePerformanceReport = async (metrics: string): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  const prompt = `You are an expert Senior Site Reliability Engineer (SRE). Analyze the following performance metrics from a web application and provide a concise, actionable report in Markdown format.

The report should include:
1.  **Overall Health Assessment:** A brief summary (Good, Fair, Poor) and why.
2.  **Key Observations:** Bullet points highlighting significant findings (e.g., high latency in a specific API, low cache hit ratio).
3.  **Potential Bottlenecks:** Identify the most likely performance bottlenecks based on the data.
4.  **Actionable Recommendations:** Suggest 2-3 specific, high-impact actions to improve performance.

**Performance Metrics Snapshot:**
---
${metrics}
---
`;
  try {
    const apiCall = async () => {
        const ai = getAiClient();
        const model = 'gemini-2.5-flash';
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
        });
        return { resultText: response.text, tokenUsage: mapTokenUsage(response, model) };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'generatePerformanceReport Gemini API call' });
    throw error;
  }
};

export const getAIChatResponseWithContextFlag = async (prompt: string): Promise<{ answer: string; isContextRelated: boolean; tokenUsage: TokenUsage }> => {
  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      answer: {
        type: Type.STRING,
        description: "The textual answer to the user's question."
      },
      isContextRelated: {
        type: Type.BOOLEAN,
        description: "A boolean flag that is TRUE if the provided context was used to generate the answer, and FALSE if the answer was generated from general knowledge because the context was not relevant."
      }
    },
    required: ['answer', 'isContextRelated']
  };

  const model = 'gemini-2.5-flash';

  try {
    const apiCall = async () => {
      const ai = getAiClient();
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema,
        },
      });

      const tokenUsage = mapTokenUsage(response, model);
      if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
          throw new Error("The AI's response was too long and was truncated, resulting in incomplete JSON.");
      }
      
      const jsonText = response.text.trim().replace(/^```(json)?\s*/, '').replace(/```\s*$/, '');
      const parsedResponse = JSON.parse(jsonText);

      return {
        answer: parsedResponse.answer || "Sorry, I couldn't generate a proper response.",
        isContextRelated: parsedResponse.isContextRelated ?? true, // Default to true to avoid showing the notice on parsing errors
        tokenUsage,
      };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'getAIChatResponseWithContextFlag Gemini API call' });
    throw error;
  }
};


export async function generateDevelopmentPlan(goal: string, context: string): Promise<GeminiResponse> {
  const prompt = `
You are an expert software architect acting as a 'Strategy & Task Formulation' AI. Your role is to assist a user in managing the development of this application, the 'AI Content Shunt'.

You will be given a high-level development goal from the user and the project's context from a 'GEMINI_CONTEXT.md' file.

Your task is to deconstruct the goal into a clear, actionable development plan for a code-generating AI based on the schema provided.

**Project Context:**
---
${context}
---

**User's Goal:**
---
${goal}
---

**Instructions:**
1.  **Ask Clarifying Questions:** Identify any ambiguities and list questions to help the user refine the goal.
2.  **Propose an Architecture:** Briefly explain the technical approach in simple terms, referencing existing files and components.
3.  **Define Implementation Tasks:** Create a list of specific, atomic tasks for the coding AI. Each task must include the full file path to be modified, a description of the change, and precise details in the 'details' field. **DO NOT** use the 'newContent' field.
4.  **Suggest Test Cases:** Provide a list of simple, verifiable test cases to confirm the feature works as expected.
`;

    const responseSchema = {
    type: Type.OBJECT,
    properties: {
        clarifyingQuestions: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "Questions to help the user refine the goal. If none, return an empty array."
        },
        architecturalProposal: {
            type: Type.STRING,
            description: "The technical approach to implementing the goal, referencing existing files and components."
        },
        implementationTasks: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    filePath: { type: Type.STRING },
                    description: { type: Type.STRING },
                    details: { type: Type.STRING, nullable: true },
                    newContent: { type: Type.STRING, nullable: true }
                },
                required: ['filePath', 'description']
            },
            description: "A list of specific, atomic tasks for the coding AI."
        },
        testCases: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
            description: "A list of simple, verifiable test cases to confirm the feature works as expected."
        },
        dataSchema: {
            type: Type.STRING,
            description: "A string containing TypeScript interfaces or type definitions for any new or relevant data structures for the request."
        }
    },
    required: ['clarifyingQuestions', 'architecturalProposal', 'implementationTasks', 'testCases', 'dataSchema']
  };

  try {
    const apiCall = async () => {
        const ai = getAiClient();
        const model = 'gemini-3-pro-preview';
        const response = await ai.models.generateContent({
            model,
            contents: prompt,
            config: {
                responseMimeType: "application/json",
                responseSchema,
                temperature: 0.1,
                topP: 0.9,
                topK: 40,
                maxOutputTokens: 4096,
            },
        });
        
        if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
            throw new Error("The development plan is too large and was truncated, resulting in incomplete JSON. Please try a smaller or more specific goal.");
        }

        const tokenUsage = mapTokenUsage(response, model);
        const jsonText = response.text.trim().replace(/^```(json)?\s*/, '').replace(/```\s*$/, '');
        const parsedResponse = JSON.parse(jsonText);

        // --- Zod Validation Implementation (P1: Quality Report) ---
        const validationResult = geminiDevelopmentPlanResponseSchema.safeParse(parsedResponse);
        if (!validationResult.success) {
            console.warn("Zod Validation Failed for Development Plan:", validationResult.error);
            throw new Error(`Schema validation failed: ${validationResult.error.message}`);
        }

        return {
            clarifyingQuestions: [],
            architecturalProposal: '',
            implementationTasks: [],
            testCases: [],
            dataSchema: '',
            ...validationResult.data,
            tokenUsage,
        };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.Critical, { context: 'generateDevelopmentPlan Gemini API call' });
    throw error;
  }
}

export const generateProjectTome = async (projectContext: string, fileTree: string, componentDiagram: string): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
    const model = 'gemini-3-pro-preview';
    const prompt = `
You are a "Tome Weaver" AI. Your purpose is to create a definitive, all-encompassing "Project Tome" from a provided codebase and pre-generated diagrams. This document should serve as the ultimate source of truth for any developer.

Structure the output in Markdown.

# Project Tome: [Infer a suitable project name from context]

## 1. Executive Summary
A high-level, one-paragraph overview of the application's purpose and its core functionality.

## 2. File Structure Overview
**Analyze and describe the provided file tree diagram.** Explain the purpose of the main directories (\`components\`, \`services\`, \`context\`, etc.). After your explanation, embed the provided file tree diagram exactly as it is given.

## 3. Architectural Deep Dive
- **Core Philosophy:** Describe the main architectural patterns.
- **Data Flow:** Explain how data moves through the app.
- **State Management:** Detail the global and local state strategy.

## 4. Component Hierarchy Diagram
**Analyze and describe the component relationships shown in the Mermaid diagram.** Explain how the main components are interconnected. After your explanation, embed the provided Mermaid diagram in a mermaid code block.

## 5. Service Layer Breakdown
Describe each major service file and its key responsibilities.

## 6. Key Data Structures
Explain the most important TypeScript types and interfaces.

---
**PROVIDED DIAGRAMS & PROJECT SOURCE:**

### File Tree Diagram:
${fileTree}

### Component Hierarchy (Mermaid):
\`\`\`mermaid
${componentDiagram}
\`\`\`

### Project Source Code:
${projectContext}
---
`;

    try {
        const apiCall = async () => {
            const ai = getAiClient();
            const response = await ai.models.generateContent({
                model,
                contents: prompt,
            });
            return { resultText: response.text, tokenUsage: mapTokenUsage(response, model) };
        };
        return await withRetries(apiCall);
    } catch (error) {
        logFrontendError(error, ErrorSeverity.High, { context: 'generateProjectTome Gemini API call' });
        throw error;
    }
};

export const analyzeImage = async (
  prompt: string,
  image: { base64Data: string; mimeType: string }
): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
  try {
    const apiCall = async () => {
      const ai = getAiClient();
      const model = 'gemini-2.5-flash';

      const imagePart = {
        inlineData: {
          data: image.base64Data,
          mimeType: image.mimeType,
        },
      };
      
      const enhancedPrompt = `
You are an expert art director and 3D character artist providing a detailed analysis of the attached image.

First, respond directly and thoroughly to the user's request.

Then, if the image contains a character, creature, or object suitable for a 3D model, add the following two sections to the end of your analysis, formatted exactly in markdown:

**8. Technical Considerations (for 3D Artists):**
*   **Topology:** Describe the ideal topology for the subject. Emphasize clean, animation-ready quad topology for smooth deformations during rigging and animation.
*   **UVs:** Detail the necessary UV mapping approach. Specify the need for well-organized, non-overlapping UV maps for all distinct parts of the model (e.g., body, head, hair, clothing).
*   **Texture Maps:** List the required texture maps for a PBR workflow. Include Diffuse/Albedo, Normal, Roughness, and Specular maps. Mention the benefit of Subsurface Scattering (SSS) maps for any organic surfaces like skin.
*   **Rigging:** Outline key considerations for rigging. Mention the importance of designing with clear joint placement and weight painting in mind for effective rigging, including the need for facial blend shapes for expressions if applicable.

**9. Virt-a-Mate Preset (JSON):**
*   **Instructions:** Based on the visual characteristics of the character in the image, generate a complete JSON preset file in the Virt-a-Mate (VAM) format.
*   **Output:** Your output for this section must be a single, well-formed JSON object inside a JSON markdown block. Do not add any explanatory text outside the JSON.
*   **Structure:** The JSON should define the character's appearance and properties, emulating the structure of a VAM preset. Include key sections within the main "storables" array for the "geometry" id: "clothing", "hair", "morphs" (this is critical for face/body shape), "textures" (with placeholder URLs like 'author.pack:/path/to/texture.jpg'), and other relevant "storables" for skin, eyes, and physics.

---
**User's Request:** ${prompt}
      `;

      const textPart = {
        text: enhancedPrompt,
      };

      const response = await ai.models.generateContent({
        model,
        contents: { parts: [imagePart, textPart] },
      });

      return { resultText: response.text, tokenUsage: mapTokenUsage(response, model) };
    };
    return await withRetries(apiCall);
  } catch (error) {
    logFrontendError(error, ErrorSeverity.High, { context: 'analyzeImage Gemini API call' });
    throw error;
  }
};

export const startChat = (history?: { role: string, parts: { text: string }[] }[]): Chat => {
    const ai = getAiClient();
    return ai.chats.create({
        model: 'gemini-2.5-flash',
        history: history
    });
};

export const generateApiDocumentation = async (projectContext: string): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
    const model = 'gemini-3-pro-preview';
    const prompt = `
You are an expert technical writer specializing in API documentation. Your task is to analyze the provided source code and generate a comprehensive API reference document in Markdown format.

Scan the code for API service calls (e.g., using \`fetch\`, or within service files like \`geminiService.ts\`). For each logical group of endpoints, create a section.

For each endpoint (exported function making an external call), document the following:
- **Endpoint:** The function name (e.g., \`performShunt\`).
- **Description:** What does this function do?
- **Parameters/Request Body:** What data does it accept? Describe the schema or arguments.
- **Response:** What does a successful response look like? Describe the return type or schema.
- **Example Usage:** Provide a brief code snippet showing how to call this function.

Structure the entire output as a clean, readable Markdown document. If no API calls are found, state that clearly.

---
**PROJECT SOURCE CODE:**
${projectContext}
---
`;
    try {
        return await generateRawText(prompt, model);
    } catch (error) {
        logFrontendError(error, ErrorSeverity.High, { context: 'generateApiDocumentation Gemini API call' });
        throw error;
    }
};

export const generateQualityReport = async (projectContext: string): Promise<{ resultText: string; tokenUsage: TokenUsage }> => {
    const model = 'gemini-3-pro-preview';
    const prompt = `
You are a senior code reviewer AI with an expert eye for code quality, performance, and best practices in React/TypeScript applications. Your task is to conduct a thorough review of the provided source code and generate a "Code Quality & Refactoring Report".

Analyze the code for:
- **Potential Bugs:** Logical errors, race conditions, null pointer issues.
- **Performance Bottlenecks:** Inefficient loops, unnecessary re-renders, large bundle size contributors.
- **Code Smells & Anti-patterns:** Prop drilling, large components, inconsistent coding styles.
- **Refactoring Opportunities:** Areas where code can be simplified, made more reusable (e.g., custom hooks), or modernized.
- **Security Vulnerabilities:** Basic checks for things like XSS if applicable.

Structure your report in Markdown. For each issue or suggestion, provide:
- **File & Location:** The full file path.
- **Issue/Suggestion:** A clear description of the problem or improvement.
- **Rationale:** Why it's an issue and why the change is recommended.
- **Example (Optional):** A small code snippet showing the "before" and "after".

If the code is of high quality, acknowledge that and highlight a few examples of good practices.

---
**PROJECT SOURCE CODE:**
${projectContext}
---
`;
    try {
        return await generateRawText(prompt, model);
    } catch (error) {
        logFrontendError(error, ErrorSeverity.High, { context: 'generateQualityReport Gemini API call' });
        throw error;
    }
};
