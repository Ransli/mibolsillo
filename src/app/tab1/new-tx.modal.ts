// src/app/tab1/new-tx.modal.ts
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonSelect, IonSelectOption,
  ModalController, ToastController,
} from '@ionic/angular/standalone';
import {
  ReactiveFormsModule, FormBuilder, Validators,
} from '@angular/forms';
import { WalletService, Category, Loan } from '../core/wallet.service';
import { Observable, firstValueFrom } from 'rxjs';

/** Modo de la transacción */
type TxMode = 'expense' | 'income' | 'loan';

@Component({
  standalone: true,
  selector: 'app-new-tx-modal',
  templateUrl: './new-tx.modal.html',
  styleUrls: ['./new-tx.modal.scss'],
  imports: [CommonModule, ReactiveFormsModule, IonSelect, IonSelectOption],
})
export class NewTxModal implements OnInit {
  private fb        = inject(FormBuilder);
  private wallet    = inject(WalletService);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);

  categories$: Observable<Category[]> = this.wallet.categories$();
  cards$: Observable<any[]>           = this.wallet.cards$();

  // Modo: gasto / ingreso / préstamo
  txMode: TxMode = 'expense';

  // Datos de préstamos (cargados al init)
  loans: Loan[] = [];
  selectedLoan: Loan | null = null;

  dateValue: string = new Date().toISOString().split('T')[0];
  formattedAmount   = '';

  form = this.fb.group({
    type:          this.fb.control<'in'|'out'>('out', { nonNullable: true }),
    amount:        this.fb.control<number|null>(null),
    category:      this.fb.control<string|null>(null),
    note:          this.fb.control<string|null>(null),
    paymentMethod: this.fb.control<'cash'|'card'>('cash', { nonNullable: true }),
    cardId:        this.fb.control<string|null>(null),
    loanId:        this.fb.control<string|null>(null),
  });

  async ngOnInit(): Promise<void> {
    try {
      this.loans = await this.wallet.getAllLoans();
    } catch { /* ignore */ }
  }

  // ── Cambio de modo ────────────────────────────────────────────────────────

  setMode(mode: TxMode): void {
    this.txMode = mode;
    if (mode === 'income') {
      this.form.patchValue({ type: 'in', category: null, loanId: null });
      this.selectedLoan = null;
    } else if (mode === 'expense') {
      this.form.patchValue({ type: 'out', loanId: null });
      this.selectedLoan = null;
    } else if (mode === 'loan') {
      this.form.patchValue({ type: 'out', category: 'Pago Préstamo', loanId: null });
      this.selectedLoan = null;
      this.formattedAmount = '';
      this.form.patchValue({ amount: null });
    }
  }

  // ── Selección de préstamo ─────────────────────────────────────────────────

  onLoanChange(ev: any): void {
    const loanId = ev?.detail?.value as string;
    const loan = this.loans.find(l => l.id === loanId) ?? null;
    this.selectedLoan = loan;
    this.form.patchValue({ loanId: loanId ?? null });

    // Pre-cargar cuota mensual
    if (loan) {
      const amount = loan.monthlyPayment;
      this.form.patchValue({ amount }, { emitEvent: false });
      this.formattedAmount = String(amount);
    }
  }

  // ── Interés / capital del préstamo seleccionado (para mostrar en el form) ──

  get loanMonthlyInterest(): number {
    if (!this.selectedLoan) return 0;
    return Math.round(this.selectedLoan.balance * (this.selectedLoan.interestRate / 100 / 12) * 100) / 100;
  }

  get loanCapitalPaid(): number {
    const paid = Number(this.form.value.amount || 0);
    return Math.max(0, Math.round((paid - this.loanMonthlyInterest) * 100) / 100);
  }

  get loanExtraAbono(): number {
    if (!this.selectedLoan) return 0;
    const paid = Number(this.form.value.amount || 0);
    return Math.max(0, Math.round((paid - this.selectedLoan.monthlyPayment) * 100) / 100);
  }

  get loanNewBalance(): number {
    if (!this.selectedLoan) return 0;
    return Math.max(0, Math.round((this.selectedLoan.balance - this.loanCapitalPaid) * 100) / 100);
  }

  // ── Numpad ────────────────────────────────────────────────────────────────

  press(k: string): void {
    let cur = this.formattedAmount.replace(/[^0-9.]/g, '') || '0';
    if (k === '⌫') {
      cur = cur.length > 1 ? cur.slice(0, -1) : '0';
    } else if (k === '.') {
      if (!cur.includes('.')) cur = cur + '.';
    } else {
      cur = cur === '0' ? k : cur + k;
    }
    const num = parseFloat(cur) || null;
    this.form.patchValue({ amount: num }, { emitEvent: false });
    this.formattedAmount = cur;
  }

  onPaymentChange(ev: any): void {
    const val = ev?.detail?.value as 'cash'|'card';
    if (val) {
      this.form.patchValue({ paymentMethod: val });
      if (val === 'cash') this.form.patchValue({ cardId: null });
    }
  }

  onDateChange(ev: any): void {
    const v = ev.target?.value;
    if (v) this.dateValue = v;
  }

  // ── Validación ────────────────────────────────────────────────────────────

  get canSave(): boolean {
    const v = this.form.value;
    const amount = Number(v.amount ?? 0);
    if (!amount || amount <= 0) return false;

    if (this.txMode === 'loan') {
      return !!v.loanId;
    }
    if (this.txMode === 'expense') {
      if (!v.category || !v.category.trim()) return false;
    }
    if (v.paymentMethod === 'card' && (!v.cardId || !v.cardId.trim())) return false;
    return true;
  }

  // ── Guardar ───────────────────────────────────────────────────────────────

  async save(): Promise<void> {
    if (!this.canSave) {
      const t = await this.toastCtrl.create({ message: '⚠️ Completa todos los campos', duration: 2000, color: 'warning' });
      await t.present();
      return;
    }
    const v = this.form.value;
    const amount = Number(v.amount ?? 0);

    try {
      if (this.txMode === 'loan' && this.selectedLoan) {
        // Pago de préstamo: registrar tx + actualizar saldo
        const interest = this.loanMonthlyInterest;
        const capital  = this.loanCapitalPaid;
        const extra    = this.loanExtraAbono;
        const newBal   = this.loanNewBalance;

        let note = `Pago cuota ${this.selectedLoan.name} · Capital: RD$${capital.toFixed(2)} · Interés: RD$${interest.toFixed(2)}`;
        if (extra > 0) note += ` · Abono extra: RD$${extra.toFixed(2)}`;

        await this.wallet.addTx({
          type:          'out',
          amount,
          category:      'Pago Préstamo',
          paymentMethod: 'cash',
          loanId:        this.selectedLoan.id,
          note,
          createdAt:     new Date(this.dateValue),
        });

        await this.wallet.updateLoan(this.selectedLoan.id!, {
          balance:    newBal,
          paidMonths: (this.selectedLoan.paidMonths || 0) + 1,
        });

      } else {
        // Gasto / ingreso normal
        await this.wallet.addTx({
          type:          (v.type ?? 'out') as 'in'|'out',
          amount,
          category:      this.txMode === 'expense' ? (v.category ?? '') : '',
          paymentMethod: (v.paymentMethod ?? 'cash') as 'cash'|'card',
          cardId:        v.paymentMethod === 'card' ? (v.cardId ?? null) : null,
          note:          v.note ?? null,
          createdAt:     new Date(this.dateValue),
        });
      }

      this.modalCtrl.dismiss({ saved: true });
    } catch (e) {
      console.error('[NewTxModal] save error', e);
      const t = await this.toastCtrl.create({ message: '❌ Error al guardar', duration: 2000, color: 'danger' });
      await t.present();
    }
  }

  fmt(n: number): string {
    return new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  }

  close(): void { this.modalCtrl.dismiss(); }
}
