import { readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const DOCS_DIR = join(process.cwd(), "docs");

interface DocEntry {
  slug: string;
  title: string;
  filename: string;
}

function slugToFilename(slug: string): string {
  // Convert slug back to filename: "github-integration" -> "GITHUB_INTEGRATION.md"
  return slug.toUpperCase().replace(/-/g, "_") + ".md";
}

function filenameToSlug(filename: string): string {
  // Convert filename to slug: "GITHUB_INTEGRATION.md" -> "github-integration"
  return filename.replace(/\.md$/, "").toLowerCase().replace(/_/g, "-");
}

function filenameToTitle(filename: string): string {
  // Convert filename to readable title: "GITHUB_INTEGRATION.md" -> "GitHub Integration"
  return filename
    .replace(/\.md$/, "")
    .replace(/_/g, " ")
    .split(" ")
    .map((word) => {
      // Handle common acronyms
      if (word === "API" || word === "GITHUB") return word.charAt(0) + word.slice(1).toLowerCase();
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(" ")
    .replace("Github", "GitHub"); // Fix GitHub casing
}

export async function handleGetDocs(): Promise<Response> {
  try {
    if (!existsSync(DOCS_DIR)) {
      return Response.json([]);
    }

    const files = readdirSync(DOCS_DIR);
    const docs: DocEntry[] = files
      .filter((f) => f.endsWith(".md"))
      .map((filename) => ({
        slug: filenameToSlug(filename),
        title: filenameToTitle(filename),
        filename,
      }))
      .sort((a, b) => a.title.localeCompare(b.title));

    return Response.json(docs);
  } catch (error) {
    console.error("Error reading docs directory:", error);
    return Response.json({ error: "Failed to read documentation" }, { status: 500 });
  }
}

export async function handleGetDoc(slug: string): Promise<Response> {
  try {
    const filename = slugToFilename(slug);
    const filePath = join(DOCS_DIR, filename);

    const file = Bun.file(filePath);
    if (!(await file.exists())) {
      return Response.json({ error: "Document not found" }, { status: 404 });
    }

    const content = await file.text();
    return Response.json({
      slug,
      title: filenameToTitle(filename),
      content,
    });
  } catch (error) {
    console.error("Error reading doc:", error);
    return Response.json({ error: "Failed to read document" }, { status: 500 });
  }
}
