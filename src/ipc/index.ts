// Export all IPC types and utilities

export * from '../types/ipc';
export * from './mainHandlers';
export * from './rendererUtilities';
export * from './errorHandling';
export * from './connectionManager';

// Re-export commonly used items for convenience
export { IPCError } from './errorHandling';
export { getConnectionManager, shutdownConnectionManager } from './connectionManager';