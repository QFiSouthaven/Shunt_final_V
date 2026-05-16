
// services/localAiService.ts

export interface LocalAiResponse {
    resultText: string;
}

/**
 * Calls a local LLM endpoint (e.g., LM Studio, Ollama) compatible with the OpenAI Chat Completions API structure.
 * @param prompt The user input text.
 * @param endpoint The local API endpoint (e.g., http://localhost:1234/v1/chat/completions).
 * @param model The model identifier (optional, defaults to 'local-model').
 * @returns A promise resolving to the generated text.
 */
export const generateLocalContent = async (prompt: string, endpoint: string, model: string = 'local-model'): Promise<LocalAiResponse> => {
    if (!endpoint) {
        throw new Error('Local AI endpoint is not configured in settings.');
    }

    try {
        // Attempt to verify connectivity before full request (optional, but good for UX)
        // const check = await fetch(endpoint.replace('/chat/completions', '/models'), { method: 'GET' }).catch(() => null);
        
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
                stream: false,
            }),
        });

        if (!response.ok) {
            throw new Error(`Local AI Server responded with status: ${response.status}`);
        }

        const data = await response.json();
        
        // Handle common OpenAI-compatible structures
        const resultText = data.choices?.[0]?.message?.content || data.choices?.[0]?.text || '';

        if (!resultText) {
            throw new Error("Received an empty response from Local AI.");
        }

        return { resultText };

    } catch (error: any) {
        console.error("Local AI Error:", error);
        
        let friendlyMessage = error.message;
        if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
             friendlyMessage = `Could not connect to Local AI at ${endpoint}. Ensure your local server (LM Studio/Ollama) is running and CORS is enabled.`;
        }
        
        throw new Error(friendlyMessage);
    }
};
