// Hand-written surface of rnd-seo.mjs for vite.config.ts. tsconfig.node.json
// has no allowJs (it typechecks exactly one file), so without this declaration
// the import would not resolve at all.
export declare const SITE: string
export declare const RND_BLURB: string
export declare const root: string

export interface RndSeoData {
  rows: Array<{
    id: string
    name: string
    tagline: string
    description: string
    date: string
  }>
  meta: Record<string, { width: number; height: number }>
  version: Record<string, { full: string; thumb: string }>
}

export declare function loadRndSeo(): RndSeoData
export declare function buildGalleryJsonLd(data: RndSeoData): object
export declare function renderJsonLd(obj: object): string
export declare function buildNoscriptHtml(data: RndSeoData): string
export declare function buildSitemapXml(data: RndSeoData): string
