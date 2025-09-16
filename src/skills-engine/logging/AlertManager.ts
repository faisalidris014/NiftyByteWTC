import {
  AlertRule,
  AlertEvaluationContext,
  AlertViolation,
  NotificationChannelConfig,
  NotificationPayload,
  AlertSeverity
} from './types';
import { NotificationManager } from './NotificationManager';
import { Logger } from './Logger';

interface TrackedAlert extends AlertViolation {
  cooldownExpiresAt?: number;
}

export class AlertManager {
  private rules: AlertRule[] = [];
  private activeAlerts: TrackedAlert[] = [];
  private notificationManager: NotificationManager;

  constructor(private logger: Logger) {
    this.notificationManager = new NotificationManager(logger);
  }

  setRules(rules: AlertRule[]): void {
    this.rules = rules;
  }

  configureNotifications(channels: NotificationChannelConfig[]): void {
    this.notificationManager.configureChannels(channels);
  }

  evaluate(context: AlertEvaluationContext): AlertViolation[] {
    const violations: AlertViolation[] = [];

    for (const rule of this.rules) {
      const violation = rule.evaluate(context);
      if (!violation) continue;

      const existingAlert = this.activeAlerts.find((alert) => alert.ruleId === rule.id);
      const now = Date.now();

      if (existingAlert && existingAlert.cooldownExpiresAt && existingAlert.cooldownExpiresAt > now) {
        continue; // still cooling down
      }

      const tracked: TrackedAlert = {
        ...violation,
        cooldownExpiresAt: rule.cooldownMinutes ? now + rule.cooldownMinutes * 60 * 1000 : undefined
      };

      this.activeAlerts = this.activeAlerts.filter((alert) => alert.ruleId !== rule.id);
      this.activeAlerts.push(tracked);
      violations.push(violation);

      this.logger.warn('Alert rule violation detected', {
        ruleId: rule.id,
        severity: violation.severity,
        message: violation.message,
        details: violation.details
      });

      void this.notify(violation);
    }

    return violations;
  }

  getActiveAlerts(): TrackedAlert[] {
    const now = Date.now();
    this.activeAlerts = this.activeAlerts.filter((alert) => !alert.cooldownExpiresAt || alert.cooldownExpiresAt > now);
    return [...this.activeAlerts];
  }

  private async notify(violation: AlertViolation): Promise<void> {
    const payload: Omit<NotificationPayload, 'channelId'> = {
      severity: violation.severity,
      message: violation.message,
      timestamp: violation.timestamp,
      details: violation.details
    };

    await this.notificationManager.notify(payload);
  }
}
