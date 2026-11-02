export interface TableRow { label: string; value: string; }
export interface MetaRow  { label: string; value: string; }

export interface TablePayload {
  rows: TableRow[];
  total?: string;
  totalLabel?: string;
  meta?: MetaRow[];
}

export interface QuickReplyOption { label: string; text: string; }
export interface ProductOption { code: string; label: string; }

export interface InlineFeedback {
  sessionId: string;
  simulationType: 'cameroon' | 'external' | 'first_necessity' | 'unknown';
  vehicleInfo: any;
  rating: number;
  comment: string;
  submitting: boolean;
  submitted: boolean;
  lang?: string;
}

export interface Message {
  sender: 'user' | 'bot';
  timestamp: Date;

  // type de rendu
  kind?: 'text' | 'table' | 'feedback' | 'quick-replies' | 'operation-cards' | 'pdf-link' | 'pdf-offer' | 'product-select';

  // contenu (optionnels selon kind)
  text?: string;
  table?: TablePayload;
  feedback?: InlineFeedback;
  quickReplies?: QuickReplyOption[];
  // URL de téléchargement du PDF de résultat (kind === 'pdf-link')
  pdfUrl?: string;
  // langue à utiliser pour les boutons Oui/Non (kind === 'pdf-offer') ou le bouton de
  // téléchargement (kind === 'pdf-link')
  offerLang?: string;
  // liste des produits de 1ère nécessité proposés (kind === 'product-select')
  productOptions?: ProductOption[];
  // 'pills' pour les 6 catégories export (boutons hors bulle, comme les menus de navigation) ;
  // 'list' (défaut) pour une vraie liste de produits (boissons, 1ère nécessité, produits d'une
  // catégorie export...) : liste verticale défilable dans la bulle, clic direct.
  optionsStyle?: 'pills' | 'list';

  // liste à puces (optionnelle) affichée sous le texte : les caractéristiques encore
  // demandées à l'utilisateur (ex: marque, modèle, pays de provenance, ...)
  checklist?: string[];
  // phrase de clôture affichée après la liste à puces (ex: "Vous pouvez répondre en une seule phrase.")
  checklistNote?: string;

  // statut d'envoi (messages utilisateur uniquement) : permet d'afficher un bouton "réessayer"
  status?: 'sent' | 'failed';
}
