import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
const root=path.resolve(new URL("..",import.meta.url).pathname.replace(/^\/(.:)/,"$1"));
const marker='<script src="js/config.js"></script>';
const button='<a class="ig-fab" data-instagram href="https://www.instagram.com/carpeo_?rpxt=MWtnNThpeGRlbjl3YQ%3D%3D&amp;utm_source=qr" target="_blank" rel="noopener" aria-label="Suivre CARPEO sur Instagram"><svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none"/></svg></a>\n';
for(const file of (await readdir(root)).filter(x=>x.endsWith(".html")&&x!=="admin.html")){
  const full=path.join(root,file);let html=await readFile(full,"utf8");
  if(!html.includes("class=\"ig-fab\"")&&html.includes(marker)){html=html.replace(marker,button+marker);await writeFile(full,html,"utf8");}
}
