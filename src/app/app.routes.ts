// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./onboarding/onboarding.page').then(m => m.OnboardingPage),
  },
  {
    path: 'auth/login',
    loadComponent: () =>
      import('./features/auth/login.page').then(m => m.LoginPage),
  },
  {
    path: 'tabs',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./tabs/tabs.routes').then(m => m.routes),
  },
  { path: '', pathMatch: 'full', redirectTo: 'tabs' },
  { path: '**', redirectTo: 'tabs' },
];
