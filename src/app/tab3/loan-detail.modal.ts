// loan-detail.modal.ts — Modal de detalle de préstamo

import { Component, Input, OnInit, ChangeDetectionStrategy, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, ModalController, ToastController } from '@ionic/angular/standalone';
import { WalletService, Loan, Tx } from '../core/wallet.service';

@Component({
  standalone: true,
  selector: 'app-loan-detail-modal',
  templateUrl: './loan-detail.modal.html',
  styleUrls: ['./loan-detail.modal.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, IonContent],
})
export class LoanDetailModal implements OnInit {
  @Input() loan!: Loan;

  activeTab: 'details' | 'payments' = 'details';

  paymentHistory: Tx[] = [];
  loading = true;

  // Proyección (calculada una sola vez, no en getter)
  projectionRows: Array<{ month: string; capital: number; interest: number; balance: number }> = [];

  // Formulario de pago
  showPayForm = false;
  payRaw = '';
  processing = false;

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private wallet: WalletService,
    private cdr: ChangeDetectorRef,
  ) {}

  async ngOnInit(): Promise<void> {
    this.buildProjection();
    await this.loadHistory();
  }

  // ── Proyección (calculada explícitamente, no como getter) ─────────────────

  buildProjection(): void {
    const rows: Array<{ month: string; capital: number; interest: number; balance: number }> = [];
    const loan = this.loan;
    if (!loan?.balance || loan.balance <= 0) {
      this.projectionRows = rows;
      return;
    }
    const rate = (loan.interestRate || 0) / 100 / 12;
    let bal = loan.balance;
    const mp = loan.monthlyPayment || 0;
    const now = new Date();
    const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    for (let i = 0; i < 6 && bal > 0; i++) {
      const interest = Math.round(bal * rate * 100) / 100;
      const capital  = Math.min(Math.max(Math.round((mp - interest) * 100) / 100, 0), bal);
      bal = Math.max(Math.round((bal - capital) * 100) / 100, 0);
      const m = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      rows.push({ month: `${M[m.getMonth()]} ${m.getFullYear()}`, capital, interest, balance: bal });
    }
    this.projectionRows = rows;
  }

  async loadHistory(): Promise<void> {
    this.loading = true;
    try {
      const all = await this.wallet.getAllTransactions();
      this.paymentHistory = all
        .filter(tx => tx.loanId === this.loan?.id)
        .sort((a, b) => {
          const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return db.getTime() - da.getTime();
        });
    } catch { /* ignore */ }
    this.loading = false;
    this.cdr.markForCheck();
  }

  dismiss(updated = false): void {
    this.modalCtrl.dismiss({ updated });
  }

  // ── Cálculos generales ────────────────────────────────────────────────────

  get loanColor(): string { return this.loan?.color || '#7C3AED'; }

  get paidPct(): number {
    const orig = this.loan?.originalAmount || 0;
    if (!orig) return 0;
    const paid = orig - (this.loan?.balance || 0);
    return Math.min(Math.round((paid / orig) * 100), 100);
  }

  get dashArray(): string {
    const r = 54;
    const circ = 2 * Math.PI * r;
    return `${(this.paidPct / 100) * circ} ${circ}`;
  }

  get daysUntilPayment(): number {
    if (!this.loan?.nextPaymentDate) return 999;
    const d = this.loan.nextPaymentDate?.toDate
      ? this.loan.nextPaymentDate.toDate()
      : new Date(this.loan.nextPaymentDate);
    if (isNaN(d.getTime())) return 999;
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // ── Cálculos del pago ─────────────────────────────────────────────────────

  get monthlyInterest(): number {
    const bal  = this.loan?.balance || 0;
    const rate = this.loan?.interestRate || 0;
    return Math.round(bal * (rate / 100 / 12) * 100) / 100;
  }

  get payAmount(): number {
    return parseFloat(this.payRaw.replace(/,/g, '')) || 0;
  }

  get capitalPaid(): number {
    return Math.max(0, Math.round((this.payAmount - this.monthlyInterest) * 100) / 100);
  }

  get extraAbono(): number {
    return Math.max(0, Math.round((this.payAmount - (this.loan?.monthlyPayment || 0)) * 100) / 100);
  }

  get shortfall(): number {
    return Math.max(0, Math.round(((this.loan?.monthlyPayment || 0) - this.payAmount) * 100) / 100);
  }

  get newBalance(): number {
    return Math.max(0, Math.round(((this.loan?.balance || 0) - this.capitalPaid) * 100) / 100);
  }

  get canPay(): boolean { return this.payAmount > 0.99 && !this.processing; }

  // ── Pago ──────────────────────────────────────────────────────────────────

  openPayForm(): void {
    this.payRaw = String(this.loan?.monthlyPayment || '');
    this.showPayForm = true;
    this.cdr.markForCheck();
  }

  async processPayment(): Promise<void> {
    if (!this.canPay) return;
    this.processing = true;
    this.cdr.markForCheck();

    const paid     = this.payAmount;
    const interest = this.monthlyInterest;
    const capital  = this.capitalPaid;
    const extra    = this.extraAbono;
    const newBal   = this.newBalance;

    let note = `Pago cuota ${this.loan.name} · Capital: RD$${this.fmt(capital)} · Interés: RD$${this.fmt(interest)}`;
    if (extra > 0) note += ` · Abono extra: RD$${this.fmt(extra)}`;

    try {
      await this.wallet.addTx({
        type: 'out', amount: paid,
        category: 'Pago Préstamo', paymentMethod: 'cash',
        loanId: this.loan.id, note,
      });
      await this.wallet.updateLoan(this.loan.id!, {
        balance:    newBal,
        paidMonths: (this.loan.paidMonths || 0) + 1,
      });

      // Actualizar objeto local y recalcular proyección
      this.loan = { ...this.loan, balance: newBal, paidMonths: (this.loan.paidMonths || 0) + 1 };
      this.buildProjection();

      const t = await this.toastCtrl.create({
        message: `✅ Pago de RD$${this.fmt(paid)} registrado`,
        duration: 2500, color: 'success', position: 'top',
      });
      await t.present();

      await this.loadHistory();
      this.showPayForm = false;
      this.payRaw = '';

    } catch {
      const t = await this.toastCtrl.create({
        message: '❌ Error al registrar', duration: 2000, position: 'top',
      });
      await t.present();
    } finally {
      this.processing = false;
      this.cdr.markForCheck();
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  fmt(n: number): string {
    return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n ?? 0);
  }
  fmtDate(val: any): string {
    if (!val) return '—';
    const d = val?.toDate ? val.toDate() : new Date(val);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  fmtShort(val: any): string {
    if (!val) return '—';
    const d = val?.toDate ? val.toDate() : new Date(val);
    if (isNaN(d.getTime())) return '—';
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }

  // trackBy para *ngFor de proyección (evita re-render innecesario)
  trackByMonth(_: number, row: { month: string }): string { return row.month; }

  // trackBy para historial de pagos
  trackByTxId(_: number, tx: Tx): string { return tx.id || String(_); }
}
