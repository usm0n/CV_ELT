import type { NextConfig } from "next";

// Static export: `npm run build` writes plain HTML/JS to out/ (Vercel, Netlify or GitHub Pages).
// The live demo talks to a separate API (NEXT_PUBLIC_DEMO_API), see ../demo.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
