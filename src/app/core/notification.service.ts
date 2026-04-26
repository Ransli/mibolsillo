// src/app/core/notification.service.ts
import { Injectable } from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { LocalNotifications, ScheduleOptions } from '@capacitor/local-notifications';

export interface CardReminder {
  cardId: string;
  cardName: string;
  cutoffDate: Date;
  paymentDate: Date;
}

@Injectable({ providedIn: 'root' })
export class NotificationService {
  private isNative = Capacitor.isNativePlatform();

  constructor() {
    this.init();
  }

  private async init(): Promise<void> {
    if (!this.isNative) return;

    // Solicitar permisos
    const permission = await LocalNotifications.requestPermissions();
    console.log('[NotificationService] Permisos:', permission);

    // Escuchar cuando se toca una notificación
    LocalNotifications.addListener('localNotificationActionPerformed', (notification) => {
      console.log('[NotificationService] Notificación tocada:', notification);
    });
  }

  /** Programar notificaciones de corte y pago para una tarjeta */
  async scheduleCardReminders(card: CardReminder): Promise<void> {
    if (!this.isNative) {
      console.log('[NotificationService] No es plataforma nativa, saltando notificaciones');
      return;
    }

    // Cancelar notificaciones anteriores de esta tarjeta
    await this.cancelCardReminders(card.cardId);

    const notifications: ScheduleOptions = { notifications: [] };

    // Calcular fechas de notificación
    const cutoffReminder = this.getDateDaysBefore(card.cutoffDate, 5);
    const paymentReminder = this.getDateDaysBefore(card.paymentDate, 3);

    const now = new Date();

    // Notificación de corte (5 días antes)
    if (cutoffReminder > now) {
      notifications.notifications.push({
        id: this.generateNotificationId(card.cardId, 'cutoff'),
        title: `Corte próximo: ${card.cardName}`,
        body: `La fecha de corte de tu tarjeta ${card.cardName} es en 5 días. Revisa tus gastos.`,
        schedule: { at: cutoffReminder },
        sound: 'default',
        smallIcon: 'ic_stat_icon_config_sample',
        largeIcon: 'ic_launcher',
      });
    }

    // Notificación de pago (3 días antes)
    if (paymentReminder > now) {
      notifications.notifications.push({
        id: this.generateNotificationId(card.cardId, 'payment'),
        title: `Pago próximo: ${card.cardName}`,
        body: `El pago de tu tarjeta ${card.cardName} vence en 3 días. No olvides pagar.`,
        schedule: { at: paymentReminder },
        sound: 'default',
        smallIcon: 'ic_stat_icon_config_sample',
        largeIcon: 'ic_launcher',
      });
    }

    if (notifications.notifications.length > 0) {
      await LocalNotifications.schedule(notifications);
      console.log('[NotificationService] Notificaciones programadas para', card.cardName);
    }
  }

  /** Cancelar notificaciones de una tarjeta */
  async cancelCardReminders(cardId: string): Promise<void> {
    if (!this.isNative) return;

    try {
      await LocalNotifications.cancel({
        notifications: [
          { id: this.generateNotificationId(cardId, 'cutoff') },
          { id: this.generateNotificationId(cardId, 'payment') },
        ],
      });
    } catch (e) {
      // Ignorar si no existen
    }
  }

  /** Reprogramar todas las notificaciones de tarjetas */
  async rescheduleAllCardReminders(cards: CardReminder[]): Promise<void> {
    if (!this.isNative) return;

    // Cancelar todas las notificaciones pendientes
    await LocalNotifications.cancel({ notifications: [] });

    // Reprogramar para cada tarjeta
    for (const card of cards) {
      await this.scheduleCardReminders(card);
    }
  }

  /** Obtener fecha X días antes */
  private getDateDaysBefore(date: Date, days: number): Date {
    const d = new Date(date);
    d.setDate(d.getDate() - days);
    d.setHours(9, 0, 0, 0); // Notificar a las 9:00 AM
    return d;
  }

  /** Generar ID único para notificación */
  private generateNotificationId(cardId: string, type: 'cutoff' | 'payment'): number {
    // Convertir cardId a número usando hash simple
    let hash = 0;
    for (let i = 0; i < cardId.length; i++) {
      hash = ((hash << 5) - hash) + cardId.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash) + (type === 'cutoff' ? 1 : 2);
  }

  /** Verificar si las notificaciones están habilitadas */
  async areNotificationsEnabled(): Promise<boolean> {
    if (!this.isNative) return false;

    const permission = await LocalNotifications.checkPermissions();
    return permission.display === 'granted';
  }

  /** Solicitar permisos de notificaciones */
  async requestPermissions(): Promise<boolean> {
    if (!this.isNative) return false;

    const permission = await LocalNotifications.requestPermissions();
    return permission.display === 'granted';
  }
}
