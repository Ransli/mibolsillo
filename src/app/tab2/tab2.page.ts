// src/app/tab2/tab2.page.ts

import { Component, OnDestroy, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonContent } from '@ionic/angular/standalone';
import { WalletService } from '../core/wallet.service';

interface CategoryData  { category: string; amount: number; percentage: number; }
interface MonthlyData   { month: string; income: number; expenses: number; }

@Component({
  standalone: true,
  selector: 'app-tab2',
  templateUrl: './tab2.page.html',
  styleUrls: ['./tab2.page.scss'],
  imports: [CommonModule, IonContent],
})
export class Tab2Page implements OnDestroy, AfterViewInit {
  @ViewChild('categoryChart')  categoryChartRef?:  ElementRef;
  @ViewChild('trendChart')     trendChartRef?:     ElementRef;
  @ViewChild('comparisonChart') comparisonChartRef?: ElementRef;

  private categoryChart?: any;
  private trendChart?: any;
  private comparisonChart?: any;
  private chartJsLoaded = false;

  // Totals for current period
  totalIncome = 0;
  totalExpenses = 0;
  balance = 0;
  averageDaily = 0;
  topCategory = '';
  totalTransactions = 0;
  maxExpense = 0;

  categoryData: CategoryData[] = [];
  monthlyData:  MonthlyData[]  = [];

  // Period navigation
  selectedMonth: number;
  selectedYear: number;
  currentMonthLabel = '';
  isCurrentMonth = true;

  readonly chartColors = [
    '#F97316','#3B82F6','#EF4444','#A855F7',
    '#F59E0B','#10B981','#06B6D4','#EC4899',
  ];

  constructor(private wallet: WalletService) {
    const n = new Date();
    this.selectedMonth = n.getMonth();
    this.selectedYear  = n.getFullYear();
    this.updateLabel();
    this.loadChartJS();
  }

  private updateLabel(): void {
    const names = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
    this.currentMonthLabel = `${names[this.selectedMonth]} ${this.selectedYear}`;
    const n = new Date();
    this.isCurrentMonth = this.selectedMonth === n.getMonth() && this.selectedYear === n.getFullYear();
  }

  prevMonth(): void {
    if (this.selectedMonth === 0) { this.selectedMonth = 11; this.selectedYear--; }
    else this.selectedMonth--;
    this.updateLabel();
    this.loadData();
  }

  nextMonth(): void {
    if (this.isCurrentMonth) return;
    if (this.selectedMonth === 11) { this.selectedMonth = 0; this.selectedYear++; }
    else this.selectedMonth++;
    this.updateLabel();
    this.loadData();
  }

  private async loadChartJS(): Promise<void> {
    if (typeof (window as any).Chart === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js';
      s.onload = () => { this.chartJsLoaded = true; };
      document.head.appendChild(s);
    } else { this.chartJsLoaded = true; }
  }

  ngAfterViewInit(): void { setTimeout(() => this.loadData(), 800); }
  ionViewWillEnter(): void { this.loadData(); }
  ionViewDidEnter(): void {}
  ngOnDestroy(): void { this.destroyCharts(); }

  async loadData(): Promise<void> {
    try {
      const all = await this.wallet.getAllTransactions();

      // Filter to selected month
      const monthStart = new Date(this.selectedYear, this.selectedMonth, 1);
      const monthEnd   = new Date(this.selectedYear, this.selectedMonth + 1, 0, 23, 59, 59);
      const monthTxs   = all.filter(t => {
        const d = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
        return d >= monthStart && d <= monthEnd;
      });

      this.totalTransactions = monthTxs.length;
      this.totalIncome    = monthTxs.filter(t => t.type==='in').reduce((s,t) => s + Number(t.amount||0), 0);
      this.totalExpenses  = monthTxs.filter(t => t.type==='out').reduce((s,t) => s + Number(t.amount||0), 0);

      // Add salary for this month
      const salary = await this.wallet.getSalaryForMonth(this.selectedYear, this.selectedMonth);
      this.totalIncome += salary;

      this.balance      = this.totalIncome - this.totalExpenses;
      this.averageDaily = this.totalExpenses / 30;

      const expenses = monthTxs.filter(t => t.type === 'out');
      this.maxExpense = expenses.length ? Math.max(...expenses.map(t => Number(t.amount||0))) : 0;

      // Category breakdown
      const catMap: Record<string,number> = {};
      expenses.forEach(t => { const c = t.category || 'Sin categoría'; catMap[c] = (catMap[c]||0) + Number(t.amount||0); });
      const catTotal = Object.values(catMap).reduce((a,b) => a+b, 0);
      this.categoryData = Object.entries(catMap)
        .map(([category, amount]) => ({ category, amount, percentage: catTotal ? (amount/catTotal)*100 : 0 }))
        .sort((a,b) => b.amount - a.amount);
      this.topCategory = this.categoryData[0]?.category || '—';

      // Last 6 months trend
      this.calculateMonthlyData(all);

      await this.waitForChartJS();
      this.renderCharts();
    } catch (e) { console.error('[Tab2] loadData error:', e); }
  }

  private calculateMonthlyData(all: any[]): void {
    const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    this.monthlyData = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const s = new Date(d.getFullYear(), d.getMonth(), 1);
      const e = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      const txs = all.filter(t => {
        const td = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
        return td >= s && td <= e;
      });
      const income   = txs.filter(t=>t.type==='in').reduce((s,t)=>s+Number(t.amount||0),0);
      const expenses = txs.filter(t=>t.type==='out').reduce((s,t)=>s+Number(t.amount||0),0);
      this.monthlyData.push({ month: names[d.getMonth()], income, expenses });
    }
  }

  private async waitForChartJS(): Promise<void> {
    let n = 0;
    while (!this.chartJsLoaded && typeof (window as any).Chart === 'undefined' && n < 20) {
      await new Promise(r => setTimeout(r, 100)); n++;
    }
    if (typeof (window as any).Chart !== 'undefined') this.chartJsLoaded = true;
  }

  private renderCharts(): void {
    this.destroyCharts();
    const Chart = (window as any).Chart;
    if (!Chart) return;

    Chart.defaults.color = '#94A3B8';
    Chart.defaults.borderColor = 'rgba(45,45,68,0.6)';

    if (this.categoryChartRef && this.categoryData.length) {
      const ctx = this.categoryChartRef.nativeElement.getContext('2d');
      if (ctx) {
        this.categoryChart = new Chart(ctx, {
          type: 'doughnut',
          data: {
            labels: this.categoryData.map(d=>d.category),
            datasets: [{ data: this.categoryData.map(d=>d.amount), backgroundColor: this.chartColors, borderWidth: 2, borderColor: '#1A1A2E' }]
          },
          options: { responsive: false, plugins: { legend: { display: false } } }
        });
      }
    }

    if (this.trendChartRef && this.monthlyData.length) {
      const ctx = this.trendChartRef.nativeElement.getContext('2d');
      if (ctx) {
        this.trendChart = new Chart(ctx, {
          type: 'line',
          data: {
            labels: this.monthlyData.map(d=>d.month),
            datasets: [
              { label:'Ingresos', data: this.monthlyData.map(d=>d.income), borderColor:'#10B981', backgroundColor:'rgba(16,185,129,0.12)', tension:.4, fill:true },
              { label:'Gastos',   data: this.monthlyData.map(d=>d.expenses), borderColor:'#EF4444', backgroundColor:'rgba(239,68,68,0.12)', tension:.4, fill:true }
            ]
          },
          options: { responsive:true, maintainAspectRatio:true, plugins:{ legend:{display:true,position:'top'} }, scales:{ y:{beginAtZero:true} } }
        });
      }
    }

    if (this.comparisonChartRef && this.monthlyData.length) {
      const ctx = this.comparisonChartRef.nativeElement.getContext('2d');
      if (ctx) {
        this.comparisonChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: this.monthlyData.map(d=>d.month),
            datasets: [
              { label:'Ingresos', data: this.monthlyData.map(d=>d.income), backgroundColor:'rgba(16,185,129,0.8)', borderRadius:6 },
              { label:'Gastos',   data: this.monthlyData.map(d=>d.expenses), backgroundColor:'rgba(239,68,68,0.8)', borderRadius:6 }
            ]
          },
          options: { responsive:true, maintainAspectRatio:true, plugins:{ legend:{display:true,position:'top'} }, scales:{ y:{beginAtZero:true} } }
        });
      }
    }
  }

  private destroyCharts(): void {
    this.categoryChart?.destroy(); this.categoryChart = undefined;
    this.trendChart?.destroy();    this.trendChart    = undefined;
    this.comparisonChart?.destroy();this.comparisonChart = undefined;
  }
}
