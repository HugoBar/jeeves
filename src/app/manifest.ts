import type { MetadataRoute } from "next";
import { t } from "@/strings";
import { theme } from "./theme";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: t("app.name"),
    short_name: t("app.name"),
    description: t("app.description"),
    start_url: "/",
    display: "standalone",
    background_color: theme.background,
    theme_color: theme.accent,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
