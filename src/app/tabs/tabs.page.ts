// src/app/tabs/tabs.page.ts
import { Component, OnDestroy } from '@angular/core';
import {
  IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel
} from '@ionic/angular/standalone';

import { addIcons } from 'ionicons';
import { homeOutline, statsChartOutline, cardOutline, settingsOutline } from 'ionicons/icons';

@Component({
  standalone: true,
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  imports: [
    IonTabs, IonTabBar, IonTabButton, IonIcon, IonLabel
  ],
})
export class TabsPage implements OnDestroy {

  constructor() {
    console.log('[TabsPage] Constructor');
    addIcons({
      homeOutline,
      statsChartOutline,
      cardOutline,
      settingsOutline
    });
  }

  ngOnDestroy(): void {
    console.log('[TabsPage] ngOnDestroy');
  }
}