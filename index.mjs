import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import apiHandler from "./api/[...path].mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".xml": "application/xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".pdf": "application/pdf"
};

export default async function handler(req, res) {
  const url = new URL(req.url || "/", "https://carpeo.vercel.app");
  let pathname = decodeURIComponent(url.pathname);

  // Route /api/* to the serverless API handler
  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return apiHandler(req, res);
  }

  // Default to index.html for root path
  if (pathname === "/" || pathname === "") {
    pathname = "/index.html";
  }

  // Prevent directory traversal
  const cleanPath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, "");
  let filePath = path.join(ROOT, cleanPath);

  try {
    let fileStat = await stat(filePath).catch(() => null);

    // Clean URLs support: try appending .html
    if (!fileStat && !path.extname(filePath)) {
      const htmlPath = filePath + ".html";
      const htmlStat = await stat(htmlPath).catch(() => null);
      if (htmlStat && htmlStat.isFile()) {
        filePath = htmlPath;
        fileStat = htmlStat;
      }
    }

    if (!fileStat || !fileStat.isFile()) {
      res.statusCode = 404;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.end("<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"utf-8\"><title>Page introuvable — CARPEO</title></head><body><h1>404 — Page introuvable</h1><p><a href=\"/\">Retour à l'accueil</a></p></body></html>");
    }

    const data = await readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();

    res.statusCode = 200;
    res.setHeader("Content-Type", TYPES[ext] || "application/octet-stream");
    res.setHeader("Content-Length", data.length);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");

    if (pathname.startsWith("/assets/") || pathname.startsWith("/css/") || pathname.startsWith("/js/")) {
      res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
    } else {
      res.setHeader("Cache-Control", "public, max-age=0, must-revalidate");
    }

    return res.end(data);
  } catch (err) {
    console.error("Static file error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Erreur interne du serveur");
  }
}
