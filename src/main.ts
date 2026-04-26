// src/main.ts

import { bootstrapApplication } from '@angular/platform-browser';
import { AppComponent } from './app/app.component';
import { appConfig } from './app/app.config';

// Los estilos ya se cargan desde angular.json, no es necesario importarlos aquí

// Iconos globales (solo los que uses globalmente)
import { addIcons } from 'ionicons';
import {
  calendarOutline,
  optionsOutline,
  logOutOutline,
} from 'ionicons/icons';

addIcons({
  'calendar-outline': calendarOutline,
  'options-outline': optionsOutline,
  'log-out-outline': logOutOutline,
});

bootstrapApplication(AppComponent, appConfig)
  .then(() => console.log('✅ Aplicación iniciada correctamente'))
  .catch(err => {
    console.error('❌ Error al iniciar la aplicación:', err);
  });