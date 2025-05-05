# @iocium/favicon-extractor

Extracts all relevant favicons, Apple touch icons, Android web app icons, and manifest-defined icons from a given URL.  
Designed to be edge-compatible (Cloudflare Workers safe) and fully testable in Node.js.

---

## 🚀 Features

- Parses HTML `<link>` and `<meta>` tags for favicon/icon references
- Follows `<link rel="manifest">` to extract additional icons
- Groups icons by platform (standard, Apple, Android)
- Identifies the largest icon per MIME type
- Fully type-safe (written in TypeScript)
- Compatible with Cloudflare Workers and Node.js environments

---

## 📦 Installation

```bash
npm install @iocium/favicon-extractor
```

---

## 🧪 Basic Usage

```ts
import { FaviconExtractor } from "@iocium/favicon-extractor";

const extractor = new FaviconExtractor();

const icons = await extractor.fetchAndExtract("https://example.com");
console.log(icons);
```

---

## ⚙️ Grouping and MIME Support

```ts
const grouped = extractor.groupIcons(icons);
/*
{
  standardIcons: [...],
  appleTouchIcons: [...],
  androidIcons: [...]
}
*/

const withMimeTypes = extractor.addMimeTypes(icons);
/*
[
  { url: "...", type: "...", size: "...", mimeType: "image/png" },
  ...
]
*/
```

---

## 🖼️ Get the Largest Icon by Type

```ts
const largestIcons = extractor.getLargestIconsByMimeType(icons);
```

Each returned icon is the highest resolution found for that MIME type.

---

## 🧠 Advanced: Manual Normalization

```ts
// If you already have raw relative icon paths:
extractor["icons"] = ["/favicon.ico", "images/logo-192.png"];
const absoluteUrls = extractor["normalizeIcons"]("https://example.com");

console.log(absoluteUrls);
// → ["https://example.com/favicon.ico", "https://example.com/images/logo-192.png"]
```

---

## 🧪 Running Tests

```bash
npm run test
```

### ✅ With Coverage

```bash
npm run test:coverage
```

Open the full report:

```bash
open coverage/lcov-report/index.html
```

> Thresholds: 90% branches / 100% lines / 100% statements

---

## 👷 Built for Edge Platforms

This library is compatible with Cloudflare Workers thanks to:
- No use of Node-specific APIs
- `HTMLRewriter` support with test mocks
- Lightweight and modular core

---

## 🧑‍💻 License

MIT

---

## 🙌 Contributing

Pull requests and improvements welcome!  
Feel free to file an issue if you need support for additional icon types or HTML quirks.

---