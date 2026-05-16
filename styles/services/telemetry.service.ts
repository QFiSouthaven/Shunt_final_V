// services/telemetry.service.ts
//
// Local-only event service. Used by the rest of the app to:
//   - Record structured interaction events (consumed live via appEventBus —
//     listeners include Oraculum, KPIDashboard, and MiaContext).
//   - Track the current GlobalTelemetryContext (userID / sessionID / current tab)
//     so consumers like TabFooter and useMiaContextTracker can read it.
//
// There is no network. Events are emitted on the bus and discarded; nothing is
// queued, batched, or POSTed. If you ever wire up a real backend, build it as a
// separate listener that subscribes to appEventBus.on('telemetry', ...).

import type { InteractionEvent, GlobalTelemetryContext } from '@/types/telemetry';
import { appEventBus } from '@/lib/eventBus';

export class TelemetryService {
    private globalContext: GlobalTelemetryContext;

    constructor(globalContext: GlobalTelemetryContext) {
        this.globalContext = globalContext;
    }

    public updateGlobalContext(newContext: Partial<GlobalTelemetryContext>): void {
        this.globalContext = { ...this.globalContext, ...newContext };
    }

    public getGlobalContext(): GlobalTelemetryContext {
        return this.globalContext;
    }

    public recordEvent(partialEvent: Omit<InteractionEvent, 'id' | 'timestamp' | 'userID' | 'sessionID'>): void {
        const enrichedEvent: InteractionEvent = {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            ...this.globalContext,
            ...partialEvent,
            contextDetails: {
                ...this.globalContext.contextDetails,
                ...partialEvent.contextDetails,
            },
        };
        appEventBus.emit('telemetry', { type: 'interaction_event', data: enrichedEvent });
    }

    public flushOnUnload(): void {
        // No-op. Live listeners receive events synchronously via appEventBus; nothing to flush.
    }
}
