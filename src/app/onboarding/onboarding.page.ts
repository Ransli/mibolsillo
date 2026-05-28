// src/app/onboarding/onboarding.page.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { IonContent } from '@ionic/angular/standalone';

interface OnbSlide {
  title: string;
  subtitle: string;
  illustration: 'bars' | 'cards' | 'loans';
  cta: string;
}

@Component({
  standalone: true,
  selector: 'app-onboarding',
  templateUrl: './onboarding.page.html',
  styleUrls: ['./onboarding.page.scss'],
  imports: [CommonModule, IonContent],
})
export class OnboardingPage {
  showSplash = true;
  currentIndex = 0;

  slides: OnbSlide[] = [
    {
      title: 'Controla tus finanzas',
      subtitle: 'Registra ingresos y gastos, visualiza reportes y mantén tu dinero bajo control desde un solo lugar.',
      illustration: 'bars',
      cta: 'Siguiente',
    },
    {
      title: 'Gestiona tus tarjetas',
      subtitle: 'Controla el límite y uso de cada tarjeta de crédito. Nunca pierdas de vista tu fecha de corte y pago.',
      illustration: 'cards',
      cta: 'Siguiente',
    },
    {
      title: 'Maneja tus préstamos',
      subtitle: 'Registra préstamos bancarios, visualiza el progreso de pago y proyecta tus cuotas a futuro.',
      illustration: 'loans',
      cta: '¡Comenzar ahora!',
    },
  ];

  constructor(private router: Router) {
    setTimeout(() => { this.showSplash = false; }, 2400);
  }

  get slide(): OnbSlide { return this.slides[this.currentIndex]; }
  get isLast(): boolean { return this.currentIndex === this.slides.length - 1; }

  next(): void {
    if (this.isLast) { this.finish(); return; }
    this.currentIndex++;
  }

  skip(): void { this.finish(); }

  back(): void {
    if (this.currentIndex > 0) this.currentIndex--;
  }

  private finish(): void {
    localStorage.setItem('onboardingDone', 'true');
    this.router.navigateByUrl('/auth/login', { replaceUrl: true });
  }
}
