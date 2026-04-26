// src/app/features/auth/login.page.ts

// Pantalla de login con:
// - Botón "Continuar con Google".
// - Lista de usuarios recientes guardados localmente.
// - Acciones: Continuar (con hint si está disponible) y Quitar.

import { Component, OnInit, inject } from '@angular/core';
import { IonicModule } from '@ionic/angular';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';

// Servicio centralizado de autenticación
import { AuthService } from '../../core/auth.service';

type RecentUser = {
  displayName: string | null | undefined;
  email: string | null | undefined;
  photoURL: string | null | undefined;
  lastLoginAt: number; // timestamp para ordenar
};

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [IonicModule, CommonModule],
  templateUrl: './login.page.html',
  styleUrls: ['./login.page.scss'],
})
export class LoginPage implements OnInit {
  private auth = inject(AuthService);
  private router = inject(Router);

  recentUsers: RecentUser[] = [];

  ngOnInit(): void {
    this.loadRecents();
  }

  // Botón principal
  async continueWithGoogle(): Promise<void> {
    console.log('[LOGIN] click - iniciando login con Google');
    try {
      await this.auth.loginWithGoogle();
      console.log('[LOGIN] loginWithGoogle completado');
      await this.onLoginSuccess();
    } catch (error: any) {
      console.error('[LOGIN] Error en loginWithGoogle:', error);
      console.error('[LOGIN] Error message:', error?.message);
      console.error('[LOGIN] Error code:', error?.code);
      alert('Error al iniciar sesión: ' + (error?.message || 'Error desconocido'));
    }
  }
  
  // Continuar con usuario de la lista local (si auth.loginWithGoogleHint existe, lo usamos)
  async continueWithRecent(u: RecentUser): Promise<void> {
    const email = u.email ?? undefined;
    try {
      const fn = (this.auth as any)?.loginWithGoogleHint as
        | ((email?: string) => Promise<void>)
        | undefined;
      if (fn && email) {
        await fn.call(this.auth, email);
      } else {
        // fallback sin hint si no existe el método en tu AuthService
        await this.auth.loginWithGoogle();
      }
      await this.onLoginSuccess();
    } catch (e) {
      console.warn('[LOGIN] error usando recent -> fallback login normal', e);
      await this.auth.loginWithGoogle();
      await this.onLoginSuccess();
    }
  }

  // Borra un usuario de la lista local
  forget(u: RecentUser): void {
    this.recentUsers = this.recentUsers.filter(x => x.email !== u.email);
    this.saveRecents();
  }

  // Guardar/actualizar el usuario logueado como "reciente" y navegar
  private async onLoginSuccess(): Promise<void> {
    console.log('[LOGIN] login OK -> navegando');
    const u = this.auth.currentUser;
    if (u) {
      const toSave: RecentUser = {
        displayName: u.displayName,
        email: u.email,
        photoURL: u.photoURL,
        lastLoginAt: Date.now(),
      };
      // mete/actualiza por email y limita a 5
      const others = this.recentUsers.filter(x => x.email !== toSave.email);
      this.recentUsers = [toSave, ...others]
        .sort((a, b) => b.lastLoginAt - a.lastLoginAt)
        .slice(0, 5);
      this.saveRecents();
    }
    this.router.navigateByUrl('/tabs/tab1', { replaceUrl: true });
  }

  // ==== utilidades: persistencia local ====
  private loadRecents(): void {
    try {
      const raw = localStorage.getItem('recentUsers');
      this.recentUsers = raw ? (JSON.parse(raw) as RecentUser[]) : [];
    } catch {
      this.recentUsers = [];
    }
  }

  private saveRecents(): void {
    try {
      localStorage.setItem('recentUsers', JSON.stringify(this.recentUsers));
    } catch {
      // ignoramos errores de almacenamiento
    }
  }
}
