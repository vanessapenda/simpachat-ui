import { APP_INITIALIZER, ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { provideHttpClient, withFetch } from '@angular/common/http';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { ConfigService } from './config-service';

// Sans ça, le pipe `date` d'Angular formate en anglais (en-US) par défaut,
// quelle que soit la langue utilisée dans la conversation.
registerLocaleData(localeFr);

export function initConfig(cfg: ConfigService) {
  return () => cfg.loadConfig();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(withFetch()),
    { provide: LOCALE_ID, useValue: 'fr' },
    { provide: APP_INITIALIZER, useFactory: initConfig, deps: [ConfigService], multi: true }
  ]
};
