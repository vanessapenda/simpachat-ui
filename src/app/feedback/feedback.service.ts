import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FeedbackData, FeedbackResponse } from './feedback.model';
import { ConfigService } from '../config-service';

@Injectable({
  providedIn: 'root'
})
export class FeedbackService {

  constructor(
    private http: HttpClient,
    private configService: ConfigService
  ) {}

  /**
   * Soumet un feedback utilisateur
   */
  submitFeedback(feedback: FeedbackData): Observable<FeedbackResponse> {
    const apiBase = this.configService.getConfig().apiBase;
    return this.http.post<FeedbackResponse>(
      `${apiBase}/feedback/submit`,
      feedback
    );
  }

  /**
   * Récupère les statistiques (pour admin)
   */
  getStats(): Observable<any> {
    const apiBase = this.configService.getConfig().apiBase;
    return this.http.get(`${apiBase}/feedback/stats`);
  }

  /**
   * Récupère tous les feedbacks (pour admin)
   */
  getAllFeedbacks(limit?: number): Observable<any> {
    const apiBase = this.configService.getConfig().apiBase;
    const url = limit
      ? `${apiBase}/feedback/all?limit=${limit}`
      : `${apiBase}/feedback/all`;
    return this.http.get(url);
  }
}
