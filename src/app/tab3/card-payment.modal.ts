// card-payment.modal.ts — Modal de pago de tarjeta de crédito

import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, ModalController, ToastController } from '@ionic/angular/standalone';
import { WalletService } from '../core/wallet.service';

export interface PaymentCardData {
  id?: string;
  name: string;
  limit: number;
  statementBalance?: number;
}

type PayOption = 'statement' | 'minimum' | 'current' | 'custom';

@Component({
  standalone: true,
  selector: 'app-card-payment-modal',
  templateUrl: './card-payment.modal.html',
  styleUrls: ['./card-payment.modal.scss'],
  imports: [CommonModule, FormsModule, IonContent],
})
export class CardPaymentModal implements OnInit {
  @Input() card!: PaymentCardData;
  /** Gastos del período de facturación ACTUAL (después del último corte) */
  @Input() currentSpent = 0;

  selectedOption: PayOption = 'statement';
  customRaw = '';
  processing = false;

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private wallet: WalletService,
  ) {}

  ngOnInit(): void {
    // Si no hay balance al corte pero sí gastos actuales, seleccionar 'current'
    if (!this.statementBalance && this.currentSpent > 0) {
      this.selectedOption = 'current';
    }
  }

  // ── Getters de montos ──────────────────────────────────────────────────────

  get statementBalance(): number {
    return Math.max(0, this.card.statementBalance || 0);
  }

  /** Pago mínimo = 5% del balance al corte, mínimo RD$100 */
  get minimumPayment(): number {
    const pct = this.statementBalance * 0.05;
    return Math.max(pct, 100);
  }

  get currentTotalBalance(): number {
    return this.statementBalance + this.currentSpent;
  }

  get customAmount(): number {
    return parseFloat(this.customRaw.replace(/,/g, '')) || 0;
  }

  get paymentAmount(): number {
    switch (this.selectedOption) {
      case 'statement': return this.statementBalance;
      case 'minimum':   return this.minimumPayment;
      case 'current':   return this.currentTotalBalance;
      case 'custom':    return this.customAmount;
    }
  }

  get canPay(): boolean {
    return this.paymentAmount > 0.99 && !this.processing;
  }

  // ── Opciones ──────────────────────────────────────────────────────────────

  selectOption(opt: PayOption): void {
    this.selectedOption = opt;
  }

  get optionNote(): string {
    switch (this.selectedOption) {
      case 'statement':
        return 'Cancela el balance del último estado de cuenta. Sin cargos por intereses el próximo período.';
      case 'minimum':
        return 'Pago mínimo requerido. El saldo restante genera intereses.';
      case 'current':
        return 'Paga todo lo que debes hasta hoy, incluyendo compras recientes.';
      case 'custom':
        return 'Se aplica primero al balance al corte y luego a las compras recientes.';
    }
  }

  // ── Pago ──────────────────────────────────────────────────────────────────

  async processPayment(): Promise<void> {
    const amount = this.paymentAmount;
    if (amount < 1 || this.processing) return;
    this.processing = true;

    // Calcular nuevo balance al corte después del pago
    const stmt = this.statementBalance;
    let newStatementBalance: number;

    switch (this.selectedOption) {
      case 'statement':
        newStatementBalance = 0;
        break;
      case 'minimum':
        newStatementBalance = Math.max(0, stmt - this.minimumPayment);
        break;
      case 'current':
        newStatementBalance = 0;
        break;
      case 'custom':
        // Se aplica primero al balance al corte
        newStatementBalance = Math.max(0, stmt - amount);
        break;
    }

    const noteLabel = {
      statement: 'Pago total estado de cuenta',
      minimum:   'Pago mínimo',
      current:   'Pago balance a la fecha',
      custom:    'Abono',
    }[this.selectedOption];

    try {
      // Registrar transacción de pago
      await this.wallet.addTx({
        type: 'out',
        amount,
        category: 'Pago Tarjeta',
        paymentMethod: 'cash',
        cardId: null,
        note: `${noteLabel} — ${this.card.name}`,
      });

      // Actualizar balance al corte en Firestore
      if (this.card.id) {
        await this.wallet.updateCard(this.card.id, { statementBalance: newStatementBalance });
      }

      const t = await this.toastCtrl.create({
        message: `✅ Pago de RD$${this.fmt(amount)} procesado`,
        duration: 2500,
        color: 'success',
        position: 'top',
      });
      await t.present();

      this.modalCtrl.dismiss({ paid: amount, newStatementBalance });
    } catch {
      const t = await this.toastCtrl.create({
        message: '❌ Error al procesar el pago',
        duration: 2000,
        position: 'top',
      });
      await t.present();
      this.processing = false;
    }
  }

  dismiss(): void {
    this.modalCtrl.dismiss(null);
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n);
  }
}
