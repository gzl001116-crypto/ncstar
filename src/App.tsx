import { Route, Routes, useLocation } from "react-router-dom";
import { useEffect, useLayoutEffect, type ReactNode } from "react";
import { clientRedirect, isPlayHost, isShopHost } from "./site";
import { Layout } from "./components/Layout";
import { About } from "./pages/About";
import { Auth } from "./pages/Auth";
import { Checkout } from "./pages/Checkout";
import { CreatorPage } from "./pages/Creator";
import { Explore } from "./pages/Explore";
import { Home } from "./pages/Home";
import { PlayLayout } from "./components/PlayLayout";
import { Library } from "./pages/Library";
import { PlayHome, PlayViewer } from "./pages/Play";
import { NotFound } from "./pages/NotFound";
import { PostPage } from "./pages/PostPage";
import { ProductPage } from "./pages/ProductPage";
import { Privacy } from "./pages/Privacy";
import { StudioHome, StudioLayout, StudioPosts, StudioProfile, StudioWorks } from "./pages/Studio";
import { Terms } from "./pages/Terms";
import { Tokushoho } from "./pages/Tokushoho";

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);
  return null;
}

function HostGate({ children }: { children: ReactNode }) {
  const location = useLocation();
  const away = clientRedirect(`${window.location.origin}${location.pathname}${location.search}${location.hash}`);
  useLayoutEffect(() => {
    if (away) window.location.replace(away);
  }, [away]);
  if (away) return null;
  return children;
}

export function App() {
  const play = isPlayHost();
  const shop = isShopHost();
  return (
    <HostGate>
      <ScrollToTop />
      <Routes>
        {play && (
          <Route element={<PlayLayout />}>
            <Route index element={<PlayHome />} />
            <Route path=":productId" element={<PlayViewer />} />
          </Route>
        )}
        {!play && !shop && (
          <Route path="play" element={<PlayLayout />}>
            <Route index element={<PlayHome />} />
            <Route path=":productId" element={<PlayViewer />} />
          </Route>
        )}
        {!play && <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="explore" element={<Explore />} />
          <Route path="c/:handle" element={<CreatorPage />} />
          <Route path="c/:handle/posts/:postId" element={<PostPage />} />
          <Route path="c/:handle/shop/:productId" element={<ProductPage />} />
          <Route path="checkout" element={<Checkout />} />
          <Route path="login" element={<Auth mode="login" />} />
          <Route path="register" element={<Auth mode="register" />} />
          <Route path="library" element={<Library />} />
          <Route path="studio" element={<StudioLayout />}>
            <Route index element={<StudioHome />} />
            <Route path="profile" element={<StudioProfile />} />
            <Route path="posts" element={<StudioPosts />} />
            <Route path="works" element={<StudioWorks />} />
          </Route>
          <Route path="about" element={<About />} />
          <Route path="terms" element={<Terms />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="tokushoho" element={<Tokushoho />} />
          <Route path="*" element={<NotFound />} />
        </Route>}
      </Routes>
    </HostGate>
  );
}
