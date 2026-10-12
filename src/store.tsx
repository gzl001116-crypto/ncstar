import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  createSeedUsers,
  seedComments,
  seedCreators,
  seedPosts,
  seedProducts,
  seedTiers,
} from "./data";
import type { Category, Creator, Db, Post, Product, User } from "./types";
import { addDays, uid } from "./utils";

const KEY = "xingye.db.v1";

function freshDb(): Db {
  return {
    version: 1,
    sessionEmail: null,
    users: createSeedUsers(),
    posts: [],
    products: [],
    comments: [],
    creators: [],
    tiers: [],
    creatorPatches: {},
  };
}

function loadDb(): Db {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return freshDb();
    const parsed = JSON.parse(raw) as Db;
    if (parsed.version !== 1 || !Array.isArray(parsed.users)) return freshDb();
    return parsed;
  } catch {
    return freshDb();
  }
}

type Toast = { id: number; text: string };

type StoreValue = {
  creators: Creator[];
  posts: Post[];
  products: Product[];
  tiers: typeof seedTiers;
  comments: typeof seedComments;
  user: User | null;
  toasts: Toast[];
  toast: (text: string) => void;
  login: (email: string, password: string) => string | null;
  logout: () => void;
  register: (input: {
    name: string;
    email: string;
    password: string;
    handle: string;
    bio: string;
    isCreator: boolean;
  }) => string | null;
  toggleFollow: (creatorId: string) => void;
  toggleLike: (postId: string) => void;
  addComment: (postId: string, text: string) => string | null;
  addToCart: (productId: string) => void;
  removeFromCart: (productId: string) => void;
  checkoutCart: () => string | null;
  checkoutTier: (tierId: string) => string | null;
  publishPost: (input: {
    title: string;
    excerpt: string;
    body: string;
    minRank: number;
  }) => string | null;
  publishProduct: (input: {
    title: string;
    description: string;
    price: number;
    kind: string;
    includes: string[];
  }) => string | null;
  updateProfile: (input: { name: string; bio: string; location?: string; category?: Category }) => void;
  openStudio: () => void;
  reset: () => void;
  creatorById: (id: string) => Creator | undefined;
  tierById: (id: string) => (typeof seedTiers)[number] | undefined;
  productById: (id: string) => Product | undefined;
  activeMembership: (creatorId: string) => User["memberships"][number] | undefined;
  canRead: (post: Post) => boolean;
  owns: (productId: string) => boolean;
  followed: (creatorId: string) => boolean;
  liked: (postId: string) => boolean;
  supporterCount: (creatorId: string) => number;
  followerCount: (creator: Creator) => number;
};

const StoreContext = createContext<StoreValue | null>(null);

function defaultTiers(creatorId: string) {
  return [
    {
      id: uid("tier"),
      creatorId,
      name: "读者席",
      price: 18,
      rank: 1,
      blurb: "解锁会员动态，并下载附件。",
      perks: ["会员动态", "附件下载", "30 天，不自动续费"],
    },
    {
      id: uid("tier"),
      creatorId,
      name: "内页",
      price: 42,
      rank: 2,
      blurb: "更早看到新作，并包含读者席的全部内容。",
      perks: ["包含读者席", "更高档位的动态", "30 天，不自动续费"],
    },
  ];
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [db, setDb] = useState<Db>(loadDb);
  const dbRef = useRef(db);
  dbRef.current = db;
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(db));
  }, [db]);

  const toast = (text: string) => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, text }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 2800);
  };

  const commit = (next: Db) => {
    dbRef.current = next;
    setDb(next);
  };

  const updateUser = (userId: string, recipe: (user: User) => User) => {
    const current = dbRef.current;
    commit({
      ...current,
      users: current.users.map((user) => (user.id === userId ? recipe(user) : user)),
    });
  };

  const creators = useMemo(() => {
    const merged = [...seedCreators, ...db.creators.filter((creator) => !seedCreators.some((item) => item.id === creator.id))];
    return merged.map((creator) => ({ ...creator, ...db.creatorPatches[creator.id] }));
  }, [db.creators, db.creatorPatches]);

  const posts = useMemo(
    () => [...db.posts, ...seedPosts].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    [db.posts],
  );
  const products = useMemo(() => [...db.products, ...seedProducts], [db.products]);
  const tiers = useMemo(() => [...db.tiers, ...seedTiers], [db.tiers]);
  const comments = useMemo(
    () => [...db.comments, ...seedComments].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt)),
    [db.comments],
  );

  const user = db.users.find((item) => item.email === db.sessionEmail) ?? null;

  const creatorById = (id: string) => creators.find((creator) => creator.id === id || creator.handle === id);
  const tierById = (id: string) => tiers.find((tier) => tier.id === id);
  const productById = (id: string) => products.find((product) => product.id === id);

  const activeMembership = (creatorId: string) =>
    user?.memberships.find((item) => item.creatorId === creatorId && new Date(item.expiresAt) > new Date());

  const canRead = (post: Post) => {
    if (post.minRank <= 0) return true;
    if (user?.handle === post.creatorId) return true;
    const membership = activeMembership(post.creatorId);
    if (!membership) return false;
    const tier = tierById(membership.tierId);
    return Boolean(tier && tier.rank >= post.minRank);
  };

  const owns = (productId: string) => Boolean(user?.library.some((item) => item.productId === productId));
  const followed = (creatorId: string) => Boolean(user?.follows.includes(creatorId));
  const liked = (postId: string) => Boolean(user?.likes.includes(postId));

  const supporterCount = (creatorId: string) => {
    const base = creatorById(creatorId)?.supporters ?? 0;
    const extra = db.users.filter((item) =>
      item.memberships.some((membership) => membership.creatorId === creatorId && new Date(membership.expiresAt) > new Date()),
    ).length;
    return base + extra;
  };

  const followerCount = (creator: Creator) =>
    creator.followers + db.users.filter((item) => item.follows.includes(creator.id)).length;

  const requireUser = () => {
    if (!dbRef.current.sessionEmail) return "请先登录";
    return null;
  };

  const login = (email: string, password: string) => {
    const found = dbRef.current.users.find((item) => item.email.toLowerCase() === email.trim().toLowerCase());
    if (!found || found.password !== password) return "邮箱或密码不正确";
    commit({ ...dbRef.current, sessionEmail: found.email });
    toast(`欢迎回来，${found.name}`);
    return null;
  };

  const logout = () => {
    commit({ ...dbRef.current, sessionEmail: null });
    toast("已退出");
  };

  const register: StoreValue["register"] = (input) => {
    const email = input.email.trim().toLowerCase();
    const handle = input.handle.trim().toLowerCase();
    const name = input.name.trim();
    if (!name) return "请填写名字";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "请填写有效邮箱";
    if (input.password.length < 6) return "密码至少 6 位";
    if (!/^[a-z0-9_]{3,16}$/.test(handle)) return "主页地址用 3-16 位小写字母、数字或下划线";
    const current = dbRef.current;
    if (current.users.some((item) => item.email === email)) return "这个邮箱已经注册";
    if (current.users.some((item) => item.handle === handle) || creators.some((item) => item.handle === handle)) {
      return "这个主页地址已经被使用";
    }
    const nextUser: User = {
      id: uid("user"),
      name,
      email,
      password: input.password,
      handle,
      bio: input.bio.trim() || "刚来到星页。",
      isCreator: input.isCreator,
      follows: [],
      likes: [],
      memberships: [],
      library: [],
      cart: [],
    };
    const creator: Creator | null = input.isCreator
      ? {
          id: handle,
          handle,
          name,
          category: "写作",
          location: "未填写",
          bio: nextUser.bio,
          tags: ["新页"],
          followers: 0,
          supporters: 0,
          since: `${new Date().getFullYear()}.${`${new Date().getMonth() + 1}`.padStart(2, "0")}`,
        }
      : null;
    commit({
      ...current,
      sessionEmail: email,
      users: [...current.users, nextUser],
      creators: creator ? [...current.creators, creator] : current.creators,
      tiers: creator ? [...current.tiers, ...defaultTiers(handle)] : current.tiers,
    });
    toast(input.isCreator ? "创作页已开通" : "账号已就绪");
    return null;
  };

  const toggleFollow = (creatorId: string) => {
    if (!user) return;
    updateUser(user.id, (current) => ({
      ...current,
      follows: current.follows.includes(creatorId)
        ? current.follows.filter((id) => id !== creatorId)
        : [...current.follows, creatorId],
    }));
  };

  const toggleLike = (postId: string) => {
    if (!user) return;
    updateUser(user.id, (current) => ({
      ...current,
      likes: current.likes.includes(postId) ? current.likes.filter((id) => id !== postId) : [...current.likes, postId],
    }));
  };

  const addComment = (postId: string, text: string) => {
    const error = requireUser();
    if (error) return error;
    const body = text.trim();
    if (!body) return "评论不能为空";
    const current = dbRef.current;
    const author = current.users.find((item) => item.email === current.sessionEmail);
    if (!author) return "请先登录";
    commit({
      ...current,
      comments: [
        {
          id: uid("comment"),
          postId,
          author: author.name,
          text: body,
          createdAt: new Date().toISOString(),
        },
        ...current.comments,
      ],
    });
    return null;
  };

  const addToCart = (productId: string) => {
    if (!user) return;
    if (user.library.some((item) => item.productId === productId)) {
      toast("这件作品已经在库里");
      return;
    }
    if (user.cart.includes(productId)) {
      toast("已经在购物袋里");
      return;
    }
    const product = productById(productId);
    if (product && product.creatorId === user.handle) {
      toast("这是你自己的作品");
      return;
    }
    updateUser(user.id, (current) => ({ ...current, cart: [...current.cart, productId] }));
    toast("已放入购物袋");
  };

  const removeFromCart = (productId: string) => {
    if (!user) return;
    updateUser(user.id, (current) => ({ ...current, cart: current.cart.filter((id) => id !== productId) }));
  };

  const checkoutCart = () => {
    const error = requireUser();
    if (error) return error;
    const currentUser = dbRef.current.users.find((item) => item.email === dbRef.current.sessionEmail);
    if (!currentUser) return "请先登录";
    const payable = currentUser.cart.filter((id) => {
      const product = products.find((item) => item.id === id);
      if (!product) return false;
      if (product.creatorId === currentUser.handle) return false;
      return !currentUser.library.some((item) => item.productId === id);
    });
    if (payable.length === 0) return "购物袋里没有可结算的作品";
    updateUser(currentUser.id, (item) => ({
      ...item,
      cart: [],
      library: [
        ...item.library,
        ...payable.map((productId) => ({ productId, purchasedAt: new Date().toISOString() })),
      ],
    }));
    toast("已入库");
    return null;
  };

  const checkoutTier = (tierId: string) => {
    const error = requireUser();
    if (error) return error;
    const tier = tiers.find((item) => item.id === tierId);
    if (!tier) return "找不到这个会员档";
    const currentUser = dbRef.current.users.find((item) => item.email === dbRef.current.sessionEmail);
    if (!currentUser) return "请先登录";
    if (tier.creatorId === currentUser.handle) return "不能开通自己的会员";
    updateUser(currentUser.id, (item) => ({
      ...item,
      memberships: [
        ...item.memberships.filter((membership) => membership.creatorId !== tier.creatorId),
        { creatorId: tier.creatorId, tierId: tier.id, expiresAt: addDays(30) },
      ],
    }));
    toast("会员已生效");
    return null;
  };

  const publishPost: StoreValue["publishPost"] = (input) => {
    if (!user?.isCreator) return "先开通创作页";
    if (input.title.trim().length < 2) return "标题再写具体一点";
    if (input.body.trim().length < 8) return "正文再多写一点";
    const post: Post = {
      id: uid("post"),
      creatorId: user.handle,
      title: input.title.trim(),
      excerpt: input.excerpt.trim() || input.body.trim().slice(0, 42),
      body: input.body.trim(),
      createdAt: new Date().toISOString(),
      likes: 0,
      minRank: input.minRank,
      attachments:
        input.minRank > 0
          ? [{ name: `${input.title.trim().slice(0, 12)}.txt`, size: "演示文件" }]
          : [],
      coverKey: uid("cover"),
    };
    commit({ ...dbRef.current, posts: [post, ...dbRef.current.posts] });
    toast("动态已发布");
    return null;
  };

  const publishProduct: StoreValue["publishProduct"] = (input) => {
    if (!user?.isCreator) return "先开通创作页";
    if (input.title.trim().length < 2) return "给作品起个名字";
    if (!Number.isFinite(input.price) || input.price <= 0 || input.price > 9999) return "价格需要在 1 到 9999 之间";
    const product: Product = {
      id: uid("shop"),
      creatorId: user.handle,
      title: input.title.trim(),
      description: input.description.trim() || "创作者刚刚上架的数字作品。",
      price: Math.round(input.price * 100) / 100,
      kind: input.kind.trim() || "数字作品",
      includes: input.includes.length ? input.includes : ["演示文件"],
      coverKey: uid("cover"),
    };
    commit({ ...dbRef.current, products: [product, ...dbRef.current.products] });
    toast("作品已上架");
    return null;
  };

  const updateProfile = (input: { name: string; bio: string; location?: string; category?: Category }) => {
    if (!user) return;
    const name = input.name.trim() || user.name;
    const bio = input.bio.trim() || user.bio;
    const patch: Partial<Creator> = { name, bio };
    if (input.location?.trim()) patch.location = input.location.trim();
    if (input.category) patch.category = input.category;
    const current = dbRef.current;
    commit({
      ...current,
      users: current.users.map((item) => (item.id === user.id ? { ...item, name, bio } : item)),
      creators: current.creators.map((creator) => (creator.id === user.handle ? { ...creator, ...patch } : creator)),
      creatorPatches: {
        ...current.creatorPatches,
        [user.handle]: { ...current.creatorPatches[user.handle], ...patch },
      },
    });
    toast("主页已更新");
  };

  const openStudio = () => {
    if (!user) return;
    if (user.isCreator && creators.some((creator) => creator.id === user.handle)) {
      toast("创作页已在");
      return;
    }
    const creator: Creator = {
      id: user.handle,
      handle: user.handle,
      name: user.name,
      category: "写作" as Category,
      location: "未填写",
      bio: user.bio,
      tags: ["新页"],
      followers: 0,
      supporters: 0,
      since: `${new Date().getFullYear()}.${`${new Date().getMonth() + 1}`.padStart(2, "0")}`,
    };
    const current = dbRef.current;
    commit({
      ...current,
      users: current.users.map((item) => (item.id === user.id ? { ...item, isCreator: true } : item)),
      creators: current.creators.some((item) => item.id === user.handle) ? current.creators : [...current.creators, creator],
      tiers: current.tiers.some((tier) => tier.creatorId === user.handle) ? current.tiers : [...current.tiers, ...defaultTiers(user.handle)],
    });
    toast("创作页已开通");
  };

  const reset = () => {
    localStorage.removeItem(KEY);
    const next = freshDb();
    commit(next);
    toast("演示数据已重置");
  };

  const value: StoreValue = {
    creators,
    posts,
    products,
    tiers,
    comments,
    user,
    toasts,
    toast,
    login,
    logout,
    register,
    toggleFollow,
    toggleLike,
    addComment,
    addToCart,
    removeFromCart,
    checkoutCart,
    checkoutTier,
    publishPost,
    publishProduct,
    updateProfile,
    openStudio,
    reset,
    creatorById,
    tierById,
    productById,
    activeMembership,
    canRead,
    owns,
    followed,
    liked,
    supporterCount,
    followerCount,
  };

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const value = useContext(StoreContext);
  if (!value) throw new Error("Store missing");
  return value;
}
