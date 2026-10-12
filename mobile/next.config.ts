import path from "node:path";
import type { NextConfig } from "next";

const isMobileBuild =
  process.env.SPPG_BUILD_TARGET === "mobile" ||
  process.env.NEXT_PUBLIC_SPPG_RUNTIME === "mobile" ||
  process.env.NODE_ENV === "production";

// `@vladmandic/human` memetakan kondisi `node` ke `human.node.js`, yang menuntut
// `@tensorflow/tfjs-node`; graf SSR komponen klien memilih kondisi itu dan build
// gagal. Pengenal wajah hanya berjalan di browser, jadi kedua bundler diarahkan
// ke bundel ESM browser. Path relatif/absolut, bukan subpath paket: peta
// `exports`-nya tidak punya subpath `./dist/...` yang bisa diimpor.
const humanBrowserModule = "./node_modules/@vladmandic/human/dist/human.esm.js";
const humanBrowserEntry = path.resolve(
  process.cwd(),
  "node_modules/@vladmandic/human/dist/human.esm.js",
);
const zxingBrowserModule = "@zxing/browser/es2015/index.js";
const zxingLibraryModule = "@zxing/library/es2015/index.js";
const zxingBrowserEntry = path.resolve(
  process.cwd(),
  "node_modules/@zxing/browser/es2015/index.js",
);
const zxingLibraryEntry = path.resolve(
  process.cwd(),
  "node_modules/@zxing/library/es2015/index.js",
);

const nextConfig: NextConfig = {
  ...(isMobileBuild ? { output: "export" as const } : {}),
  devIndicators: false,
  turbopack: {
    root: process.cwd(),
    resolveAlias: {
      "@zxing/browser": zxingBrowserModule,
      "@zxing/library": zxingLibraryModule,
      "@vladmandic/human": humanBrowserModule,
    },
  },
  webpack(config) {
    config.resolve.alias = {
      ...config.resolve.alias,
      "@zxing/browser$": zxingBrowserEntry,
      "@zxing/library$": zxingLibraryEntry,
      "@vladmandic/human$": humanBrowserEntry,
    };
    return config;
  },
  images: {
    unoptimized: true,
  },
  reactCompiler: true,
};

export default nextConfig;
