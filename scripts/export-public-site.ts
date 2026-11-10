import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { PublicSite } from "../src/components/public-site";

const value = (name: string) => process.argv[process.argv.indexOf(name) + 1];
if (!process.argv.includes("--out") || !process.argv.includes("--app-origin"))
  throw new Error("Use --out <directory> --app-origin <Atlas URL>");
const output = resolve(value("--out")),
  origin = new URL(value("--app-origin")).origin;
if (!origin.startsWith("https://") && !origin.startsWith("http://127.0.0.1:"))
  throw new Error("Expected an HTTPS Atlas origin");
await mkdir(output, { recursive: true });
const css = await readFile(resolve("src/app/public.css"), "utf8");
const markup = renderToStaticMarkup(
  createElement(PublicSite, { appOrigin: origin }),
);
await writeFile(
  join(output, "index.html"),
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Atlas Research — A clearer path from paper to insight</title><meta name="description" content="Read closely. Keep the evidence. Move your research forward in one connected workspace."><link rel="stylesheet" href="public.css"><style>:root{--canvas:#fff;--accent:#2f6feb}*{box-sizing:border-box}body{margin:0}button,input,select,textarea{font:inherit}svg{vertical-align:middle}:focus-visible{outline:2px solid #2f6feb;outline-offset:3px}</style></head><body>${markup}</body></html>`,
);
await writeFile(join(output, "public.css"), css);
await writeFile(join(output, ".gitignore"), "dist/\n");
await writeFile(
  join(output, "build.mjs"),
  `import {mkdir,copyFile} from 'node:fs/promises';await mkdir('dist',{recursive:true});for(const f of ['index.html','public.css'])await copyFile(f,'dist/'+f);\n`,
);
console.log(
  "Exported the shared public presentation. Sign-in links point to the existing Atlas service; no credential form or authentication proxy is exported.",
);
