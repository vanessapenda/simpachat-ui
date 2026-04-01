import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { environment } from '../environments/environment';
import { lastValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class ConfigService {
  private config: any
  private configFile = 'config.dev.json'

  constructor(private http: HttpClient) { }

  //fonction pour récupérer le bon fichier de configuration en fonction du profil
  async loadConfig(): Promise<void> {
    if(environment.test)
      this.configFile = 'config.test.json'
    else if(environment.production)
      this.configFile = 'config.prod.json'
    else
      this.configFile = 'config.dev.json'

      // 🔥 Cache-buster: nouvelle URL à chaque reload
    const v = Date.now(); // ou une version lue dans index.html si tu préfères
    const url = `assets/config/${this.configFile}?v=${v}`;

    // En-têtes anti-cache (ne suffisent pas si SW actif, mais ça aide)
    const headers = new HttpHeaders({
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    });

    try {
      const data = await lastValueFrom(this.http.get(url, { headers }));
      this.config = data;
    } catch (error) {
      throw new Error(
        `Impossible de charger la configuration "${this.configFile}". ` +
        `Vérifiez que le fichier existe dans assets/config/ et que le serveur est accessible.`
      );
    }
  }

  getConfig(): any {
    return this.config;
  }
}
