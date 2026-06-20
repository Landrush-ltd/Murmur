import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LandingPage } from './screens/LandingPage';
import { initPWA, requestStoragePersistence } from './pwa';
import './styles.css';

initPWA();
void requestStoragePersistence();

function Root() {
  const isApp = window.location.pathname.startsWith('/app');
  if (!isApp) return <LandingPage />;
  return <App />;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
