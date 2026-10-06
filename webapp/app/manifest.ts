import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "WaiWai",
    short_name: "WaiWai",
    description: "Wealth, like water: let it flow with purpose.",
    start_url: "/home",
    scope: "/",
    display: "standalone",
    background_color: "#F8FAFC",
    theme_color: "#1F2E5A",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
