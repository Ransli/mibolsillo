// src/app/settings/settings.page.ts

import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonContent, IonSelect, IonSelectOption,
  AlertController, ToastController
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { WalletService, SalaryEntry } from '../core/wallet.service';
import { Observable } from 'rxjs';

@Component({
  standalone: true,
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [CommonModule, FormsModule, IonContent, IonSelect, IonSelectOption],
})
export class SettingsPage implements OnInit, OnDestroy {
  user$: Observable<any>;
  salaryHistory$: Observable<SalaryEntry[]>;

  // Salary
  monthlySalary    = 0;
  formattedSalary  = '';
  newSalaryNote    = '';
  newSalaryMonth   = '';   // e.g. "2025-05"
  showSalaryForm   = false;

  // Stats
  statsTransactions = 0;
  statsMonths       = 0;
  statsCategories   = 0;

  // Preferences
  currency: string = 'DOP';
  paymentFrequency: 'monthly' | 'biweekly' = 'monthly';
  paymentDay  = 1;
  paymentDay1 = 1;
  paymentDay2 = 15;

  constructor(
    private auth: AuthService,
    private wallet: WalletService,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {
    this.user$ = this.auth.user$;
    this.salaryHistory$ = this.wallet.salaryHistory$();

    // Default new salary month to current month
    const n = new Date();
    this.newSalaryMonth = `${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}`;
  }

  ngOnInit(): void { this.loadSettings(); this.loadStats(); }
  ionViewWillEnter(): void { this.loadSettings(); this.loadStats(); }
  ngOnDestroy(): void {}

  async loadStats(): Promise<void> {
    try {
      const txs = await this.wallet.getAllTransactions();
      this.statsTransactions = txs.length;
      // Months active: unique year-month combinations
      const months = new Set(txs.map(t => {
        const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
        return `${d.getFullYear()}-${d.getMonth()}`;
      }));
      this.statsMonths = months.size;
      // Categories: from categories$ (just count from localStorage or Firestore)
      const cats = await new Promise<number>(resolve => {
        this.wallet.categories$().subscribe(c => resolve(c.length));
      });
      this.statsCategories = cats;
    } catch { /* ignore */ }
  }

  async loadSettings(): Promise<void> {
    const userData = await this.auth.getUserData();
    if (userData?.salary) {
      this.monthlySalary = userData.salary;
      this.formattedSalary = this.formatNumber(this.monthlySalary);
    }

    const s = localStorage;
    if (!this.monthlySalary) {
      const ls = s.getItem('monthlySalary');
      if (ls) { this.monthlySalary = parseFloat(ls); this.formattedSalary = this.formatNumber(this.monthlySalary); }
    }
    const cur = s.getItem('currency'); if (cur) this.currency = cur;
    const pf  = s.getItem('paymentFrequency'); if (pf) this.paymentFrequency = pf as any;
    const pd  = s.getItem('paymentDay');  if (pd)  this.paymentDay  = parseInt(pd);
    const pd1 = s.getItem('paymentDay1'); if (pd1) this.paymentDay1 = parseInt(pd1);
    const pd2 = s.getItem('paymentDay2'); if (pd2) this.paymentDay2 = parseInt(pd2);
  }

  formatNumber(v: number): string {
    if (!v) return '';
    return v.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  onSalaryInput(ev: any): void {
    const raw = (ev.target.value as string).replace(/[^\d]/g,'');
    this.monthlySalary = raw ? parseFloat(raw) : 0;
    this.formattedSalary = this.monthlySalary ? this.formatNumber(this.monthlySalary) : '';
  }

  async saveSalary(): Promise<void> {
    if (!this.monthlySalary || this.monthlySalary <= 0) {
      await this.showToast('⚠️ Ingresa un sueldo válido'); return;
    }
    try {
      // Parse month
      let effectiveFrom: Date;
      if (this.newSalaryMonth) {
        const [y, m] = this.newSalaryMonth.split('-').map(Number);
        effectiveFrom = new Date(y, m - 1, 1);
      } else {
        const n = new Date();
        effectiveFrom = new Date(n.getFullYear(), n.getMonth(), 1);
      }

      await this.wallet.addSalaryEntry({
        amount: this.monthlySalary,
        effectiveFrom,
        notes: this.newSalaryNote || undefined,
      });

      // Also update legacy salary field for backward compat
      await this.auth.updateUserSalary(this.monthlySalary);
      localStorage.setItem('monthlySalary', this.monthlySalary.toString());

      this.newSalaryNote = '';
      await this.showToast('✅ Sueldo guardado');
    } catch (e) {
      console.error('[Settings] saveSalary error:', e);
      await this.showToast('❌ Error al guardar');
    }
  }

  async deleteSalaryEntry(entry: SalaryEntry): Promise<void> {
    if (!entry.id) return;
    const alert = await this.alertCtrl.create({
      header: 'Eliminar entrada',
      message: '¿Eliminar este registro de sueldo?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: async () => {
          await this.wallet.deleteSalaryEntry(entry.id!);
          await this.showToast('🗑 Entrada eliminada');
        }}
      ]
    });
    await alert.present();
  }

  formatSalaryDate(val: any): string {
    if (!val) return '';
    const d = val?.toDate ? val.toDate() : new Date(val);
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    return `${months[d.getMonth()]} ${d.getFullYear()}`;
  }

  saveCurrency(): void { localStorage.setItem('currency', this.currency); this.showToast('✅ Moneda actualizada'); }
  savePaymentFrequency(): void { localStorage.setItem('paymentFrequency', this.paymentFrequency); }
  savePaymentDay(): void { localStorage.setItem('paymentDay', this.paymentDay.toString()); this.showToast('✅ Día guardado'); }
  savePaymentDays(): void {
    localStorage.setItem('paymentDay1', this.paymentDay1.toString());
    localStorage.setItem('paymentDay2', this.paymentDay2.toString());
    this.showToast('✅ Días guardados');
  }

  async exportData(): Promise<void> {
    try {
      const txs = await this.wallet.getAllTransactions();
      if (!txs.length) { await this.showToast('Sin transacciones para exportar'); return; }
      const headers = ['Tipo','Monto','Categoría','Método','Fecha','Nota'];
      const rows = txs.map(t => [
        t.type === 'in' ? 'Ingreso' : 'Gasto',
        t.amount, t.category || '', t.paymentMethod || 'cash',
        t.createdAt?.toDate ? t.createdAt.toDate().toISOString() : '',
        t.note || ''
      ]);
      const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `mibolsillo_${new Date().toISOString().split('T')[0]}.csv`;
      a.click(); URL.revokeObjectURL(url);
      await this.showToast('✅ Exportado');
    } catch { await this.showToast('❌ Error exportando'); }
  }

  async confirmDeleteData(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: '⚠️ Eliminar todos los datos',
      message: 'Esta acción es irreversible. ¿Continuar?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: () => this.showToast('⚠️ Función en desarrollo') }
      ]
    });
    await alert.present();
  }

  async logout(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar sesión',
      message: '¿Estás seguro?',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Salir', handler: async () => {
          await this.auth.logout();
          await this.router.navigateByUrl('/auth/login', { replaceUrl: true });
        }}
      ]
    });
    await alert.present();
  }

  private async showToast(msg: string): Promise<void> {
    const t = await this.toastCtrl.create({ message: msg, duration: 2000, position: 'top' });
    await t.present();
  }
}
