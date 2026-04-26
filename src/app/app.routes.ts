// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/auth/login.page').then(m => m.LoginPage),
  },
  {
    path: 'tabs',
    // si no quieres proteger con login, quita la siguiente línea
    canActivate: [authGuard],
    loadChildren: () =>
      import('./tabs/tabs.routes').then(m => m.routes),
  },
  { path: '', pathMatch: 'full', redirectTo: 'tabs' },
  { path: '**', redirectTo: 'tabs' },
];
