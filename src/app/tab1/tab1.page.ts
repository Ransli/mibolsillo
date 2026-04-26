// src/app/tab1/tab1.page.ts

import { Component, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { BehaviorSubject, combineLatest, map, Observable, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { Tx, Totals, Category, Card } from '../core/wallet.service';

import {
  IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
  IonContent, IonCard, IonCardContent, IonList, IonItem, IonLabel, IonBadge,
  IonSegment, IonSegmentButton, IonSelect, IonSelectOption,
  ModalController
} from '@ionic/angular/standalone';

import { AuthService } from '../core/auth.service';
import { WalletService } from '../core/wallet.service';

import { NewTxModal } from './new-tx.modal';
import { CategoriesModal } from './categories.modal';

@Component({
  standalone: true,
  selector: 'app-tab1',
  templateUrl: './tab1.page.html',
  styleUrls: ['./tab1.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    IonHeader, IonToolbar, IonTitle, IonButtons, IonButton, IonIcon,
    IonContent, IonCard, IonCardContent, IonList, IonItem, IonLabel, IonBadge,
    IonSegment, IonSegmentButton, IonSelect, IonSelectOption
  ],
})
export class Tab1Page implements OnDestroy {
  user$: Observable<any>;
  totals$!: Observable<Totals>;
  lastTx$!: Observable<Tx[]>;
  categories$!: Observable<Category[]>;
  cards$!: Observable<Card[]>;
  filteredTx$!: Observable<Tx[]>;

  // Cache de tarjetas para acceso rápido
  private cardsCache: Card[] = [];

  // Filtros
  dateFilter = 'all';
  categoryFilter = 'all';
  cardFilter = 'all';

  // Selector de período/mes
  selectedMonth: number;
  selectedYear: number;
  selectedMonthLabel = '';
  isCurrentMonth = true;

  private filtersSubject = new BehaviorSubject<{ date: string; category: string; card: string }>({
    date: 'all',
    category: 'all',
    card: 'all'
  });

  constructor(
    private auth: AuthService,
    private wallet: WalletService,
    private modalCtrl: ModalController,
    private router: Router
  ) {
    console.log('[Tab1Page] constructor');

    // Inicializar mes actual
    const now = new Date();
    this.selectedMonth = now.getMonth();
    this.selectedYear = now.getFullYear();
    this.updateMonthLabel();

    this.user$ = this.auth.user$;
    this.loadDataForSelectedMonth();
    this.categories$ = this.wallet.categories$();
    this.cards$ = this.wallet.cards$();

    // Cachear tarjetas para uso rápido
    this.cards$.subscribe(cards => {
      this.cardsCache = cards;
    });

    this.setupFilteredTransactions();
  }

  setupFilteredTransactions(): void {
    if (!this.lastTx$) return;

    this.filteredTx$ = combineLatest([
      this.lastTx$,
      this.filtersSubject
    ]).pipe(
      map(([txs, filters]: [Tx[], { date: string; category: string; card: string }]) => {
        let filtered = [...txs];

        // Filtro por fecha
        if (filters.date !== 'all') {
          const now = new Date();
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

          filtered = filtered.filter((tx: Tx) => {
            const txDate = tx.createdAt instanceof Date ? tx.createdAt : tx.createdAt.toDate();

            switch (filters.date) {
              case 'today':
                return txDate >= today;
              case 'week':
                const weekAgo = new Date(today);
                weekAgo.setDate(weekAgo.getDate() - 7);
                return txDate >= weekAgo;
              case 'month':
                const monthAgo = new Date(today);
                monthAgo.setMonth(monthAgo.getMonth() - 1);
                return txDate >= monthAgo;
              default:
                return true;
            }
          });
        }

        // Filtro por categoría
        if (filters.category !== 'all') {
          filtered = filtered.filter((tx: Tx) => tx.category === filters.category);
        }

        // Filtro por tarjeta
        if (filters.card !== 'all') {
          if (filters.card === 'cash') {
            filtered = filtered.filter((tx: Tx) => tx.paymentMethod === 'cash');
          } else {
            filtered = filtered.filter((tx: Tx) =>
              tx.paymentMethod === 'card' && tx.cardId === filters.card
            );
          }
        }

        return filtered;
      })
    );
  }

  applyFilters() {
    this.filtersSubject.next({
      date: this.dateFilter,
      category: this.categoryFilter,
      card: this.cardFilter
    });
  }

  clearFilters() {
    this.dateFilter = 'all';
    this.categoryFilter = 'all';
    this.cardFilter = 'all';
    this.applyFilters();
  }

  ionViewWillEnter(): void {
    console.log('[Tab1Page] ionViewWillEnter');
    this.loadData();
  }

  ionViewDidEnter(): void {
    console.log('[Tab1Page] ionViewDidEnter');
  }

  ngOnDestroy(): void {
    console.log('[Tab1Page] ngOnDestroy');
  }

  loadData(): void {
    console.log('[Tab1Page] loadData ejecutado');
    this.loadDataForSelectedMonth();
    this.categories$ = this.wallet.categories$();
    this.cards$ = this.wallet.cards$();

    // Actualizar cache de tarjetas
    this.cards$.subscribe(cards => {
      this.cardsCache = cards;
    });

    // Reconfigurar transacciones filtradas
    this.setupFilteredTransactions();
  }

  /** Cargar datos para el mes seleccionado */
  private loadDataForSelectedMonth(): void {
    const range = this.getMonthRange();
    console.log('[Tab1Page] Cargando datos para:', this.selectedMonthLabel, range);

    this.totals$ = this.wallet.totals$(range);
    this.lastTx$ = this.wallet.lastTx$(100, range);
  }

  /** Obtener rango de fechas del mes seleccionado */
  private getMonthRange(): { start: Date; end: Date } {
    const start = new Date(this.selectedYear, this.selectedMonth, 1);
    const end = new Date(this.selectedYear, this.selectedMonth + 1, 0, 23, 59, 59, 999);
    return { start, end };
  }

  /** Actualizar etiqueta del mes */
  private updateMonthLabel(): void {
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];
    this.selectedMonthLabel = `${monthNames[this.selectedMonth]} ${this.selectedYear}`;

    // Verificar si es el mes actual
    const now = new Date();
    this.isCurrentMonth = (this.selectedMonth === now.getMonth() && this.selectedYear === now.getFullYear());
  }

  /** Ir al mes anterior */
  previousMonth(): void {
    if (this.selectedMonth === 0) {
      this.selectedMonth = 11;
      this.selectedYear--;
    } else {
      this.selectedMonth--;
    }
    this.updateMonthLabel();
    this.loadDataForSelectedMonth();
    this.setupFilteredTransactions();
  }

  /** Ir al mes siguiente */
  nextMonth(): void {
    if (this.isCurrentMonth) return;

    if (this.selectedMonth === 11) {
      this.selectedMonth = 0;
      this.selectedYear++;
    } else {
      this.selectedMonth++;
    }
    this.updateMonthLabel();
    this.loadDataForSelectedMonth();
    this.setupFilteredTransactions();
  }

  async openNew(): Promise<void> {
    try {
      const m = await this.modalCtrl.create({ 
        component: NewTxModal, 
        cssClass: 'tx-modal' 
      });
      await m.present();
      const result = await m.onWillDismiss();
      if (result.data?.saved) {
        this.loadData();
      }
    } catch (e) {
      console.error('[UI] openNew error', e);
    }
  }

  async openCategories(): Promise<void> {
    try {
      const m = await this.modalCtrl.create({ 
        component: CategoriesModal, 
        cssClass: 'tx-modal' 
      });
      await m.present();
      await m.onWillDismiss();
      // Recargar datos después de gestionar categorías
      this.loadData();
    } catch (e) {
      console.error('[UI] openCategories error', e);
    }
  }

  // 🔥 NUEVO: Método para obtener el nombre de la tarjeta
  getCardName(cardId: string | null | undefined): string {
    if (!cardId) return 'Tarjeta';
    
    const card = this.cardsCache.find(c => c.id === cardId);
    return card ? card.name : 'Tarjeta';
  }

  // 🔥 NUEVO: TrackBy para optimizar el renderizado
  trackByTxId(index: number, tx: any): string {
    return tx.id || index.toString();
  }
}