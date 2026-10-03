import { StrictMode, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import StatusPage from './StatusPage.tsx'
import LegalPage from './LegalPage.tsx'
import PageEnter from './PageEnter.tsx'
import { SessionProvider } from './store/session.tsx'
import StoreLayout from './store/StoreLayout.tsx'
import StoreHome from './store/StoreHome.tsx'
import CapeDetail from './store/CapeDetail.tsx'
import WingDetail from './store/WingDetail'
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

/** A new page starts at the top (unless the link points at a section, like /#faq). */
function ScrollToTop() {
  const { pathname, hash } = useLocation()
  useLayoutEffect(() => {
    if (!hash) window.scrollTo({ top: 0, left: 0, behavior: 'instant' })
  }, [pathname, hash])
  return null
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SessionProvider>
      <BrowserRouter basename={basename}>
        <ScrollToTop />
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
            <Route path="my-cosmetics" element={<MyCapesPage />} />
            <Route path="my-capes" element={<Navigate to="/store/my-cosmetics" replace />} />
            <Route path="account" element={<Navigate to="/store" replace />} />
            <Route path="checkout" element={<CheckoutReturn />} />
            <Route path="admin" element={<AdminPage />} />
            <Route path="cape/:id" element={<CapeDetail />} />
            <Route path="wings/:id" element={<WingDetail />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </SessionProvider>
  </StrictMode>,
)
