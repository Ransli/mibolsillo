// src/app/tab3/tab3.page.ts — Tarjetas & Préstamos

import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, FormsModule, Validators } from '@angular/forms';
import { IonContent, AlertController, ToastController, ModalController } from '@ionic/angular/standalone';
import { WalletService, Loan } from '../core/wallet.service';
import { NotificationService } from '../core/notification.service';
import { CardDetailModal } from './card-detail.modal';
import { CardPaymentModal } from './card-payment.modal';
import { LoanDetailModal } from './loan-detail.modal';
import { Observable } from 'rxjs';

interface Card {
  id?: string;
  name: string;
  limit: number;
  cutoffDate: any;
  paymentDate: any;
  lastFourDigits?: string;
  statementBalance?: number;
  statementDate?: any;
}

const CAT_EMOJI: Record<string, string> = {
  'Comida': '🍔', 'Transporte': '🚗', 'Hogar': '🏠', 'Servicios': '⚡',
  'Salud': '💊', 'Entretenimiento': '🎬', 'Ropa': '👕', 'Educación': '📚',
  'Deportes': '⚽', 'Viajes': '✈️', 'Mascotas': '🐾', 'Restaurante': '🍽️',
  'Supermercado': '🛒', 'Gasolina': '⛽', 'Farmacia': '💊', 'Salario': '💰',
  'Pago Tarjeta': '💳',
};

const LOAN_COLORS = ['#10B981','#3B82F6','#7C3AED','#F59E0B','#EF4444','#06B6D4'];

@Component({
  standalone: true,
  selector: 'app-tab3',
  templateUrl: './tab3.page.html',
  styleUrls: ['./tab3.page.scss'],
  imports: [CommonModule, ReactiveFormsModule, FormsModule, IonContent],
})
export class Tab3Page implements OnDestroy {

  // Segment
  activeSegment: 'cards' | 'loans' = 'cards';

  // Cards
  cardForm: FormGroup;
  cards$: Observable<Card[]>;
  selectedCard?: Card;
  selectedCardTransactions: any[] = [];
  cardTransactions: { [id: string]: any[] } = {};
  saving = false;
  showAddCard = false;
  formattedLimit = '';

  // Billing period offset per card (0 = actual, -1 = anterior, etc.)
  cardPeriodOffset: { [id: string]: number } = {};

  // Loans
  loanForm: FormGroup;
  loans$: Observable<Loan[]>;
  selectedLoan?: Loan;
  savingLoan = false;
  showAddLoan = false;
  formattedLoanOrig = '';
  formattedLoanBal = '';
  formattedLoanMonthly = '';

  constructor(
    private fb: FormBuilder,
    private wallet: WalletService,
    private notifications: NotificationService,
    private alertCtrl: AlertController,
    private toastCtrl: ToastController,
    private modalCtrl: ModalController,
  ) {
    this.cardForm = this.fb.group({
      name:        ['', [Validators.required, Validators.minLength(2)]],
      limit:       [null, [Validators.required, Validators.min(1)]],
      cutoffDate:  ['', Validators.required],
      paymentDate: ['', Validators.required],
    });

    this.loanForm = this.fb.group({
      name:            ['', [Validators.required, Validators.minLength(2)]],
      loanType:        ['Personal', Validators.required],
      interestRate:    [null, [Validators.required, Validators.min(0)]],
      originalAmount:  [null, [Validators.required, Validators.min(1)]],
      balance:         [null, [Validators.required, Validators.min(0)]],
      monthlyPayment:  [null, [Validators.required, Validators.min(1)]],
      termMonths:      [null, [Validators.required, Validators.min(1)]],
      paidMonths:      [0, [Validators.required, Validators.min(0)]],
      nextPaymentDate: ['', Validators.required],
      notes:           [''],
    });

    this.cards$ = this.wallet.cards$();
    this.loans$ = this.wallet.loans$();
  }

  ionViewWillEnter(): void {
    this.loadData();
    this.wallet.checkAndUpdateCardDates().then(() => this.scheduleAllNotifications());
  }

  private async scheduleAllNotifications(): Promise<void> {
    const cards = await this.wallet.getAllCards();
    for (const c of cards) {
      if (c.id) {
        const cut = (c.cutoffDate as any)?.toDate?.() || new Date(c.cutoffDate);
        const pay = (c.paymentDate as any)?.toDate?.() || new Date(c.paymentDate);
        await this.notifications.scheduleCardReminders({ cardId: c.id, cardName: c.name, cutoffDate: cut, paymentDate: pay });
      }
    }
  }

  ngOnDestroy(): void {}

  async loadData(): Promise<void> {
    const all = await this.wallet.getAllTransactions();
    this.cardTransactions = {};
    all.forEach(tx => {
      if (tx.cardId && tx.paymentMethod === 'card') {
        if (!this.cardTransactions[tx.cardId]) this.cardTransactions[tx.cardId] = [];
        this.cardTransactions[tx.cardId].push(tx);
      }
    });
    if (this.selectedCard?.id) this.selectedCardTransactions = this.getCardPeriodTransactions(this.selectedCard);
  }

  // ────── BILLING PERIOD HELPERS ──────────────────────────────────────────────

  /**
   * Calcula la fecha de inicio y fin del período de facturación.
   * offset=0 → período actual (desde el último corte hasta el próximo corte)
   * offset=-1 → período anterior
   */
  getBillingPeriod(card: Card, offset = 0): { start: Date; end: Date } {
    const cutoffDay = this.getCutoffDay(card);
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Fecha de corte más reciente (≤ hoy)
    let periodEnd = new Date(now.getFullYear(), now.getMonth(), cutoffDay);
    if (periodEnd > now) {
      // El corte de este mes aún no llega → el "próximo corte" es este mes, el "último corte" fue el mes pasado
      periodEnd = new Date(now.getFullYear(), now.getMonth() - 1, cutoffDay);
    }

    // Aplicar offset (0=actual, -1=anterior, -2=hace 2 meses, etc.)
    // offset=0 → periodEnd = último corte, periodStart = un mes antes
    // El período ACTUAL: desde el último corte hasta hoy (o hasta el próximo corte)
    // Período anterior: desde el corte de hace 2 meses hasta el corte del mes pasado

    // periodEnd para el período con offset
    const adjustedEnd = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + offset + 1, cutoffDay);
    const adjustedStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth() + offset, cutoffDay);

    return { start: adjustedStart, end: adjustedEnd };
  }

  getCutoffDay(card: Card): number {
    if (!card.cutoffDate) return 1;
    const d = (card.cutoffDate as any)?.toDate ? (card.cutoffDate as any).toDate() : new Date(card.cutoffDate);
    return d.getDate();
  }

  getPeriodLabel(card: Card): string {
    const offset = this.cardPeriodOffset[card.id || ''] ?? 0;
    const { start, end } = this.getBillingPeriod(card, offset);
    const months = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const fmtDate = (d: Date) => `${d.getDate()} ${months[d.getMonth()]}`;
    return `${fmtDate(start)} → ${fmtDate(end)}`;
  }

  previousPeriod(card: Card): void {
    const id = card.id || '';
    this.cardPeriodOffset[id] = (this.cardPeriodOffset[id] ?? 0) - 1;
    if (this.selectedCard?.id === card.id) this.selectedCardTransactions = this.getCardPeriodTransactions(card);
  }

  nextPeriod(card: Card): void {
    const id = card.id || '';
    const current = this.cardPeriodOffset[id] ?? 0;
    if (current >= 0) return; // No avanzar más allá del período actual
    this.cardPeriodOffset[id] = current + 1;
    if (this.selectedCard?.id === card.id) this.selectedCardTransactions = this.getCardPeriodTransactions(card);
  }

  isCurrentPeriod(card: Card): boolean {
    return (this.cardPeriodOffset[card.id || ''] ?? 0) >= 0;
  }

  // ────── CARDS ──────────────────────────────────────────────────────────────

  async addCard(): Promise<void> {
    if (this.cardForm.invalid || this.saving) return;
    this.saving = true;
    const v = this.cardForm.value;
    try {
      await this.wallet.addCard({
        name: v.name, limit: Number(v.limit),
        cutoffDate: new Date(v.cutoffDate), paymentDate: new Date(v.paymentDate),
      });
      const t = await this.toastCtrl.create({ message: '✅ Tarjeta agregada', duration: 2000, color: 'success', position: 'top' });
      await t.present();
      this.cardForm.reset(); this.formattedLimit = ''; this.showAddCard = false;
      setTimeout(() => this.loadData(), 400);
    } catch {
      const t = await this.toastCtrl.create({ message: '❌ Error al agregar', duration: 2000, color: 'danger', position: 'top' });
      await t.present();
    } finally { this.saving = false; }
  }

  selectCard(card: Card): void {
    this.selectedCard = this.selectedCard?.id === card.id ? undefined : card;
    if (this.selectedCard) this.selectedCardTransactions = this.getCardPeriodTransactions(card);
  }

  async openCardDetail(card: Card, cardIndex: number): Promise<void> {
    const modal = await this.modalCtrl.create({
      component: CardDetailModal,
      componentProps: { card, cardIndex },
    });
    await modal.present();
  }

  onLimitInput(ev: any): void {
    const raw = (ev.target.value as string).replace(/[^\d.]/g, '');
    const n = raw ? parseFloat(raw) : null;
    this.cardForm.patchValue({ limit: n }, { emitEvent: false });
    this.formattedLimit = n ? this.formatNumber(n) : '';
  }

  async viewCardStatement(card: Card): Promise<void> {
    const spent = this.getCardSpent(card);
    const period = this.getPeriodLabel(card);
    const a = await this.alertCtrl.create({
      header: card.name,
      message: `Período: ${period}<br>Límite: RD$${this.formatNumber(card.limit)}<br>Consumido: RD$${this.formatNumber(spent)}<br>Disponible: RD$${this.formatNumber(card.limit - spent)}`,
      buttons: ['Cerrar']
    });
    await a.present();
  }

  async registerCardPayment(card: Card, ev: Event): Promise<void> {
    ev.stopPropagation();
    const m = await this.modalCtrl.create({
      component: CardPaymentModal,
      componentProps: {
        card,
        currentSpent: this.getCardSpent(card),
      },
    });
    await m.present();
    const { data } = await m.onDidDismiss();
    if (data?.paid) {
      setTimeout(() => this.loadData(), 300);
    }
  }

  async deleteCard(card: Card, ev: Event): Promise<void> {
    ev.stopPropagation();
    const a = await this.alertCtrl.create({
      header: 'Eliminar tarjeta',
      message: `¿Eliminar "${card.name}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: async () => {
          await this.wallet.deleteCard(card.id!);
          if (this.selectedCard?.id === card.id) { this.selectedCard = undefined; this.selectedCardTransactions = []; }
        }}
      ]
    });
    await a.present();
  }

  // Cards helpers
  getCardGradient(i: number): string {
    const g = [
      'linear-gradient(135deg, #1E3A8A 0%, #0F172A 100%)',
      'linear-gradient(135deg, #7C3AED 0%, #3B82F6 100%)',
      'linear-gradient(135deg, #064E3B 0%, #065F46 100%)',
      'linear-gradient(135deg, #7F1D1D 0%, #991B1B 100%)',
      'linear-gradient(135deg, #1E1B4B 0%, #312E81 100%)',
      'linear-gradient(135deg, #0C4A6E 0%, #075985 100%)',
    ];
    return g[i % g.length];
  }

  formatCardDate(date: any): string {
    if (!date) return '--/--';
    const d = date.toDate ? date.toDate() : new Date(date);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  getDateDay(date: any): number {
    if (!date) return 0;
    const d = date.toDate ? date.toDate() : new Date(date);
    return d.getDate();
  }

  getCardDaysUntilPayment(card: Card): number {
    if (!card.paymentDate) return 999;
    const d = card.paymentDate?.toDate ? card.paymentDate.toDate() : new Date(card.paymentDate);
    const now = new Date(); now.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  /** Transacciones filtradas por período de facturación */
  getCardPeriodTransactions(card: Card): any[] {
    if (!card.id) return [];
    const offset = this.cardPeriodOffset[card.id] ?? 0;
    const { start, end } = this.getBillingPeriod(card, offset);
    const allTx = this.cardTransactions[card.id] || [];
    return allTx.filter(tx => {
      const d = tx.createdAt?.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
      return d >= start && d <= end;
    });
  }

  /** Monto gastado en el período de facturación activo */
  getCardSpent(card: Card): number {
    return this.getCardPeriodTransactions(card).reduce((s, t) => s + Number(t.amount || 0), 0);
  }

  // Backward compat for template references using card.id
  getCardSpentById(id?: string): number {
    const card = { id, cutoffDate: null, paymentDate: null, name: '', limit: 0 } as Card;
    // Use the simple total (no period filter) for summary glass
    if (!id) return 0;
    return (this.cardTransactions[id] || []).reduce((s, t) => s + Number(t.amount || 0), 0);
  }

  getUsagePercentage(card: Card): number {
    if (!card.id || !card.limit) return 0;
    return Math.min((this.getCardSpent(card) / card.limit) * 100, 100);
  }

  getUsagePctColor(card: Card): string {
    const p = this.getUsagePercentage(card);
    if (p >= 80) return 'var(--mf-red)';
    if (p >= 50) return 'var(--mf-amber)';
    return 'var(--mf-green)';
  }

  getCatEmoji(cat: string): string {
    return CAT_EMOJI[cat] || '💰';
  }

  // Cards summary — use total (no period filter) for the summary glass
  getTotalLimit(cards: Card[]): number {
    return cards.reduce((s, c) => s + (c.limit || 0), 0);
  }

  getTotalAvailable(cards: Card[]): number {
    return cards.reduce((s, c) => s + Math.max(0, (c.limit || 0) - this.getCardSpentById(c.id)), 0);
  }

  getTotalUsedPct(cards: Card[]): number {
    const totalLimit = this.getTotalLimit(cards);
    if (!totalLimit) return 0;
    const totalUsed = cards.reduce((s, c) => s + this.getCardSpentById(c.id), 0);
    return Math.min((totalUsed / totalLimit) * 100, 100);
  }

  // ────── LOANS ──────────────────────────────────────────────────────────────

  onLoanOrigInput(ev: any): void {
    const raw = (ev.target.value as string).replace(/[^\d.]/g, '');
    const n = raw ? parseFloat(raw) : null;
    this.loanForm.patchValue({ originalAmount: n }, { emitEvent: false });
    this.formattedLoanOrig = n ? this.formatNumber(n) : '';
  }

  onLoanBalInput(ev: any): void {
    const raw = (ev.target.value as string).replace(/[^\d.]/g, '');
    const n = raw ? parseFloat(raw) : null;
    this.loanForm.patchValue({ balance: n }, { emitEvent: false });
    this.formattedLoanBal = n ? this.formatNumber(n) : '';
  }

  onLoanMonthlyInput(ev: any): void {
    const raw = (ev.target.value as string).replace(/[^\d.]/g, '');
    const n = raw ? parseFloat(raw) : null;
    this.loanForm.patchValue({ monthlyPayment: n }, { emitEvent: false });
    this.formattedLoanMonthly = n ? this.formatNumber(n) : '';
  }

  async addLoan(): Promise<void> {
    if (this.loanForm.invalid || this.savingLoan) return;
    this.savingLoan = true;
    const v = this.loanForm.value;
    try {
      await this.wallet.addLoan({
        name: v.name,
        loanType: v.loanType,
        interestRate: Number(v.interestRate),
        originalAmount: Number(v.originalAmount),
        balance: Number(v.balance),
        monthlyPayment: Number(v.monthlyPayment),
        termMonths: Number(v.termMonths),
        paidMonths: Number(v.paidMonths || 0),
        nextPaymentDate: new Date(v.nextPaymentDate),
        notes: v.notes || '',
      });
      const t = await this.toastCtrl.create({ message: '✅ Préstamo registrado', duration: 2000, color: 'success', position: 'top' });
      await t.present();
      this.loanForm.reset({ loanType: 'Personal', paidMonths: 0 });
      this.formattedLoanOrig = ''; this.formattedLoanBal = ''; this.formattedLoanMonthly = '';
      this.showAddLoan = false;
    } catch {
      const t = await this.toastCtrl.create({ message: '❌ Error al registrar', duration: 2000, color: 'danger', position: 'top' });
      await t.present();
    } finally { this.savingLoan = false; }
  }

  toggleLoanDetail(loan: Loan): void {
    this.selectedLoan = this.selectedLoan?.id === loan.id ? undefined : loan;
  }

  async openLoanDetail(loan: Loan): Promise<void> {
    const m = await this.modalCtrl.create({
      component: LoanDetailModal,
      componentProps: { loan },
    });
    await m.present();
    const { data } = await m.onDidDismiss();
    if (data?.updated) {
      // Recargar préstamos si hubo un pago
      setTimeout(() => this.loadData(), 300);
    }
  }

  async deleteLoan(loan: Loan, ev: Event): Promise<void> {
    ev.stopPropagation();
    const a = await this.alertCtrl.create({
      header: 'Eliminar préstamo',
      message: `¿Eliminar "${loan.name}"?`,
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Eliminar', role: 'destructive', handler: async () => {
          await this.wallet.deleteLoan(loan.id!);
          if (this.selectedLoan?.id === loan.id) this.selectedLoan = undefined;
          const t = await this.toastCtrl.create({ message: '🗑 Préstamo eliminado', duration: 1500, position: 'top' });
          await t.present();
        }}
      ]
    });
    await a.present();
  }

  // Loans helpers
  getLoanColor(loan: Loan): string {
    if (loan.color) return loan.color;
    return LOAN_COLORS[0];
  }

  getLoanPaidPct(loan: Loan): number {
    return this.wallet.getLoanPaidPct(loan);
  }

  getLoanDays(loan: Loan): number {
    return this.wallet.getLoanDaysUntilPayment(loan);
  }

  getLoanDashArray(loan: Loan): string {
    const r = 56;
    const dash = 2 * Math.PI * r;
    const pct = this.getLoanPaidPct(loan) / 100;
    return `${pct * dash} ${dash}`;
  }

  getLoanProjection(loan: Loan): Array<{ month: string; cuota: number; capital: number; interest: number; balance: number }> {
    const rows: any[] = [];
    const monthlyRate = loan.interestRate / 100 / 12;
    let bal = loan.balance;
    const now = new Date();
    const monthNames = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

    for (let i = 0; i < 5 && bal > 0; i++) {
      const interest = Math.round(bal * monthlyRate);
      const capital = Math.min(Math.round(loan.monthlyPayment - interest), bal);
      bal = Math.max(bal - capital, 0);
      const m = new Date(now.getFullYear(), now.getMonth() + i + 1, 1);
      rows.push({ month: `${monthNames[m.getMonth()]} ${m.getFullYear()}`, cuota: loan.monthlyPayment, capital, interest, balance: bal });
    }
    return rows;
  }

  formatLoanDate(date: any): string {
    if (!date) return '—';
    const d = date?.toDate ? date.toDate() : new Date(date);
    return d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short', year: 'numeric' });
  }

  // Loans summary
  getTotalLoanBalance(loans: Loan[]): number {
    return loans.reduce((s, l) => s + (l.balance || 0), 0);
  }

  getTotalMonthlyPayment(loans: Loan[]): number {
    return loans.reduce((s, l) => s + (l.monthlyPayment || 0), 0);
  }

  getOverallPaidPct(loans: Loan[]): number {
    const totalOrig = loans.reduce((s, l) => s + (l.originalAmount || 0), 0);
    const totalBal = loans.reduce((s, l) => s + (l.balance || 0), 0);
    if (!totalOrig) return 0;
    return Math.min(((totalOrig - totalBal) / totalOrig) * 100, 100);
  }

  // ────── SHARED ─────────────────────────────────────────────────────────────

  formatNumber(n: number): string {
    return new Intl.NumberFormat('es-DO').format(n);
  }
}
