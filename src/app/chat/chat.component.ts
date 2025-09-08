import { Component, ElementRef, ViewChild, AfterViewChecked, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Message, TableRow } from './message.model';
import { ChatService } from '../chat.service';
import { ConversationService, Conversation } from './conversation.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements AfterViewChecked, OnInit {

  private readonly WELCOME_TEXT =
    "Bienvenue👋 sur SimpaChat ! Votre assistant intelligent pour la simulation  des droits et taxes liés à la procédure d’importation des véhicules d’occasion au Cameroun.";

  messages: Message[] = [];
  userInput = '';
  loading = false;

  showHistory = false;
  sessions: Conversation[] = [];
  currentSessionId: string | null = null;

  @ViewChild('chatBody') private chatBody!: ElementRef;

  constructor(private chatService: ChatService, private convSvc: ConversationService) {}

  ngOnInit(): void {
    // Charger la dernière session ou en créer une
    this.sessions = this.convSvc.list();
    const last = this.convSvc.getLast();
    if (last) {
      this.currentSessionId = last.id;
      this.messages = [...last.messages];
    } else {
      const s = this.convSvc.createNew();
      this.currentSessionId = s.id;
      this.sessions = this.convSvc.list();
      this.messages = [];
    }

    // Message de bienvenue si la convo est vide
    this.ensureWelcomeIfEmpty();
  }

  ngAfterViewChecked(): void { this.scrollToBottom(); }

  private scrollToBottom(): void {
    try {
      if (this.chatBody?.nativeElement) {
        this.chatBody.nativeElement.scrollTop = this.chatBody.nativeElement.scrollHeight;
      }
    } catch {}
  }

  // Ajoute le message de bienvenue s'il n'y a encore aucun message
  private ensureWelcomeIfEmpty(): void {
    if (this.messages.length === 0) {
      this.messages.push({
        sender: 'bot',
        text: this.WELCOME_TEXT,
        timestamp: new Date(),
        kind: 'text'
      });
      this.saveMessages();
      this.sessions = this.convSvc.list();
    }
  }

  // Format FCFA
  private fcfa(n: number) {
    const val = Number.isFinite(n) ? n : 0;
    try {
      return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XAF', maximumFractionDigits: 0 }).format(val);
    } catch {
      return `${Math.round(val).toLocaleString('fr-FR')} FCFA`;
    }
  }

  // --- Utilitaires sessions
  toggleHistory(): void {
    this.showHistory = !this.showHistory;
    if (this.showHistory) this.sessions = this.convSvc.list();
  }

  startNewConversation(): void {
    const s = this.convSvc.createNew();
    this.currentSessionId = s.id;
    this.messages = [];
    this.userInput = '';
    this.showHistory = false;
    this.sessions = this.convSvc.list();

    // Bienvenue pour toute nouvelle conversation
    this.ensureWelcomeIfEmpty();

    // IMPORTANT : on réinitialise aussi le contexte conservé côté service
    this.chatService.resetContext();
    // (optionnel) tu peux aussi forcer un scroll tout en bas
    setTimeout(() => this.scrollToBottom());
  }

  openSession(id: string): void {
    const s = this.convSvc.get(id);
    if (!s) return;
    this.currentSessionId = s.id;
    this.messages = [...s.messages];
    this.userInput = '';
    this.showHistory = false;

    // Sécurité : si jamais une session est vide, on affiche le message de bienvenue
    this.ensureWelcomeIfEmpty();
  }

  // --- Persistance
  private saveMessages(): void {
    if (this.currentSessionId) {
      this.convSvc.updateMessages(this.currentSessionId, this.messages);
    }
  }

  private maybeSetTitleFromFirstUser(): void {
    if (!this.currentSessionId) return;
    const s = this.convSvc.get(this.currentSessionId);
    if (!s) return;
    if (!s.title || s.title === 'Nouvelle conversation') {
      const firstUser = this.messages.find(m => m.sender === 'user');
      if (firstUser?.text?.trim()) {
        const t = firstUser.text.trim().slice(0, 40);
        this.convSvc.rename(this.currentSessionId, t);
      }
    }
  }

  // Convertit le résultat en payload tableau (FOB et Fret NON affichés)
  private toTablePayload(result: any) {
    const rows: TableRow[] = [];
    const b = result?.breakdown || {}; // accepte both shapes

    const order = [
      'Inscription au fichier des importateurs',
      'Frais CIVIC SGS',
      'Frais de déclaration d’importation (Douane)',
      'BESC (Bordereau Électronique de Suivi de Cargaison)',
      'Prime assurance locale',
      'Droit de Douane Initial (DDI)',
      'Droit d’accise (DAC)',
      'Droit d’accises ordinaire (DAO)',
      'Taxe sur la Valeur Ajoutée (TVA)',
      'Centimes additionnels communaux (CAC)',
      'Précompte (PCT)',
      'Redevance Informatique Douanière (RID )',
      'Taxe Communautaire d’Intégration (TCI)',
      'Contribution pour l’Intégration Africaine (CIA)',
      'Prélèvement OHADA (PRO)',
      'Protocole Douane /CDA (PRD)',
      'Redevance / Contribution Scanner',
      'Frais facilitation GUCE',
      'Honoraires agréé en douane',
      'Impôts et taxes',
      'Commission extra-légale',
      'Frais de visite',
      'Redevance PAD ',
      'Frais d’aconage et de manutention',


    ];

    if (typeof result?.valeur_douane !== 'undefined') {
      rows.push({ label: 'Valeur en douane', value: this.fcfa(result.valeur_douane) });
    }

    for (const key of order) if (b[key] != null) rows.push({ label: key, value: this.fcfa(b[key]) });

    const totalRaw = (result?.total ?? result?.result?.total ?? 0);
    const totalStr = this.fcfa(Number(totalRaw) || 0);
    return { rows, total: totalStr };
  }

  // --- UNIQUE handler: pas de keydown.enter dans le template
  sendMessage(): void {
    if (this.loading) return; // anti-double envoi
    const text = (this.userInput || '').trim();
    if (!text) return;

    // Ajout message utilisateur
    this.messages.push({ text, sender: 'user', timestamp: new Date(), kind: 'text' });
    this.saveMessages();
    this.maybeSetTitleFromFirstUser();
    this.userInput = '';
    this.loading = true;

    // On laisse le service gérer le contexte (il renvoie toujours context_fields et les mémorise)
    // Astuce : laisse le backend détecter la langue si tu veux, en passant undefined
    this.chatService.simulateFromText(text /* , 'fr' */).subscribe({
      next: (res: any) => {
        if (res?.status === 'need_info') {
          const q = res.question || 'Merci de préciser les informations manquantes.';
          this.messages.push({ text: q, sender: 'bot', timestamp: new Date(), kind: 'text' });
        }
        else if (this.isResult(res)) {
          // Résultat interne/externe (accepte les 2 formes)
          const resultObj = res?.result ?? res;
          const payload = this.toTablePayload(resultObj);
          this.messages.push({ sender: 'bot', timestamp: new Date(), kind: 'table', table: payload });

          // On peut réinitialiser le contexte pour une nouvelle simulation
          this.chatService.resetContext();
        }
        else if (res?.status === 'need_external') {
          const msg = (res.message || 'Ce véhicule n’a pas encore été importé au Cameroun. Pour estimation Europe, précisez le kilométrage.')
            + (res.fields_needed ? ` Champs requis : ${res.fields_needed.join(', ')}` : '');
          this.messages.push({ text: msg, sender: 'bot', timestamp: new Date(), kind: 'text' });
        }
        else if (res?.status === 'error') {
          const detail = res.message || 'Erreur inconnue côté serveur.';
          this.messages.push({ text: `❌ ${detail}`, sender: 'bot', timestamp: new Date(), kind: 'text' });
          if (res.raw) this.messages.push({ text: `🪵 Debug LLM : ${res.raw}`, sender: 'bot', timestamp: new Date(), kind: 'text' });
        }
        else {
          this.messages.push({ text: 'Réponse inattendue du serveur.', sender: 'bot', timestamp: new Date(), kind: 'text' });
        }

        this.loading = false;
        this.saveMessages();
        this.sessions = this.convSvc.list();
      },
      error: (err) => {
        const msg = err?.error?.message || err?.message || 'Serveur inaccessible.';
        this.messages.push({ text: '⚠️ ' + msg, sender: 'bot', timestamp: new Date(), kind: 'text' });
        this.loading = false;
        this.saveMessages();
      }
    });
  }

  private isResult(res: any): boolean {
    // Considère résultat si renvoie un breakdown/total à la racine
    // ou bien un objet { status:'ok', result:{...} }
    return !!(res?.breakdown || res?.total || res?.valeur_douane || (res?.status === 'ok' && res?.result));
  }

  deleteSession(id: string): void {
    if (!confirm('Supprimer cette conversation ?')) return;
    const wasCurrent = this.currentSessionId === id;

    this.convSvc.remove(id);
    this.sessions = this.convSvc.list();

    if (wasCurrent) {
      const last = this.convSvc.getLast();
      if (last) {
        this.currentSessionId = last.id;
        this.messages = [...last.messages];
      } else {
        // recréer une session vide propre si plus rien
        const s = this.convSvc.createNew();
        this.currentSessionId = s.id;
        this.sessions = this.convSvc.list();
        this.messages = [];
      }
    }
  }

  clearAllSessions(): void {
    if (!confirm('Supprimer TOUTES les conversations ?')) return;
    this.convSvc.clear();
    const s = this.convSvc.createNew();
    this.currentSessionId = s.id;
    this.sessions = this.convSvc.list();
    this.messages = [];
    this.chatService.resetContext(); // reset aussi le contexte LLM/back
  }
}
