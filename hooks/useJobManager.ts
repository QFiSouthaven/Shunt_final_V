
// hooks/useJobManager.ts
import { useState, useCallback, useRef } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Job, JobStatus, JobLog } from '@/types';
import { generateRawText } from '../styles/services/aiService';
import type { ContentPart } from '@/styles/services/aiService';

const sleep = (ms: number) => new Promise(res => setTimeout(res, ms));

export const useJobManager = () => {
    const [jobs, setJobs] = useState<Job[]>([]);
    const [isRunning, setIsRunning] = useState(false);
    const jobsRef = useRef(jobs);
    jobsRef.current = jobs;

    const updateJob = (jobId: string, updates: Partial<Job>) => {
        setJobs(prevJobs => prevJobs.map(job => 
            job.id === jobId ? { ...job, ...updates } : job
        ));
    };

    const addLog = (jobId: string, message: string) => {
        const newLog: JobLog = { timestamp: new Date().toLocaleTimeString(), message };
        setJobs(prevJobs => prevJobs.map(job => 
            job.id === jobId ? { ...job, logs: [...job.logs, newLog] } : job
        ));
    };
    
    const isJobCancelled = (jobId: string): boolean => {
        const job = jobsRef.current.find(j => j.id === jobId);
        return job?.status === 'Cancelled';
    };

    const submitJob = useCallback(async (
        prompt: string,
        image?: { base64Data: string; mimeType: string },
        isGameDev?: boolean
    ) => {
        setIsRunning(true);
        const newJob: Job = {
            id: uuidv4(),
            prompt,
            status: 'Pending',
            logs: [],
            result: null,
            startTime: Date.now(),
            endTime: null,
        };
        setJobs(prev => [newJob, ...prev]);

        // --- Simulation Starts ---
        try {
            addLog(newJob.id, 'Job submitted and waiting in queue...');
            await sleep(1500);

            if (isJobCancelled(newJob.id)) throw new Error('Job cancelled by user.');
            
            updateJob(newJob.id, { status: 'Running' });
            addLog(newJob.id, 'AI worker picked up the job. Preparing to execute...');
            await sleep(1000);

            if (isJobCancelled(newJob.id)) throw new Error('Job cancelled by user.');

            addLog(newJob.id, 'Contacting AI model for analysis...');
            
            let promptContent: string | ContentPart[];
            let textPrompt: string;

            if (isGameDev) {
                textPrompt = `You are an expert game designer and technical artist. Your task is to think through the following request in the context of game development (e.g., for Unity, Unreal Engine, or Godot). Provide a detailed, step-by-step plan that includes code examples, asset considerations, and engine-specific advice where applicable.\n\nREQUEST: "${prompt}"`;
            } else {
                textPrompt = `Based on the following user request, provide a step-by-step plan in markdown.\n\nREQUEST: "${prompt}"`;
            }

            if (image) {
                promptContent = [
                    { text: textPrompt },
                    {
                        inlineData: {
                            data: image.base64Data,
                            mimeType: image.mimeType
                        }
                    }
                ];
            } else {
                promptContent = textPrompt;
            }

            const { resultText } = await generateRawText(promptContent, '');

            if (isJobCancelled(newJob.id)) throw new Error('Job cancelled by user.');

            addLog(newJob.id, 'AI model responded. Finalizing results...');
            await sleep(2000);

            if (isJobCancelled(newJob.id)) throw new Error('Job cancelled by user.');

            updateJob(newJob.id, { status: 'Completed', result: resultText, endTime: Date.now() });
            addLog(newJob.id, 'Job finished successfully.');

        } catch (error) {
            const message = error instanceof Error ? error.message : 'An unknown error occurred.';
            const isCancelled = message.includes('cancelled');
            updateJob(newJob.id, { 
                status: isCancelled ? 'Cancelled' : 'Failed', 
                result: isCancelled ? 'Job execution was cancelled by the user.' : message, 
                endTime: Date.now() 
            });
            addLog(newJob.id, isCancelled ? 'Execution halted by user.' : `Job failed: ${message}`);
        } finally {
            setIsRunning(false);
        }
    }, []);

    const cancelJob = useCallback((jobId: string) => {
        const job = jobs.find(j => j.id === jobId);
        if (job && (job.status === 'Pending' || job.status === 'Running')) {
            updateJob(jobId, { status: 'Cancelled' });
        }
    }, [jobs]);

    return { jobs, submitJob, cancelJob, isRunning };
};
