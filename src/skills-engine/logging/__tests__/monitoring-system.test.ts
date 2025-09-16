import { MonitoringSystem } from '../MonitoringSystem';
import { Logger } from '../Logger';
import { AlertRule, NotificationChannelConfig, EndpointHealthStatus, QueueHealthStatus } from '../types';

describe('MonitoringSystem alerting', () => {
  const createSystem = (logger?: Logger) => new MonitoringSystem(logger ?? new Logger({ bufferSize: 0 }));

  afterEach(async () => {
    jest.restoreAllMocks();
  });

  it('raises warning when failure rate spikes', async () => {
    const system = createSystem();

    for (let i = 0; i < 6; i++) {
      const id = `exec-${i}`;
      system.startExecution(id, 'wifi-reset');
      system.endExecution(id, false, { code: 'failure', message: 'Test failure' });
    }

    const metrics = system.getDashboardMetrics();
    const alert = metrics.alerts.find((a) => a.id === 'skill-failure-spike');

    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('warning');

    await system.shutdown();
  });

  it('raises critical alert when endpoint is unhealthy', async () => {
    const system = createSystem();
    const endpoint: EndpointHealthStatus = {
      endpointId: 'endpoint-1',
      name: 'Endpoint 1',
      status: 'unhealthy',
      lastHeartbeat: Date.now() - 1000
    };

    system.updateEndpointHealth(endpoint);
    const metrics = system.getDashboardMetrics();
    const alert = metrics.alerts.find((a) => a.id === 'endpoint-unhealthy');

    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('critical');

    await system.shutdown();
  });

  it('triggers queue backlog alert when pending items are high', async () => {
    const system = createSystem();
    const queueStats: QueueHealthStatus = {
      totalItems: 15,
      pending: 12,
      failed: 0,
      retrying: 1,
      oldestItemAge: 40 * 60 * 1000,
      totalSizeBytes: 1024
    };

    system.updateQueueHealth(queueStats);
    const metrics = system.getDashboardMetrics();
    const alert = metrics.alerts.find((a) => a.id === 'queue-backlog');

    expect(alert).toBeDefined();
    expect(alert?.severity).toBe('warning');

    await system.shutdown();
  });

  it('supports custom alert rules and notification channels', async () => {
    const logger = new Logger({ bufferSize: 0 });
    const infoSpy = jest.spyOn(logger as any, 'info');
    const system = createSystem(logger);

    const customRule: AlertRule = {
      id: 'test-rule',
      description: 'Custom rule fires when executions exceed threshold',
      severity: 'info',
      evaluate: ({ monitoringStats }) => {
        if (monitoringStats.totalExecutions >= 1) {
          return {
            ruleId: 'test-rule',
            severity: 'info',
            message: 'Custom rule executed',
            timestamp: Date.now()
          };
        }
        return null;
      }
    };

    const channels: NotificationChannelConfig[] = [
      {
        id: 'console-email',
        type: 'email',
        enabled: true,
        target: 'alerts@example.com',
        minSeverity: 'info'
      }
    ];

    system.configureAlerting({ rules: [customRule], channels });
    const id = 'exec-custom';
    system.startExecution(id, 'wifi-reset');
    system.endExecution(id, true);

    const metrics = system.getDashboardMetrics();
    const alert = metrics.alerts.find((a) => a.id === 'test-rule');

    expect(alert).toBeDefined();
    expect(infoSpy).toHaveBeenCalled();

    await system.shutdown();
  });
});
