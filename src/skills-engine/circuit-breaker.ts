import { EventEmitter } from 'events';
import { ErrorHandler, ErrorContext } from './error-handler';

// Circuit breaker states
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

// Circuit breaker configuration
export interface CircuitBreakerOptions {
  failureThreshold: number; // Number of failures before opening circuit
  successThreshold: number; // Number of successes before closing circuit
  timeoutMs: number; // Time to wait before attempting half-open
  resetTimeoutMs: number; // Time to wait before resetting completely
  maxFailures: number; // Maximum failures before permanent open
  errorHandler?: ErrorHandler;
}

// Circuit breaker event
export interface CircuitBreakerEvent {
  state: CircuitState;
  previousState: CircuitState;
  failureCount: number;
  successCount: number;
  lastError?: Error;
  timestamp: number;
  reason?: string;
}

// Default circuit breaker configuration
const DEFAULT_CIRCUIT_BREAKER_OPTIONS: CircuitBreakerOptions = {
  failureThreshold: 5,
  successThreshold: 3,
  timeoutMs: 30000, // 30 seconds
  resetTimeoutMs: 60000, // 60 seconds
  maxFailures: 100,
};

/**
 * Circuit breaker pattern implementation for fault tolerance
 */
export class CircuitBreaker extends EventEmitter {
  private state: CircuitState = 'CLOSED';
  private failureCount: number = 0;
  private successCount: number = 0;
  private lastError: Error | null = null;
  private lastStateChange: number = Date.now();
  private halfOpenTimeout: NodeJS.Timeout | null = null;
  private resetTimeout: NodeJS.Timeout | null = null;
  private options: CircuitBreakerOptions;

  constructor(
    private name: string,
    options: Partial<CircuitBreakerOptions> = {}
  ) {
    super();
    this.options = { ...DEFAULT_CIRCUIT_BREAKER_OPTIONS, ...options };
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      throw new Error(`Circuit breaker '${this.name}' is OPEN`);
    }

    if (this.state === 'HALF_OPEN') {
      this.emit('halfOpenAttempt', {
        name: this.name,
        timestamp: Date.now(),
      });
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.successCount++;
    this.lastError = null;

    if (this.state === 'HALF_OPEN') {
      if (this.successCount >= this.options.successThreshold) {
        this.close('Success threshold reached in half-open state');
      }
    }

    this.emit('success', {
      name: this.name,
      state: this.state,
      successCount: this.successCount,
      failureCount: this.failureCount,
      timestamp: Date.now(),
    });
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error): void {
    this.failureCount++;
    this.successCount = 0;
    this.lastError = error;

    // Report error if error handler is available
    if (this.options.errorHandler) {
      const context: ErrorContext = {
        timestamp: Date.now(),
        additionalData: {
          circuitName: this.name,
          state: this.state,
          failureCount: this.failureCount,
        },
      };

      this.options.errorHandler.handleError(
        error,
        'UNKNOWN_ERROR',
        context,
        'error',
        true
      );
    }

    if (this.state === 'CLOSED' && this.failureCount >= this.options.failureThreshold) {
      this.open('Failure threshold reached');
    } else if (this.state === 'HALF_OPEN') {
      this.open('Failure in half-open state');
    }

    // Check for permanent open condition
    if (this.failureCount >= this.options.maxFailures) {
      this.open('Maximum failures reached - circuit permanently open', true);
    }

    this.emit('failure', {
      name: this.name,
      state: this.state,
      error,
      failureCount: this.failureCount,
      successCount: this.successCount,
      timestamp: Date.now(),
    });
  }

  /**
   * Open the circuit breaker
   */
  private open(reason: string, permanent: boolean = false): void {
    if (this.state === 'OPEN') return;

    const previousState = this.state;
    this.state = 'OPEN';
    this.lastStateChange = Date.now();

    // Clear existing timeouts
    this.clearTimeouts();

    if (!permanent) {
      // Schedule transition to half-open state
      this.halfOpenTimeout = setTimeout(() => {
        this.halfOpen('Timeout expired - attempting half-open');
      }, this.options.timeoutMs);

      // Schedule complete reset
      this.resetTimeout = setTimeout(() => {
        this.reset('Reset timeout expired');
      }, this.options.resetTimeoutMs);
    }

    this.emitStateChange(previousState, reason);
  }

  /**
   * Close the circuit breaker
   */
  private close(reason: string): void {
    if (this.state === 'CLOSED') return;

    const previousState = this.state;
    this.state = 'CLOSED';
    this.lastStateChange = Date.now();
    this.resetCounters();
    this.clearTimeouts();

    this.emitStateChange(previousState, reason);
  }

  /**
   * Transition to half-open state
   */
  private halfOpen(reason: string): void {
    if (this.state === 'HALF_OPEN') return;

    const previousState = this.state;
    this.state = 'HALF_OPEN';
    this.lastStateChange = Date.now();
    this.successCount = 0;

    this.emitStateChange(previousState, reason);
  }

  /**
   * Reset circuit breaker completely
   */
  private reset(reason: string): void {
    const previousState = this.state;
    this.state = 'CLOSED';
    this.lastStateChange = Date.now();
    this.resetCounters();
    this.clearTimeouts();

    this.emitStateChange(previousState, reason);
  }

  /**
   * Reset counters
   */
  private resetCounters(): void {
    this.failureCount = 0;
    this.successCount = 0;
    this.lastError = null;
  }

  /**
   * Clear all timeouts
   */
  private clearTimeouts(): void {
    if (this.halfOpenTimeout) {
      clearTimeout(this.halfOpenTimeout);
      this.halfOpenTimeout = null;
    }

    if (this.resetTimeout) {
      clearTimeout(this.resetTimeout);
      this.resetTimeout = null;
    }
  }

  /**
   * Emit state change event
   */
  private emitStateChange(previousState: CircuitState, reason: string): void {
    const event: CircuitBreakerEvent = {
      state: this.state,
      previousState,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastError: this.lastError || undefined,
      timestamp: Date.now(),
      reason,
    };

    this.emit('stateChange', event);
    this.emit(this.state.toLowerCase(), event);
  }

  /**
   * Get current state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get failure count
   */
  getFailureCount(): number {
    return this.failureCount;
  }

  /**
   * Get success count
   */
  getSuccessCount(): number {
    return this.successCount;
  }

  /**
   * Get last error
   */
  getLastError(): Error | null {
    return this.lastError;
  }

  /**
   * Get time since last state change
   */
  getTimeSinceLastStateChange(): number {
    return Date.now() - this.lastStateChange;
  }

  /**
   * Check if circuit is closed
   */
  isClosed(): boolean {
    return this.state === 'CLOSED';
  }

  /**
   * Check if circuit is open
   */
  isOpen(): boolean {
    return this.state === 'OPEN';
  }

  /**
   * Check if circuit is half-open
   */
  isHalfOpen(): boolean {
    return this.state === 'HALF_OPEN';
  }

  /**
   * Get circuit statistics
   */
  getStatistics(): {
    name: string;
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastStateChange: number;
    timeSinceLastChange: number;
    lastError: string | null;
  } {
    return {
      name: this.name,
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastStateChange: this.lastStateChange,
      timeSinceLastChange: this.getTimeSinceLastStateChange(),
      lastError: this.lastError?.message || null,
    };
  }

  /**
   * Manually close the circuit
   */
  manualClose(): void {
    this.close('Manually closed by user');
  }

  /**
   * Manually open the circuit
   */
  manualOpen(): void {
    this.open('Manually opened by user');
  }

  /**
   * Manually reset the circuit
   */
  manualReset(): void {
    this.reset('Manually reset by user');
  }

  /**
   * Dispose of all resources
   */
  dispose(): void {
    this.clearTimeouts();
    this.removeAllListeners();
  }
}

/**
 * Circuit breaker manager for multiple circuits
 */
export class CircuitBreakerManager extends EventEmitter {
  private circuits: Map<string, CircuitBreaker> = new Map();

  /**
   * Get or create circuit breaker
   */
  getCircuit(name: string, options?: Partial<CircuitBreakerOptions>): CircuitBreaker {
    if (!this.circuits.has(name)) {
      const circuit = new CircuitBreaker(name, options);

      // Forward events from individual circuits
      circuit.on('stateChange', (event) => {
        this.emit('circuitStateChange', { name, ...event });
      });

      circuit.on('failure', (event) => {
        this.emit('circuitFailure', { name, ...event });
      });

      circuit.on('success', (event) => {
        this.emit('circuitSuccess', { name, ...event });
      });

      this.circuits.set(name, circuit);
    }

    return this.circuits.get(name)!;
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    circuitName: string,
    operation: () => Promise<T>,
    options?: Partial<CircuitBreakerOptions>
  ): Promise<T> {
    const circuit = this.getCircuit(circuitName, options);
    return circuit.execute(operation);
  }

  /**
   * Get all circuits
   */
  getAllCircuits(): CircuitBreaker[] {
    return Array.from(this.circuits.values());
  }

  /**
   * Get circuit by name
   */
  getCircuitByName(name: string): CircuitBreaker | undefined {
    return this.circuits.get(name);
  }

  /**
   * Remove circuit
   */
  removeCircuit(name: string): boolean {
    const circuit = this.circuits.get(name);
    if (circuit) {
      circuit.dispose();
      return this.circuits.delete(name);
    }
    return false;
  }

  /**
   * Get overall circuit statistics
   */
  getStatistics(): {
    totalCircuits: number;
    closedCircuits: number;
    openCircuits: number;
    halfOpenCircuits: number;
    totalFailures: number;
  } {
    let closed = 0;
    let open = 0;
    let halfOpen = 0;
    let totalFailures = 0;

    for (const circuit of this.circuits.values()) {
      switch (circuit.getState()) {
        case 'CLOSED':
          closed++;
          break;
        case 'OPEN':
          open++;
          break;
        case 'HALF_OPEN':
          halfOpen++;
          break;
      }
      totalFailures += circuit.getFailureCount();
    }

    return {
      totalCircuits: this.circuits.size,
      closedCircuits: closed,
      openCircuits: open,
      halfOpenCircuits: halfOpen,
      totalFailures,
    };
  }

  /**
   * Dispose of all circuits
   */
  dispose(): void {
    for (const circuit of this.circuits.values()) {
      circuit.dispose();
    }
    this.circuits.clear();
    this.removeAllListeners();
  }
}

/**
 * Factory function to create circuit breaker manager
 */
export function createCircuitBreakerManager(): CircuitBreakerManager {
  return new CircuitBreakerManager();
}