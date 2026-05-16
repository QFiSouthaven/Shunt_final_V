
// context/MCPContext.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode, useRef } from 'react';
import { MCPConnectionStatus, MCPExtensionAPI } from '@/types/mcp';

interface MCPContextType {
  status: MCPConnectionStatus;
  extensionVersion: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
  extensionApi: MCPExtensionAPI | null;
}

const MCPContext = createContext<MCPContextType | undefined>(undefined);

/**
 * Creates a stateful, event-driven mock of the MCPExtensionAPI.
 * This allows for realistic testing of the connection flow without the real extension.
 */
const createMockMcpApi = (): MCPExtensionAPI => {
    type Listener = (status: MCPConnectionStatus) => void;
    const listeners = new Set<Listener>();
    let status = MCPConnectionStatus.Disconnected;

    const emit = (newStatus: MCPConnectionStatus) => {
        status = newStatus;
        listeners.forEach(cb => cb(status));
    };

    return {
        isReady: true,
        connect: async () => {
            console.log("Mock API: connect() called, simulating delay...");
            await new Promise(res => setTimeout(res, 750));
            console.log("Mock API: connected.");
            emit(MCPConnectionStatus.Connected);
            return { version: '1.0.0-mock' };
        },
        disconnect: async () => {
            console.log("Mock API: disconnect() called.");
            emit(MCPConnectionStatus.Disconnected);
        },
        getConnectionStatus: async () => status,
        on: (eventName, callback) => {
            if (eventName === 'statusChange') listeners.add(callback);
        },
        off: (eventName, callback) => {
            if (eventName === 'statusChange') listeners.delete(callback);
        },
        fs: {
            readFile: async (path: string) => {
                await new Promise(res => setTimeout(res, 500));
                const mockContent = `// This is mock content for ${path} loaded via the mock MCP browser extension.`;
                console.log(`Mock MCP: Reading file from path: ${path}`);
                return Promise.resolve(mockContent);
            },
            saveFile: async (path: string, content: string) => {
                await new Promise(res => setTimeout(res, 500));
                console.log(`Mock MCP: Saving file to path: ${path}`);
                console.log(`--- Start of Content for ${path} ---`);
                console.log(content);
                console.log(`--- End of Content for ${path} ---`);
                alert(`Mock Extension: File '${path}' would be saved. Check the browser console for the output.`);
                return Promise.resolve();
            }
        }
    };
};

export const MCPProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [status, setStatus] = useState<MCPConnectionStatus>(MCPConnectionStatus.NotFound);
  const [extensionVersion, setExtensionVersion] = useState<string | null>(null);
  const [extensionApi, setExtensionApi] = useState<MCPExtensionAPI | null>(null);
  const mockApiRef = useRef<MCPExtensionAPI | null>(null);

  // Effect for detecting the extension or creating a mock
  useEffect(() => {
    const detectExtension = () => {
      if (window.mcpExtension) {
        console.log("MCP Extension found.");
        setExtensionApi(window.mcpExtension);
      } else if (!mockApiRef.current) {
        console.warn("MCP Extension not found. Initializing mock for demonstration.");
        mockApiRef.current = createMockMcpApi();
        setExtensionApi(mockApiRef.current);
      }
    };
    
    detectExtension();
    const timeoutId = setTimeout(detectExtension, 1000); // Check again after 1s for late injection
    
    return () => clearTimeout(timeoutId);
  }, []);

  // Effect for handling listeners and initial status check
  useEffect(() => {
    if (!extensionApi) return;

    const handleStatusChange = (newStatus: MCPConnectionStatus) => {
        setStatus(newStatus);
        if (newStatus !== MCPConnectionStatus.Connected) {
            setExtensionVersion(null);
        }
    };

    extensionApi.on('statusChange', handleStatusChange);
    
    // Check initial status
    extensionApi.getConnectionStatus().then(initialStatus => {
        setStatus(initialStatus);
    }).catch(() => {
        setStatus(MCPConnectionStatus.Disconnected); // Fallback
    });

    return () => {
      extensionApi.off('statusChange', handleStatusChange);
    };
  }, [extensionApi]);

  const connect = useCallback(async () => {
    if (!extensionApi) {
      console.error("MCP extension not available to connect.");
      return;
    }
    setStatus(MCPConnectionStatus.Connecting);
    try {
      const { version } = await extensionApi.connect();
      // The statusChange event will set the final CONNECTED state.
      // We only need to capture the version from the resolved promise.
      setExtensionVersion(version);
    } catch (error) {
      console.error("Failed to connect to MCP extension:", error);
      // The extension should ideally emit a 'Disconnected' status on failure.
      // Set it manually as a fallback.
      setStatus(MCPConnectionStatus.Disconnected);
    }
  }, [extensionApi]);

  const disconnect = useCallback(async () => {
    if (!extensionApi) {
      console.error("MCP extension not available to disconnect.");
      return;
    }
    try {
      // The statusChange event from the extension will handle the state update to DISCONNECTED.
      await extensionApi.disconnect();
    } catch (error) {
      console.error("Failed to disconnect from MCP extension:", error);
      // Fallback in case the event doesn't fire.
      setStatus(MCPConnectionStatus.Disconnected);
    }
  }, [extensionApi]);

  return (
    <MCPContext.Provider value={{ status, extensionVersion, connect, disconnect, extensionApi }}>
      {children}
    </MCPContext.Provider>
  );
};

export const useMCPContext = (): MCPContextType => {
  const context = useContext(MCPContext);
  if (!context) {
    throw new Error('useMCPContext must be used within an MCPProvider');
  }
  return context;
};
