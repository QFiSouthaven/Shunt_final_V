export type EventLevel = 'info' | 'warn' | 'error';

export interface SystemEvent {
  id: string;
  timestamp: number;
  systemId: string;
  level: EventLevel;
  message: string;
  data?: any;
}

type EventListener = (event: SystemEvent) => void;

class EventBus {
  private listeners: Set<EventListener> = new Set();
  private history: SystemEvent[] = [];

  subscribe(listener: EventListener) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  emit(systemId: string, level: EventLevel, message: string, data?: any) {
    const event: SystemEvent = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      systemId,
      level,
      message,
      data,
    };
    this.history.push(event);
    if (this.history.length > 2000) {
      this.history.shift(); // Keep last 2000
    }
    this.listeners.forEach((listener) => listener(event));
  }

  getHistory() {
    return [...this.history];
  }
}

export const eventBus = new EventBus();
