// src/app/tab3/tab3.page.ts

import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardContent,
  IonList, IonItem, IonLabel, IonButton, IonInput, IonIcon, IonSelect, IonSelectOption,
  AlertController, ToastController
} from '@ionic/angular/standalone';
import { WalletService } from '../core/wallet.service';
import { NotificationService } from '../core/notification.service';
import { Observable, Subscription } from 'rxjs';

interface Card {
  id?: string;
  name: string;
  limit: number;
  cutoffDate: Date;
  paymentDate: Date;
}

@Component({
  standalone: true,
  selector: 'app-tab3',
  templateUrl: './tab3.page.html',
  styleUrls: ['./tab3.page.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardContent,
    IonList, IonItem, IonLabel, IonButton, IonInput, IonIcon, IonSelect, IonSelectOption
  ],
})
export class Tab3Page implements OnDestroy {
  cardForm: FormGroup;
  cards$: Observable<Card[]>;
  selectedCard?: Card;
  selectedCardTransactions: any[] = [];
  cardTransactions: { [cardId: string]: any[] } = {};
  saving = false;
  private subscription?: Subscription;

  // Formato para el campo de límite
  formattedLimit: string = '';

  constructor(
    private fb: FormBuilder,
    private wallet: WalletService,
    private notifications: NotificationService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {
    console.log('[Tab3Page] constructor');

    this.cardForm = this.fb.group({
      name: ['', [Validators.required, Validators.minLength(3)]],
      limit: [null, [Validators.required, Validators.min(1)]],
      cutoffDate: ['', Validators.required],
      paymentDate: ['', Validators.required]
    });

    this.cards$ = this.wallet.cards$();
  }

  ionViewWillEnter(): void {
    console.log('[Tab3Page] ionViewWillEnter');
    this.loadData();
    // Verificar y actualizar fechas de tarjetas si ya pasaron
    this.wallet.checkAndUpdateCardDates().then(() => {
      this.scheduleAllNotifications();
    });
  }

  /** Programar notificaciones para todas las tarjetas */
  private async scheduleAllNotifications(): Promise<void> {
    const cards = await this.wallet.getAllCards();
    for (const card of cards) {
      if (card.id) {
        const cutoffDate = (card.cutoffDate as any)?.toDate?.() || new Date(card.cutoffDate);
        const paymentDate = (card.paymentDate as any)?.toDate?.() || new Date(card.paymentDate);
        await this.notifications.scheduleCardReminders({
          cardId: card.id,
          cardName: card.name,
          cutoffDate,
          paymentDate,
        });
      }
    }
  }

  ionViewDidEnter(): void {
    console.log('[Tab3Page] ionViewDidEnter');
  }

  ngOnDestroy(): void {
    console.log('[Tab3Page] ngOnDestroy');
    this.subscription?.unsubscribe();
  }

  async loadData(): Promise<void> {
    console.log('[Tab3Page] loadData ejecutado');
    
    try {
      // Cargar todas las transacciones
      const allTransactions = await this.wallet.getAllTransactions();
      
      // Agrupar por tarjeta
      this.cardTransactions = {};
      allTransactions.forEach(tx => {
        if (tx.cardId && tx.paymentMethod === 'card') {
          if (!this.cardTransactions[tx.cardId]) {
            this.cardTransactions[tx.cardId] = [];
          }
          this.cardTransactions[tx.cardId].push(tx);
        }
      });

      // Si hay tarjeta seleccionada, actualizar sus transacciones
      if (this.selectedCard?.id) {
        this.selectedCardTransactions = this.cardTransactions[this.selectedCard.id] || [];
      }
    } catch (error) {
      console.error('[Tab3Page] Error cargando datos:', error);
    }
  }

  async addCard(): Promise<void> {
    if (this.cardForm.invalid || this.saving) return;

    this.saving = true;
    const formValue = this.cardForm.value;
    const cutoffDate = new Date(formValue.cutoffDate);
    const paymentDate = new Date(formValue.paymentDate);

    try {
      await this.wallet.addCard({
        name: formValue.name,
        limit: Number(formValue.limit),
        cutoffDate,
        paymentDate
      });

      const toast = await this.toastCtrl.create({
        message: '✅ Tarjeta agregada exitosamente',
        duration: 2000,
        color: 'success',
        position: 'top'
      });
      await toast.present();

      this.cardForm.reset();
      this.formattedLimit = '';

      // Recargar datos y programar notificaciones
      setTimeout(async () => {
        this.loadData();
        await this.scheduleAllNotifications();
      }, 500);
    } catch (error) {
      console.error('[Tab3Page] Error agregando tarjeta:', error);

      const toast = await this.toastCtrl.create({
        message: '❌ Error al agregar tarjeta',
        duration: 2000,
        color: 'danger',
        position: 'top'
      });
      await toast.present();
    } finally {
      this.saving = false;
    }
  }

  getCardGradient(index: number): string {
    const gradients = [
      'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
      'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
      'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
      'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
      'linear-gradient(135deg, #30cfd0 0%, #330867 100%)',
    ];
    return gradients[index % gradients.length];
  }

  formatCardDate(date: any): string {
    if (!date) return '--/--';
    const d = date.toDate ? date.toDate() : new Date(date);
    const month = (d.getMonth() + 1).toString().padStart(2, '0');
    const day = d.getDate().toString().padStart(2, '0');
    return `${day}/${month}`;
  }

  // Formatear número con separadores de miles
  formatNumber(value: number): string {
    if (!value) return '';
    return new Intl.NumberFormat('es-DO', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    }).format(value);
  }

  // Manejar input del límite con formato
  onLimitInput(event: any): void {
    const input = event.target.value;
    // Remover todo excepto números y punto decimal
    const numericValue = input.replace(/[^\d.]/g, '');

    if (numericValue) {
      const amount = parseFloat(numericValue);
      this.cardForm.patchValue({ limit: amount }, { emitEvent: false });
      this.formattedLimit = this.formatNumber(amount);
    } else {
      this.cardForm.patchValue({ limit: null }, { emitEvent: false });
      this.formattedLimit = '';
    }
  }

  getUsagePercentage(card: Card): number {
    if (!card.id || !card.limit) return 0;
    const spent = this.getCardSpent(card.id);
    return Math.min((spent / card.limit) * 100, 100);
  }

  selectCard(card: Card): void {
    this.selectedCard = card;
    this.selectedCardTransactions = this.cardTransactions[card.id!] || [];
    console.log('[Tab3Page] Tarjeta seleccionada:', card.name);
  }

  onCardChange(): void {
    if (this.selectedCard?.id) {
      this.selectedCardTransactions = this.cardTransactions[this.selectedCard.id] || [];
    }
  }

  getCardSpent(cardId?: string): number {
    if (!cardId) return 0;
    const transactions = this.cardTransactions[cardId] || [];
    return transactions.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0);
  }

  async viewCardStatement(): Promise<void> {
    if (!this.selectedCard) return;

    const spent = this.getCardSpent(this.selectedCard.id);
    const available = this.selectedCard.limit - spent;

    const alert = await this.alertCtrl.create({
      header: `Estado de ${this.selectedCard.name}`,
      message: `
        <strong>Límite:</strong> $${this.selectedCard.limit.toFixed(2)}<br>
        <strong>Consumido:</strong> $${spent.toFixed(2)}<br>
        <strong>Disponible:</strong> $${available.toFixed(2)}<br><br>
        <strong>Corte:</strong> ${this.selectedCard.cutoffDate.toLocaleDateString()}<br>
        <strong>Pago:</strong> ${this.selectedCard.paymentDate.toLocaleDateString()}
      `,
      buttons: ['Cerrar']
    });

    await alert.present();
  }

  async deleteCard(card: Card, event: any): Promise<void> {
    event.stopPropagation();

    const alert = await this.alertCtrl.create({
      header: 'Eliminar tarjeta',
      message: `¿Estás seguro de eliminar la tarjeta "${card.name}"?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            try {
              await this.wallet.deleteCard(card.id!);
              
              const toast = await this.toastCtrl.create({
                message: '✅ Tarjeta eliminada',
                duration: 2000,
                color: 'success',
                position: 'top'
              });
              await toast.present();

              if (this.selectedCard?.id === card.id) {
                this.selectedCard = undefined;
                this.selectedCardTransactions = [];
              }
            } catch (error) {
              console.error('[Tab3Page] Error eliminando tarjeta:', error);
              
              const toast = await this.toastCtrl.create({
                message: '❌ Error al eliminar tarjeta',
                duration: 2000,
                color: 'danger',
                position: 'top'
              });
              await toast.present();
            }
          }
        }
      ]
    });

    await alert.present();
  }
}