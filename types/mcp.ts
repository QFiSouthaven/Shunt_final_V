// types/mcp.ts

export enum MCPConnectionStatus {
  Connected = 'CONNECTED',
  Disconnected = 'DISCONNECTED',
  NotFound = 'NOT_FOUND',
  Connecting = 'CONNECTING',
}

export type MCPStatusUpdateCallback = (status: MCPConnectionStatus) => void;

export interface MCPExtensionAPI {
  isReady: boolean;
  connect: () => Promise<{ version: string }>;
  disconnect: () => Promise<void>;
  getConnectionStatus: () => Promise<MCPConnectionStatus>;
  on: (eventName: 'statusChange', callback: MCPStatusUpdateCallback) => void;
  off: (eventName: 'statusChange', callback: MCPStatusUpdateCallback) => void;
  // Add File System Access API
  fs?: {
    readFile: (path: string) => Promise<string>;
    saveFile: (path: string, content: string) => Promise<void>;
  };
}

// Make it available on the window object
declare global {
  interface Window {
    mcpExtension?: MCPExtensionAPI;
  }
}