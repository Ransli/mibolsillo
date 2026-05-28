// src/app/tabs/tabs.page.ts
import { Component, OnDestroy } from '@angular/core';
import {
  IonTabs, IonTabBar, IonTabButton, IonLabel,
  ModalController
} from '@ionic/angular/standalone';
import { NewTxModal } from '../tab1/new-tx.modal';

@Component({
  standalone: true,
  selector: 'app-tabs',
  templateUrl: './tabs.page.html',
  styleUrls: ['./tabs.page.scss'],
  imports: [IonTabs, IonTabBar, IonTabButton, IonLabel],
})
export class TabsPage implements OnDestroy {

  constructor(private modalCtrl: ModalController) {}

  async openNew(ev?: Event): Promise<void> {
    if (ev) { ev.preventDefault(); ev.stopPropagation(); }
    try {
      const m = await this.modalCtrl.create({
        component: NewTxModal,
        cssClass: 'tx-modal',
        breakpoints: [0, 1],
        initialBreakpoint: 1,
      });
      await m.present();
    } catch (e) {
      console.error('[Tabs] openNew error', e);
    }
  }

  ngOnDestroy(): void {}
}
