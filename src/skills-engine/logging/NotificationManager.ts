import { NotificationChannelConfig, NotificationPayload, AlertSeverity, NotificationChannelType } from './types';
import { Logger } from './Logger';

interface DeliveryResult {
  success: boolean;
  error?: string;
}

export class NotificationManager {
  private channels: NotificationChannelConfig[] = [];

  constructor(private logger: Logger) {}

  configureChannels(channels: NotificationChannelConfig[]): void {
    this.channels = channels.filter((channel) => channel.enabled);
  }

  async notify(payload: Omit<NotificationPayload, 'channelId'>): Promise<void> {
    const eligibleChannels = this.channels.filter((channel) =>
      this.shouldNotify(channel, payload.severity)
    );

    if (!eligibleChannels.length) {
      return;
    }

    for (const channel of eligibleChannels) {
      try {
        const channelPayload: NotificationPayload = {
          ...payload,
          channelId: channel.id
        };
        const result = await this.deliver(channel, channelPayload);
        if (!result.success) {
          this.logger.warn('Notification delivery failed', { channel, error: result.error });
        }
      } catch (error) {
        this.logger.error('Notification delivery threw an error', error as Error, { channelId: channel.id });
      }
    }
  }

  private shouldNotify(channel: NotificationChannelConfig, severity: AlertSeverity): boolean {
    const severityRank: Record<AlertSeverity, number> = {
      info: 1,
      warning: 2,
      critical: 3
    };

    return severityRank[severity] >= severityRank[channel.minSeverity];
  }

  private async deliver(channel: NotificationChannelConfig, payload: NotificationPayload): Promise<DeliveryResult> {
    switch (channel.type) {
      case 'email':
        return this.deliverEmail(channel, payload);
      case 'slack':
      case 'teams':
      case 'webhook':
        return this.deliverWebhook(channel, payload);
      default:
        return { success: false, error: `Unsupported channel type: ${channel.type}` };
    }
  }

  private async deliverEmail(channel: NotificationChannelConfig, payload: NotificationPayload): Promise<DeliveryResult> {
    // Email delivery is simulated—integration points can be filled later.
    this.logger.info('Simulated email notification', {
      channelId: channel.id,
      to: channel.target,
      subject: `[${payload.severity.toUpperCase()}] Windows Troubleshooting Companion Alert`,
      payload
    });
    return { success: true };
  }

  private async deliverWebhook(channel: NotificationChannelConfig, payload: NotificationPayload): Promise<DeliveryResult> {
    // Webhook delivery is simulated and logged for audit purposes.
    this.logger.info('Simulated webhook notification', {
      channelId: channel.id,
      endpoint: channel.target,
      payload
    });
    return { success: true };
  }
}
