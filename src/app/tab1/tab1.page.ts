// src/app/tab1/tab1.page.ts

import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BehaviorSubject, combineLatest, map, Observable } from 'rxjs';
import { Tx, Totals, Category, Card } from '../core/wallet.service';

import {
  IonContent, IonSelect, IonSelectOption,
  ModalController, ToastController
} from '@ionic/angular/standalone';

import { AuthService } from '../core/auth.service';
import { WalletService, Loan } from '../core/wallet.service';
import { NewTxModal } from './new-tx.modal';
import { CategoriesModal } from './categories.modal';

const CAT_COLORS: Record<string, string> = {
  'Comida':         '#F97316',
  'Transporte':     '#3B82F6',
  'Salud':          '#EF4444',
  'Entretenimiento':'#A855F7',
  'Servicios':      '#F59E0B',
  'Educación':      '#10B981',
  'Hogar':          '#06B6D4',
  'Ropa':           '#EC4899',
  'Viajes':         '#8B5CF6',
  'Salario':        '#22C55E',
  'Freelance':      '#14B8A6',
  'Otros':          '#94A3B8',
};

const CAT_EMOJI: Record<string, string> = {
  'Comida':          '🍔',
  'Transporte':      '🚗',
  'Salud':           '💊',
  'Entretenimiento': '🎮',
  'Servicios':       '📱',
  'Educación':       '📚',
  'Hogar':           '🏠',
  'Ropa':            '👕',
  'Viajes':          '✈️',
  'Salario':         '💼',
  'Freelance':       '💻',
  'Otros':           '📦',
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
  selector: 'app-tab1',
  templateUrl: './tab1.page.html',
  styleUrls: ['./tab1.page.scss'],
  imports: [
    CommonModule, FormsModule,
    IonContent, IonSelect, IonSelectOption,
  ],
})
export class Tab1Page implements OnDestroy {
  user$: Observable<any>;
  totals$!: Observable<Totals>;
  lastTx$!: Observable<Tx[]>;
  categories$!: Observable<Category[]>;
  cards$!: Observable<Card[]>;
  filteredTx$!: Observable<Tx[]>;

  private cardsCache: Card[] = [];
  private categoriesCache: Category[] = [];
  private cardTxMap: { [id: string]: Tx[] } = {};

  dateFilter = 'all';
  categoryFilter = 'all';
  cardFilter = 'all';

  selectedMonth: number;
  selectedYear: number;
  selectedMonthLabel = '';
  isCurrentMonth = true;

  // Loan alert
  urgentLoan?: Loan;
  urgentLoanDays = 0;

  private filtersSubject = new BehaviorSubject<{date:string;category:string;card:string}>({
    date: 'all', category: 'all', card: 'all'
  });

  constructor(
    private auth: AuthService,
    private wallet: WalletService,
    private modalCtrl: ModalController,
    private toastCtrl: ToastController,
    private router: Router
  ) {
    const now = new Date();
    this.selectedMonth = now.getMonth();
    this.selectedYear  = now.getFullYear();
    this.updateMonthLabel();

    this.user$ = this.auth.user$;
    this.categories$ = this.wallet.categories$();
    this.cards$ = this.wallet.cards$();

    this.categories$.subscribe(c => { this.categoriesCache = c; });
    this.cards$.subscribe(c => { this.cardsCache = c; });

    this.loadDataForSelectedMonth();
    this.setupFilteredTransactions();
  }

  setupFilteredTransactions(): void {
    if (!this.lastTx$) return;
    this.filteredTx$ = combineLatest([this.lastTx$, this.filtersSubject]).pipe(
      map(([txs, filters]) => {
        let filtered = [...txs];
        if (filters.date !== 'all') {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          filtered = filtered.filter(tx => {
            const d = tx.createdAt instanceof Date ? tx.createdAt : tx.createdAt?.toDate?.() ?? new Date(tx.createdAt);
            if (filters.date === 'today') return d >= today;
            if (filters.date === 'week')  { const w = new Date(today); w.setDate(w.getDate()-7); return d >= w; }
            return true;
          });
        }
        if (filters.category !== 'all') filtered = filtered.filter(tx => tx.category === filters.category);
        if (filters.card !== 'all') {
          if (filters.card === 'cash') filtered = filtered.filter(tx => tx.paymentMethod === 'cash');
          else filtered = filtered.filter(tx => tx.paymentMethod === 'card' && tx.cardId === filters.card);
        }
        return filtered;
      })
    );
  }

  applyFilters(): void {
    this.filtersSubject.next({ date: this.dateFilter, category: this.categoryFilter, card: this.cardFilter });
  }

  clearFilters(): void {
    this.dateFilter = 'all'; this.categoryFilter = 'all'; this.cardFilter = 'all';
    this.applyFilters();
  }

  ionViewWillEnter(): void { this.loadData(); }
  ngOnDestroy(): void {}

  loadData(): void {
    this.loadDataForSelectedMonth();
    this.categories$ = this.wallet.categories$();
    this.cards$ = this.wallet.cards$();
    this.cards$.subscribe(c => { this.cardsCache = c; });
    this.categories$.subscribe(c => { this.categoriesCache = c; });
    this.setupFilteredTransactions();
    this.loadCardTxMap();
    this.loadUrgentLoan();
  }

  private async loadCardTxMap(): Promise<void> {
    try {
      const all = await this.wallet.getAllTransactions();
      this.cardTxMap = {};
      all.forEach(tx => {
        if (tx.cardId && tx.paymentMethod === 'card') {
          if (!this.cardTxMap[tx.cardId]) this.cardTxMap[tx.cardId] = [];
          this.cardTxMap[tx.cardId].push(tx);
        }
      });
    } catch { /* ignore */ }
  }

  private async loadUrgentLoan(): Promise<void> {
    try {
      const loans = await this.wallet.getAllLoans();
      if (!loans.length) { this.urgentLoan = undefined; return; }
      // Find the loan with the soonest payment (≤7 days)
      let urgent: Loan | undefined;
      let urgentDays = 999;
      for (const loan of loans) {
        const days = this.wallet.getLoanDaysUntilPayment(loan);
        if (days >= 0 && days <= 7 && days < urgentDays) {
          urgent = loan;
          urgentDays = days;
        }
      }
      this.urgentLoan = urgent;
      this.urgentLoanDays = urgentDays;
    } catch { this.urgentLoan = undefined; }
  }

  private loadDataForSelectedMonth(): void {
    const range = this.getMonthRange();
    this.totals$ = this.wallet.totals$(range);
    this.lastTx$ = this.wallet.lastTx$(100, range);
  }

  private getMonthRange(): { start: Date; end: Date } {
    return {
      start: new Date(this.selectedYear, this.selectedMonth, 1),
      end:   new Date(this.selectedYear, this.selectedMonth + 1, 0, 23, 59, 59, 999),
    };
  }

  private updateMonthLabel(): void {
    const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    this.selectedMonthLabel = `${names[this.selectedMonth]} ${this.selectedYear}`;
    const n = new Date();
    this.isCurrentMonth = this.selectedMonth === n.getMonth() && this.selectedYear === n.getFullYear();
  }

  previousMonth(): void {
    if (this.selectedMonth === 0) { this.selectedMonth = 11; this.selectedYear--; }
    else this.selectedMonth--;
    this.updateMonthLabel();
    this.loadDataForSelectedMonth();
    this.setupFilteredTransactions();
  }

  nextMonth(): void {
    if (this.isCurrentMonth) return;
    if (this.selectedMonth === 11) { this.selectedMonth = 0; this.selectedYear++; }
    else this.selectedMonth++;
    this.updateMonthLabel();
    this.loadDataForSelectedMonth();
    this.setupFilteredTransactions();
  }

  async openNew(type?: string): Promise<void> {
    try {
      const m = await this.modalCtrl.create({ component: NewTxModal, cssClass: 'tx-modal', breakpoints: [0,1], initialBreakpoint: 1 });
      await m.present();
      const { data } = await m.onWillDismiss();
      if (data?.saved) { this.loadData(); this.showToast('✅ Transacción guardada'); }
    } catch (e) { console.error('[Tab1] openNew error', e); }
  }

  async openCategories(): Promise<void> {
    try {
      const m = await this.modalCtrl.create({ component: CategoriesModal, cssClass: 'tx-modal', breakpoints: [0,1], initialBreakpoint: 1 });
      await m.present();
      await m.onWillDismiss();
      this.loadData();
    } catch (e) { console.error('[Tab1] openCategories error', e); }
  }

  openTxDetail(tx: Tx): void { /* future */ }

  goToCards(): void {
    this.router.navigateByUrl('/tabs/tab3');
  }

  // ─── Card helpers ────────────────────────────────────────────────────────────

  getCardGradient(i: number): string {
    return CARD_GRADIENTS[i % CARD_GRADIENTS.length];
  }

  getCardSpent(cardId?: string): number {
    if (!cardId) return 0;
    return (this.cardTxMap[cardId] || []).reduce((s, t) => s + Number(t.amount || 0), 0);
  }

  getCardAvailable(card: Card): number {
    return Math.max(0, (card.limit || 0) - this.getCardSpent(card.id));
  }

  getCardUsedPct(card: Card): number {
    if (!card.limit) return 0;
    return Math.min((this.getCardSpent(card.id) / card.limit) * 100, 100);
  }

  getUsagePctColor(card: Card): string {
    const p = this.getCardUsedPct(card);
    if (p >= 80) return 'var(--mf-red)';
    if (p >= 50) return 'var(--mf-amber)';
    return 'var(--mf-green)';
  }

  // ─── Category helpers ────────────────────────────────────────────────────────

  getCardName(cardId: string | null | undefined): string {
    if (!cardId) return 'Tarjeta';
    return this.cardsCache.find(c => c.id === cardId)?.name ?? 'Tarjeta';
  }

  getCatColor(cat: string): string {
    return CAT_COLORS[cat] ?? '#94A3B8';
  }

  getCatEmoji(cat: string): string {
    const custom = this.categoriesCache.find(c => c.name === cat);
    if (custom?.emoji) return custom.emoji;
    return CAT_EMOJI[cat] ?? '📦';
  }

  trackByTxId(_: number, tx: any): string { return tx.id ?? _.toString(); }

  private async showToast(message: string): Promise<void> {
    const t = await this.toastCtrl.create({ message, duration: 1800, position: 'top' });
    await t.present();
  }
}
