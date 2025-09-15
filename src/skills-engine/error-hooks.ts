import { EventEmitter } from 'events';
import { ErrorHandler, ErrorEvent, ErrorContext, ErrorSeverity } from './error-handler';

// Hook types
export type HookType = 'beforeError' | 'afterError' | 'errorTransform' | 'errorFilter' | 'custom';

export type HookPriority = 'low' | 'normal' | 'high' | 'critical';

// Hook configuration
interface HookConfig {
  id: string;
  type: HookType;
  priority: HookPriority;
  enabled: boolean;
  async: boolean;
  timeoutMs?: number;
  description?: string;
}

// Hook function types
export interface BeforeErrorHook {
  (error: Error, context: ErrorContext): Promise<void> | void;
}

export interface AfterErrorHook {
  (errorEvent: ErrorEvent): Promise<void> | void;
}

export interface ErrorTransformHook {
  (error: Error, context: ErrorContext): Promise<Error> | Error;
}

export interface ErrorFilterHook {
  (error: Error, context: ErrorContext): Promise<boolean> | boolean;
}

export interface CustomErrorHook {
  (error: Error | ErrorEvent, context: any): Promise<any> | any;
}

// Hook registration
type HookFunction = BeforeErrorHook | AfterErrorHook | ErrorTransformHook | ErrorFilterHook | CustomErrorHook;

// Hook event
export interface HookEvent {
  hookId: string;
  hookType: HookType;
  success: boolean;
  error?: Error;
  timestamp: number;
  executionTimeMs: number;
}

// Hooks manager configuration
export interface ErrorHooksOptions {
  maxHooks: number;
  hookTimeoutMs: number;
  enableHookChaining: boolean;
  stopOnFirstFailure: boolean;
  errorHandler?: ErrorHandler;
}

// Default hooks configuration
const DEFAULT_HOOKS_OPTIONS: ErrorHooksOptions = {
  maxHooks: 100,
  hookTimeoutMs: 5000, // 5 seconds
  enableHookChaining: true,
  stopOnFirstFailure: false,
};

// Priority weights
const PRIORITY_WEIGHTS: Record<HookPriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

/**
 * Comprehensive error hooks system for custom error handling
 */
export class ErrorHooks extends EventEmitter {
  private hooks: Map<string, { config: HookConfig; handler: HookFunction }> = new Map();
  private hookHistory: HookEvent[] = [];
  private options: ErrorHooksOptions;

  constructor(options: Partial<ErrorHooksOptions> = {}) {
    super();
    this.options = { ...DEFAULT_HOOKS_OPTIONS, ...options };
  }

  /**
   * Register a new error hook
   */
  registerHook(
    type: HookType,
    handler: HookFunction,
    config: Partial<HookConfig> = {}
  ): string {
    const hookId = config.id || this.generateHookId(type);

    if (this.hooks.size >= this.options.maxHooks) {
      throw new Error(`Maximum number of hooks (${this.options.maxHooks}) exceeded`);
    }

    const hookConfig: HookConfig = {
      id: hookId,
      type,
      priority: config.priority || 'normal',
      enabled: config.enabled !== false,
      async: config.async || false,
      timeoutMs: config.timeoutMs,
      description: config.description,
    };

    this.hooks.set(hookId, { config: hookConfig, handler });

    this.emit('hookRegistered', {
      hookId,
      type,
      priority: hookConfig.priority,
      timestamp: Date.now(),
    });

    return hookId;
  }

  /**
   * Execute beforeError hooks
   */
  async executeBeforeErrorHooks(error: Error, context: ErrorContext): Promise<void> {
    await this.executeHooks('beforeError', error, context);
  }

  /**
   * Execute afterError hooks
   */
  async executeAfterErrorHooks(errorEvent: ErrorEvent): Promise<void> {
    await this.executeHooks('afterError', errorEvent);
  }

  /**
   * Execute errorTransform hooks
   */
  async executeErrorTransformHooks(error: Error, context: ErrorContext): Promise<Error> {
    let transformedError = error;
    const hooks = this.getHooksByType('errorTransform');

    for (const { config, handler } of hooks) {
      if (!config.enabled) continue;

      try {
        const result = await this.executeHookWithTimeout(
          config,
          handler as ErrorTransformHook,
          transformedError,
          context
        );

        if (result !== undefined && result !== null) {
          transformedError = result;
        }
      } catch (hookError) {
        this.handleHookError(config, hookError as Error);
        if (this.options.stopOnFirstFailure) break;
      }
    }

    return transformedError;
  }

  /**
   * Execute errorFilter hooks
   */
  async executeErrorFilterHooks(error: Error, context: ErrorContext): Promise<boolean> {
    const hooks = this.getHooksByType('errorFilter');
    let shouldProcess = true;

    for (const { config, handler } of hooks) {
      if (!config.enabled) continue;

      try {
        const result = await this.executeHookWithTimeout(
          config,
          handler as ErrorFilterHook,
          error,
          context
        );

        if (result === false) {
          shouldProcess = false;
          break;
        }
      } catch (hookError) {
        this.handleHookError(config, hookError as Error);
        if (this.options.stopOnFirstFailure) break;
      }
    }

    return shouldProcess;
  }

  /**
   * Execute custom hooks
   */
  async executeCustomHooks(hookType: string, data: any): Promise<any> {
    const hooks = this.getHooksByType('custom').filter(hook =>
      hook.config.description === hookType
    );

    let result = data;

    for (const { config, handler } of hooks) {
      if (!config.enabled) continue;

      try {
        const hookResult = await this.executeHookWithTimeout(
          config,
          handler as CustomErrorHook,
          result
        );

        if (hookResult !== undefined) {
          result = hookResult;
        }
      } catch (hookError) {
        this.handleHookError(config, hookError as Error);
        if (this.options.stopOnFirstFailure) break;
      }
    }

    return result;
  }

  /**
   * Execute hooks of specific type
   */
  private async executeHooks(type: HookType, data: any, context?: any): Promise<void> {
    const hooks = this.getHooksByType(type);

    for (const { config, handler } of hooks) {
      if (!config.enabled) continue;

      try {
        await this.executeHookWithTimeout(config, handler, data, context);
      } catch (hookError) {
        this.handleHookError(config, hookError as Error);
        if (this.options.stopOnFirstFailure) break;
      }
    }
  }

  /**
   * Execute hook with timeout protection
   */
  private async executeHookWithTimeout(
    config: HookConfig,
    handler: HookFunction,
    data: any,
    context?: any
  ): Promise<any> {
    const timeoutMs = config.timeoutMs || this.options.hookTimeoutMs;
    const startTime = Date.now();

    if (config.async && timeoutMs > 0) {
      return Promise.race([
        handler(data, context),
        new Promise<any>((_, reject) => {
          setTimeout(() => reject(new Error(`Hook timeout after ${timeoutMs}ms`)), timeoutMs);
        })
      ]);
    }

    return handler(data, context);
  }

  /**
   * Handle hook execution error
   */
  private handleHookError(config: HookConfig, error: Error): void {
    const hookEvent: HookEvent = {
      hookId: config.id,
      hookType: config.type,
      success: false,
      error,
      timestamp: Date.now(),
      executionTimeMs: 0, // Would be populated from execution context
    };

    this.hookHistory.push(hookEvent);
    this.emit('hookError', hookEvent);

    // Log hook error
    if (this.options.errorHandler) {
      const context: ErrorContext = {
        timestamp: Date.now(),
        additionalData: {
          hookId: config.id,
          hookType: config.type,
          hookPriority: config.priority,
        },
      };

      this.options.errorHandler.handleError(
        error,
        'HOOK_EXECUTION_FAILED',
        context,
        'warning',
        true
      );
    }
  }

  /**
   * Record successful hook execution
   */
  private recordHookSuccess(config: HookConfig, executionTimeMs: number): void {
    const hookEvent: HookEvent = {
      hookId: config.id,
      hookType: config.type,
      success: true,
      timestamp: Date.now(),
      executionTimeMs,
    };

    this.hookHistory.push(hookEvent);
    this.emit('hookSuccess', hookEvent);
  }

  /**
   * Get hooks by type, sorted by priority
   */
  private getHooksByType(type: HookType): Array<{ config: HookConfig; handler: HookFunction }> {
    const hooks = Array.from(this.hooks.values())
      .filter(({ config }) => config.type === type && config.enabled)
      .sort((a, b) => PRIORITY_WEIGHTS[b.config.priority] - PRIORITY_WEIGHTS[a.config.priority]);

    return hooks;
  }

  /**
   * Generate unique hook ID
   */
  private generateHookId(type: HookType): string {
    return `hook_${type}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Enable/disable a hook
   */
  setHookEnabled(hookId: string, enabled: boolean): boolean {
    const hook = this.hooks.get(hookId);
    if (hook) {
      hook.config.enabled = enabled;
      this.emit('hookEnabledChanged', { hookId, enabled, timestamp: Date.now() });
      return true;
    }
    return false;
  }

  /**
   * Update hook priority
   */
  setHookPriority(hookId: string, priority: HookPriority): boolean {
    const hook = this.hooks.get(hookId);
    if (hook) {
      hook.config.priority = priority;
      this.emit('hookPriorityChanged', { hookId, priority, timestamp: Date.now() });
      return true;
    }
    return false;
  }

  /**
   * Remove a hook
   */
  removeHook(hookId: string): boolean {
    const existed = this.hooks.delete(hookId);
    if (existed) {
      this.emit('hookRemoved', { hookId, timestamp: Date.now() });
    }
    return existed;
  }

  /**
   * Get all hooks
   */
  getAllHooks(): HookConfig[] {
    return Array.from(this.hooks.values()).map(({ config }) => config);
  }

  /**
   * Get hook configurations by type
   */
  getHookConfigsByType(type: HookType): HookConfig[] {
    return Array.from(this.hooks.values())
      .filter(({ config }) => config.type === type)
      .map(({ config }) => config);
  }

  /**
   * Get hook by ID
   */
  getHookById(hookId: string): HookConfig | undefined {
    return this.hooks.get(hookId)?.config;
  }

  /**
   * Get hook statistics
   */
  getHookStatistics(): {
    totalHooks: number;
    hooksByType: Record<HookType, number>;
    hooksByPriority: Record<HookPriority, number>;
    enabledHooks: number;
    disabledHooks: number;
    totalExecutions: number;
    successfulExecutions: number;
    failedExecutions: number;
    executionSuccessRate: number;
  } {
    const hooksByType: Record<HookType, number> = {
      custom: 0,
      beforeError: 0,
      afterError: 0,
      errorTransform: 0,
      errorFilter: 0
    };
    const hooksByPriority: Record<HookPriority, number> = {
      low: 0,
      normal: 0,
      high: 0,
      critical: 0,
    };

    let enabledHooks = 0;
    let disabledHooks = 0;
    let successfulExecutions = 0;
    let failedExecutions = 0;

    for (const { config } of this.hooks.values()) {
      hooksByType[config.type] = (hooksByType[config.type] || 0) + 1;
      hooksByPriority[config.priority] = (hooksByPriority[config.priority] || 0) + 1;

      if (config.enabled) {
        enabledHooks++;
      } else {
        disabledHooks++;
      }
    }

    for (const event of this.hookHistory) {
      if (event.success) {
        successfulExecutions++;
      } else {
        failedExecutions++;
      }
    }

    const totalExecutions = this.hookHistory.length;
    const executionSuccessRate = totalExecutions > 0 ? (successfulExecutions / totalExecutions) * 100 : 0;

    return {
      totalHooks: this.hooks.size,
      hooksByType,
      hooksByPriority,
      enabledHooks,
      disabledHooks,
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      executionSuccessRate,
    };
  }

  /**
   * Get recent hook events
   */
  getRecentHookEvents(limit: number = 50): HookEvent[] {
    return this.hookHistory.slice(-limit);
  }

  /**
   * Clear hook history
   */
  clearHookHistory(): void {
    this.hookHistory = [];
    this.emit('hookHistoryCleared', { timestamp: Date.now() });
  }

  /**
   * Set hooks options
   */
  setOptions(options: Partial<ErrorHooksOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current options
   */
  getOptions(): ErrorHooksOptions {
    return { ...this.options };
  }

  /**
   * Dispose of all hooks
   */
  dispose(): void {
    this.hooks.clear();
    this.hookHistory = [];
    this.removeAllListeners();
  }
}

/**
 * Factory function to create error hooks manager
 */
export function createErrorHooks(options?: Partial<ErrorHooksOptions>): ErrorHooks {
  return new ErrorHooks(options);
}