// src/app/core/wallet.service.ts

import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  CollectionReference,
  DocumentData,
  collection,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  collectionData,
  query,
  orderBy,
  where,
  limit,
  getDocs,
  getDoc,
  updateDoc,
  Timestamp,
} from '@angular/fire/firestore';

import { Observable, firstValueFrom, of, from } from 'rxjs';
import { map, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';

export type TxType = 'in' | 'out';

export interface Tx {
  id?: string;
  type: TxType;
  amount: number;
  category: string;
  paymentMethod?: 'cash' | 'card';
  cardId?: string | null;
  /** Id del préstamo al que corresponde este pago (solo para category='Pago Préstamo') */
  loanId?: string | null;
  note?: string | null;
  createdAt: any;
}

export interface Category {
  id?: string;
  name: string;
  emoji: string;
}

export interface Card {
  id?: string;
  name: string;
  limit: number;
  cutoffDate: Date;
  paymentDate: Date;
  lastFourDigits?: string;
  type?: 'credit' | 'debit';
  /** Saldo pendiente del último estado de cuenta cerrado (balance al corte no pagado) */
  statementBalance?: number;
  /** Fecha del último corte procesado (para evitar doble conteo) */
  statementDate?: any;
}

export interface Totals {
  in: number;
  out: number;
  balance: number;
}

/**
 * Historial de sueldos: cada entrada tiene un monto y la fecha
 * desde cuando aplica (primer día del mes).  Esto permite que al
 * filtrar el mes de enero el sistema use el sueldo que regía entonces,
 * aunque haya subido en mayo.
 */
export interface SalaryEntry {
  id?: string;
  amount: number;
  effectiveFrom: any;   // Timestamp | Date — primer día del mes
  notes?: string;
}

export interface Loan {
  id?: string;
  name: string;               // Ej. "BanReservas Personal"
  loanType: string;           // Personal, Hipotecario, Vehicular, Comercial
  originalAmount: number;     // Monto original del préstamo
  balance: number;            // Saldo pendiente actual
  monthlyPayment: number;     // Cuota mensual
  interestRate: number;       // Tasa de interés anual %
  termMonths: number;         // Plazo total en meses
  paidMonths: number;         // Meses ya pagados
  nextPaymentDate: any;       // Próxima fecha de pago (Timestamp | Date)
  color?: string;             // Color para mostrar en UI
  notes?: string;
  createdAt?: any;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  private afs = inject(Firestore);
  private auth = inject(AuthService);

  get currentUser() { return this.auth.currentUser; }

  private col$<T extends DocumentData>(sub: string): Observable<CollectionReference<T> | null> {
    return this.auth.user$.pipe(
      map(u => u?.uid
        ? (collection(this.afs, `users/${u.uid}/${sub}`) as CollectionReference<T>)
        : null)
    );
  }

  // ─── Salary History ──────────────────────────────────────────────────────────

  /**
   * Devuelve el sueldo que estaba activo en el mes indicado.
   * Busca en salaryHistory la entrada cuyo effectiveFrom sea la más reciente
   * que NO supere el primer día del mes consultado.
   */
  async getSalaryForMonth(year: number, month: number): Promise<number> {
    const user = this.currentUser;
    if (!user?.uid) return 0;

    // primer día del mes (00:00:00)
    const monthStart = new Date(year, month, 1, 0, 0, 0, 0);

    try {
      const ref = collection(this.afs, `users/${user.uid}/salaryHistory`);
      const q = query(
        ref,
        where('effectiveFrom', '<=', Timestamp.fromDate(monthStart)),
        orderBy('effectiveFrom', 'desc'),
        limit(1)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const data = snap.docs[0].data() as SalaryEntry;
        return Number(data.amount) || 0;
      }

      // Fallback: salary en el documento del usuario (migración desde versión anterior)
      const userRef = doc(this.afs, `users/${user.uid}`);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const d = userSnap.data();
        return Number(d?.['salary']) || 0;
      }
      return 0;
    } catch (e) {
      console.error('[WalletService] getSalaryForMonth error:', e);
      return 0;
    }
  }

  /**
   * Agrega una entrada al historial de sueldos.
   * Si `effectiveFrom` no se indica usa el primer día del mes actual.
   */
  async addSalaryEntry(entry: { amount: number; effectiveFrom?: Date; notes?: string }): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) throw new Error('Sin sesión');

    const from = entry.effectiveFrom ?? (() => {
      const n = new Date();
      return new Date(n.getFullYear(), n.getMonth(), 1);
    })();

    const ref = collection(this.afs, `users/${user.uid}/salaryHistory`);
    await addDoc(ref, {
      amount: entry.amount,
      effectiveFrom: Timestamp.fromDate(from),
      notes: entry.notes ?? null,
    });
    console.log('[WalletService] SalaryEntry agregado:', entry.amount, 'desde', from);
  }

  /** Obtiene todo el historial de sueldos, más reciente primero */
  salaryHistory$(): Observable<SalaryEntry[]> {
    return this.col$<SalaryEntry>('salaryHistory').pipe(
      switchMap(col => {
        if (!col) return of<SalaryEntry[]>([]);
        return collectionData(
          query(col, orderBy('effectiveFrom', 'desc')),
          { idField: 'id' }
        ) as Observable<SalaryEntry[]>;
      })
    );
  }

  async deleteSalaryEntry(entryId: string): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) return;
    const ref = doc(this.afs, `users/${user.uid}/salaryHistory/${entryId}`);
    await deleteDoc(ref);
  }

  // ─── Transactions ────────────────────────────────────────────────────────────

  lastTx$(takeCount = 10, range?: { start: Date; end: Date }): Observable<Tx[]> {
    return this.col$<Tx>('tx').pipe(
      switchMap(col => {
        if (!col) return of([]);
        let qRef = query(col, orderBy('createdAt', 'desc'), limit(takeCount));
        if (range) {
          qRef = query(
            col,
            where('createdAt', '>=', range.start),
            where('createdAt', '<=', range.end),
            orderBy('createdAt', 'desc'),
            limit(takeCount)
          );
        }
        return collectionData(qRef, { idField: 'id' }) as Observable<Tx[]>;
      })
    );
  }

  /**
   * Calcula totales para el rango dado, incluyendo el sueldo histórico correcto.
   * El sueldo se trata como un ingreso fijo para ese mes (no se registra como Tx).
   */
  async totalsForRange(range: { start: Date; end: Date }): Promise<Totals> {
    const user = this.currentUser;
    if (!user?.uid) return { in: 0, out: 0, balance: 0 };

    // 1) Sueldo activo en ese mes
    const salary = await this.getSalaryForMonth(
      range.start.getFullYear(),
      range.start.getMonth()
    );

    // 2) Transacciones del rango
    const txRef = collection(this.afs, `users/${user.uid}/tx`);
    const q = query(
      txRef,
      where('createdAt', '>=', range.start),
      where('createdAt', '<=', range.end),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    const txs = snap.docs.map(d => d.data()) as Tx[];

    let inc = salary;
    let exp = 0;
    for (const t of txs) {
      const n = Number(t.amount || 0);
      if (t.type === 'in') inc += n;
      else exp += n;
    }

    console.log('[WalletService] totalsForRange:', { salary, inc, exp, range });
    return { in: inc, out: exp, balance: inc - exp };
  }

  /** Observable de totales para el rango (para el dashboard reactivo) */
  totals$(range?: { start: Date; end: Date }): Observable<Totals> {
    const now = new Date();
    const r = range ?? {
      start: new Date(now.getFullYear(), now.getMonth(), 1),
      end:   new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999),
    };
    return from(this.totalsForRange(r));
  }

  async getAllTransactions(): Promise<Tx[]> {
    const user = this.currentUser;
    if (!user?.uid) return [];
    try {
      const txRef = collection(this.afs, `users/${user.uid}/tx`);
      const snap = await getDocs(query(txRef, orderBy('createdAt', 'desc')));
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Tx[];
    } catch (e) {
      console.error('[WalletService] getAllTransactions error:', e);
      return [];
    }
  }

  async addTx(data: {
    type: TxType;
    amount: number;
    category: string;
    paymentMethod?: 'cash' | 'card';
    cardId?: string | null;
    loanId?: string | null;
    createdAt?: Date;
    note?: string | null;
  }): Promise<void> {
    const col = await firstValueFrom(this.col$<Tx>('tx'));
    if (!col) throw new Error('Sin sesión');
    await addDoc(col, {
      type: data.type,
      amount: data.amount,
      category: data.category,
      paymentMethod: data.paymentMethod ?? 'cash',
      cardId: data.paymentMethod === 'card' ? (data.cardId ?? null) : null,
      loanId: data.loanId ?? null,
      note: data.note ?? null,
      createdAt: data.createdAt ?? serverTimestamp(),
    });
  }

  async deleteTx(txId: string): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) return;
    await deleteDoc(doc(this.afs, `users/${user.uid}/tx/${txId}`));
  }

  // ─── Categories ──────────────────────────────────────────────────────────────

  categories$(): Observable<Category[]> {
    return this.col$<Category>('categories').pipe(
      switchMap(col => {
        if (!col) return of<Category[]>([]);
        return collectionData(query(col, orderBy('name')), { idField: 'id' }) as Observable<Category[]>;
      })
    );
  }

  async addCategory(cat: { name: string; emoji: string }): Promise<void> {
    const col = await firstValueFrom(this.col$<Category>('categories'));
    if (!col) return;
    await addDoc(col, { name: cat.name, emoji: cat.emoji });
  }

  async deleteCategory(id: string): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) return;
    await deleteDoc(doc(this.afs, `users/${user.uid}/categories/${id}`));
  }

  // ─── Cards ───────────────────────────────────────────────────────────────────

  cards$(): Observable<Card[]> {
    return this.col$<Card>('cards').pipe(
      switchMap(col => {
        if (!col) return of<Card[]>([]);
        return collectionData(query(col, orderBy('name')), { idField: 'id' }) as Observable<Card[]>;
      })
    );
  }

  async addCard(card: { name: string; limit: number; cutoffDate: Date; paymentDate: Date }): Promise<void> {
    const col = await firstValueFrom(this.col$<Card>('cards'));
    if (!col) return;
    await addDoc(col, { ...card });
  }

  async deleteCard(cardId: string): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) return;
    await deleteDoc(doc(this.afs, `users/${user.uid}/cards/${cardId}`));
  }

  async getAllCards(): Promise<Card[]> {
    const user = this.currentUser;
    if (!user?.uid) return [];
    try {
      const ref = collection(this.afs, `users/${user.uid}/cards`);
      const snap = await getDocs(query(ref, orderBy('name')));
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Card[];
    } catch { return []; }
  }

  async updateCardDates(cardId: string, cutoffDate: Date, paymentDate: Date): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) return;
    const ref = doc(this.afs, `users/${user.uid}/cards/${cardId}`);
    await updateDoc(ref, { cutoffDate, paymentDate });
  }

  /** Actualiza campos arbitrarios de una tarjeta (p.ej. statementBalance) */
  async updateCard(cardId: string, data: Partial<Card> & Record<string, any>): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) return;
    const ref = doc(this.afs, `users/${user.uid}/cards/${cardId}`);
    await updateDoc(ref, { ...data });
  }

  getNextMonthDate(date: Date): Date {
    const d = new Date(date);
    const day = d.getDate();
    d.setMonth(d.getMonth() + 1);
    if (d.getDate() !== day) d.setDate(0);
    return d;
  }

  // ─── Loans ───────────────────────────────────────────────────────────────────

  loans$(): Observable<Loan[]> {
    return this.col$<Loan>('loans').pipe(
      switchMap(col => {
        if (!col) return of<Loan[]>([]);
        return collectionData(
          query(col, orderBy('createdAt', 'desc')),
          { idField: 'id' }
        ) as Observable<Loan[]>;
      })
    );
  }

  async getAllLoans(): Promise<Loan[]> {
    const user = this.currentUser;
    if (!user?.uid) return [];
    try {
      const ref = collection(this.afs, `users/${user.uid}/loans`);
      const snap = await getDocs(query(ref, orderBy('createdAt', 'desc')));
      return snap.docs.map(d => ({ id: d.id, ...d.data() })) as Loan[];
    } catch { return []; }
  }

  async addLoan(loan: Omit<Loan, 'id' | 'createdAt'>): Promise<void> {
    const col = await firstValueFrom(this.col$<Loan>('loans'));
    if (!col) throw new Error('Sin sesión');
    await addDoc(col, {
      ...loan,
      nextPaymentDate: loan.nextPaymentDate instanceof Date
        ? Timestamp.fromDate(loan.nextPaymentDate)
        : loan.nextPaymentDate,
      createdAt: serverTimestamp(),
    });
  }

  async updateLoan(loanId: string, data: Partial<Loan>): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) return;
    const ref = doc(this.afs, `users/${user.uid}/loans/${loanId}`);
    await updateDoc(ref, { ...data });
  }

  async deleteLoan(loanId: string): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) return;
    await deleteDoc(doc(this.afs, `users/${user.uid}/loans/${loanId}`));
  }

  /** % pagado del préstamo */
  getLoanPaidPct(loan: Loan): number {
    if (!loan.originalAmount || loan.originalAmount === 0) return 0;
    const paid = loan.originalAmount - loan.balance;
    return Math.min(Math.round((paid / loan.originalAmount) * 100), 100);
  }

  /** Días restantes para próximo pago */
  getLoanDaysUntilPayment(loan: Loan): number {
    if (!loan.nextPaymentDate) return 999;
    const d = loan.nextPaymentDate?.toDate ? loan.nextPaymentDate.toDate() : new Date(loan.nextPaymentDate);
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return Math.round((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  }

  async checkAndUpdateCardDates(): Promise<void> {
    const cards = await this.getAllCards();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    // Cargamos todas las transacciones una sola vez
    let allTx: Tx[] = [];
    try { allTx = await this.getAllTransactions(); } catch {}

    for (const card of cards) {
      let needsUpdate = false;
      let statementDelta = 0;

      let cutoff = card.cutoffDate instanceof Date
        ? card.cutoffDate
        : (card.cutoffDate as any)?.toDate?.() || new Date(card.cutoffDate);
      let payment = card.paymentDate instanceof Date
        ? card.paymentDate
        : (card.paymentDate as any)?.toDate?.() || new Date(card.paymentDate);

      // statementDate marca el último corte que ya procesamos
      const lastStatementDate: Date | null = (card as any).statementDate
        ? ((card as any).statementDate?.toDate?.() || new Date((card as any).statementDate))
        : null;

      while (cutoff < now) {
        // ¿Ya procesamos este período?
        const alreadyProcessed = lastStatementDate !== null
          && lastStatementDate.getTime() >= cutoff.getTime();

        if (!alreadyProcessed && card.id) {
          // Período que cierra: desde (cutoff − 1 mes) hasta cutoff
          const pStart = new Date(cutoff.getFullYear(), cutoff.getMonth() - 1, cutoff.getDate());
          const pEnd   = new Date(cutoff);

          const periodSpent = allTx
            .filter(tx => {
              if (tx.cardId !== card.id || tx.paymentMethod !== 'card') return false;
              const d = tx.createdAt?.toDate ? tx.createdAt.toDate() : new Date(tx.createdAt);
              return d >= pStart && d < pEnd;
            })
            .reduce((s, t) => s + Number(t.amount || 0), 0);

          statementDelta += periodSpent;
        }

        cutoff = this.getNextMonthDate(cutoff);
        needsUpdate = true;
      }

      while (payment < now) { payment = this.getNextMonthDate(payment); needsUpdate = true; }

      if (needsUpdate && card.id) {
        const currentStatement = Number((card as any).statementBalance || 0);
        const updates: any = { cutoffDate: cutoff, paymentDate: payment };

        if (statementDelta > 0) {
          // La fecha del corte que acabamos de procesar es la cutoff ANTES de avanzar
          // (la guardamos para no reprocesar en futuras ejecuciones)
          const processedCutoff = card.cutoffDate instanceof Date
            ? card.cutoffDate
            : (card.cutoffDate as any)?.toDate?.() || new Date(card.cutoffDate);
          updates.statementBalance = currentStatement + statementDelta;
          updates.statementDate    = processedCutoff;
        }

        await this.updateCard(card.id, updates);
      }
    }
  }
}
