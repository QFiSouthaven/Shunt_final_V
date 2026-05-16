
// hooks/useLmStudio.ts
import { useState, useCallback } from 'react';
import { generateLocalContent } from '../styles/services/localAiService';

interface LmStudioResponse {
  resultText: string;
}

export const useLmStudio = () => {
    const [isLmStudioLoading, setIsLoading] = useState(false);
    const [lmStudioError, setLmStudioError] = useState<string | null>(null);

    const callLmStudio = useCallback(async (prompt: string, endpoint: string): Promise<LmStudioResponse> => {
        setIsLoading(true);
        setLmStudioError(null);

        try {
            const result = await generateLocalContent(prompt, endpoint);
            return result;
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred.';
            setLmStudioError(errorMessage);
            throw error;
        } finally {
            setIsLoading(false);
        }
    }, []);

    return { callLmStudio, isLmStudioLoading, lmStudioError };
};
