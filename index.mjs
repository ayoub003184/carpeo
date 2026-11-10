import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import apiHandler from "./api/[...path].mjs";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));

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

function getCandidatePaths(cleanPath) {
  const norm = path.normalize(cleanPath).replace(/^[/\\]+/, "").replace(/^(\.\.[\/\\])+/, "");
  const roots = [
    process.cwd(),
    MODULE_DIR,
    ...(process.env.LAMBDA_TASK_ROOT ? [process.env.LAMBDA_TASK_ROOT] : [])
  ];
  const list = [];
  for (const r of roots) {
    const full = path.join(r, norm);
    if (!list.includes(full)) list.push(full);
  }
  return list;
}

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

  const cleanPath = pathname.replace(/^[/\\]+/, "");
  const candidates = getCandidatePaths(cleanPath);

  let targetPath = null;
  let targetStat = null;

  for (const candidate of candidates) {
    let s = await stat(candidate).catch(() => null);
    if (s && s.isFile()) {
      targetPath = candidate;
      targetStat = s;
      break;
    }
    // Clean URLs support: try appending .html if no extension
    if (!path.extname(candidate)) {
      const htmlCandidate = candidate + ".html";
      s = await stat(htmlCandidate).catch(() => null);
      if (s && s.isFile()) {
        targetPath = htmlCandidate;
        targetStat = s;
        break;
      }
    }
  }

  if (!targetPath || !targetStat) {
    res.statusCode = 404;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.end("<!DOCTYPE html><html lang=\"fr\"><head><meta charset=\"utf-8\"><title>404 — CARPEO</title></head><body><h1>404 — Fichier introuvable</h1><p><a href=\"/\">Retour à l'accueil</a></p></body></html>");
  }

  try {
    const data = await readFile(targetPath);
    const ext = path.extname(targetPath).toLowerCase();

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
    console.error("Read file error:", err);
    res.statusCode = 500;
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    return res.end("Erreur interne du serveur");
  }
}
