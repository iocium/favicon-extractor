import { FaviconExtractor } from "../src/index";

// ✅ Assign a working mock to global.HTMLRewriter
(global as any).HTMLRewriter = class {
  private handlers: Record<string, (element: any) => void> = {};

  on(selector: string, handlers: { element: (element: any) => void }) {
    this.handlers[selector] = handlers.element;
    return this;
  }

  transform(response: Response) {
    return {
      text: async () => {
        const html = await response.text();

        const linkTags = [...html.matchAll(/<link\s+([^>]+)>/g)];
        for (const [, attrString] of linkTags) {
          const element = createFakeElement(attrString);
          this.handlers["link"]?.(element);
        }

        const metaTags = [...html.matchAll(/<meta\s+([^>]+)>/g)];
        for (const [, attrString] of metaTags) {
          const element = createFakeElement(attrString);
          this.handlers["meta"]?.(element);
        }

        return html;
      }
    };
  }
};

function createFakeElement(attrString: string): any {
  const attrs: Record<string, string> = {};
  const regex = /([a-zA-Z\-]+)\s*=\s*"([^"]*)"/g;
  let match;
  while ((match = regex.exec(attrString)) !== null) {
    attrs[match[1]] = match[2];
  }
  return {
    getAttribute: (name: string) => attrs[name] || null
  };
}

global.fetch = jest.fn();

// Minimal mock HTML page with favicons
const MOCK_HTML = `
<!DOCTYPE html>
<html>
  <head>
    <link rel="icon" href="/favicon.ico" sizes="32x32">
    <link rel="apple-touch-icon" href="/apple-icon.png" sizes="180x180">
    <meta name="msapplication-TileImage" content="/tile.png">
    <link rel="manifest" href="/manifest.json">
  </head>
</html>
`;

const MOCK_MANIFEST = {
  icons: [
    { src: "/android-icon-192x192.png", sizes: "192x192", type: "image/png" },
    { src: "/android-icon-512x512.png", sizes: "512x512", type: "image/png" }
  ]
};

describe("FaviconExtractor", () => {
  let extractor: FaviconExtractor;

  beforeEach(() => {
    extractor = new FaviconExtractor();

    (fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("manifest.json")) {
        return Promise.resolve(new Response(JSON.stringify(MOCK_MANIFEST)));
      }
      return Promise.resolve(new Response(MOCK_HTML, {
        headers: { "Content-Type": "text/html" }
      }));
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("extracts all favicon URLs from mock HTML and manifest", async () => {
    const icons = await extractor.fetchAndExtract("https://example.com");

    expect(icons).toEqual(expect.arrayContaining([
      "https://example.com/favicon.ico",
      "https://example.com/apple-icon.png",
      "https://example.com/tile.png",
      "https://example.com/android-icon-192x192.png",
      "https://example.com/android-icon-512x512.png"
    ]));

    expect(icons.length).toBe(5);
  });

  it("groups icons by type correctly", () => {
    const urls = [
      "https://site.com/favicon.ico",
      "https://site.com/apple-touch-icon-180x180.png",
      "https://site.com/android-chrome-512x512.png"
    ];

    const grouped = extractor.groupIcons(urls);
    expect(grouped.standardIcons.length).toBe(1);
    expect(grouped.appleTouchIcons.length).toBe(1);
    expect(grouped.androidIcons.length).toBe(1);
  });

  it("adds correct mime types to icon URLs", () => {
    const urls = [
      "https://x.com/favicon.ico",
      "https://x.com/image.png",
      "https://x.com/logo.svg",
      "https://x.com/photo.jpg",
    ];

    const typed = extractor.addMimeTypes(urls);
    expect(typed.find(i => i.mimeType === "image/x-icon")).toBeDefined();
    expect(typed.find(i => i.mimeType === "image/png")).toBeDefined();
    expect(typed.find(i => i.mimeType === "image/svg+xml")).toBeDefined();
    expect(typed.find(i => i.mimeType === "image/jpeg")).toBeDefined();
  });

  it("returns the largest icon by MIME type", () => {
    const icons = extractor.addMimeTypes([
      { type: "icon", size: "32x32", url: "https://x.com/32.png" },
      { type: "icon", size: "128x128", url: "https://x.com/128.png" },
      { type: "icon", size: "256x256", url: "https://x.com/icon.svg" },
    ]);

    const largest = extractor.getLargestIconsByMimeType(icons);
    expect(largest.length).toBe(2); // png and svg
    expect(largest.find(i => i.url.includes("128.png"))).toBeDefined();
  });

  it("ignores <link> tags without href", async () => {
    const badHtml = `
      <html><head>
        <link rel="icon">
      </head></html>
    `;
  
    (fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve(new Response(badHtml, { headers: { "Content-Type": "text/html" } }))
    );
  
    const icons = await extractor.fetchAndExtract("https://example.com");
    expect(icons).toEqual([]); // should skip it
  });
  
  it("ignores irrelevant <link> rel types", async () => {
    const badHtml = `
      <html><head>
        <link rel="stylesheet" href="/style.css">
      </head></html>
    `;
  
    (fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve(new Response(badHtml, { headers: { "Content-Type": "text/html" } }))
    );
  
    const icons = await extractor.fetchAndExtract("https://example.com");
    expect(icons).toEqual([]); // not an icon
  });
  
  it("handles manifest fetch failure gracefully", async () => {
    const html = `
      <html><head>
        <link rel="manifest" href="/bad-manifest.json">
      </head></html>
    `;
  
    (fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("bad-manifest.json")) {
        return Promise.resolve(new Response(null, { status: 404 }));
      }
      return Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html" } }));
    });
  
    const icons = await extractor.fetchAndExtract("https://example.com");
    expect(icons).toEqual([]); // no icons found
  });
  
  it("skips manifest if icons is not an array", async () => {
    const html = `<html><head><link rel="manifest" href="/manifest.json"></head></html>`;
  
    (fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("manifest.json")) {
        return Promise.resolve(new Response(JSON.stringify({ icons: {} })));
      }
      return Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html" } }));
    });
  
    const icons = await extractor.fetchAndExtract("https://example.com");
    expect(icons).toEqual([]); // no valid icons
  });
  
  it("skips manifest icon entries missing src", async () => {
    const html = `<html><head><link rel="manifest" href="/manifest.json"></head></html>`;
  
    (fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("manifest.json")) {
        return Promise.resolve(new Response(JSON.stringify({
          icons: [{ sizes: "512x512" }] // no src
        })));
      }
      return Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html" } }));
    });
  
    const icons = await extractor.fetchAndExtract("https://example.com");
    expect(icons).toEqual([]); // no src, should skip
  });

  it("assigns default MIME type for unknown extensions", () => {
    const urls = ["https://example.com/icon.unknown"];
    const typed = extractor.addMimeTypes(urls);
  
    expect(typed[0].mimeType).toBe("image/png"); // default fallback
  });

  it("treats invalid sizes as 0 pixels", () => {
    const icons = extractor.addMimeTypes([
      { type: "icon", size: "abc", url: "https://x.com/icon.png" },
      { type: "icon", size: "64x64", url: "https://x.com/icon-64.png" },
    ]);
  
    const largest = extractor.getLargestIconsByMimeType(icons);
    expect(largest[0].url).toContain("64"); // should ignore the invalid one
  });

  it("deduplicates icon URLs", async () => {
    const html = `
      <html><head>
        <link rel="icon" href="/favicon.ico">
        <link rel="shortcut icon" href="/favicon.ico">
      </head></html>
    `;
  
    (fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html" } }))
    );
  
    const icons = await extractor.fetchAndExtract("https://example.com");
    expect(icons.length).toBe(1); // only one unique URL
  });

  it("handles JSON parse error in manifest gracefully", async () => {
    const html = `<html><head><link rel="manifest" href="/manifest.json"></head></html>`;
  
    (fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("manifest.json")) {
        // Return something that will break .json()
        return Promise.resolve(new Response("this is not json", {
          headers: { "Content-Type": "application/json" }
        }));
      }
      return Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html" } }));
    });
  
    const icons = await extractor.fetchAndExtract("https://example.com");
    expect(icons).toEqual([]); // catch block should be hit
  });

  it("skips manifest icons with non-string src", async () => {
    const html = `<html><head><link rel="manifest" href="/manifest.json"></head></html>`;
  
    (fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("manifest.json")) {
        return Promise.resolve(new Response(JSON.stringify({
          icons: [{ src: 123 }]
        })));
      }
      return Promise.resolve(new Response(html, { headers: { "Content-Type": "text/html" } }));
    });
  
    const icons = await extractor.fetchAndExtract("https://example.com");
    expect(icons).toEqual([]); // no src pushed
  });

  it("skips empty or non-string icon URLs in normalizeIcons", async () => {
    extractor["icons"] = ["/valid.png", "", null as any, undefined as any];
    const result = extractor["normalizeIcons"]("https://example.com");
  
    expect(result).toEqual(["https://example.com/valid.png"]);
  });
  
  it("throws an error if initial HTML fetch fails", async () => {
    (fetch as jest.Mock).mockResolvedValueOnce(new Response(null, { status: 500 }));
  
    await expect(
      extractor.fetchAndExtract("https://example.com")
    ).rejects.toThrow("Failed to fetch URL: https://example.com");
  });
  
  it("getLargestIconsByMimeType handles icons with no size", () => {
    const icons = [
      { url: "https://a.com/a.png", mimeType: "image/png" }, // no size
      { url: "https://a.com/b.png", size: "128x128", mimeType: "image/png" }
    ];
    const result = extractor.getLargestIconsByMimeType(icons as any);
    expect(result.length).toBe(1);
  });

  it("linkHandler ignores <link> without rel or href", () => {
    const el = {
      getAttribute: (name: string) => (name === "rel" ? null : null)
    };
    extractor["linkHandler"](el as any);
    expect(extractor["icons"].length).toBe(0);
  });

  it("linkHandler stores manifest URL if rel is manifest", () => {
    const el = {
      getAttribute: (name: string) =>
        name === "rel" ? "manifest" : "/manifest.json"
    };
    extractor["linkHandler"](el as any);
    expect(extractor["manifestUrl"]).toBe("/manifest.json");
  });

  it("addMimeTypes falls back to image/png for extensionless URLs", () => {
    const urls = [
      "https://example.com/icon." // no file extension
    ];
    const typed = extractor.addMimeTypes(urls);
    expect(typed[0].mimeType).toBe("image/png"); // fallback behavior
  });

  it("addMimeTypes detects image/webp correctly", () => {
    const urls = [
      "https://example.com/icon.webp"
    ];
    const typed = extractor.addMimeTypes(urls);
    expect(typed[0].mimeType).toBe("image/webp");
  });
  
  it("metaHandler handles missing name attribute safely", () => {
    const el = {
      getAttribute: (name: string) =>
        name === "content" ? "/tile.png" : null
    };
  
    extractor["metaHandler"](el as any);
    expect(extractor["icons"].length).toBe(0); // name is missing, nothing added
  });

  it("normalizeIcons skips icons that do not match http(s) or relative paths", () => {
    extractor["icons"] = [
      "/valid.png",
      "https://example.com/ok.png",
      "data:image/png;base64,iVBORw0KGgo=", // bad
      "ftp://example.com/file.ico"          // bad
    ];
  
    const result = extractor["normalizeIcons"]("https://example.com");
  
    expect(result).toEqual([
      "https://example.com/valid.png",
      "https://example.com/ok.png"
    ]);
  });  
});