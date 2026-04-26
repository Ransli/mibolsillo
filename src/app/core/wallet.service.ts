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
} from '@angular/fire/firestore';

import { Observable, firstValueFrom, of, combineLatest, from } from 'rxjs';
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
}

export interface Totals {
  in: number;
  out: number;
  balance: number;
}

@Injectable({ providedIn: 'root' })
export class WalletService {
  private afs = inject(Firestore);
  private auth = inject(AuthService);

  get currentUser() {
    return this.auth.currentUser;
  }

  private col$<T extends DocumentData>(sub: 'tx' | 'categories' | 'cards'): Observable<CollectionReference<T> | null> {
    return this.auth.user$.pipe(
      map(u => u?.uid ? (collection(this.afs, `users/${u.uid}/${sub}`) as CollectionReference<T>) : null)
    );
  }

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
   * 🔥 CORREGIDO: Calcula los totales incluyendo el sueldo del mes actual
   */
  totals$(range?: { start: Date; end: Date }): Observable<Totals> {
    return combineLatest([
      this.col$<Tx>('tx').pipe(
        switchMap(col => {
          if (!col) return of<Tx[]>([]);
          let qRef = query(col, orderBy('createdAt', 'desc'));
          if (range) {
            qRef = query(
              col,
              where('createdAt', '>=', range.start),
              where('createdAt', '<=', range.end),
              orderBy('createdAt', 'desc')
            );
          }
          return collectionData(qRef, { idField: 'id' }) as Observable<Tx[]>;
        })
      ),
      this.auth.user$.pipe(
        switchMap(user => {
          if (!user?.uid) return of(null);
          // 🔥 NUEVO: Obtener el sueldo desde Firestore
          const userRef = doc(this.afs, `users/${user.uid}`);
          return from(getDoc(userRef)).pipe(
            map(docSnap => {
              if (docSnap.exists()) {
                const data = docSnap.data();
                return data?.['salary'] || 0;
              }
              return 0;
            })
          );
        })
      )
    ]).pipe(
      map(([list, salary]) => {
        let inc = 0, exp = 0;
        
        // 🔥 CORREGIDO: Agregar el sueldo como ingreso del mes actual
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();
        
        // Si no hay rango, usar el mes actual
        if (!range) {
          if (salary) {
            inc += Number(salary);
            console.log('[WalletService] Sueldo mensual agregado:', salary);
          }
        } else {
          // Si hay rango y el mes actual está en ese rango, agregar el sueldo
          const rangeStartMonth = range.start.getMonth();
          const rangeStartYear = range.start.getFullYear();
          if (rangeStartMonth === currentMonth && rangeStartYear === currentYear) {
            if (salary) {
              inc += Number(salary);
              console.log('[WalletService] Sueldo mensual agregado al rango:', salary);
            }
          }
        }
        
        // Sumar transacciones
        for (const t of list) {
          const n = Number(t.amount || 0);
          if (t.type === 'in') inc += n;
          else exp += n;
        }
        
        console.log('[WalletService] Totales calculados:', { in: inc, out: exp, balance: inc - exp });
        return { in: inc, out: exp, balance: inc - exp };
      })
    );
  }

  async getAllTransactions(): Promise<Tx[]> {
    const user = this.currentUser;
    if (!user?.uid) {
      console.warn('[WalletService] No hay usuario autenticado para getAllTransactions');
      return [];
    }

    try {
      const txRef = collection(this.afs, `users/${user.uid}/tx`);
      const q = query(txRef, orderBy('createdAt', 'desc'));
      
      const snapshot = await getDocs(q);
      const transactions = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Tx[];

      console.log(`[WalletService] Obtenidas ${transactions.length} transacciones`);
      return transactions;
    } catch (error) {
      console.error('[WalletService] Error al obtener todas las transacciones:', error);
      return [];
    }
  }

  async addTx(data: {
    type: TxType;
    amount: number;
    category: string;
    paymentMethod?: 'cash' | 'card';
    cardId?: string | null;
    createdAt?: Date;
    note?: string | null;
  }): Promise<void> {
    const col = await firstValueFrom(this.col$<Tx>('tx'));
    if (!col) {
      console.warn('[WalletService] No se puede agregar transacción sin sesión');
      throw new Error('No hay sesión activa');
    }
    
    const txData = {
      type: data.type,
      amount: data.amount,
      category: data.category,
      paymentMethod: data.paymentMethod ?? 'cash',
      cardId: data.paymentMethod === 'card' ? data.cardId ?? null : null,
      note: data.note ?? null,
      createdAt: data.createdAt ?? serverTimestamp(),
    };

    console.log('[WalletService] Agregando transacción:', txData);
    
    await addDoc(col, txData);

    console.log('[WalletService] ✅ Transacción agregada exitosamente');
  }

  async deleteTx(txId: string): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) {
      console.warn('[WalletService] No se puede eliminar transacción sin sesión');
      return;
    }

    try {
      const txRef = doc(this.afs, `users/${user.uid}/tx/${txId}`);
      await deleteDoc(txRef);
      console.log('[WalletService] Transacción eliminada');
    } catch (error) {
      console.error('[WalletService] Error eliminando transacción:', error);
      throw error;
    }
  }

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
    if (!col) {
      console.warn('[WalletService] No se puede agregar categoría sin sesión');
      return;
    }
    
    await addDoc(col, { name: cat.name, emoji: cat.emoji });
    console.log('[WalletService] Categoría agregada:', cat.name);
  }

  async deleteCategory(categoryId: string): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) {
      console.warn('[WalletService] No se puede eliminar categoría sin sesión');
      return;
    }

    try {
      const categoryRef = doc(this.afs, `users/${user.uid}/categories/${categoryId}`);
      await deleteDoc(categoryRef);
      console.log('[WalletService] Categoría eliminada');
    } catch (error) {
      console.error('[WalletService] Error eliminando categoría:', error);
      throw error;
    }
  }

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
    if (!col) {
      console.warn('[WalletService] No se puede agregar tarjeta sin sesión');
      return;
    }
    
    await addDoc(col, {
      name: card.name,
      limit: card.limit,
      cutoffDate: card.cutoffDate,
      paymentDate: card.paymentDate
    });
    console.log('[WalletService] Tarjeta agregada:', card.name);
  }

  async deleteCard(cardId: string): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) {
      console.warn('[WalletService] No se puede eliminar tarjeta sin sesión');
      return;
    }

    try {
      const cardRef = doc(this.afs, `users/${user.uid}/cards/${cardId}`);
      await deleteDoc(cardRef);
      console.log('[WalletService] Tarjeta eliminada');
    } catch (error) {
      console.error('[WalletService] Error eliminando tarjeta:', error);
      throw error;
    }
  }

  /** Obtener todas las tarjetas (snapshot único) */
  async getAllCards(): Promise<Card[]> {
    const user = this.currentUser;
    if (!user?.uid) return [];

    try {
      const cardsRef = collection(this.afs, `users/${user.uid}/cards`);
      const snapshot = await getDocs(query(cardsRef, orderBy('name')));
      return snapshot.docs.map(d => ({
        id: d.id,
        ...d.data()
      })) as Card[];
    } catch (error) {
      console.error('[WalletService] Error obteniendo tarjetas:', error);
      return [];
    }
  }

  /** Actualizar fechas de una tarjeta */
  async updateCardDates(cardId: string, cutoffDate: Date, paymentDate: Date): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) return;

    try {
      const cardRef = doc(this.afs, `users/${user.uid}/cards/${cardId}`);
      await updateDoc(cardRef, { cutoffDate, paymentDate });
      console.log('[WalletService] Fechas de tarjeta actualizadas:', cardId);
    } catch (error) {
      console.error('[WalletService] Error actualizando fechas:', error);
      throw error;
    }
  }

  /** Avanzar fecha al siguiente mes (mantiene el mismo día) */
  getNextMonthDate(date: Date): Date {
    const d = new Date(date);
    const day = d.getDate();
    d.setMonth(d.getMonth() + 1);
    // Si el día no existe en el nuevo mes (ej: 31 feb), ajustar
    if (d.getDate() !== day) {
      d.setDate(0); // Último día del mes anterior
    }
    return d;
  }

  /** Verificar y actualizar fechas de tarjetas si ya pasaron */
  async checkAndUpdateCardDates(): Promise<void> {
    const cards = await this.getAllCards();
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    for (const card of cards) {
      let needsUpdate = false;
      let cutoffDate = card.cutoffDate instanceof Date
        ? card.cutoffDate
        : (card.cutoffDate as any)?.toDate?.() || new Date(card.cutoffDate);
      let paymentDate = card.paymentDate instanceof Date
        ? card.paymentDate
        : (card.paymentDate as any)?.toDate?.() || new Date(card.paymentDate);

      // Si la fecha de corte ya pasó, avanzar al siguiente mes
      while (cutoffDate < now) {
        cutoffDate = this.getNextMonthDate(cutoffDate);
        needsUpdate = true;
      }

      // Si la fecha de pago ya pasó, avanzar al siguiente mes
      while (paymentDate < now) {
        paymentDate = this.getNextMonthDate(paymentDate);
        needsUpdate = true;
      }

      if (needsUpdate && card.id) {
        await this.updateCardDates(card.id, cutoffDate, paymentDate);
        console.log(`[WalletService] Fechas actualizadas para ${card.name}`);
      }
    }
  }
}