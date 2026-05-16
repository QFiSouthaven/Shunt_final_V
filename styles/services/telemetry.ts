
// services/telemetry.ts
import { generateUniqueId, UserTelemetryEvent } from '@/types/autonomous';

const TELEMETRY_BATCH_INTERVAL = 3000; // milliseconds
const TELEMETRY_BATCH_SIZE = 5; // Send after 5 events
const TELEMETRY_ENDPOINT = '/api/telemetry/events'; // Assumed backend endpoint

let eventQueue: UserTelemetryEvent[] = [];
let sessionId = generateUniqueId(); // Persistent session ID for the user
let eventSequenceNumber = 0;
let lastEventId: string | undefined;
let isSending = false;

// FIX: Implement the missing processEventQueue function.
/**
 * Processes the event queue, sending batched events to the backend.
 */
const processEventQueue = async () => {
    if (isSending || eventQueue.length === 0) {
        return;
    }
    isSending = true;

    const eventsToSend = [...eventQueue];
    eventQueue = []; // Clear queue immediately

    try {
        const response = await fetch(TELEMETRY_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(eventsToSend),
            keepalive: true, // Useful for sending data before page unload
        });

        if (!response.ok) {
            console.error(`Telemetry: Failed to send ${eventsToSend.length} events. Status: ${response.status}`);
            // Re-queue events on server error for retry
            eventQueue = [...eventsToSend, ...eventQueue];
        } else {
            console.log(`Telemetry: Successfully sent ${eventsToSend.length} events.`);
        }
    } catch (error) {
        console.error('Telemetry: Error sending events:', error);
        // Re-queue events on network failure
        eventQueue = [...eventsToSend, ...eventQueue];
    } finally {
        isSending = false;
    }
};

/**
 * Initializes telemetry, setting up listeners for common events.
 */
export const initializeTelemetry = () => {
  console.log('Telemetry initialized. Session ID:', sessionId);
  // Re-initialize session ID on hard page reload, but persist for soft navigations.
  if (!sessionStorage.getItem('telemetrySessionId')) {
    sessionStorage.setItem('telemetrySessionId', sessionId);
  } else {
    sessionId = sessionStorage.getItem('telemetrySessionId')!;
  }

  setupEventListeners();
  setInterval(processEventQueue, TELEMETRY_BATCH_INTERVAL);
};

/**
 * Captures a raw user event and enriches it before adding to the queue.
 */
// FIX: Renamed 'captureEvent' to 'trackCustomEvent' and exported it to be used across the application.
export const trackCustomEvent = (eventType: string, details?: Partial<Omit<UserTelemetryEvent, 'id' | 'timestamp' | 'sessionId' | 'sequenceNumber' | 'pagePath'>>): UserTelemetryEvent => {
  eventSequenceNumber++;
  const event: UserTelemetryEvent = {
    id: generateUniqueId(),
    timestamp: new Date().toISOString(),
    eventType,
    pagePath: window.location.pathname,
    sessionId,
    userId: localStorage.getItem('userId') || 'anonymous', // Assumes a userId might be stored
    sequenceNumber: eventSequenceNumber,
    previousEventId: lastEventId,
    ...details,
    context: {
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      // Add more global context as needed
      ...details?.context,
    },
  };

  eventQueue.push(event);
  lastEventId = event.id;

  if (eventQueue.length >= TELEMETRY_BATCH_SIZE) {
    processEventQueue();
  }
  return event;
};

/**
 * Sets up global event listeners for common interactions.
 */
const setupEventListeners = () => {
  document.addEventListener('click', (e: MouseEvent) => {
    // FIX: Safely determine the element target. The original e.target could be a text node or other non-element node which doesn't have .getAttribute.
    const target = e.target;
    const elementTarget = target instanceof Element ? target : (target as Node).parentElement;

    if (!elementTarget) {
      return;
    }

    trackCustomEvent('click', {
      elementId: elementTarget.id || undefined,
      elementName: elementTarget.getAttribute('name') || elementTarget.tagName.toLowerCase(),
      elementType: elementTarget.tagName.toLowerCase(),
      value: elementTarget.textContent?.substring(0, 50), // Capture first 50 chars of text content
      coords: { x: e.clientX, y: e.clientY },
    });
  });

  // Debounce scroll events to avoid excessive tracking
  let scrollTimeout: ReturnType<typeof setTimeout>;
  document.addEventListener('scroll', (e: Event) => {
    clearTimeout(scrollTimeout);
    scrollTimeout = setTimeout(() => {
        // FIX: Safely handle scroll events where the target might be the Document object, which lacks element properties.
        const target = e.target;
        let elementId: string | undefined;
        let elementName: string;
        let elementType: string;

        if (target instanceof HTMLElement) {
            elementId = target.id || undefined;
            elementName = target.getAttribute('name') || target.tagName.toLowerCase();
            elementType = target.tagName.toLowerCase();
        } else {
            // This case handles when the event target is the Document
            elementId = undefined;
            elementName = 'document_scroll';
            elementType = 'document';
        }

        trackCustomEvent('scroll', {
            elementId,
            elementName,
            elementType,
            value: `ScrollY: ${window.scrollY}`,
        });
    }, 250);
  }, { passive: true, capture: true }); // Use capture phase and passive for performance

  // Track form input changes (debounced)
  let inputChangeTimeout: ReturnType<typeof setTimeout>;
  document.addEventListener('input', (e: Event) => {
    const target = e.target as HTMLInputElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
      clearTimeout(inputChangeTimeout);
      inputChangeTimeout = setTimeout(() => {
        trackCustomEvent('inputChange', {
          elementId: target.id || undefined,
          elementName: target.name || target.id || target.tagName.toLowerCase(),
          elementType: target.tagName.toLowerCase(),
          value: target.value.substring(0, 100), // Capture first 100 chars
        });
      }, 500); // Debounce input events
    }
  });

  // Track page views for Single Page Applications
  const originalPushState = history.pushState;
  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    // Fix: The `pagePath` is automatically added by `trackCustomEvent`, so it should not be passed in the details object.
    trackCustomEvent('pageView');
  };
  window.addEventListener('popstate', () => {
    // Fix: The `pagePath` is automatically added by `trackCustomEvent`, so it should not be passed in the details object.
    trackCustomEvent('pageView');
  });
  // Initial page view
  // Fix: The `pagePath` is automatically added by `trackCustomEvent`, so it should not be passed in the details object.
  trackCustomEvent('pageView');
};
