export const CATEGORIES = ["插画", "音乐", "设计", "摄影", "写作", "图案"] as const;

export type Category = (typeof CATEGORIES)[number];

export type Creator = {
  id: string;
  handle: string;
  name: string;
  category: Category;
  location: string;
  bio: string;
  tags: string[];
  avatarAt: string;
  followers: number;
  supporters: number;
  since: string;
};

export type Attachment = {
  name: string;
  size: string;
  minRank?: number;
};

export type Post = {
  id: string;
  creatorId: string;
  title: string;
  excerpt: string;
  body: string;
  createdAt: string;
  likes: number;
  minRank: number;
  attachments: Attachment[];
  coverKey: string;
};

export type Product = {
  id: string;
  creatorId: string;
  title: string;
  description: string;
  price: number;
  priceCurrency: string;
  coinPrice?: number;
  kind: string;
  includes: string[];
  coverKey: string;
  playFormat: string;
  tags: string[];
  allowPlay: boolean;
  allowDownload: boolean;
  allowPreview: boolean;
  previewMode: "" | "content" | "progress";
  previewLimit: number;
  previewBody: string;
  listed: boolean;
  coverAt: string;
};

export type Tier = {
  id: string;
  creatorId: string;
  name: string;
  price: number;
  priceCurrency: string;
  coinPrice?: number;
  rank: number;
  blurb: string;
  perks: string[];
};

export type Comment = {
  id: string;
  postId: string;
  author: string;
  text: string;
  createdAt: string;
};

export type Membership = {
  creatorId: string;
  tierId: string;
  expiresAt: string;
};

export type Purchase = {
  productId: string;
  purchasedAt: string;
};

export type User = {
  id: string;
  name: string;
  email: string;
  handle: string;
  bio: string;
  avatarAt: string;
  isCreator: boolean;
  coins: number;
  follows: string[];
  likes: string[];
  memberships: Membership[];
  library: Purchase[];
  cart: string[];
  playList: string[];
  playProgress: { productId: string; cursor: string; updatedAt: string }[];
  playlists: { id: string; name: string; items: { productId: string; trackIndex: number }[] }[];
};

export type DeskOrder = {
  id: string;
  kind: string;
  targetId: string;
  title: string;
  buyer: string;
  amount: number;
  currency: string;
  coinAmount: number;
  fee: number;
  createdAt: string;
};

export type DeskMember = {
  name: string;
  handle: string;
  tier: string;
  price: number;
  expiresAt: string;
};

export type Desk = {
  orders: DeskOrder[];
  members: DeskMember[];
  gross: number;
  fee: number;
  net: number;
  payoutReady: boolean;
  payoutStarted: boolean;
  payoutMethod: string;
  pending: number;
  nextPayout: string;
};

export type Catalog = {
  creators: Creator[];
  posts: Post[];
  products: Product[];
  tiers: Tier[];
  comments: Comment[];
  user: User | null;
};
