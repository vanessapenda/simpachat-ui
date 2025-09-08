import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { ConfigService } from './config-service';


@Injectable({ providedIn: 'root' })
export class ChatService {
  // Contexte persistant entre les tours (partagé à tous les composants si besoin)
  private ctxFieldsSubject = new BehaviorSubject<any>({});
  ctxFields$ = this.ctxFieldsSubject.asObservable();

   // 🔐 Identifiant de session de chat (1 onglet = 1 session). Persiste au reload.
  private sessionId = ((): string => {
    const k = 'simpachat_session';
    let v = localStorage.getItem(k) || '';
    if (!v) { v = crypto.randomUUID(); localStorage.setItem(k, v); }
    return v;
  })();

  constructor(private http: HttpClient, private enService: ConfigService) {
  }

  /** Contexte courant (lecture rapide) */
  get ctxFields(): any {
    return this.ctxFieldsSubject.value;
  }

  /** Réinitialiser la conversation (vide le contexte) */
  resetContext(): void {
    this.ctxFieldsSubject.next({});
    // Nouveau cycle de conversation => nouvelle session
    this.sessionId = crypto.randomUUID();
    localStorage.setItem('simpachat_session', this.sessionId);
  }

  /** Fusionne sans écraser par des valeurs vides/nulles */
  private mergeNonEmpty(base: any, incoming: any): any {
    const out = { ...(base || {}) };
    for (const k of Object.keys(incoming || {})) {
      const v = (incoming as any)[k];
      if (v !== null && v !== '' && !(Array.isArray(v) && v.length === 0)) {
        out[k.toUpperCase?.() ?? k] = v;
      }
    }
    return out;
  }

  /** Conversation orchestrée par le backend (LLM) — envoie TOUJOURS le contexte courant et le met à jour au retour */
  simulateFromText(text: string, lang: string = 'fr', contextFields?: any): Observable<any> {
    const ctx = contextFields ?? this.ctxFields; // si non fourni, on prend le contexte stocké
    const body = { text, lang, session_id: this.sessionId, context_fields: ctx }; // ← session_id + contexte
    console.log(this.enService.getConfig().apiBase);
    return this.http.post(`${this.enService.getConfig().apiBase}/chat/simulate-from-text`, body).pipe(
      tap((res: any) => {
        if (res?.fields) {
          const merged = this.mergeNonEmpty(this.ctxFields, res.fields);
          this.ctxFieldsSubject.next(merged); // ⚠️ met à jour le contexte pour le prochain tour
        }
      })
    );
  }

  /** Appel direct au /chat brut (rarement utile pour ta prod) */
  chat(prompt: string): Observable<any> {
    return this.http.post(`${this.enService.getConfig().apiBase}/chat`, { prompt });
  }

  /** Simulation interne directe (bypass conversation) */
  simulate(payload: any): Observable<any> {
    return this.http.post(`${this.enService.getConfig().apiBase}/simulate/`, payload);
  }

  /** Simulation externe directe (bypass conversation) */
  simulateExternal(payload: any): Observable<any> {
    return this.http.post(`${this.enService.getConfig().apiBase}/simulate-external/`, payload);
  }

  health(): Observable<any> {
    return this.http.get(`${this.enService.getConfig().apiBase}/health`);
  }
}
