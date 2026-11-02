import { Component, ElementRef, ViewChild, AfterViewChecked, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClientModule } from '@angular/common/http';
import { Subscription } from 'rxjs';
import { Message, TableRow, QuickReplyOption } from './message.model';
import { ChatService } from '../chat.service';
import { ConversationService, Conversation } from './conversation.service';
import { FeedbackService } from '../feedback/feedback.service';

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, HttpClientModule],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements AfterViewChecked, OnInit {

  private readonly WELCOME_TEXT =
    "Bienvenue👋 sur SimpaChat ! Votre assistant intelligent pour la simulation  des droits et taxes liés aux procédures du commerce extérieur.\n\nEn quoi pouvons-nous vous aider ?";

  messages: Message[] = [];
  userInput = '';
  loading = false;

  // Requête HTTP en cours (le cas échéant) : annulée explicitement si l'utilisateur
  // démarre une nouvelle conversation avant d'avoir reçu la réponse, pour ne pas laisser
  // le backend/LLM continuer à traiter une réponse qui ne sera jamais affichée.
  private pendingRequest?: Subscription;

  // Contexte en attente pour pousser le message d'avis (feedback) une fois l'offre de PDF
  // résolue (oui ou non) — voir finalizeAfterPdfOffer(). Vide en dehors de cette fenêtre.
  private pendingFeedbackContext?: { simulationType: 'cameroon' | 'external' | 'first_necessity'; vehicleInfo: any; lang: string };

  showHistory = false;
  sessions: Conversation[] = [];
  currentSessionId: string | null = null;
  historySearch = '';

  editingSessionId: string | null = null;
  editingTitle = '';

  @ViewChild('chatBody') private chatBody!: ElementRef;
  @ViewChild('userInputEl') private userInputEl?: ElementRef<HTMLTextAreaElement>;

  constructor(private chatService: ChatService, private convSvc: ConversationService, private feedbackService: FeedbackService) {}

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

  private shouldScroll = false;

ngAfterViewChecked(): void {
  if (this.shouldScroll) {
    this.scrollToBottom();
    this.shouldScroll = false;
  }
}

  private scrollToBottom(): void {
    try {
      if (this.chatBody?.nativeElement) {
        this.chatBody.nativeElement.scrollTop = this.chatBody.nativeElement.scrollHeight;
      }
    } catch {}
  }

  // Menu à 2 niveaux (demande de Vanessa le 21/10/2026, pour coller à l'interface du
  // simulateur graphique : onglet "Type d'opérations" d'abord, puis "Type de produits" une
  // fois l'opération choisie -- cf. guce-simulator step.html). Niveau 1 : les 4 opérations,
  // affichées en grandes cartes colorées (kind: 'operation-cards', template, demande du
  // 22/10/2026 pour reprendre le style des cartes de la page d'accueil SIMPA) -- 4 boutons
  // écrits en dur dans le template, pas de liste ici (jamais que ces 4, pas besoin de *ngFor).
  // Niveau 2 (import uniquement pour l'instant) : les catégories de produits existantes.
  // Export n'a qu'une seule catégorie (36 produits, cf. _EXPORT_PRODUCTS côté backend) donc le
  // bouton "Exportation" déclenche directement cette liste, sans sous-menu intermédiaire.
  // Transit Export/Import : backend pas encore implémenté (cf. discussion du 21/10/2026) --
  // boutons affichés pour respecter la symétrie avec les 4 opérations officielles, mais
  // répondent pour l'instant par un message "bientôt disponible" plutôt que de planter.

  // Emojis ajoutes devant chaque libelle (demande explicite de Vanessa : rendre les boutons plus
  // vivants) -- uniquement decoratif, le texte envoye au backend (text:) reste inchange.
  private readonly IMPORT_PRODUCT_TYPES: QuickReplyOption[] = [
    { label: "🚗 Véhicule d'occasion", text: "Je veux simuler un véhicule d'occasion." },
    { label: '🚙 Véhicule neuf', text: 'Je veux simuler mon véhicule neuf.' },
    { label: '📦 Produits de 1ère nécessité', text: 'Je veux simuler des produits de première nécessité.' },
    { label: '🍾 Boissons', text: 'Je veux simuler des boissons.' },
    { label: '💊 Produits pharmaceutiques', text: 'Je veux simuler des produits pharmaceutiques.' },
    { label: '🛒 Autres produits', text: 'Je veux simuler un autre produit.' }
  ];

  // Ajoute le message de bienvenue (+ les choix rapides) s'il n'y a encore aucun message
  private ensureWelcomeIfEmpty(): void {
    if (this.messages.length === 0) {
      this.messages.push({
        sender: 'bot',
        text: this.WELCOME_TEXT,
        timestamp: new Date(),
        kind: 'text'
      });
      this.messages.push({
        sender: 'bot',
        timestamp: new Date(),
        kind: 'operation-cards'
      });
      this.saveMessages();
      this.sessions = this.convSvc.list();
    }
  }

  // Ajoute localement un échange user/bot (pas d'appel backend) : utilisé pour la navigation
  // du menu à 2 niveaux ci-dessus, qui n'a besoin d'aucune info côté serveur avant que
  // l'utilisateur n'ait choisi sa catégorie finale.
  private pushLocalExchange(userLabel: string, botText: string, quickReplies?: QuickReplyOption[]): void {
    this.messages.push({ text: userLabel, sender: 'user', timestamp: new Date(), kind: 'text' });
    this.messages.push({ text: botText, sender: 'bot', timestamp: new Date(), kind: 'text' });
    if (quickReplies) {
      this.messages.push({ sender: 'bot', timestamp: new Date(), kind: 'quick-replies', quickReplies });
    }
    this.saveMessages();
    this.shouldScroll = true;
  }

  // Envoie le texte associé à un choix rapide, via le même chemin qu'un message tapé au clavier
  // -- sauf les 4 sentinelles __OP_*__ du menu "Type d'opérations", interceptées ici pour rester
  // 100% locales (jamais envoyées telles quelles au backend/LLM).
  sendQuickReply(text: string): void {
    if (this.loading) return;
    switch (text) {
      case '__OP_EXPORT__':
        this.userInput = 'Je veux exporter un produit.';
        this.sendMessage();
        return;
      case '__OP_IMPORT__':
        this.pushLocalExchange('🚢 Importation', 'Quel type de produit souhaitez-vous importer ?', this.IMPORT_PRODUCT_TYPES);
        return;
      case '__OP_TRANSIT_EXPORT__':
        this.userInput = 'Je veux simuler un transit export.';
        this.sendMessage();
        return;
      case '__OP_TRANSIT_IMPORT__':
        this.userInput = 'Je veux simuler un transit import.';
        this.sendMessage();
        return;
    }
    this.userInput = text;
    this.sendMessage();
  }

  // --- Offre de PDF (facultative), affichée après un résultat, avant le recueil d'avis ---

  // Accepte l'offre : ce texte matche _looks_like_pdf_request côté backend, qui répond
  // pdf_ready en réutilisant last_simulation (déjà envoyé à chaque requête) — aucun besoin
  // d'un chemin dédié, on réutilise l'export PDF déjà en place.
  acceptPdfOffer(): void {
    // Le texte envoyé doit rester dans la langue de la conversation : un texte français en dur
    // ici faisait re-détecter la session en français (à raison, ce texte EST français) juste
    // après, cassant toute la fin d'une simulation menée en anglais (PDF/avis en français).
    const lang = this.pendingFeedbackContext?.lang;
    const text = lang === 'en'
      ? 'Yes, generate the PDF of this simulation.'
      : 'Oui, génère le PDF de cette simulation.';
    this.sendQuickReply(text);
  }

  // Refuse l'offre : purement local, pas d'appel backend nécessaire.
  declinePdfOffer(): void {
    this.finalizeAfterPdfOffer();
  }

  // Pousse le message d'avis (feedback) et réinitialise le contexte — appelé une fois l'offre
  // de PDF résolue (acceptée, refusée, ou après la génération effective du PDF). Sans effet si
  // appelé hors de cette fenêtre (ex. demande de PDF plus tard dans la conversation).
  private finalizeAfterPdfOffer(): void {
    const ctx = this.pendingFeedbackContext;
    if (!ctx) return;
    this.pendingFeedbackContext = undefined;

    this.messages.push({
      sender: 'bot',
      timestamp: new Date(),
      kind: 'feedback',
      feedback: {
        sessionId: this.currentSessionId || 'unknown',
        simulationType: ctx.simulationType,
        vehicleInfo: ctx.vehicleInfo,
        rating: 0,
        comment: '',
        submitting: false,
        submitted: false,
        lang: ctx.lang
      }
    });
    this.saveMessages();
    this.shouldScroll = true;

    // On peut réinitialiser le contexte pour une nouvelle simulation
    this.chatService.resetContext();
  }

  // Libellés français des champs que le backend peut demander (cf. llm_api.py : MARQUE/MODELE,
  // _REQUIRED_FOR_SIM pour un véhicule d'occasion, _REQUIRED_FOR_NEW_VEHICLE pour un véhicule neuf).
  // Sert uniquement à transformer `wait_for` en liste à puces lisible — sans invention de champs :
  // si un champ de `wait_for` n'a pas de libellé connu ici, on renonce à la liste et on garde le
  // texte brut renvoyé par le backend.
  private readonly FIELD_LABELS: Record<string, string> = {
    ETAT_VEHICULE: "l'état du véhicule (neuf ou d'occasion)",
    MARQUE: 'la marque',
    MODELE: 'le modèle',
    PAYS_PROVENANCE: 'le pays de provenance',
    ANNEE_FABRICATION: "l'année de fabrication",
    ENERGIE: "le type d'énergie",
    NOMBRE_PLACES: 'le nombre de places',
    CONTENEURISER: 'si le véhicule est en conteneur (oui/non)',
    CYLINDRE: 'la cylindrée (en cm³ ou en litres, ex. 1600 cc ou 1.6 L)',
    TYPE_VEHICULE: 'le type de véhicule',
    KILOMETRAGE: 'le kilométrage',
    VALEUR_FOB: 'la valeur FOB',
    VALEUR_FRET: 'la valeur du fret',
    VALEUR_ASSURANCE: "la valeur de l'assurance"
  };

  // N'affiche une liste à puces que pour une vraie demande groupée (au moins 2 champs) et
  // seulement si CHAQUE champ attendu a un libellé connu — pas de case à cocher, juste la liste
  // de ce qui est demandé (l'utilisateur répond en une seule phrase, comme avant).
  private buildChecklist(waitFor: string[] | undefined): string[] | null {
    if (!waitFor || waitFor.length < 2) return null;
    const labels = waitFor.map(k => this.FIELD_LABELS[k]).filter((l): l is string => !!l);
    if (labels.length !== waitFor.length) return null;
    return labels;
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

  // Agrandir/reduire la fenetre de chat (demande Vanessa, inspire d'un widget PeopleSpheres vu
  // en reference). SimpaChat est embarque dans une iframe de taille fixe sur la page d'accueil
  // de guce-simulator (#assistantContainer) -- agrandir/reduire CE composant seul ne changerait
  // rien visuellement puisque la taille visible est imposee par l'iframe elle-meme, pas par son
  // contenu. On previent donc la page parente par postMessage pour qu'elle agrandisse l'iframe ;
  // see fragments/layout.html cote guce-simulator pour la reception de ce message.
  isExpanded = false;

  toggleExpand(): void {
    this.isExpanded = !this.isExpanded;
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({ simpaChatExpand: this.isExpanded }, '*');
    }
  }

  startNewConversation(): void {
    // Annule une requête en cours (l'utilisateur a posé une question puis démarré une
    // nouvelle conversation avant la réponse) : sans ça, le backend/LLM continuait à
    // traiter une réponse qui n'aurait jamais été affichée.
    this.pendingRequest?.unsubscribe();
    this.pendingRequest = undefined;
    this.loading = false;

    const s = this.convSvc.createNew();
    this.currentSessionId = s.id;
    this.messages = [];
    this.userInput = '';
    this.resetInputHeight();
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

  // Libellés anglais des postes du tableau, indexés par la clé française d'origine
  // (la clé française reste utilisée pour aller chercher la valeur dans result.breakdown).
  private readonly EN_LABELS: Record<string, string> = {
    'Inscription au fichier des importateurs': 'Importers registry fee',
    'Frais CIVIC SGS': 'CIVIC SGS fee',
    'Frais de déclaration d’importation (Douane)': 'Customs import declaration fee',
    'BESC (Bordereau Électronique de Suivi de Cargaison)': 'BESC (Electronic Cargo Tracking Note)',
    'Prime assurance locale': 'Local insurance premium',
    'Droit de Douane Initial (DDI)': 'Initial customs duty',
    'Droit d’accise (DAC)': 'Excise duty',
    'Droit d’accises ordinaire (DAO)': 'Ordinary excise duty',
    'Taxe sur la Valeur Ajoutée (TVA)': 'Value Added Tax',
    'Centimes additionnels communaux (CAC)': 'Additional municipal tax',
    'Précompte (PCT)': 'Withholding tax',
    'Redevance Informatique Douanière (RID )': 'Customs IT fee',
    'Taxe Communautaire d’Intégration (TCI)': 'Community integration tax',
    'Contribution pour l’Intégration Africaine (CIA)': 'African integration contribution',
    'Prélèvement OHADA (PRO)': 'OHADA levy',
    'Protocole Douane /CDA (PRD)': 'Customs/CDA protocol fee',
    'Redevance / Contribution Scanner': 'Scanner fee/contribution',
    'Frais facilitation GUCE': 'GUCE facilitation fee',
    'Honoraires agréé en douane': 'Licensed customs broker fee',
    'Impôts et taxes': 'Taxes and duties',
    'Commission extra-légale': 'Extra-legal commission',
    'Frais de visite': 'Inspection fee',
    'Redevance PAD ': 'Port authority fee (PAD)',
    'Frais d’aconage et de manutention': 'Stevedoring and handling fee',
  };

  // Libellés anglais des postes de taxes guce-simulator, indexés par CODE (stable et
  // indépendant du texte — contrairement à `designation`, qui vient de la base et perd
  // ses accents à l'affichage : "ajout e" pour "ajoutée", "agr   en" pour "agréé", etc.).
  // Liste exhaustive des codes RIGHTS_TAXES imprimables côté IMPORT (vérifiée en base le
  // 2026-08-28). Un code absent de cette table retombe simplement sur `designation` telle
  // quelle (jamais d'erreur, juste pas de traduction pour ce poste).
  private readonly EN_LABELS_BY_CODE: Record<string, string> = {
    ACONAGE_IMPORT: 'Stevedoring and handling fee',
    BESC: '(BESC) Electronic Cargo Tracking Note',
    CAC: '(CAC) Additional municipal centimes',
    CDS: 'Scanner fee/contribution',
    CIA: '(CIA) African Integration Contribution',
    CIVIC: 'CIVIC SGS fee',
    DAO: '(DAO) Waste management excise duty',
    DAS: '(DAA) Additional excise duties',
    DD_DA: '(DAC) Excise duty',
    DD_IN: '(DDI) Initial customs duty',
    DD_REDUCE: '(DDI) Customs duty reduction (EPA)',
    DD_TVA: '(VAT) Value Added Tax',
    DI_DGD: 'Customs import declaration fee',
    ET_CA: 'Registration certificate issuance fee',
    FIMEX: 'Importers registry fee',
    F_GUCE: 'GUCE facilitation fee',
    HAD: 'Licensed customs broker fee',
    IHI: '(IHI) Veterinary health inspection fee (import)',
    IMPOT: 'Taxes and duties',
    PCE: '(PCT) Withholding tax',
    PRD: '(PRD) Customs/CDA protocol fee',
    PRIME_ASS: 'Local insurance premium',
    PRO: '(PRO) OHADA levy',
    REDPAD_IMPORT: 'Port authority fee (PAD)',
    REDPAK_IMPORT: 'Kribi port authority fee (PAK)',
    RIB: '(RID) Customs IT fee',
    TAUX_DA_FINAL: 'Final excise duty rate',
    TAUX_DA_VEH: 'Vehicle excise duty rate',
    TCI: '(TCI) Community integration tax',
    TI_SGS: 'Import verification tax (SGS)',
    TSP: 'Special tax on petroleum products',
    TYPE_GOOD: 'Customs duty rate lookup',
    TYPE_POSITION_TARIFAIRE: 'Tariff position lookup',
    T_CIR_VIANDE: '(TCV) Meat circulation tax',
    T_COM_TEL: 'Extra-legal work commission',
    T_MUN: 'Municipal tax',
    VALEUR_DOUANE: 'Customs value',
    VISITE: 'Inspection fee',
  };

  // Convertit le résultat en payload tableau (FOB et Fret NON affichés)
  private toTablePayload(result: any, lang: string) {
    const rows: TableRow[] = [];
    const b = result?.breakdown;
    const isEn = (lang || 'fr').startsWith('en');

    if (typeof result?.valeur_douane !== 'undefined') {
      rows.push({ label: isEn ? 'Customs value' : 'Valeur en douane', value: this.fcfa(result.valeur_douane) });
    }

    if (Array.isArray(b)) {
      // Forme guce-simulator (/simulate-quick) : liste [{code, designation, value}, ...].
      // En anglais, on traduit via EN_LABELS_BY_CODE (code stable) ; en français, on garde
      // `designation` telle quelle. Un code absent de la table retombe sur `designation`
      // même en anglais (pas de traduction manquante = trou dans l'affichage).
      for (const item of b) {
        const val = Number(item?.value);
        if (item?.designation && Number.isFinite(val) && val !== 0) {
          const label = isEn ? (this.EN_LABELS_BY_CODE[item.code] || String(item.designation)) : String(item.designation);
          rows.push({ label, value: this.fcfa(val) });
        }
      }
    } else if (b && typeof b === 'object') {
      // Ancienne forme (dict clé française -> montant), gardée en secours pour ne pas casser
      // l'affichage d'un résultat déjà enregistré dans l'historique local avant cette migration.
      const order = Object.keys(this.EN_LABELS);
      const cleanLabel = (label: string) => label.replace(/\s*\([^)]*\)\s*/g, '').trim();
      const labelFor = (key: string) => isEn ? this.EN_LABELS[key] : cleanLabel(key);
      for (const key of order) if (b[key] != null) rows.push({ label: labelFor(key), value: this.fcfa(b[key]) });
    }

    const totalRaw = (result?.total ?? result?.result?.total ?? 0);
    const totalStr = this.fcfa(Number(totalRaw) || 0);
    const totalLabel = isEn ? 'Total import costs' : "Total des coûts d'importation";
    return { rows, total: totalStr, totalLabel };
  }

  // --- Zone de saisie auto-extensible (retour à la ligne sans passer sous le bouton d'envoi)
  autoGrow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  private resetInputHeight(): void {
    const el = this.userInputEl?.nativeElement;
    if (el) el.style.height = 'auto';
  }

  onEnterKey(event: Event): void {
    const kbEvent = event as KeyboardEvent;
    if (!kbEvent.shiftKey) {
      kbEvent.preventDefault();
      this.sendMessage();
    }
  }

  sendMessage(): void {
    if (this.loading) return; // anti-double envoi
    const text = (this.userInput || '').trim();
    if (!text) return;

    // Ajout message utilisateur (on garde une référence pour pouvoir le marquer "échoué" et le renvoyer)
    const userMsg: Message = { text, sender: 'user', timestamp: new Date(), kind: 'text' };
    this.messages.push(userMsg);
    this.saveMessages();
    this.maybeSetTitleFromFirstUser();
    this.userInput = '';
    this.resetInputHeight();
    this.shouldScroll = true;

    this.submitUserMessage(userMsg);
  }

  // Renvoie un message utilisateur resté en échec (ex: Ollama injoignable, serveur inaccessible),
  // sans que l'utilisateur ait à le retaper.
  retryMessage(msg: Message): void {
    if (this.loading || !msg.text) return;
    msg.status = undefined;
    this.saveMessages();
    this.submitUserMessage(msg);
  }

  private submitUserMessage(userMsg: Message): void {
    this.loading = true;

    // On laisse le service gérer le contexte (il renvoie toujours context_fields et les mémorise)
    // Astuce : laisse le backend détecter la langue si tu veux, en passant undefined
    this.pendingRequest = this.chatService.simulateFromText(userMsg.text!).subscribe({
      next: (res: any) => {
        const lang = res?.lang || 'fr';

        if (res?.status === 'need_info' && Array.isArray(res.product_options) && res.product_options.length) {
          // Liste des produits de première nécessité à choisir (bouton dédié plutôt qu'un texte
          // libre à retaper) — le clic envoie le libellé exact via sendQuickReply, même pattern
          // que les quick-replies d'accueil.
          this.messages.push({
            sender: 'bot', timestamp: new Date(), kind: 'product-select',
            text: res.question, productOptions: res.product_options,
            optionsStyle: res.product_options_style === 'pills' ? 'pills' : 'list'
          });
        }
        else if (res?.status === 'need_info') {
          const q = res.question || 'Merci de préciser les informations manquantes.';
          // res.reason (ex. "out_of_scope_llm", "general_import_info") signale un message de
          // refus/redirection généré par le LLM, pas une vraie collecte de champs véhicule —
          // ne JAMAIS le remplacer par la checklist générique "marque/modèle", même si
          // wait_for contient exactement ces deux champs (ce qui était le bug : le message
          // poli de refus disparaissait, remplacé par une simple demande de caractéristiques).
          const checklist = res.reason ? undefined : (this.buildChecklist(res.wait_for) ?? undefined);
          if (checklist) {
            // Liste à puces : on remplace la phrase (souvent longue) du backend par une intro
            // courte + la liste + une note de clôture, plutôt que d'afficher les deux à la fois.
            const intro = lang === 'en'
              ? 'Please provide your vehicle’s characteristics:'
              : 'Merci d’indiquer les caractéristiques de votre véhicule :';
            const note = lang === 'en'
              ? 'You can answer in a single sentence.'
              : 'Vous pouvez répondre en une seule phrase.';
            this.messages.push({ text: intro, sender: 'bot', timestamp: new Date(), kind: 'text', checklist, checklistNote: note });
          } else {
            this.messages.push({ text: q, sender: 'bot', timestamp: new Date(), kind: 'text' });
          }
        }
        else if (this.isResult(res)) {
          // Résultat interne/externe (accepte les 2 formes)
          const resultObj = res?.result ?? res;
          const payload = this.toTablePayload(resultObj, lang);
          this.messages.push({ sender: 'bot', timestamp: new Date(), kind: 'table', table: payload });

          // Déterminer le type de simulation + infos véhicule/produit depuis le contexte (avant reset)
          const fields = this.chatService.ctxFields;
          const isFirstNecessity = !!fields?.PRODUIT_CODE;
          const simulationType: 'cameroon' | 'external' | 'first_necessity' = isFirstNecessity
            ? 'first_necessity'
            : (res?.result?.estimation_euro ? 'external' : 'cameroon');
          const vehicleInfo = isFirstNecessity
            ? { produit: fields?.PRODUIT_LABEL, poids: fields?.POIDS }
            : { marque: fields?.MARQUE, modele: fields?.MODELE, annee: fields?.ANNEE_FABRICATION };

          // Instantané conservé pour un éventuel export PDF (resetContext() plus bas, une fois
          // l'offre PDF résolue, change de session_id — c'est le seul endroit où le capturer).
          this.chatService.setLastSimulation(fields, resultObj, lang);

          // Le recueil d'avis n'est poussé qu'une fois l'offre de PDF résolue (oui ou non) —
          // voir finalizeAfterPdfOffer(). On garde le contexte nécessaire ici en attendant.
          this.pendingFeedbackContext = { simulationType, vehicleInfo, lang };
          this.messages.push({ sender: 'bot', timestamp: new Date(), kind: 'pdf-offer', offerLang: lang });
        }
        else if (res?.status === 'pdf_ready') {
          this.messages.push({
            sender: 'bot', timestamp: new Date(), kind: 'pdf-link',
            text: res.message || 'Voici le PDF de votre simulation :',
            pdfUrl: res.pdf_url,
            offerLang: lang
          });
          // Si ce PDF a été généré suite à l'offre proposée après un résultat, on enchaîne
          // maintenant vers le recueil d'avis. Si c'est une demande de PDF faite plus tard,
          // hors de ce contexte, pendingFeedbackContext est déjà vide et on ne fait rien de plus.
          this.finalizeAfterPdfOffer();
        }
        else if (res?.status === 'need_external') {
          const msg = (res.message || 'Ce véhicule n’a pas encore été importé au Cameroun. Pour estimation Europe, précisez le kilométrage.')
            + (res.fields_needed ? ` Champs requis : ${res.fields_needed.join(', ')}` : '');
          this.messages.push({ text: msg, sender: 'bot', timestamp: new Date(), kind: 'text' });
        }
        else if (res?.status === 'error') {
          userMsg.status = 'failed';
          const detail = res.message || 'Erreur inconnue côté serveur.';
          this.messages.push({ text: `❌ ${detail}`, sender: 'bot', timestamp: new Date(), kind: 'text' });
          if (res.raw) this.messages.push({ text: `🪵 Debug LLM : ${res.raw}`, sender: 'bot', timestamp: new Date(), kind: 'text' });
        }
        else {
          this.messages.push({ text: 'Réponse inattendue du serveur.', sender: 'bot', timestamp: new Date(), kind: 'text' });
        }

        this.loading = false;
        this.shouldScroll = true;
        this.saveMessages();
        this.sessions = this.convSvc.list();
      },
      error: (err) => {
        userMsg.status = 'failed';
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

  // --- Feedback en ligne (message de type 'feedback' dans la conversation) ---
  setFeedbackRating(msg: Message, star: number): void {
    if (!msg.feedback || msg.feedback.submitted || msg.feedback.submitting) return;
    msg.feedback.rating = star;
  }

  submitInlineFeedback(msg: Message): void {
    const fb = msg.feedback;
    if (!fb || fb.submitted || fb.submitting || fb.rating === 0) return;

    fb.submitting = true;
    this.feedbackService.submitFeedback({
      session_id: fb.sessionId,
      rating: fb.rating,
      comment: (fb.comment || '').trim(),
      simulation_type: fb.simulationType,
      vehicle_info: fb.vehicleInfo
    }).subscribe({
      next: () => {
        fb.submitting = false;
        fb.submitted = true;
        this.saveMessages();
        this.shouldScroll = true;
      },
      error: () => {
        fb.submitting = false;
        // on n'affiche pas d'erreur bloquante : le feedback est facultatif, l'utilisateur peut réessayer
      }
    });
  }

  // --- Historique : regroupement par période + aperçu du dernier résultat ---
  private bucketLabel(ts: number): string {
    const startOfDay = (t: number) => {
      const d = new Date(t);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    };
    const diffDays = Math.round((startOfDay(Date.now()) - startOfDay(ts)) / 86400000);
    if (diffDays <= 0) return "Aujourd'hui";
    if (diffDays === 1) return 'Hier';
    if (diffDays <= 7) return '7 derniers jours';
    if (diffDays <= 30) return '30 derniers jours';
    return 'Plus ancien';
  }

  get groupedSessions(): { label: string; items: Conversation[] }[] {
    const term = this.historySearch.trim().toLowerCase();
    const filtered = term
      ? this.sessions.filter(s => (s.title || '').toLowerCase().includes(term))
      : this.sessions;

    const order = ["Aujourd'hui", 'Hier', '7 derniers jours', '30 derniers jours', 'Plus ancien'];
    const groups = new Map<string, Conversation[]>();
    for (const s of filtered) {
      const label = this.bucketLabel(s.updatedAt);
      (groups.get(label) || groups.set(label, []).get(label)!).push(s);
    }
    return order.filter(l => groups.has(l)).map(label => ({ label, items: groups.get(label)! }));
  }

  // trackBy : `groupedSessions` recrée de nouveaux objets à chaque cycle de détection de
  // changement (c'est un getter, pas un état mis en cache). Sans trackBy, *ngFor considère
  // que "tout a changé" à chaque cycle et détruit/recrée le DOM de toute la liste — ce qui,
  // combiné au focus programmatique du champ de renommage, provoquait une boucle infinie
  // (focus → destruction du DOM → blur → sauvegarde → nouveau cycle → focus perdu → ...).
  trackByGroupLabel(_i: number, g: { label: string; items: Conversation[] }): string {
    return g.label;
  }
  trackBySessionId(_i: number, s: Conversation): string {
    return s.id;
  }

  // Aperçu d'une conversation : le dernier résultat chiffré si dispo, sinon le dernier message texte
  getPreview(s: Conversation): string {
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const m = s.messages[i];
      if (m.kind === 'table' && m.table?.total) {
        return `${m.table.totalLabel || 'Total'} : ${m.table.total}`;
      }
    }
    for (let i = s.messages.length - 1; i >= 0; i--) {
      const m = s.messages[i];
      if ((m.kind || 'text') === 'text' && m.text) {
        return m.text.length > 64 ? m.text.slice(0, 64) + '…' : m.text;
      }
    }
    return '';
  }

  // --- Renommage manuel d'une conversation dans l'historique ---
  startRename(s: Conversation): void {
    this.editingSessionId = s.id;
    this.editingTitle = s.title || '';
    setTimeout(() => {
      const el = document.getElementById('rename-input-' + s.id) as HTMLInputElement | null;
      el?.focus();
      el?.select();
    });
  }

  confirmRename(s: Conversation): void {
    if (this.editingSessionId !== s.id) return;
    const title = this.editingTitle.trim();
    if (title) {
      this.convSvc.rename(s.id, title);
      this.sessions = this.convSvc.list();
    }
    this.editingSessionId = null;
  }

  cancelRename(): void {
    this.editingSessionId = null;
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
