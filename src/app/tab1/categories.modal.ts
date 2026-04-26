// src/app/tab1/categories.modal.ts
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController, ToastController, AlertController } from '@ionic/angular';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import { WalletService, Category } from '../core/wallet.service';

@Component({
  standalone: true,
  selector: 'app-categories-modal',
  templateUrl: './categories.modal.html',
  styleUrls: ['./categories.modal.scss'],
  imports: [IonicModule, CommonModule, ReactiveFormsModule],
})
export class CategoriesModal {
  private wallet = inject(WalletService);
  private fb = inject(FormBuilder);
  private modalCtrl = inject(ModalController);
  private toastCtrl = inject(ToastController);
  private alertCtrl = inject(AlertController);

  categories$: Observable<Category[]> = this.wallet.categories$();

  form = this.fb.group({
    name: ['', [Validators.required, Validators.minLength(2)]],
    emoji: ['🗂️', [Validators.required]],
  });

  saving = false;

  async add() {
    if (this.form.invalid || this.saving) return;

    this.saving = true;
    const { name, emoji } = this.form.value as { name: string; emoji: string };

    try {
      await this.wallet.addCategory({ name, emoji } as Omit<Category, 'id'>);

      const toast = await this.toastCtrl.create({
        message: 'Categoría creada ✅',
        duration: 1200,
        color: 'success',
      });
      await toast.present();

      this.form.reset({ name: '', emoji: '🗂️' });
    } catch (err) {
      const toast = await this.toastCtrl.create({
        message: 'No se pudo crear la categoría',
        duration: 1600,
        color: 'danger',
      });
      await toast.present();
      console.error(err);
    } finally {
      this.saving = false;
    }
  }

  async deleteCategory(id: string, name: string) {
    const alert = await this.alertCtrl.create({
      header: 'Confirmar eliminación',
      message: `¿Estás seguro de eliminar la categoría "${name}"?`,
      buttons: [
        {
          text: 'Cancelar',
          role: 'cancel',
        },
        {
          text: 'Eliminar',
          role: 'destructive',
          handler: async () => {
            try {
              await this.wallet.deleteCategory(id);
              
              const toast = await this.toastCtrl.create({
                message: 'Categoría eliminada',
                duration: 1200,
                color: 'success',
              });
              await toast.present();
            } catch (error) {
              console.error('Error al eliminar categoría:', error);
              const toast = await this.toastCtrl.create({
                message: 'Error al eliminar la categoría',
                duration: 1600,
                color: 'danger',
              });
              await toast.present();
            }
          },
        },
      ],
    });

    await alert.present();
  }

  close() {
    this.modalCtrl.dismiss();
  }
}