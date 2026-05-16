
// services/versionControl.service.ts

// Fix: TelemetryService is not in types, so it's removed from this import.
import { VersionRecord, VersionContentType, InteractionEvent } from '@/types/telemetry';
import { TelemetryService } from './telemetry.service';
import { v4 as uuidv4 } from 'uuid';
import { createTwoFilesPatch, diffLines } from 'diff';


/**
 * Manages the version history for various types of content within the application.
 * It integrates with the TelemetryService to record versioning events.
 */
export class VersionControlService {
    private telemetryService: TelemetryService;
    private storageKeyPrefix = 'ai-shunt-version-'; // Prefix for localStorage keys
    private maxVersionsPerContent = 20; // Limit the number of versions to prevent excessive storage

    constructor(telemetryService: TelemetryService) {
        this.telemetryService = telemetryService;
        console.log('VersionControlService initialized.');
    }

    /**
     * Captures a new version of content, stores it, and records a telemetry event.
     * @param contentType The type of content being versioned (e.g., 'development_plan', 'code_snippet').
     * @param contentRef A unique reference for this content stream (e.g., 'weaver_plan_output', 'shunt_code_output_file_xyz.ts').
     * @param newContent The actual content string.
     * @param eventType The telemetry event type that triggered this version capture.
     * @param summary A human-readable summary of the changes or reason for the new version.
     * @param metadata Optional metadata to attach to the version record.
     * @returns The created VersionRecord.
     */
    public async captureVersion(
        contentType: VersionContentType,
        contentRef: string,
        newContent: string,
        eventType: InteractionEvent['eventType'], // E.g., 'ai_response', 'user_action'
        summary: string,
        metadata?: Record<string, any>
    ): Promise<VersionRecord | null> {
        const currentVersions = this.getVersions(contentRef);
        const previousContent = currentVersions.length > 0 ? this.getVersionContent(currentVersions[0].versionId) : null;

        let diffString: string | undefined;
        if (previousContent !== null) {
            diffString = createTwoFilesPatch(
                `Version ${currentVersions.length}`,
                `Version ${currentVersions.length + 1}`,
                previousContent,
                newContent,
                'Previous Content',
                'New Content',
                { context: 3 }
            );
        }

        const versionId = uuidv4();
        const timestamp = new Date().toISOString();
        const globalContext = this.telemetryService.getGlobalContext();
        const committerId = globalContext?.userID || 'unknown';

        const newVersionRecord: VersionRecord = {
            versionId,
            timestamp,
            committerId,
            eventType,
            contentType,
            contentRef,
            summary,
            diff: diffString,
            metadata: {
                ...metadata,
                previousVersionId: currentVersions.length > 0 ? currentVersions[0].versionId : undefined,
            },
        };

        // Store the content itself
        this.saveVersionContent(versionId, newContent);

        // Add to the list of versions for this contentRef
        let updatedVersions = [newVersionRecord, ...currentVersions];
        
        // Clean up old versions
        if (updatedVersions.length > this.maxVersionsPerContent) {
            const versionsToKeep = updatedVersions.slice(0, this.maxVersionsPerContent);
            const versionsToRemove = updatedVersions.slice(this.maxVersionsPerContent);
            for(const oldVersion of versionsToRemove) {
                try {
                    localStorage.removeItem(`${this.storageKeyPrefix}content-${oldVersion.versionId}`);
                } catch (e) {
                    console.error(`VersionControlService: Failed to remove old version content ${oldVersion.versionId}.`, e);
                }
            }
            updatedVersions = versionsToKeep;
        }

        this.storeVersions(contentRef, updatedVersions);

        this.telemetryService.recordEvent({
            eventType: 'system_action',
            interactionType: 'version_captured',
            tab: globalContext?.tab || 'unknown',
            customData: {
                versionId: newVersionRecord.versionId,
                contentRef: newVersionRecord.contentRef,
                contentType: newVersionRecord.contentType,
                summary: newVersionRecord.summary,
                previousVersionId: newVersionRecord.metadata?.previousVersionId,
            },
            outcome: 'success',
        });

        console.log(`VersionControlService: Captured new version for '${contentRef}' (ID: ${versionId}).`);
        return newVersionRecord;
    }

    /**
     * Retrieves all version records for a given content reference, ordered newest first.
     */
    public getVersions(contentRef: string): VersionRecord[] {
        try {
            const stored = localStorage.getItem(`${this.storageKeyPrefix}records-${contentRef}`);
            return stored ? JSON.parse(stored) : [];
        } catch (e) {
            console.error(`VersionControlService: Failed to get or parse versions for ${contentRef}.`, e);
            return [];
        }
    }

    /**
     * Retrieves all version records from across the entire application.
     * @returns A single array of all version records, sorted by timestamp (newest first).
     */
    public getAllVersions(): VersionRecord[] {
        const allRecords: VersionRecord[] = [];
        const recordKeyPrefix = `${this.storageKeyPrefix}records-`;

        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && key.startsWith(recordKeyPrefix)) {
                try {
                    const records: VersionRecord[] = JSON.parse(localStorage.getItem(key) || '[]');
                    allRecords.push(...records);
                } catch (e) {
                    console.error(`Error parsing version records from localStorage key: ${key}`, e);
                }
            }
        }

        // Sort all records by timestamp in descending order (newest first)
        allRecords.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

        return allRecords;
    }


    /**
     * Retrieves the content for a specific version ID.
     */
    public getVersionContent(versionId: string): string | null {
        try {
            return localStorage.getItem(`${this.storageKeyPrefix}content-${versionId}`);
        } catch (e) {
            console.error(`VersionControlService: Failed to get content for version ${versionId}.`, e);
            return null;
        }
    }

    /**
     * Reverts content to a specific version. This provides the content for the UI to update state.
     */
    public revertToVersion(versionId: string): string | null {
        const content = this.getVersionContent(versionId);
        if (content) {
            const versions = this.getVersionsByVersionId(versionId);
            const versionRecord = versions.find(v => v.versionId === versionId);
            const globalContext = this.telemetryService.getGlobalContext();

            this.telemetryService.recordEvent({
                eventType: 'user_action',
                interactionType: 'revert_to_version',
                tab: globalContext?.tab || 'unknown',
                customData: {
                    versionId,
                    contentRef: versionRecord?.contentRef,
                    contentType: versionRecord?.contentType,
                },
                outcome: 'success',
            });
            console.log(`VersionControlService: Content reverted to version ID: ${versionId}.`);
            return content;
        }
        console.warn(`VersionControlService: Attempted to revert to non-existent version ID: ${versionId}.`);
        return null;
    }

    private saveVersionContent(versionId: string, content: string): void {
        try {
            localStorage.setItem(`${this.storageKeyPrefix}content-${versionId}`, content);
        } catch (e) {
            console.error(`VersionControlService: Failed to save content for version ${versionId}. Storage may be full.`, e);
        }
    }

    private storeVersions(contentRef: string, versions: VersionRecord[]): void {
        try {
            localStorage.setItem(`${this.storageKeyPrefix}records-${contentRef}`, JSON.stringify(versions));
        } catch (e) {
            console.error(`VersionControlService: Failed to store version records for ${contentRef}. Storage may be full.`, e);
        }
    }

    private getVersionsByVersionId(versionId: string): VersionRecord[] {
        const allKeys = Object.keys(localStorage);
        for (const key of allKeys) {
            if (key.startsWith(`${this.storageKeyPrefix}records-`)) {
                try {
                    const versions: VersionRecord[] = JSON.parse(localStorage.getItem(key) || '[]');
                    if (versions.some((v: VersionRecord) => v.versionId === versionId)) {
                        return versions;
                    }
                } catch(e) {
                    console.error(`Error parsing version records from key: ${key}`, e);
                }
            }
        }
        return [];
    }

    /**
     * Generates a semantic diff string between two content strings using a library.
     */
    public generateDiff(oldContent: string, newContent: string): string {
        if (oldContent === newContent) {
            return 'No changes.';
        }

        const changes = diffLines(oldContent, newContent);
        let diffText = '';
        changes.forEach(part => {
            const prefix = part.added ? '+' : part.removed ? '-' : ' ';
            const lines = part.value.split('\n').filter(line => line.length > 0);
            for(const line of lines) {
                diffText += `${prefix} ${line}\n`;
            }
        });
        return diffText.trim();
    }
}
