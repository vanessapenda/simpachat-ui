import { Injectable } from '@angular/core';
import { Message } from './message.model';

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;   // epoch ms
  updatedAt: number;   // epoch ms
  messages: Message[];
}

@Injectable({ providedIn: 'root' })
export class ConversationService {
  private readonly STORAGE_KEY = 'simpachat_sessions_v1';

  private loadAll(): Conversation[] {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEY);
      return raw ? JSON.parse(raw) as Conversation[] : [];
    } catch {
      return [];
    }
  }

  private saveAll(list: Conversation[]): void {
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(list));
  }

  // Historique limite a 1 mois (demande explicite de Vanessa) : les conversations plus
  // anciennes ne sont plus proposees dans le panneau Historique. Elles restent en localStorage
  // (pas de suppression active, juste filtrees a la lecture) -- un nettoyage explicite reste
  // possible plus tard si besoin, sans perte de donnees silencieuse d'ici la.
  private static readonly HISTORY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

  list(): Conversation[] {
    const cutoff = Date.now() - ConversationService.HISTORY_MAX_AGE_MS;
    return this.loadAll()
      .filter(s => s.updatedAt >= cutoff)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(id: string): Conversation | undefined {
    return this.loadAll().find(s => s.id === id);
  }

  createNew(): Conversation {
    const now = Date.now();
    const conv: Conversation = {
      id: crypto.randomUUID(),
      title: 'Nouvelle conversation',
      createdAt: now,
      updatedAt: now,
      messages: []
    };
    const all = this.loadAll();
    all.unshift(conv);
    this.saveAll(all);
    return conv;
  }

  rename(id: string, title: string) {
    const all = this.loadAll();
    const s = all.find(x => x.id === id);
    if (!s) return;
    s.title = title;
    s.updatedAt = Date.now();
    this.saveAll(all);
  }

  updateMessages(id: string, messages: Message[]) {
    const all = this.loadAll();
    const s = all.find(x => x.id === id);
    if (!s) return;
    s.messages = messages;
    s.updatedAt = Date.now();
    this.saveAll(all);
  }

  getLast(): Conversation | undefined {
    return this.list()[0];
  }

  remove(id: string): void {
    const all = this.loadAll();
    const idx = all.findIndex(x => x.id === id);
    if (idx >= 0) {
      all.splice(idx, 1);
      this.saveAll(all);
    }
  }

  clear(): void {
    this.saveAll([]);
  }
}
