// src/app/tab2/tab2.page.ts

import { Component, OnDestroy, ViewChild, ElementRef, AfterViewInit, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardContent, IonIcon
} from '@ionic/angular/standalone';
import { WalletService } from '../core/wallet.service';

interface CategoryData {
  category: string;
  amount: number;
  percentage: number;
}

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
}

@Component({
  standalone: true,
  selector: 'app-tab2',
  templateUrl: './tab2.page.html',
  styleUrls: ['./tab2.page.scss'],
  imports: [
    CommonModule,
    IonHeader, IonToolbar, IonTitle, IonContent, IonCard, IonCardContent, IonIcon
  ],
})
export class Tab2Page implements OnDestroy, AfterViewInit {
  @ViewChild('categoryChart') categoryChartRef?: ElementRef;
  @ViewChild('trendChart') trendChartRef?: ElementRef;
  @ViewChild('comparisonChart') comparisonChartRef?: ElementRef;

  private categoryChart?: any;
  private trendChart?: any;
  private comparisonChart?: any;
  private chartJsLoaded = false;

  // Datos para las estadísticas
  totalIncome = 0;
  totalExpenses = 0;
  balance = 0;
  averageDaily = 0;
  topCategory = '';
  totalTransactions = 0;
  maxExpense = 0;

  categoryData: CategoryData[] = [];
  monthlyData: MonthlyData[] = [];

  chartColors = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b',
    '#8b5cf6', '#ec4899', '#14b8a6', '#f97316',
  ];

  constructor(private wallet: WalletService) {
    console.log('[Tab2Page] constructor');
    this.loadChartJS();
  }

  private async loadChartJS(): Promise<void> {
    // Cargar Chart.js desde CDN si no está disponible
    if (typeof (window as any).Chart === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      script.onload = () => {
        this.chartJsLoaded = true;
        console.log('[Tab2Page] Chart.js cargado desde CDN');
      };
      script.onerror = () => {
        console.error('[Tab2Page] Error cargando Chart.js');
      };
      document.head.appendChild(script);
    } else {
      this.chartJsLoaded = true;
    }
  }

  ngAfterViewInit(): void {
    setTimeout(() => {
      this.loadData();
    }, 800);
  }

  ionViewWillEnter(): void {
    console.log('[Tab2Page] ionViewWillEnter');
    this.loadData();
  }

  ionViewDidEnter(): void {
    console.log('[Tab2Page] ionViewDidEnter');
  }

  ngOnDestroy(): void {
    console.log('[Tab2Page] ngOnDestroy');
    this.destroyCharts();
  }

  async loadData(): Promise<void> {
    console.log('[Tab2Page] loadData ejecutado');
    
    try {
      const transactions = await this.wallet.getAllTransactions();
      
      if (transactions.length === 0) {
        console.log('[Tab2Page] No hay transacciones');
        return;
      }

      this.calculateGeneralStats(transactions);
      this.calculateCategoryData(transactions);
      this.calculateMonthlyData(transactions);
      
      // Esperar a que Chart.js esté cargado
      this.waitForChartJS().then(() => {
        this.renderCharts();
      });
      
    } catch (error) {
      console.error('[Tab2Page] Error cargando datos:', error);
    }
  }

  private async waitForChartJS(): Promise<void> {
    let attempts = 0;
    while (!this.chartJsLoaded && typeof (window as any).Chart === 'undefined' && attempts < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (typeof (window as any).Chart !== 'undefined') {
      this.chartJsLoaded = true;
    }
  }

  private calculateGeneralStats(transactions: any[]): void {
    this.totalIncome = transactions
      .filter(t => t.type === 'in')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    this.totalExpenses = transactions
      .filter(t => t.type === 'out')
      .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

    this.balance = this.totalIncome - this.totalExpenses;
    this.totalTransactions = transactions.length;
    
    const lastMonth = new Date();
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const recentTransactions = transactions.filter(t => {
      const date = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
      return date >= lastMonth;
    });
    const days = 30;
    const recentTotal = recentTransactions.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    this.averageDaily = days > 0 ? recentTotal / days : 0;

    const expenses = transactions.filter(t => t.type === 'out');
    this.maxExpense = expenses.length > 0 
      ? Math.max(...expenses.map(t => Number(t.amount) || 0))
      : 0;
  }

  private calculateCategoryData(transactions: any[]): void {
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const monthExpenses = transactions.filter(t => {
      if (t.type !== 'out') return false;
      const date = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
      return date >= currentMonth;
    });

    if (monthExpenses.length === 0) {
      this.categoryData = [];
      return;
    }

    const categoryTotals: { [key: string]: number } = {};
    monthExpenses.forEach(t => {
      const cat = t.category || 'Sin categoría';
      categoryTotals[cat] = (categoryTotals[cat] || 0) + (Number(t.amount) || 0);
    });

    const total = Object.values(categoryTotals).reduce((sum, val) => sum + val, 0);

    this.categoryData = Object.entries(categoryTotals)
      .map(([category, amount]) => ({
        category,
        amount,
        percentage: total > 0 ? (amount / total) * 100 : 0
      }))
      .sort((a, b) => b.amount - a.amount);

    this.topCategory = this.categoryData[0]?.category || '—';
  }

  private calculateMonthlyData(transactions: any[]): void {
    const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const months: MonthlyData[] = [];
    
    for (let i = 5; i >= 0; i--) {
      const date = new Date();
      date.setMonth(date.getMonth() - i);
      const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
      const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);

      const monthTransactions = transactions.filter(t => {
        const tDate = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
        return tDate >= monthStart && tDate <= monthEnd;
      });

      const income = monthTransactions
        .filter(t => t.type === 'in')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      const expenses = monthTransactions
        .filter(t => t.type === 'out')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);

      months.push({
        month: monthNames[date.getMonth()],
        income,
        expenses
      });
    }

    this.monthlyData = months;
  }

  private renderCharts(): void {
    this.destroyCharts();

    const Chart = (window as any).Chart;
    if (!Chart) {
      console.error('[Tab2Page] Chart.js no disponible');
      return;
    }

    // Gráfico de categorías
    if (this.categoryChartRef && this.categoryData.length > 0) {
      const canvas = this.categoryChartRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.categoryChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: this.categoryData.map(d => d.category),
            datasets: [{
              data: this.categoryData.map(d => d.amount),
              backgroundColor: this.chartColors,
              borderWidth: 2,
              borderColor: '#fff'
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: false },
              tooltip: {
                callbacks: {
                  label: (context: any) => {
                    const value = context.parsed;
                    const total = context.dataset.data.reduce((a: number, b: number) => a + b, 0);
                    const percentage = ((value / total) * 100).toFixed(1);
                    return `${context.label}: $${value.toFixed(2)} (${percentage}%)`;
                  }
                }
              }
            }
          }
        });
      }
    }

    // Gráfico de evolución (líneas)
    if (this.trendChartRef && this.monthlyData.length > 0) {
      const canvas = this.trendChartRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.trendChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: this.monthlyData.map(d => d.month),
            datasets: [
              {
                label: 'Ingresos',
                data: this.monthlyData.map(d => d.income),
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.1)',
                tension: 0.4,
                fill: true
              },
              {
                label: 'Gastos',
                data: this.monthlyData.map(d => d.expenses),
                borderColor: '#ef4444',
                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                tension: 0.4,
                fill: true
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: true, position: 'top' },
              tooltip: { mode: 'index', intersect: false }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { callback: (value: any) => `$${value}` }
              }
            }
          }
        });
      }
    }

    // Gráfico de comparación (barras)
    if (this.comparisonChartRef && this.monthlyData.length > 0) {
      const canvas = this.comparisonChartRef.nativeElement;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        this.comparisonChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: this.monthlyData.map(d => d.month),
            datasets: [
              {
                label: 'Ingresos',
                data: this.monthlyData.map(d => d.income),
                backgroundColor: 'rgba(16, 185, 129, 0.8)',
                borderColor: '#10b981',
                borderWidth: 1,
                borderRadius: 6
              },
              {
                label: 'Gastos',
                data: this.monthlyData.map(d => d.expenses),
                backgroundColor: 'rgba(239, 68, 68, 0.8)',
                borderColor: '#ef4444',
                borderWidth: 1,
                borderRadius: 6
              }
            ]
          },
          options: {
            responsive: true,
            maintainAspectRatio: true,
            plugins: {
              legend: { display: true, position: 'top' },
              tooltip: {
                callbacks: {
                  label: (context: any) => {
                    const value = context.parsed.y;
                    return `${context.dataset.label}: $${value.toFixed(2)}`;
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                ticks: { callback: (value: any) => `$${value}` }
              }
            }
          }
        });
      }
    }
  }

  private destroyCharts(): void {
    if (this.categoryChart) {
      this.categoryChart.destroy();
      this.categoryChart = undefined;
    }
    if (this.trendChart) {
      this.trendChart.destroy();
      this.trendChart = undefined;
    }
    if (this.comparisonChart) {
      this.comparisonChart.destroy();
      this.comparisonChart = undefined;
    }
  }
}