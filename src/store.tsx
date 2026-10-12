import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { isMessage, useI18n } from "./i18n";
import type { Catalog, Category, Creator, Post, Product, Tier, User } from "./types";

type Toast = { id: number; text: string };

type RegisterInput = {
  name: string;
  email: string;
  password: string;
  handle: string;
  bio: string;
  isCreator: boolean;
  code: string;
  token: string;
  expiresAt: number;
};

type StoreValue = {
  ready: boolean;
  creators: Creator[];
  posts: Post[];
  products: Product[];
  tiers: Tier[];
  comments: Catalog["comments"];
  user: User | null;
  toasts: Toast[];
  toast: (text: string) => void;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  register: (input: RegisterInput) => Promise<string | null>;
  toggleFollow: (creatorId: string) => Promise<void>;
  toggleLike: (postId: string) => Promise<void>;
  addComment: (postId: string, text: string) => Promise<string | null>;
  addToCart: (productId: string) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  checkoutCart: () => Promise<string | null>;
  checkoutTier: (tierId: string) => Promise<string | null>;
  publishPost: (input: { title: string; excerpt: string; body: string; minRank: number }) => Promise<string | null>;
  publishProduct: (input: {
    title: string;
    description: string;
    price: number;
    kind: string;
    includes: string[];
    fileBody: string;
  }) => Promise<string | null>;
  updateProfile: (input: { name: string; bio: string; location?: string; category?: Category }) => Promise<string | null>;
  openStudio: () => Promise<string | null>;
  creatorById: (id: string) => Creator | undefined;
  tierById: (id: string) => Tier | undefined;
  productById: (id: string) => Product | undefined;
  activeMembership: (creatorId: string) => User["memberships"][number] | undefined;
  canRead: (post: Post) => boolean;
  owns: (productId: string) => boolean;
  followed: (creatorId: string) => boolean;
  liked: (postId: string) => boolean;
  supporterCount: (creatorId: string) => number;
  followerCount: (creator: Creator) => number;
};

const empty: Catalog = { creators: [], posts: [], products: [], tiers: [], comments: [], user: null };
const StoreContext = createContext<StoreValue | null>(null);

async function call(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined && path === "/api/state" ? "GET" : "POST",
    credentials: "same-origin",
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as Catalog & {
    code?: string;
    name?: string;
    toast?: string;
    error?: string;
  };
  return { response, data };
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const [catalog, setCatalog] = useState<Catalog>(empty);
  const [ready, setReady] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const say = (code?: string, name?: string, legacy?: string) => {
    if (code && isMessage(code)) return t(code, name ? { name } : undefined);
    return legacy || code || t("err.generic");
  };

  const toast = (text: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, text }]);
    window.setTimeout(() => setToasts((current) => current.filter((item) => item.id !== id)), 2800);
  };

  const apply = (data: Catalog & { code?: string; name?: string; toast?: string }) => {
    setCatalog({
      creators: data.creators ?? [],
      posts: data.posts ?? [],
      products: data.products ?? [],
      tiers: data.tiers ?? [],
      comments: data.comments ?? [],
      user: data.user ?? null,
    });
    if (data.code || data.toast) toast(say(data.code, data.name, data.toast));
  };

  useEffect(() => {
    let live = true;
    fetch("/api/state", { credentials: "same-origin" })
      .then((response) => response.json())
      .then((data: Catalog) => {
        if (live) apply(data);
      })
      .catch(() => {
        if (live) toast(t("err.offline"));
      })
      .finally(() => {
        if (live) setReady(true);
      });
    return () => {
      live = false;
    };
    // Language is chosen once, before the first paint of this provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const mutate = async (path: string, body?: unknown) => {
    try {
      const { response, data } = await call(path, body ?? {});
      if (!response.ok) return say(data.code, data.name, data.error);
      apply(data);
      return null;
    } catch {
      return t("err.network");
    }
  };

  const { creators, posts, products, tiers, comments, user } = catalog;
  const creatorById = (id: string) => creators.find((creator) => creator.id === id || creator.handle === id);
  const tierById = (id: string) => tiers.find((tier) => tier.id === id);
  const productById = (id: string) => products.find((product) => product.id === id);
  const activeMembership = (creatorId: string) =>
    user?.memberships.find((item) => item.creatorId === creatorId && new Date(item.expiresAt) > new Date());
  const canRead = (post: Post) => {
    if (post.minRank <= 0) return true;
    if (user?.handle === post.creatorId) return true;
    const membership = activeMembership(post.creatorId);
    const tier = tierById(membership?.tierId ?? "");
    return Boolean(tier && tier.rank >= post.minRank);
  };

  const value: StoreValue = {
    ready,
    creators,
    posts,
    products,
    tiers,
    comments,
    user,
    toasts,
    toast,
    login: (email, password) => mutate("/api/login", { email, password }),
    logout: async () => {
      await mutate("/api/logout", {});
    },
    register: (input) => mutate("/api/register", input),
    toggleFollow: async (creatorId) => {
      const error = await mutate("/api/follow", { creatorId });
      if (error) toast(error);
    },
    toggleLike: async (postId) => {
      const error = await mutate("/api/like", { postId });
      if (error) toast(error);
    },
    addComment: (postId, text) => mutate("/api/comments", { postId, text }),
    addToCart: async (productId) => {
      const error = await mutate("/api/cart", { productId, op: "add" });
      if (error) toast(error);
    },
    removeFromCart: async (productId) => {
      await mutate("/api/cart", { productId, op: "remove" });
    },
    checkoutCart: () => mutate("/api/checkout", {}),
    checkoutTier: (tierId) => mutate("/api/checkout", { tierId }),
    publishPost: (input) => mutate("/api/posts", input),
    publishProduct: (input) => mutate("/api/products", input),
    updateProfile: (input) => mutate("/api/profile", input),
    openStudio: () => mutate("/api/studio", {}),
    creatorById,
    tierById,
    productById,
    activeMembership,
    canRead,
    owns: (productId) => Boolean(user?.library.some((item) => item.productId === productId)),
    followed: (creatorId) => Boolean(user?.follows.includes(creatorId)),
    liked: (postId) => Boolean(user?.likes.includes(postId)),
    supporterCount: (creatorId) => creatorById(creatorId)?.supporters ?? 0,
    followerCount: (creator) => creator.followers,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Store missing");
  return value;
}
