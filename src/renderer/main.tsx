import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/outfit/400.css';
import '@fontsource/outfit/500.css';
import '@fontsource/outfit/600.css';
import '@fontsource/outfit/700.css';
import '@fontsource/outfit/800.css';
import '@fontsource/outfit/900.css';
import { App } from './app/App';
import { applyAppearancePreferences, readAppearancePreferences } from './preferences/appearancePreferences';
import './styles/tokens.css';
import './styles/theme.css';
import './styles/layout.css';
import './styles/app.css';
import './styles/songs.css';
import './styles/eq.css';
import './styles/album-detail.css';

applyAppearancePreferences(readAppearancePreferences());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
