// src/app/tab1/new-tx.modal.ts
import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonicModule,
  ModalController,
  ToastController,
} from '@ionic/angular';
import {
  ReactiveFormsModule,
  FormBuilder,
  Validators,
} from '@angular/forms';

import { WalletService, Category } from '../core/wallet.service';
import { Observable } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-new-tx-modal',
  templateUrl: './new-tx.modal.html',
  styleUrls: ['./new-tx.modal.scss'],
  imports: [IonicModule, CommonModule, ReactiveFormsModule],
})
export class NewTxModal implements OnInit {
  private fb = inject(FormBuilder);
  private wallet = inject(WalletService);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);

  categories$: Observable<Category[]> = this.wallet.categories$();
  cards$: Observable<any[]> = this.wallet.cards$();

  // 🔥 Fecha como string para input type="date"
  dateValue: string = new Date().toISOString().split('T')[0];
  
  // 🔥 Valor formateado para mostrar
  formattedAmount: string = '';

  form = this.fb.group({
    type: this.fb.control<'in' | 'out'>('out', { nonNullable: true }),
    amount: this.fb.control<number | null>(null),
    category: this.fb.control<string | null>(null),
    note: this.fb.control<string | null>(null),
    paymentMethod: this.fb.control<'cash' | 'card'>('cash', { nonNullable: true }),
    cardId: this.fb.control<string | null>(null),
  });

  ngOnInit() {
    this.form.valueChanges.subscribe(values => {
      console.log('[NewTxModal] 📝 Formulario cambió:', values);
      console.log('[NewTxModal] 📝 ¿Puede guardar?', this.canSave);
    });
  }

  // 🔥 Formatear el monto mientras se escribe
  onAmountInput(ev: any) {
    const input = ev.target.value;
    const numericValue = input.replace(/[^0-9.]/g, '');
    
    // Actualizar el valor del form
    const amount = parseFloat(numericValue) || null;
    this.form.patchValue({ amount }, { emitEvent: false });
    
    // Formatear para mostrar
    if (amount && amount > 0) {
      this.formattedAmount = this.formatCurrency(amount);
    } else {
      this.formattedAmount = '';
    }
  }

  // 🔥 Formatear número a moneda
  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-DO', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  onTypeChange(ev: any) {
    const val = ev?.detail?.value as 'in' | 'out';
    console.log('[NewTxModal] Tipo cambiado a:', val);
    if (val) {
      this.form.patchValue({ type: val });
      if (val === 'in') {
        this.form.patchValue({ category: null });
      }
    }
  }

  onPaymentChange(ev: any) {
    const val = ev?.detail?.value as 'cash' | 'card';
    console.log('[NewTxModal] Método de pago cambiado a:', val);
    this.form.patchValue({ paymentMethod: val });
    if (val === 'cash') {
      this.form.patchValue({ cardId: null });
    }
  }

  // 🔥 Manejar cambio de fecha desde input nativo
  onDateChange(ev: any) {
    const value = ev.target.value;
    console.log('[NewTxModal] Fecha cambiada a:', value);
    if (value) {
      this.dateValue = value;
    }
  }

  get canSave(): boolean {
    const v = this.form.value;
    const amount = Number(v.amount ?? 0);
    
    console.log('[NewTxModal] 🔍 Validando:', {
      amount,
      type: v.type,
      category: v.category,
      paymentMethod: v.paymentMethod,
      cardId: v.cardId
    });
    
    if (!amount || amount <= 0) {
      console.log('[NewTxModal] ❌ Monto inválido o vacío');
      return false;
    }
    
    if (v.type === 'out') {
      if (!v.category || v.category.trim() === '') {
        console.log('[NewTxModal] ❌ Falta categoría para gasto');
        return false;
      }
    }
    
    if (v.paymentMethod === 'card') {
      if (!v.cardId || v.cardId.trim() === '') {
        console.log('[NewTxModal] ❌ Falta seleccionar tarjeta');
        return false;
      }
    }
    
    console.log('[NewTxModal] ✅ Formulario válido, puede guardar');
    return true;
  }

  async save() {
    console.log('[NewTxModal] 🚀 Intentando guardar transacción...');
    
    if (!this.canSave) {
      console.warn('[NewTxModal] ❌ No se puede guardar, validación falló');
      const toast = await this.toastCtrl.create({
        message: '⚠️ Por favor completa todos los campos requeridos',
        duration: 2000,
        color: 'warning',
      });
      await toast.present();
      return;
    }
    
    const v = this.form.value;

    try {
      const txData = {
        type: (v.type ?? 'out') as 'in' | 'out',
        amount: Number(v.amount ?? 0),
        category: (v.type === 'out' ? (v.category ?? '') : ''),
        paymentMethod: (v.paymentMethod ?? 'cash') as 'cash' | 'card',
        cardId: (v.paymentMethod === 'card' ? (v.cardId ?? null) : null),
        note: v.note ?? null,
        createdAt: new Date(this.dateValue),
      };

      console.log('[NewTxModal] 💾 Guardando transacción:', txData);
      
      await this.wallet.addTx(txData);

      const toast = await this.toastCtrl.create({
        message: '✅ Transacción guardada exitosamente',
        duration: 1500,
        color: 'success',
      });
      await toast.present();

      console.log('[NewTxModal] ✅ Transacción guardada correctamente');
      this.modalCtrl.dismiss({ saved: true });
    } catch (error) {
      console.error('[NewTxModal] ❌ Error al guardar transacción:', error);
      const toast = await this.toastCtrl.create({
        message: '❌ Error al guardar la transacción',
        duration: 2000,
        color: 'danger',
      });
      await toast.present();
    }
  }

  close() {
    this.modalCtrl.dismiss();
  }
}