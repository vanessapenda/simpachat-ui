export interface FeedbackData {
  session_id: string;
  rating: number;
  comment: string;
  simulation_type: 'cameroon' | 'external' | 'unknown';
  vehicle_info: {
    marque?: string;
    modele?: string;
    annee?: number;
    [key: string]: any;
  };
}

export interface FeedbackResponse {
  status: 'success' | 'error';
  message: string;
  feedback_id?: string;
}
