// src/app/core/auth.guard.ts
// Guard: permite entrar a /tabs solo si hay sesión. Si no, redirige a /auth/login.
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, onAuthStateChanged, User } from '@angular/fire/auth';

export const authGuard: CanActivateFn = async () => {
  const auth = inject(Auth);
  const router = inject(Router);

  // 1) Chequeo rápido en memoria
  if (auth.currentUser) {
    console.log('[GUARD] currentUser presente -> OK');
    return true;
  }

  // 2) Espera un tick a que Firebase resuelva el estado
  const user = await new Promise<User | null>((resolve) => {
    const off = onAuthStateChanged(auth, u => {
      off();           // nos desuscribimos al primer valor
      resolve(u);      // devolvemos el usuario (o null)
    });
  });

  if (user) {
    console.log('[GUARD] user resuelto por onAuthStateChanged -> OK');
    return true;
  }

  // 3) Sin sesión -> fuera
  console.log('[GUARD] sin sesión -> /auth/login');
  router.navigateByUrl('/auth/login', { replaceUrl: true });
  return false;
};
