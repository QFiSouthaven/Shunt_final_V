// lib/eventBus.ts
import { MiaAlert } from '../types';

type Listener<T> = (payload: T) => void;

class EventBus<E extends { [key: string]: any }> {
  private listeners: { [K in keyof E]?: Listener<E[K]>[] } = {};

  on<K extends keyof E>(event: K, listener: Listener<E[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event]!.push(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof E>(event: K, listener: Listener<E[K]>): void {
    if (!this.listeners[event]) return;
    this.listeners[event] = this.listeners[event]!.filter(l => l !== listener);
  }

  emit<K extends keyof E>(event: K, payload: E[K]): void {
    if (!this.listeners[event]) return;
    this.listeners[event]!.forEach(l => l(payload));
  }
}

// Define all possible application-wide events and their payload types
interface AppEvents {
  'mia-alert': MiaAlert;
  'telemetry': { type: string; data: Record<string, any> };
  'ai-inflight-changed': { count: number };
}

// Export a singleton instance for global use
export const appEventBus = new EventBus<AppEvents>();