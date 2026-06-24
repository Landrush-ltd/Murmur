import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { LandingPage } from './screens/LandingPage';
import { WaitlistPage } from './screens/WaitlistPage';
import { initPWA, requestStoragePersistence } from './pwa';
import './styles.css';

initPWA();
void requestStoragePersistence();

function Root() {
  const path = window.location.pathname;
  if (path.startsWith('/app')) return <App />;
  if (path.startsWith('/waitlist')) return <WaitlistPage />;
  return <LandingPage />;
}

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
