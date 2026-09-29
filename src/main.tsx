import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import StatusPage from './StatusPage.tsx'
import LegalPage from './LegalPage.tsx'
import PageEnter from './PageEnter.tsx'
import { SessionProvider } from './store/session.tsx'
import StoreLayout from './store/StoreLayout.tsx'
import StoreHome from './store/StoreHome.tsx'
import CapeDetail from './store/CapeDetail.tsx'
import CollectionPage from './store/CollectionPage.tsx'
import MyCapesPage from './store/MyCapesPage.tsx'
import AuthPage from './store/AuthPage.tsx'
import CheckoutReturn from './store/CheckoutReturn.tsx'
import AdminPage from './store/AdminPage.tsx'

const basename = (() => {
  const base = import.meta.env.BASE_URL || '/'
  if (base === '/') return '/'
  return base.replace(/\/$/, '')
})()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <BrowserRouter basename={basename}>
        <Routes>
          <Route
            path="/"
            element={
              <PageEnter>
                <App />
              </PageEnter>
            }
          />
          <Route
            path="/status"
            element={
              <PageEnter>
                <StatusPage />
              </PageEnter>
            }
          />
          <Route
            path="/auth"
            element={
              <PageEnter>
                <AuthPage />
              </PageEnter>
            }
          />
          <Route
            path="/legal"
            element={
              <PageEnter>
                <LegalPage />
              </PageEnter>
            }
          />
          <Route path="/privacy" element={<Navigate to="/legal#privacy" replace />} />
          <Route path="/terms" element={<Navigate to="/legal#terms" replace />} />
          <Route path="/refunds" element={<Navigate to="/legal#purchases" replace />} />
          <Route path="/store" element={<StoreLayout />}>
            <Route index element={<StoreHome />} />
            <Route path="collection" element={<CollectionPage />} />
            <Route path="my-capes" element={<MyCapesPage />} />
            <Route path="account" element={<Navigate to="/store" replace />} />
            <Route path="checkout" element={<CheckoutReturn />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="cape/:id" element={<CapeDetail />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  </StrictMode>,
)
