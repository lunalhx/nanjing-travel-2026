import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ATTRACTIONS } from "../src/data.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const output = path.join(root, "dist");

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const item of ["index.html", "styles.css", "src", "public"]) {
  await cp(path.join(root, item), path.join(output, item === "public" ? "" : item), { recursive: true });
}

const photoDirectory = path.join(output, "photos");
const photoCount = { value: 0 };
const attractionIdByFolder = new Map(ATTRACTIONS.map((attraction) => [attraction.name, attraction.id]));
const photoManifest = Object.fromEntries(ATTRACTIONS.map((attraction) => [attraction.id, { folder: attraction.name, files: [] }]));
async function validatePhotoTree(directory, attractionId = null) {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    if (entry.name === "README.md" || entry.name === ".gitkeep" || entry.name === ".DS_Store") continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (path.dirname(file) !== photoDirectory) throw new Error(`Photo folders must be direct children of public/photos: ${entry.name}`);
      const folderAttractionId = attractionIdByFolder.get(entry.name);
      if (!folderAttractionId) throw new Error(`Photo folder must match an attraction name from the guide: ${entry.name}`);
      await validatePhotoTree(file, folderAttractionId);
      continue;
    }
    if (!entry.isFile() || !/^[^/\\\0]+\.(?:jpe?g|png|webp)$/i.test(entry.name)) {
      throw new Error(`Unsupported photo file in public/photos: ${path.relative(photoDirectory, file)}`);
    }
    const bytes = await readFile(file);
    const extension = path.extname(entry.name).toLowerCase();
    const valid = extension === ".jpg" || extension === ".jpeg"
      ? bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      : extension === ".png"
        ? bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
        : bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
    if (!valid) throw new Error(`Photo content does not match its extension: ${path.relative(photoDirectory, file)}`);
    if (!attractionId || directory === photoDirectory) throw new Error(`Place each photo inside its attraction folder: ${path.relative(photoDirectory, file)}`);
    photoManifest[attractionId].files.push(entry.name);
    photoCount.value += 1;
  }
}
await validatePhotoTree(photoDirectory);
for (const attraction of Object.values(photoManifest)) attraction.files.sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
await writeFile(path.join(photoDirectory, "manifest.json"), `${JSON.stringify(photoManifest, null, 2)}\n`);

console.log(`Built static site at ${path.relative(root, output)} (${photoCount.value} photo files validated in ${Object.keys(photoManifest).length} attraction folders).`);
