export function parseSseStream(eventData: string) {
  try {
    return JSON.parse(eventData);
  } catch {
    return eventData;
  }
}
