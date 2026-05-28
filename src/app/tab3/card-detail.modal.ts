// src/app/tab3/card-detail.modal.ts

import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent, ModalController } from '@ionic/angular/standalone';
import { WalletService } from '../core/wallet.service';

export interface CardData {
  id?: string;
  name: string;
  limit: number;
  cutoffDate: any;
  paymentDate: any;
  lastFourDigits?: string;
}

const CAT_EMOJI: Record<string, string> = {
  'Comida': '🍔', 'Transporte': '🚗', 'Hogar': '🏠', 'Servicios': '⚡',
  'Salud': '💊', 'Entretenimiento': '🎬', 'Ropa': '👕', 'Educación': '📚',
  'Deportes': '⚽', 'Viajes': '✈️', 'Mascotas': '🐾', 'Restaurante': '🍽️',
  'Supermercado': '🛒', 'Gasolina': '⛽', 'Farmacia': '💊', 'Salario': '💰',
  'Pago Tarjeta': '💳', 'Otros': '📦',
};

const CARD_GRADIENTS = [
  'linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%)',
  'linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)',
  'linear-gradient(135deg, #064E3B 0%, #065F46 100%)',
  'linear-gradient(135deg, #7F1D1D 0%, #991B1B 100%)',
  'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)',
  'linear-gradient(135deg, #0C4A6E 0%, #075985 100%)',
];

@Component({
  standalone: true,
  selector: 'app-card-detail-modal',
  templateUrl: './card-detail.modal.html',
  styleUrls: ['./card-detail.modal.scss'],
  imports: [CommonModule, IonContent],
})
export class CardDetailModal implements OnInit {
  @Input() card!: CardData;
  @Input() cardIndex = 0;

  activeTab: 'details' | 'states' = 'details';
  periodOffset = 0;
  allTransactions: any[] = [];
  loading = true;

  constructor(
    private modalCtrl: ModalController,
    private wallet: WalletService,
  ) {}

  async ngOnInit(): Promise<void> {
    try {
      const all = await this.wallet.getAllTransactions();
      this.allTransactions = all.filter(tx =>
        tx.cardId === this.card.id && tx.paymentMethod === 'card'
      );
    } catch { /* ignore */ }
    this.loading = false;
  }

  dismiss(): void {
    this.modalCtrl.dismiss();
  }

  // ── Gradient ──────────────────────────────────────────────────────────────
  get gradient(): string {
    return CARD_GRADIENTS[this.cardIndex % CARD_GRADIENTS.length];
  }

  // ── Billing period ────────────────────────────────────────────────────────
  get cutoffDay(): number {
    if (!this.card.cutoffDate) return 1;
    const d = (this.card.cutoffDate as any)?.toDate
      ? (this.card.cutoffDate as any).toDate()
      : new Date(this.card.cutoffDate);
    return d.getDate();
  }

  getBillingPeriod(offset = 0): { start: Date; end: Date } {
    const day = this.cutoffDay;
    const now = new Date(); now.setHours(23, 59, 59, 999);

    // Último corte (≤ hoy)
    let lastCut = new Date(now.getFullYear(), now.getMonth(), day);
    if (lastCut > now) lastCut = new Date(now.getFullYear(), now.getMonth() - 1, day);

    const start = new Date(lastCut.getFullYear(), lastCut.getMonth() + offset,     day);
    const end   = new Date(lastCut.getFullYear(), lastCut.getMonth() + offset + 1, day);
    return { start, end };
  }

  get periodLabel(): string {
    const { start, end } = this.getBillingPeriod(this.periodOffset);
    const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${start.getDate()} ${M[start.getMonth()]} → ${end.getDate()} ${M[end.getMonth()]}`;
  }

  get isCurrentPeriod(): boolean { return this.periodOffset >= 0; }

  prevPeriod(): void { this.periodOffset--; }
  nextPeriod(): void { if (!this.isCurrentPeriod) this.periodOffset++; }

  get periodTx(): any[] {
    const { start, end } = this.getBillingPeriod(this.periodOffset);
    return this.allTransactions
      .filter(tx => {
        const d = tx.createdAt?.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
        return d >= start && d < end;
      })
      .sort((a, b) => {
        const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
        const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
        return db.getTime() - da.getTime();
      });
  }

  get periodSpent(): number {
    return this.periodTx.reduce((s, t) => s + Number(t.amount || 0), 0);
  }

  get available(): number {
    return Math.max(0, (this.card.limit || 0) - this.periodSpent);
  }

  get usagePct(): number {
    if (!this.card.limit) return 0;
    return Math.min((this.periodSpent / this.card.limit) * 100, 100);
  }

  get usageColor(): string {
    if (this.usagePct >= 80) return 'var(--mf-red)';
    if (this.usagePct >= 50) return 'var(--mf-amber)';
    return 'var(--mf-green)';
  }

  get daysUntilPayment(): number {
    if (!this.card.paymentDate) return 999;
    const d = (this.card.paymentDate as any)?.toDate
      ? (this.card.paymentDate as any).toDate()
      : new Date(this.card.paymentDate);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  isInTransit(tx: any): boolean {
    const d = tx.createdAt?.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
    return (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24) <= 3;
  }

  fmtDate(val: any): string {
    const d = val?.toDate ? val.toDate() : new Date(val);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  fmtCardDate(val: any): string {
    if (!val) return '--/--/----';
    return this.fmtDate(val);
  }

  fmtAmount(n: number): string {
    return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  catEmoji(cat: string): string {
    return CAT_EMOJI[cat] || '💰';
  }

  merchantName(tx: any): string {
    return (tx.category || tx.note || 'Compra').toUpperCase();
  }
}
