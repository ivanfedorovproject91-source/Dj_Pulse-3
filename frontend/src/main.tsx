import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { I18nProvider } from './services/i18n';
import { PrefsProvider } from './services/prefs';
import { initTelegram } from './services/telegram';
import './styles/app.css';

initTelegram();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrefsProvider>
      <I18nProvider>
        <App />
      </I18nProvider>
    </PrefsProvider>
  </StrictMode>,
);
