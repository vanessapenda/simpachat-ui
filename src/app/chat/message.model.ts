export interface TableRow { label: string; value: string; }
export interface MetaRow  { label: string; value: string; }

export interface TablePayload {
  rows: TableRow[];
  total?: string;
  meta?: MetaRow[];
}

export interface Message {
  sender: 'user' | 'bot';
  timestamp: Date;

  // type de rendu
  kind?: 'text' | 'table';

  // contenu (optionnels selon kind)
  text?: string;
  table?: TablePayload;
}
