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
import { WalletService, Category } from '../core/wallet.service';
import { Observable } from 'rxjs';

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

  dateValue: string = new Date().toISOString().split('T')[0];
  formattedAmount   = '';

  form = this.fb.group({
    type:          this.fb.control<'in'|'out'>('out', { nonNullable: true }),
    amount:        this.fb.control<number|null>(null),
    category:      this.fb.control<string|null>(null),
    note:          this.fb.control<string|null>(null),
    paymentMethod: this.fb.control<'cash'|'card'>('cash', { nonNullable: true }),
    cardId:        this.fb.control<string|null>(null),
  });

  ngOnInit() {}

  /** Numpad key press */
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

  get canSave(): boolean {
    const v = this.form.value;
    const amount = Number(v.amount ?? 0);
    if (!amount || amount <= 0) return false;
    if (v.type === 'out' && (!v.category || !v.category.trim())) return false;
    if (v.paymentMethod === 'card' && (!v.cardId || !v.cardId.trim())) return false;
    return true;
  }

  async save(): Promise<void> {
    if (!this.canSave) {
      const t = await this.toastCtrl.create({ message: '⚠️ Completa todos los campos', duration: 2000, color: 'warning' });
      await t.present();
      return;
    }
    const v = this.form.value;
    try {
      await this.wallet.addTx({
        type:          (v.type ?? 'out') as 'in'|'out',
        amount:        Number(v.amount ?? 0),
        category:      v.type === 'out' ? (v.category ?? '') : '',
        paymentMethod: (v.paymentMethod ?? 'cash') as 'cash'|'card',
        cardId:        v.paymentMethod === 'card' ? (v.cardId ?? null) : null,
        note:          v.note ?? null,
        createdAt:     new Date(this.dateValue),
      });
      this.modalCtrl.dismiss({ saved: true });
    } catch (e) {
      console.error('[NewTxModal] save error', e);
      const t = await this.toastCtrl.create({ message: '❌ Error al guardar', duration: 2000, color: 'danger' });
      await t.present();
    }
  }

  close(): void { this.modalCtrl.dismiss(); }
}
