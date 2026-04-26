// src/app/settings/settings.page.ts

import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonCard,
  IonList, IonItem, IonLabel, IonToggle, IonInput, IonSelect, IonSelectOption,
  IonButton, IonIcon, AlertController, ToastController
} from '@ionic/angular/standalone';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../core/auth.service';
import { WalletService } from '../core/wallet.service';

@Component({
  standalone: true,
  selector: 'app-settings',
  templateUrl: './settings.page.html',
  styleUrls: ['./settings.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonCard,
    IonList, IonItem, IonLabel, IonToggle, IonInput, IonSelect, IonSelectOption,
    IonButton, IonIcon
  ],
})
export class SettingsPage implements OnDestroy, OnInit {
  user$;
  
  // Configuración financiera
  monthlySalary = 0;
  formattedSalary = '';
  currency = 'USD';
  paymentFrequency: 'monthly' | 'biweekly' = 'monthly';
  paymentDay = 15;
  paymentDay1 = 15;
  paymentDay2 = 30;

  // Apariencia
  darkMode = false;
  fontSize: 'small' | 'normal' | 'large' | 'extra-large' = 'normal';

  // Notificaciones
  notificationsEnabled = false;
  paymentReminders = true;
  cutoffReminders = true;
  budgetAlerts = true;

  constructor(
    private auth: AuthService,
    private wallet: WalletService,
    private router: Router,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController
  ) {
    console.log('[SettingsPage] constructor');
    this.user$ = this.auth.user$;
  }

  ngOnInit(): void {
    this.loadSettings();
  }

  ionViewWillEnter(): void {
    console.log('[SettingsPage] ionViewWillEnter');
    this.loadSettings();
  }

  ionViewDidEnter(): void {
    console.log('[SettingsPage] ionViewDidEnter');
  }

  ngOnDestroy(): void {
    console.log('[SettingsPage] ngOnDestroy');
  }

  async loadSettings(): Promise<void> {
    console.log('[SettingsPage] loadSettings ejecutado');
    
    // Cargar datos del usuario desde auth.service
    const user = await this.auth.currentUser;
    if (user) {
      // Intentar cargar salary desde el usuario
      const userData = await this.auth.getUserData();
      if (userData?.salary) {
        this.monthlySalary = userData.salary;
        this.formattedSalary = this.formatNumber(this.monthlySalary);
      }
    }

    // Fallback a localStorage si no hay en Firebase
    const savedSalary = localStorage.getItem('monthlySalary');
    if (savedSalary && !this.monthlySalary) {
      this.monthlySalary = parseFloat(savedSalary);
      this.formattedSalary = this.formatNumber(this.monthlySalary);
    }

    const savedCurrency = localStorage.getItem('currency');
    if (savedCurrency) this.currency = savedCurrency;

    const savedPaymentFrequency = localStorage.getItem('paymentFrequency');
    if (savedPaymentFrequency) this.paymentFrequency = savedPaymentFrequency as 'monthly' | 'biweekly';

    const savedPaymentDay = localStorage.getItem('paymentDay');
    if (savedPaymentDay) this.paymentDay = parseInt(savedPaymentDay);

    const savedPaymentDay1 = localStorage.getItem('paymentDay1');
    if (savedPaymentDay1) this.paymentDay1 = parseInt(savedPaymentDay1);

    const savedPaymentDay2 = localStorage.getItem('paymentDay2');
    if (savedPaymentDay2) this.paymentDay2 = parseInt(savedPaymentDay2);

    const savedDarkMode = localStorage.getItem('darkMode');
    if (savedDarkMode) {
      this.darkMode = savedDarkMode === 'true';
      this.applyDarkMode(this.darkMode);
    }

    const savedFontSize = localStorage.getItem('fontSize');
    if (savedFontSize) {
      this.fontSize = savedFontSize as 'small' | 'normal' | 'large' | 'extra-large';
      this.applyFontSize(this.fontSize);
    }

    const savedNotifications = localStorage.getItem('notificationsEnabled');
    if (savedNotifications) this.notificationsEnabled = savedNotifications === 'true';

    const savedPaymentReminders = localStorage.getItem('paymentReminders');
    if (savedPaymentReminders) this.paymentReminders = savedPaymentReminders === 'true';

    const savedCutoffReminders = localStorage.getItem('cutoffReminders');
    if (savedCutoffReminders) this.cutoffReminders = savedCutoffReminders === 'true';

    const savedBudgetAlerts = localStorage.getItem('budgetAlerts');
    if (savedBudgetAlerts) this.budgetAlerts = savedBudgetAlerts === 'true';
  }

  formatNumber(value: number): string {
    if (!value) return '';
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  parseNumber(value: string): number {
    return parseFloat(value.replace(/,/g, '')) || 0;
  }

  onSalaryInput(event: any): void {
    const input = event.target.value;
    const numericValue = input.replace(/[^\d]/g, '');
    
    if (numericValue) {
      this.monthlySalary = parseFloat(numericValue);
      this.formattedSalary = this.formatNumber(this.monthlySalary);
    } else {
      this.monthlySalary = 0;
      this.formattedSalary = '';
    }
  }

  async saveSalary(): Promise<void> {
    try {
      // 🔥 CORRECCIÓN: Guardar en Firebase Y localStorage
      await this.auth.updateUserSalary(this.monthlySalary);
      localStorage.setItem('monthlySalary', this.monthlySalary.toString());
      this.formattedSalary = this.formatNumber(this.monthlySalary);
      this.showToast('✅ Sueldo guardado correctamente');
      console.log('[SettingsPage] Sueldo guardado:', this.monthlySalary);
    } catch (error) {
      console.error('[SettingsPage] Error guardando sueldo:', error);
      this.showToast('❌ Error al guardar el sueldo');
    }
  }

  saveCurrency(): void {
    localStorage.setItem('currency', this.currency);
    this.showToast('✅ Moneda actualizada');
  }

  savePaymentFrequency(): void {
    localStorage.setItem('paymentFrequency', this.paymentFrequency);
    this.showToast('✅ Frecuencia de pago guardada');
  }

  savePaymentDay(): void {
    if (this.paymentDay < 1) this.paymentDay = 1;
    if (this.paymentDay > 31) this.paymentDay = 31;
    localStorage.setItem('paymentDay', this.paymentDay.toString());
    this.showToast('✅ Día de pago guardado');
  }

  savePaymentDays(): void {
    if (this.paymentDay1 < 1) this.paymentDay1 = 1;
    if (this.paymentDay1 > 31) this.paymentDay1 = 31;
    if (this.paymentDay2 < 1) this.paymentDay2 = 1;
    if (this.paymentDay2 > 31) this.paymentDay2 = 31;
    
    localStorage.setItem('paymentDay1', this.paymentDay1.toString());
    localStorage.setItem('paymentDay2', this.paymentDay2.toString());
    this.showToast('✅ Días de pago guardados');
  }

  toggleDarkMode(): void {
    localStorage.setItem('darkMode', this.darkMode.toString());
    this.applyDarkMode(this.darkMode);
    this.showToast(this.darkMode ? '🌙 Modo oscuro activado' : '☀️ Modo claro activado');
  }

  private applyDarkMode(isDark: boolean): void {
    document.body.classList.toggle('dark', isDark);
  }

  changeFontSize(): void {
    localStorage.setItem('fontSize', this.fontSize);
    this.applyFontSize(this.fontSize);
    
    const sizeLabels = {
      'small': 'Pequeño',
      'normal': 'Normal',
      'large': 'Grande',
      'extra-large': 'Extra Grande'
    };
    
    this.showToast(`🔠 Tamaño: ${sizeLabels[this.fontSize]}`);
  }

  private applyFontSize(size: string): void {
    document.body.classList.remove('font-small', 'font-normal', 'font-large', 'font-extra-large');
    document.body.classList.add(`font-${size}`);
  }

  async toggleNotifications(): Promise<void> {
    if (this.notificationsEnabled) {
      const permission = await this.requestNotificationPermission();
      if (!permission) {
        this.notificationsEnabled = false;
        await this.showAlert(
          'Permisos Denegados',
          'Para recibir notificaciones, debes habilitar los permisos en la configuración de tu dispositivo.'
        );
        return;
      }
      this.showToast('✅ Notificaciones activadas');
    } else {
      this.showToast('🔕 Notificaciones desactivadas');
      this.paymentReminders = false;
      this.cutoffReminders = false;
      this.budgetAlerts = false;
    }
    
    localStorage.setItem('notificationsEnabled', this.notificationsEnabled.toString());
    this.saveSettings();
  }

  private async requestNotificationPermission(): Promise<boolean> {
    try {
      if ('Notification' in window) {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
      }
      return false;
    } catch (error) {
      console.error('[SettingsPage] Error requesting notification permission:', error);
      return false;
    }
  }

  saveSettings(): void {
    localStorage.setItem('paymentReminders', this.paymentReminders.toString());
    localStorage.setItem('cutoffReminders', this.cutoffReminders.toString());
    localStorage.setItem('budgetAlerts', this.budgetAlerts.toString());
  }

  async exportData(): Promise<void> {
    try {
      const transactions = await this.wallet.getAllTransactions();
      
      if (transactions.length === 0) {
        await this.showAlert('Sin Datos', 'No tienes transacciones para exportar.');
        return;
      }

      const csv = this.convertToCSV(transactions);
      
      const blob = new Blob([csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `mibolsillo_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);

      this.showToast('✅ Datos exportados exitosamente');
    } catch (error) {
      console.error('[SettingsPage] Error exportando datos:', error);
      this.showToast('❌ Error al exportar datos');
    }
  }

  private convertToCSV(data: any[]): string {
    const headers = ['Tipo', 'Monto', 'Categoría', 'Método', 'Fecha', 'Nota'];
    const rows = data.map(tx => [
      tx.type === 'in' ? 'Ingreso' : 'Gasto',
      tx.amount,
      tx.category || '',
      tx.paymentMethod || 'cash',
      tx.createdAt?.toDate ? tx.createdAt.toDate().toISOString() : '',
      tx.note || ''
    ]);

    return [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');
  }

  async confirmDeleteData(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: '⚠️ Eliminar Todos los Datos',
      message: 'Esta acción eliminará TODAS tus transacciones, categorías y tarjetas. Esta acción NO se puede deshacer. ¿Estás seguro?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Eliminar Todo',
          role: 'destructive',
          handler: () => {
            this.deleteAllData();
          }
        }
      ]
    });

    await alert.present();
  }

  private async deleteAllData(): Promise<void> {
    try {
      this.showToast('⚠️ Esta funcionalidad requiere implementación adicional');
    } catch (error) {
      console.error('[SettingsPage] Error eliminando datos:', error);
      this.showToast('❌ Error al eliminar datos');
    }
  }

  openTerms(): void {
    window.open('https://tuapp.com/terminos', '_blank');
  }

  openPrivacy(): void {
    window.open('https://tuapp.com/privacidad', '_blank');
  }

  async logout(): Promise<void> {
    const alert = await this.alertCtrl.create({
      header: 'Cerrar Sesión',
      message: '¿Estás seguro de que quieres cerrar sesión?',
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel'
        },
        {
          text: 'Salir',
          handler: async () => {
            try {
              await this.auth.logout();
              await this.router.navigateByUrl('/auth/login', { replaceUrl: true });
              this.showToast('👋 Sesión cerrada');
            } catch (error) {
              console.error('[SettingsPage] Error cerrando sesión:', error);
              this.showToast('❌ Error al cerrar sesión');
            }
          }
        }
      ]
    });

    await alert.present();
  }

  private async showToast(message: string): Promise<void> {
    const toast = await this.toastCtrl.create({
      message,
      duration: 2000,
      position: 'top'
    });
    await toast.present();
  }

  private async showAlert(header: string, message: string): Promise<void> {
    const alert = await this.alertCtrl.create({
      header,
      message,
      buttons: ['OK']
    });
    await alert.present();
  }
}