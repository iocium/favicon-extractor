/**
 * Represents a single icon extracted from a webpage or manifest.
 */
export interface IconEntry {
  /**
   * The absolute or relative URL pointing to the icon resource.
   */
  url: string;

  /**
   * The size of the icon in `widthxheight` format (e.g., "192x192").
   */
  size?: string;

  /**
   * The logical type of the icon (e.g., "icon", "apple-touch-icon").
   */
  type?: string;

  /**
   * The resolved MIME type of the icon (e.g., "image/png").
   */
  mimeType?: string;
}

/**
 * The FaviconExtractor class parses HTML and manifest files to extract
 * favicon and app icon URLs for standard, Apple, and Android platforms.
 */
export class FaviconExtractor {
  private icons: string[] = [];
  private manifestUrl: string | null = null;

  /**
   * Fetches the page and extracts all icon URLs, including manifest-defined ones.
   * @param url - The full page URL to extract icons from.
   * @returns A list of fully resolved absolute icon URLs.
   * @throws If the page fails to fetch.
   */
  async fetchAndExtract(url: string): Promise<string[]> {
    this.icons = [];
    this.manifestUrl = null;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Failed to fetch URL: ${url}`);

    const rewriter = new HTMLRewriter()
    .on("link", { element: this.linkHandler.bind(this) })
    .on("meta", { element: this.metaHandler.bind(this) });  

    await rewriter.transform(res).text();

    if (this.manifestUrl) {
      await this.extractIconsFromManifest(this.manifestUrl, url);
    }

    return this.normalizeIcons(url);
  }

  /**
   * Organizes a list of icons into platform-specific categories.
   * @param iconUrls - The raw list of icon URLs.
   * @returns Grouped icon categories.
   */
  groupIcons(iconUrls: string[]) {
    const groups = {
      standardIcons: [] as IconEntry[],
      appleTouchIcons: [] as IconEntry[],
      androidIcons: [] as IconEntry[]
    };

    for (const url of iconUrls) {
      const lower = url.toLowerCase();
      const match = url.match(/(\d+x\d+)/);
      const size = match ? match[1] : "unknown";
      const entry: IconEntry = { type: "", size, url };

      if (lower.includes("apple-touch-icon")) {
        entry.type = "apple-touch-icon";
        groups.appleTouchIcons.push(entry);
      } else if (lower.includes("android-chrome")) {
        entry.type = "android-chrome";
        groups.androidIcons.push(entry);
      } else {
        entry.type = "icon";
        groups.standardIcons.push(entry);
      }
    }

    return groups;
  }

  /**
   * Selects the largest icon found for each unique MIME type.
   * @param icons - List of icons with MIME types and optional sizes.
   * @returns One icon per MIME type, prioritized by size.
   */  
  getLargestIconsByMimeType(icons: string[] | IconEntry[]): IconEntry[] {
    const enriched = this.addMimeTypes(icons);

    const groups = new Map<string, IconEntry[]>();

    for (const icon of enriched) {
      const list = groups.get(icon.mimeType!) ?? [];
      list.push(icon);
      groups.set(icon.mimeType!, list);
    }

    const result: IconEntry[] = [];

    for (const [mime, entries] of groups.entries()) {
      const largest = entries
        .map(icon => ({
          ...icon,
          pixels: this.getPixelCount(icon.size ?? "")
        }))
        .sort((a, b) => b.pixels - a.pixels)[0];

      if (largest) result.push(largest);
    }

    return result;
  }

  /**
   * Adds MIME types to icon URLs based on file extensions.
   * @param icons - A list of icon URLs or objects with a `url` key.
   * @returns A list of icon objects with inferred MIME types.
   */  
  addMimeTypes(icons: string[] | IconEntry[]): IconEntry[] {
    return icons.map(icon => {
      const url = typeof icon === "string" ? icon : icon.url;
      const ext = url.split('.').pop()?.toLowerCase() || '';
      let mimeType = 'image/png';

      if (ext === 'ico') mimeType = 'image/x-icon';
      else if (ext === 'svg') mimeType = 'image/svg+xml';
      else if (ext === 'jpg' || ext === 'jpeg') mimeType = 'image/jpeg';
      else if (ext === 'webp') mimeType = 'image/webp';

      return typeof icon === "string"
        ? { type: "", size: "unknown", url, mimeType }
        : { ...icon, mimeType };
    });
  }
  
  /**
   * Parses a `widthxheight` size string (e.g., "128x128") and returns its pixel count.
   * If the format is invalid, returns 0.
   * @param size - The string representing image dimensions (e.g., "64x64").
   * @returns The total pixel area as a number.
   */
  private getPixelCount(size: string): number {
    const [w, h] = size.split('x').map(Number);
    return isNaN(w) || isNaN(h) ? 0 : w * h;
  }

  /**
   * Extracts relevant icon URLs from `<link>` tags.
   * @param element - The HTML element to inspect.
   */  
  private linkHandler(element: Element): void {
    const rel = element.getAttribute("rel")?.toLowerCase() ?? "";
    const href = element.getAttribute("href");

    if (!href) return;

    if (
      rel.includes("icon") ||
      rel.includes("apple-touch-icon") ||
      rel.includes("shortcut icon")
    ) {
      this.icons.push(href);
    } else if (rel === "manifest") {
      this.manifestUrl = href;
    }
  }

  /**
   * Extracts icon URLs from `<meta>` tags like `msapplication-TileImage`.
   * @param element - The HTML element to inspect.
   */  
  private metaHandler(element: Element): void {
    const name = element.getAttribute("name")?.toLowerCase() ?? "";
    const content = element.getAttribute("content");

    if (name === "msapplication-tileimage" && content) {
      this.icons.push(content);
    }
  }

  /**
   * Loads and parses a manifest.json to extract additional icons.
   * @param manifestHref - Path to the manifest file.
   * @param baseUrl - Base URL to resolve relative manifest icons.
   */  
  private async extractIconsFromManifest(manifestHref: string, baseUrl: string): Promise<void> {
    try {
      const base = new URL(baseUrl);
      const manifestUrl = new URL(manifestHref, base).href;

      const res = await fetch(manifestUrl);
      if (!res.ok) return;

      const manifest = await res.json() as { icons?: Array<{ src: string }> };
      if (Array.isArray(manifest.icons)) {
        for (const icon of manifest.icons) {
          if (typeof icon.src === "string") {
            this.icons.push(icon.src);
          }
        }
      }
    } catch (err) {
      console.warn("Manifest parsing failed:", (err as Error).message);
    }
  }

  /**
   * Resolves all icons to absolute URLs and removes duplicates.
   * @param baseUrl - The base URL to resolve relative paths against.
   * @returns A deduplicated list of fully-qualified icon URLs.
   */  
  private normalizeIcons(baseUrl: string): string[] {
    const base = new URL(baseUrl);
    const uniqueIcons = new Set<string>();
  
    for (const icon of this.icons) {
      if (typeof icon !== "string" || !icon.trim()) continue;
      if (!/^https?:|^\//.test(icon)) continue;
  
      const resolved = new URL(icon, base).href;
      uniqueIcons.add(resolved);
    }
  
    return [...uniqueIcons];
  }  
}
