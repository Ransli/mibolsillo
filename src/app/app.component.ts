// src/app/app.component.ts
import { Component, OnInit, NgZone } from '@angular/core';
import { Router, NavigationStart, NavigationEnd, NavigationError } from '@angular/router';
import { IonApp, IonRouterOutlet } from '@ionic/angular/standalone';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { GoogleAuth } from '@southdevs/capacitor-google-auth';
import { Location } from '@angular/common';

@Component({
  standalone: true,
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  imports: [IonApp, IonRouterOutlet],
})
export class AppComponent implements OnInit {
  constructor(
    private router: Router,
    private location: Location,
    private zone: NgZone
  ) {
    // Inicializar Google Auth para plataformas nativas
    this.initializeGoogleAuth();

    // Inicializar manejo del botón/gesto de retroceso
    this.initializeBackButton();

    // Solo logging para debug (opcional, puedes comentar esto en producción)
    this.router.events.subscribe(evt => {
      if (evt instanceof NavigationStart) {
        console.log('[ROUTER] NavigationStart:', evt.url);
      }
      if (evt instanceof NavigationEnd) {
        console.log('[ROUTER] NavigationEnd:', evt.url);
      }
      if (evt instanceof NavigationError) {
        console.error('[ROUTER] NavigationError:', evt.error);
      }
    });
  }

  ngOnInit(): void {
    console.log('[AppComponent] Aplicación inicializada');
  }

  /** Manejo del botón/gesto de retroceso en Android */
  private initializeBackButton(): void {
    if (Capacitor.isNativePlatform()) {
      App.addListener('backButton', ({ canGoBack }) => {
        console.log('[AppComponent] backButton pressed, canGoBack:', canGoBack);

        this.zone.run(() => {
          // Rutas principales donde salir de la app
          const mainRoutes = ['/tabs/tab1', '/tabs/tab2', '/tabs/tab3', '/tabs/tab4', '/auth/login'];
          const currentUrl = this.router.url;

          if (mainRoutes.includes(currentUrl)) {
            // Estamos en una página principal - minimizar la app
            App.minimizeApp();
          } else {
            // Hay historial - ir atrás
            this.location.back();
          }
        });
      });
      console.log('[AppComponent] BackButton listener inicializado');
    }
  }

  private async initializeGoogleAuth(): Promise<void> {
    console.log('[AppComponent] initializeGoogleAuth llamado');
    console.log('[AppComponent] isNativePlatform:', Capacitor.isNativePlatform());
    console.log('[AppComponent] platform:', Capacitor.getPlatform());

    if (Capacitor.isNativePlatform()) {
      try {
        console.log('[AppComponent] Inicializando GoogleAuth...');
        await GoogleAuth.initialize({
          clientId: '812437785979-4efcctave2kv97rj8jm5jhrtjojgeuh8.apps.googleusercontent.com',
          scopes: ['profile', 'email'],
          grantOfflineAccess: true,
        });
        console.log('[AppComponent] GoogleAuth inicializado EXITOSAMENTE');
      } catch (error: any) {
        console.error('[AppComponent] ERROR inicializando GoogleAuth:', error);
        console.error('[AppComponent] Error message:', error?.message);
      }
    } else {
      console.log('[AppComponent] No es plataforma nativa, saltando inicialización de GoogleAuth');
    }
  }
}