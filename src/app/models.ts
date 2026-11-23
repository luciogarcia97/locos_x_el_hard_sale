export type ProductStatus = 'disponible' | 'reservado' | 'vendido';

export interface Spec {
  label: string;
  value: string;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  category: string;
  /** "Nuevo de review" | "Usado" */
  origin: string;
  condition: string;
  price: number;
  status: ProductStatus;
  /** Paths relative to /public, e.g. "images/products/rk-m75he-1.webp" */
  images: string[];
  highlights: string[];
  specs: Spec[];
  description: string;
  /** Optional link to the YouTube/TikTok review of the product */
  reviewUrl?: string;
}

export interface SiteConfig {
  title: string;
  subtitle: string;
  instagram: string;
  tiktok: string;
  facebook: string;
  /** Full channel URL, e.g. https://www.youtube.com/c/locosporelhardware */
  youtube?: string;
  /** International format without "+", e.g. 5491112345678. Empty = hide WhatsApp. */
  whatsapp: string;
  zone: string;
  shipping: string;
  messageTemplate: string;
  /** Repo the admin panel (#admin) edits. */
  github?: { owner: string; repo: string; branch: string };
  /** "Ingresar con GitHub": the GitHub App's Client ID and the Cloudflare Worker URL (see worker/). */
  auth?: { clientId: string; workerUrl: string };
}

export const formatPrice = (value: number) =>
  new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(value);
