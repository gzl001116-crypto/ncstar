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
  kind: string;
  includes: string[];
  coverKey: string;
};

export type Tier = {
  id: string;
  creatorId: string;
  name: string;
  price: number;
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
  password: string;
  handle: string;
  bio: string;
  isCreator: boolean;
  follows: string[];
  likes: string[];
  memberships: Membership[];
  library: Purchase[];
  cart: string[];
};

export type Db = {
  version: 1;
  sessionEmail: string | null;
  users: User[];
  posts: Post[];
  products: Product[];
  comments: Comment[];
  creators: Creator[];
  tiers: Tier[];
  creatorPatches: Record<string, Partial<Creator>>;
};
