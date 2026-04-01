import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { FeedbackService } from './feedback.service';
import { FeedbackData } from './feedback.model';

@Component({
  selector: 'app-feedback',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './feedback.component.html',
  styleUrls: ['./feedback.component.css']
})
export class FeedbackComponent {

  @Input() sessionId: string = '';
  @Input() simulationType: 'cameroon' | 'external' | 'unknown' = 'unknown';
  @Input() vehicleInfo: any = {};

  @Output() feedbackSubmitted = new EventEmitter<void>();

  rating: number = 0;
  hoverRating: number = 0;
  comment: string = '';
  isSubmitting: boolean = false;
  isSubmitted: boolean = false;
  errorMessage: string = '';

  constructor(private feedbackService: FeedbackService) {}

  /**
   * Sélectionner une note (clic sur étoile)
   */
  setRating(value: number): void {
    this.rating = value;
    this.errorMessage = ''; // Reset error si présent
  }

  /**
   * Hover sur une étoile
   */
  onStarHover(value: number): void {
    this.hoverRating = value;
  }

  /**
   * Quitter le hover
   */
  onStarLeave(): void {
    this.hoverRating = 0;
  }

  /**
   * Soumettre le feedback
   */
  submit(): void {
    // Validation
    if (this.rating === 0) {
      this.errorMessage = 'Veuillez sélectionner une note';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const feedback: FeedbackData = {
      session_id: this.sessionId,
      rating: this.rating,
      comment: this.comment.trim(),
      simulation_type: this.simulationType,
      vehicle_info: this.vehicleInfo
    };

    this.feedbackService.submitFeedback(feedback).subscribe({
      next: (response) => {
        if (response.status === 'success') {
          this.isSubmitted = true;
          this.feedbackSubmitted.emit();
        } else {
          this.errorMessage = response.message || 'Erreur lors de l\'envoi';
        }
        this.isSubmitting = false;
      },
      error: (err) => {
        console.error('Erreur feedback:', err);
        this.errorMessage = 'Impossible d\'envoyer votre avis. Réessayez.';
        this.isSubmitting = false;
      }
    });
  }

  /**
   * Annuler / Masquer le feedback
   */
  cancel(): void {
    this.feedbackSubmitted.emit();
  }
}
