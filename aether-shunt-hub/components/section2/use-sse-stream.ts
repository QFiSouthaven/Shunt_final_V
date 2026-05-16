import { useState, useEffect } from "react";

export function useSseStream(url: string) {
  const [messages, setMessages] = useState<any[]>([]);

  useEffect(() => {
    const eventSource = new EventSource(url);
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setMessages((prev) => [data, ...prev]);
      } catch (e) {
        // ignore
      }
    };
    return () => eventSource.close();
  }, [url]);

  return { messages };
}
