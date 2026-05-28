// loan-detail.modal.ts — Modal de detalle de préstamo

import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IonContent, ModalController, ToastController } from '@ionic/angular/standalone';
import { WalletService, Loan, Tx } from '../core/wallet.service';

@Component({
  standalone: true,
  selector: 'app-loan-detail-modal',
  templateUrl: './loan-detail.modal.html',
  styleUrls: ['./loan-detail.modal.scss'],
  imports: [CommonModule, FormsModule, IonContent],
})
export class LoanDetailModal implements OnInit {
  @Input() loan!: Loan;

  activeTab: 'details' | 'payments' = 'details';

  paymentHistory: Tx[] = [];
  loading = true;

  // Formulario de pago
  showPayForm = false;
  payRaw = '';
  processing = false;

  constructor(
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private wallet: WalletService,
  ) {}

  async ngOnInit(): Promise<void> {
    await this.loadHistory();
  }

  async loadHistory(): Promise<void> {
    this.loading = true;
    try {
      const all = await this.wallet.getAllTransactions();
      this.paymentHistory = all
        .filter(tx => tx.loanId === this.loan.id)
        .sort((a, b) => {
          const da = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const db = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return db.getTime() - da.getTime();
        });
    } catch { /* ignore */ }
    this.loading = false;
  }

  dismiss(updated = false): void {
    this.modalCtrl.dismiss({ updated });
  }

  // ── Cálculos generales ────────────────────────────────────────────────────

  get loanColor(): string { return this.loan.color || '#7C3AED'; }

  get paidPct(): number {
    if (!this.loan.originalAmount) return 0;
    const paid = this.loan.originalAmount - this.loan.balance;
    return Math.min(Math.round((paid / this.loan.originalAmount) * 100), 100);
  }

  get dashArray(): string {
    const r = 54;
    const circ = 2 * Math.PI * r;
    return `${(this.paidPct / 100) * circ} ${circ}`;
  }

  get daysUntilPayment(): number {
    if (!this.loan.nextPaymentDate) return 999;
    const d = this.loan.nextPaymentDate?.toDate
      ? this.loan.nextPaymentDate.toDate()
      : new Date(this.loan.nextPaymentDate);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  // ── Cálculos del pago ─────────────────────────────────────────────────────

  get monthlyInterest(): number {
    return Math.round(this.loan.balance * (this.loan.interestRate / 100 / 12) * 100) / 100;
  }

  get payAmount(): number {
    return parseFloat(this.payRaw.replace(/,/g, '')) || 0;
  }

  get capitalPaid(): number {
    return Math.max(0, Math.round((this.payAmount - this.monthlyInterest) * 100) / 100);
  }

  get extraAbono(): number {
    return Math.max(0, Math.round((this.payAmount - this.loan.monthlyPayment) * 100) / 100);
  }

  get shortfall(): number {
    return Math.max(0, Math.round((this.loan.monthlyPayment - this.payAmount) * 100) / 100);
  }

  get newBalance(): number {
    return Math.max(0, Math.round((this.loan.balance - this.capitalPaid) * 100) / 100);
  }

  get canPay(): boolean { return this.payAmount > 0.99 && !this.processing; }

  // ── Proyección ────────────────────────────────────────────────────────────

  get projection(): Array<{ month: string; capital: number; interest: number; balance: number }> {
    const rows: any[] = [];
    const rate = this.loan.interestRate / 100 / 12;
    let bal = this.loan.balance;
    const now = new Date();
    const M = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    for (let i = 0; i < 6 && bal > 0; i++) {
      const interest = Math.round(bal * rate * 100) / 100;
      const capital  = Math.min(Math.round((this.loan.monthlyPayment - interest) * 100) / 100, bal);
      bal = Math.max(Math.round((bal - capital) * 100) / 100, 0);
      const m = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      rows.push({ month: `${M[m.getMonth()]} ${m.getFullYear()}`, capital, interest, balance: bal });
    }
    return rows;
  }

  // ── Pago ──────────────────────────────────────────────────────────────────

  openPayForm(): void {
    this.payRaw = String(this.loan.monthlyPayment);
    this.showPayForm = true;
  }

  async processPayment(): Promise<void> {
    if (!this.canPay) return;
    this.processing = true;

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

      // Actualizar objeto local
      this.loan = { ...this.loan, balance: newBal, paidMonths: (this.loan.paidMonths || 0) + 1 };

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
    } finally { this.processing = false; }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  fmt(n: number): string {
    return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }
  fmtDate(val: any): string {
    if (!val) return '—';
    const d = val?.toDate ? val.toDate() : new Date(val);
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  fmtShort(val: any): string {
    if (!val) return '—';
    const d = val?.toDate ? val.toDate() : new Date(val);
    return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
  }
}
