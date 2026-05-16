
// context/MailboxContext.tsx
import React, { createContext, useContext, useState, ReactNode, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { MailboxFile } from '@/types';
import { useTelemetry } from './TelemetryContext';

const MAILBOX_STORAGE_KEY = 'ai-shunt-mailbox';

interface MailboxContextType {
  files: MailboxFile[];
  unreadCount: number;
  deliverFiles: (filesToDeliver: { path: string; content: string }[]) => Promise<void>;
  markAsRead: (fileId: string) => void;
  clearMailbox: () => void;
}

const MailboxContext = createContext<MailboxContextType | undefined>(undefined);

const loadFiles = (): MailboxFile[] => {
    try {
        const stored = localStorage.getItem(MAILBOX_STORAGE_KEY);
        return stored ? JSON.parse(stored) : [];
    } catch (error) {
        console.error("Failed to load mailbox files from localStorage:", error);
        return [];
    }
};

export const MailboxProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [files, setFiles] = useState<MailboxFile[]>(loadFiles);
    const { versionControlService } = useTelemetry();

    useEffect(() => {
        try {
            localStorage.setItem(MAILBOX_STORAGE_KEY, JSON.stringify(files));
        } catch (error) {
            console.error("Failed to save mailbox files to localStorage:", error);
        }
    }, [files]);

    const unreadCount = files.filter(f => !f.isRead).length;

    const deliverFiles = useCallback(async (filesToDeliver: { path: string; content: string }[]) => {
        if (!versionControlService) {
            console.error("Version control service not available for mailbox delivery.");
            return;
        }

        const newMailboxFiles: MailboxFile[] = [];
        for (const file of filesToDeliver) {
            const versionRecord = await versionControlService.captureVersion(
                'code_snippet',
                `mailbox_${file.path}_${uuidv4()}`,
                file.content,
                'ai_response',
                `Delivered skill file: ${file.path}`
            );

            if (versionRecord) {
                newMailboxFiles.push({
                    id: uuidv4(),
                    path: file.path,
                    content: file.content,
                    timestamp: new Date().toISOString(),
                    isRead: false,
                    versionId: versionRecord.versionId,
                });
            }
        }

        setFiles(prevFiles => [...newMailboxFiles, ...prevFiles]);
    }, [versionControlService]);

    const markAsRead = useCallback((fileId: string) => {
        setFiles(prevFiles =>
            prevFiles.map(file =>
                file.id === fileId && !file.isRead ? { ...file, isRead: true } : file
            )
        );
    }, []);

    const clearMailbox = useCallback(() => {
        setFiles([]);
    }, []);

    return (
        <MailboxContext.Provider value={{ files, unreadCount, deliverFiles, markAsRead, clearMailbox }}>
            {children}
        </MailboxContext.Provider>
    );
};

export const useMailbox = (): MailboxContextType => {
    const context = useContext(MailboxContext);
    if (!context) {
        throw new Error('useMailbox must be used within a MailboxProvider');
    }
    return context;
};
