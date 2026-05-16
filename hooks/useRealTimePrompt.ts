
// hooks/useRealTimePrompt.ts
import { useState, useEffect } from 'react';
import { useDebounce } from './useDebounce';
import { generateRealTimeCorrection } from '@/styles/services/aiService';
import { useMiaContext } from '@/styles/services/context/MiaContext';

export const useRealTimePrompt = (inputValue: string, onApply: (text: string) => void) => {
    const { isRTActive } = useMiaContext();
    const [feedback, setFeedback] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const debouncedValue = useDebounce(inputValue, 1500);

    useEffect(() => {
        // Only run if RT mode is on, input is long enough, and not empty
        if (!isRTActive || !debouncedValue.trim() || debouncedValue.length < 10) {
            setFeedback('');
            return;
        }

        let isMounted = true;
        const fetchCorrection = async () => {
            setIsLoading(true);
            try {
                const result = await generateRealTimeCorrection(debouncedValue);
                if (isMounted) setFeedback(result);
            } catch (e) {
                console.error("RT Prompt Error:", e);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };
        fetchCorrection();
        return () => { isMounted = false; };
    }, [debouncedValue, isRTActive]);

    const applyFeedback = () => {
        if (feedback) {
            onApply(feedback);
            setFeedback('');
        }
    };
    
    const discardFeedback = () => {
        setFeedback('');
    };

    return { feedback, isLoading, applyFeedback, discardFeedback, isRTActive };
};
