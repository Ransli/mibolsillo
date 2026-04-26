// src/app/core/auth.service.ts

import { Injectable, inject } from '@angular/core';
import {
  Auth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  signOut,
  User
} from '@angular/fire/auth';
import { authState } from '@angular/fire/auth';
import {
  Firestore,
  doc,
  setDoc,
  getDoc,
  updateDoc
} from '@angular/fire/firestore';
import { Observable, map, throwError, timer } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { Capacitor } from '@capacitor/core';
import { GoogleAuth } from '@southdevs/capacitor-google-auth';

// 🔥 NUEVO: Interfaz para datos adicionales del usuario
export interface UserData {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  salary?: number;
  currency?: string;
  createdAt?: any;
  lastLogin?: any;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private auth = inject(Auth);
  private firestore = inject(Firestore);

  /** Stream de sesión (null si no hay usuario) */
  readonly user$: Observable<User | null> = authState(this.auth);

  /** Helper: booleano de sesión */
  readonly isLoggedIn$: Observable<boolean> = this.user$.pipe(
    map(u => !!u)
  );

  /** Login con Google - usa plugin nativo en móvil, popup en web */
  async loginWithGoogle(): Promise<void> {
    console.log('[AUTH] loginWithGoogle llamado');
    console.log('[AUTH] isNativePlatform:', Capacitor.isNativePlatform());
    console.log('[AUTH] platform:', Capacitor.getPlatform());

    // Detectar si estamos en plataforma nativa (Android/iOS)
    if (Capacitor.isNativePlatform()) {
      console.log('[AUTH] Usando login NATIVO');
      await this.loginWithGoogleNative();
    } else {
      console.log('[AUTH] Usando login WEB');
      await this.loginWithGoogleWeb();
    }
  }

  /** Login nativo con Google (Android/iOS) usando el plugin de Capacitor */
  private async loginWithGoogleNative(): Promise<void> {
    try {
      console.log('[AUTH] loginWithGoogleNative - INICIO');
      console.log('[AUTH] Llamando GoogleAuth.signIn()...');

      // Usar el plugin nativo de Google Auth con opciones requeridas
      const googleUser = await GoogleAuth.signIn({
        scopes: ['profile', 'email'],
        serverClientId: '812437785979-4efcctave2kv97rj8jm5jhrtjojgeuh8.apps.googleusercontent.com',
        grantOfflineAccess: true,
      });
      console.log('[AUTH] GoogleAuth.signIn() completado');
      console.log('[AUTH] googleUser:', JSON.stringify(googleUser));

      // Crear credencial de Firebase con el idToken de Google
      console.log('[AUTH] Creando credencial de Firebase...');
      const credential = GoogleAuthProvider.credential(googleUser.authentication.idToken);
      console.log('[AUTH] Credencial creada, llamando signInWithCredential...');

      // Autenticar en Firebase con la credencial
      const result = await signInWithCredential(this.auth, credential);
      console.log('[AUTH] Firebase signInWithCredential OK');
      console.log('[AUTH] Firebase user uid:', result.user?.uid);

      // Crear o actualizar documento del usuario en Firestore
      if (result && result.user) {
        await this.createOrUpdateUserDoc(result.user);
      }
      console.log('[AUTH] loginWithGoogleNative - FIN EXITOSO');
    } catch (e: any) {
      console.error('[AUTH] ERROR en loginWithGoogleNative');
      console.error('[AUTH] Error name:', e?.name);
      console.error('[AUTH] Error message:', e?.message);
      console.error('[AUTH] Error code:', e?.code);
      console.error('[AUTH] Error completo:', JSON.stringify(e));
      throw e;
    }
  }

  /** Login web con Google (popup con fallback a redirect) */
  private async loginWithGoogleWeb(): Promise<void> {
    const provider = new GoogleAuthProvider();
    try {
      // Intento popup con timeout (por ejemplo 10 segundos)
      const popupPromise = signInWithPopup(this.auth, provider);
      const timeout = timer(10000).pipe(
        switchMap(() => throwError(() => new Error('popup-timeout')))
      ).toPromise();

      // race entre el popup y timeout
      const result = await Promise.race([popupPromise, timeout]);
      console.log('[AUTH] loginWithGoogle (popup) OK');

      // Crear o actualizar documento del usuario en Firestore
      if (result && result.user) {
        await this.createOrUpdateUserDoc(result.user);
      }
    } catch (e: any) {
      const code = e?.code as string | undefined;
      console.warn('[AUTH] loginWithPopup error -> fallback redirect', code, e);

      // Si el error indica popup bloqueado o timeout, hacemos redirect
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment' ||
        e?.message === 'popup-timeout'
      ) {
        try {
          await signInWithRedirect(this.auth, provider);
        } catch (e2) {
          console.error('[AUTH] fallback redirect failed', e2);
          throw e2;
        }
      } else {
        throw e;
      }
    }
  }

  /** Login con Google sugiriendo un correo (hint) */
  async loginWithGoogleHint(email?: string): Promise<void> {
    // En plataforma nativa, usar login normal (hint no soportado)
    if (Capacitor.isNativePlatform()) {
      await this.loginWithGoogleNative();
      return;
    }

    // En web, usar popup con hint
    const provider = new GoogleAuthProvider();
    if (email) {
      provider.setCustomParameters({ login_hint: email });
    }
    try {
      const result = await signInWithPopup(this.auth, provider);
      console.log('[AUTH] loginWithGoogleHint (popup) OK');

      // Crear o actualizar documento del usuario
      if (result && result.user) {
        await this.createOrUpdateUserDoc(result.user);
      }
    } catch (e: any) {
      const code = e?.code as string | undefined;
      console.warn('[AUTH] popup error (hint) -> fallback redirect', code, e);
      if (
        code === 'auth/popup-blocked' ||
        code === 'auth/operation-not-supported-in-this-environment'
      ) {
        await signInWithRedirect(this.auth, provider);
      } else {
        throw e;
      }
    }
  }

  /** 🔥 NUEVO: Crear o actualizar documento del usuario en Firestore */
  private async createOrUpdateUserDoc(user: User): Promise<void> {
    try {
      const userRef = doc(this.firestore, `users/${user.uid}`);
      const userSnap = await getDoc(userRef);
      
      if (!userSnap.exists()) {
        // Usuario nuevo - crear documento
        const userData: UserData = {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          salary: 0,
          currency: 'DOP',
          createdAt: new Date(),
          lastLogin: new Date()
        };
        await setDoc(userRef, userData);
        console.log('[AUTH] Documento de usuario creado');
      } else {
        // Usuario existente - actualizar lastLogin
        await updateDoc(userRef, {
          lastLogin: new Date()
        });
        console.log('[AUTH] LastLogin actualizado');
      }
    } catch (error) {
      console.error('[AUTH] Error al crear/actualizar documento de usuario:', error);
    }
  }

  /** 🔥 NUEVO: Obtener datos del usuario desde Firestore */
  async getUserData(): Promise<UserData | null> {
    const user = this.currentUser;
    if (!user?.uid) {
      console.warn('[AUTH] No hay usuario autenticado');
      return null;
    }

    try {
      const userRef = doc(this.firestore, `users/${user.uid}`);
      const userSnap = await getDoc(userRef);
      
      if (userSnap.exists()) {
        return userSnap.data() as UserData;
      } else {
        console.warn('[AUTH] Documento de usuario no encontrado');
        return null;
      }
    } catch (error) {
      console.error('[AUTH] Error al obtener datos del usuario:', error);
      return null;
    }
  }

  /** 🔥 NUEVO: Actualizar el sueldo del usuario */
  async updateUserSalary(salary: number): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) {
      throw new Error('No hay usuario autenticado');
    }

    try {
      const userRef = doc(this.firestore, `users/${user.uid}`);
      await updateDoc(userRef, {
        salary: salary
      });
      console.log('[AUTH] Sueldo actualizado en Firestore:', salary);
    } catch (error) {
      console.error('[AUTH] Error al actualizar sueldo:', error);
      throw error;
    }
  }

  /** 🔥 NUEVO: Actualizar datos del perfil del usuario */
  async updateUserProfile(data: Partial<UserData>): Promise<void> {
    const user = this.currentUser;
    if (!user?.uid) {
      throw new Error('No hay usuario autenticado');
    }

    try {
      const userRef = doc(this.firestore, `users/${user.uid}`);
      await updateDoc(userRef, data);
      console.log('[AUTH] Perfil actualizado:', data);
    } catch (error) {
      console.error('[AUTH] Error al actualizar perfil:', error);
      throw error;
    }
  }

  /** Cerrar sesión */
  async logout(): Promise<void> {
    try {
      await signOut(this.auth);
      console.log('[AUTH] logout OK');
    } catch (e) {
      console.error('[AUTH] logout error', e);
      throw e;
    }
  }

  /** Usuario actual (sin observable) */
  get currentUser(): User | null {
    return this.auth.currentUser;
  }
}