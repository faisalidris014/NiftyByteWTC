import {
  executeSkill,
  addConnectionStateListener,
  initializeConnection,
  initializeIPCListeners,
  cleanupIPCListeners,
  IPCError,
  withRetry,
  getConnectionManager
} from './index';

/**
 * Example: Main Process Setup
 * 
 * In your main process file (main.js/main.ts):
 */
/*
import { app, BrowserWindow } from 'electron';
import { initializeIPCHandlers, registerSkill } from './src/ipc/mainHandlers';

// Initialize IPC handlers
initializeIPCHandlers();

// Register skills
registerSkill('wifi_reset', async (params) => {
  // Implement Wi-Fi reset logic
  return 'Wi-Fi adapter reset successfully';
});

registerSkill('printer_queue_clear', async (params) => {
  // Implement printer queue clearing
  return 'Printer queue cleared successfully';
});
*/

/**
 * Example: Renderer Process Usage
 */
export class TroubleshootingClient {
  private isInitialized = false;

  /**
   * Initialize the IPC connection
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize IPC listeners
      initializeIPCListeners();

      // Initialize connection to main process
      await initializeConnection();

      // Listen for connection state changes
      addConnectionStateListener((message) => {
        console.log('Connection state changed:', message.state, message.reason);
      });

      this.isInitialized = true;
      console.log('IPC connection initialized successfully');
    } catch (error) {
      console.error('Failed to initialize IPC connection:', error);
      throw error;
    }
  }

  /**
   * Execute a troubleshooting skill with retry logic
   */
  async executeTroubleshootingSkill(
    skillId: string,
    params: Record<string, any> = {},
    options: {
      timeoutMs?: number;
      maxRetries?: number;
    } = {}
  ): Promise<string> {
    if (!this.isInitialized) {
      await this.initialize();
    }

    return withRetry(
      async () => {
        const response = await executeSkill(skillId, params, {
          timeoutMs: options.timeoutMs
        });

        if (response.status === 'success') {
          return response.output!;
        } else {
          throw new IPCError(
            response.error?.code || 'UNKNOWN_ERROR',
            response.error?.message || 'Skill execution failed',
            { details: response.error?.details }
          );
        }
      },
      {
        maxAttempts: options.maxRetries,
        shouldRetry: (error) => error instanceof IPCError && error.isRetryable()
      }
    );
  }

  /**
   * Example: Wi-Fi troubleshooting
   */
  async troubleshootWifi(): Promise<void> {
    try {
      const result = await this.executeTroubleshootingSkill('wifi_reset', {}, {
        timeoutMs: 15000,
        maxRetries: 2
      });
      
      console.log('Wi-Fi troubleshooting completed:', result);
    } catch (error) {
      console.error('Wi-Fi troubleshooting failed:', error);
      throw error;
    }
  }

  /**
   * Example: Printer troubleshooting
   */
  async troubleshootPrinter(): Promise<void> {
    try {
      const result = await this.executeTroubleshootingSkill('printer_queue_clear', {
        printerName: 'Office-Printer'
      }, {
        timeoutMs: 10000
      });
      
      console.log('Printer troubleshooting completed:', result);
    } catch (error) {
      console.error('Printer troubleshooting failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    if (this.isInitialized) {
      cleanupIPCListeners();
      this.isInitialized = false;
    }
  }
}

/**
 * Advanced usage with connection manager
 */
export class AdvancedTroubleshootingClient {
  private connectionManager = getConnectionManager();

  constructor() {
    this.setupConnectionMonitoring();
  }

  private setupConnectionMonitoring(): void {
    // Monitor connection state changes
    this.connectionManager.onStateChange((state) => {
      console.log('Connection state:', state);
    });

    // Handle reconnect attempts
    this.connectionManager.onReconnectAttempt(() => {
      console.log('Attempting to reconnect...');
      this.initializeConnection();
    });
  }

  private async initializeConnection(): Promise<void> {
    try {
      await initializeConnection();
      this.connectionManager.connected();
    } catch (error) {
      this.connectionManager.disconnected(error as Error);
    }
  }

  async executeSkillWithConnectionCheck(
    skillId: string,
    params: Record<string, any> = {}
  ): Promise<string> {
    if (!this.connectionManager.isAvailable()) {
      throw new IPCError('CONNECTION_UNAVAILABLE', 'Connection to main process is not available');
    }

    return this.executeTroubleshootingSkill(skillId, params);
  }

  // Implementation similar to TroubleshootingClient
  private async executeTroubleshootingSkill(
    skillId: string,
    params: Record<string, any>
  ): Promise<string> {
    // Implementation would be similar to the previous example
    const response = await executeSkill(skillId, params);
    
    if (response.status === 'success') {
      return response.output!;
    } else {
      throw new IPCError(
        response.error?.code || 'UNKNOWN_ERROR',
        response.error?.message || 'Skill execution failed'
      );
    }
  }
}

// Quick usage example
export async function quickExample() {
  const client = new TroubleshootingClient();
  
  try {
    await client.initialize();
    
    // Execute a skill
    const result = await client.executeTroubleshootingSkill('wifi_reset');
    console.log('Skill executed successfully:', result);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    client.cleanup();
  }
}