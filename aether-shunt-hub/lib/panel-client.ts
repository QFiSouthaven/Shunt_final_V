export async function panelFetch(path: string, init?: RequestInit): Promise<Response> {
  const PANEL_SERVER_URL = process.env.PANEL_SERVER_URL || 'http://localhost:4000';
  return fetch(`${PANEL_SERVER_URL}${path}`, init);
}
