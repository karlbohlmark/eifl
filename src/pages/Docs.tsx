import { useState, useEffect } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { marked } from "marked";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FileText, ChevronRight } from "lucide-react";

interface DocEntry {
  slug: string;
  title: string;
  filename: string;
}

interface DocContent {
  slug: string;
  title: string;
  content: string;
}

export function Docs() {
  const { slug } = useParams<{ slug?: string }>();
  const navigate = useNavigate();
  const [docs, setDocs] = useState<DocEntry[]>([]);
  const [doc, setDoc] = useState<DocContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDocs();
  }, []);

  useEffect(() => {
    if (slug) {
      fetchDoc(slug);
    } else {
      setDoc(null);
      setLoading(false);
    }
  }, [slug]);

  async function fetchDocs() {
    try {
      const res = await fetch("/api/docs");
      if (res.ok) {
        const data = await res.json();
        setDocs(data);
        // If no slug and we have docs, redirect to first doc
        if (!slug && data.length > 0) {
          navigate(`/docs/${data[0].slug}`, { replace: true });
        }
      }
    } catch (err) {
      console.error("Failed to fetch docs:", err);
    } finally {
      if (!slug) setLoading(false);
    }
  }

  async function fetchDoc(docSlug: string) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/docs/${docSlug}`);
      if (res.ok) {
        const data = await res.json();
        setDoc(data);
      } else if (res.status === 404) {
        setError("Document not found");
        setDoc(null);
      }
    } catch (err) {
      console.error("Failed to fetch doc:", err);
      setError("Failed to load document");
    } finally {
      setLoading(false);
    }
  }

  if (loading && !docs.length) {
    return (
      <div className="max-w-7xl mx-auto p-8">
        <div className="flex gap-8">
          <div className="w-64 shrink-0">
            <Skeleton className="h-8 w-32 mb-4" />
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-6 w-full mb-2" />
            <Skeleton className="h-6 w-full" />
          </div>
          <div className="flex-1">
            <Skeleton className="h-10 w-64 mb-6" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-4 w-3/4" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-8">
      <div className="flex gap-8">
        {/* Sidebar */}
        <nav className="w-64 shrink-0">
          <h2 className="text-lg font-semibold mb-4">Documentation</h2>
          <ul className="space-y-1">
            {docs.map((d) => (
              <li key={d.slug}>
                <Link
                  to={`/docs/${d.slug}`}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md transition-colors ${
                    slug === d.slug
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  {d.title}
                </Link>
              </li>
            ))}
          </ul>
          {docs.length === 0 && (
            <p className="text-muted-foreground text-sm">No documentation available</p>
          )}
        </nav>

        {/* Content */}
        <main className="flex-1 min-w-0">
          {loading ? (
            <div>
              <Skeleton className="h-10 w-64 mb-6" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          ) : error ? (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">{error}</p>
              </CardContent>
            </Card>
          ) : doc ? (
            <article className="markdown-content">
              <div
                dangerouslySetInnerHTML={{
                  __html: marked.parse(doc.content, { async: false }) as string,
                }}
              />
            </article>
          ) : docs.length > 0 ? (
            <Card>
              <CardContent className="py-12">
                <h2 className="text-2xl font-bold mb-4">Welcome to EIFL Documentation</h2>
                <p className="text-muted-foreground mb-6">
                  Select a topic from the sidebar to get started.
                </p>
                <ul className="space-y-2">
                  {docs.map((d) => (
                    <li key={d.slug}>
                      <Link
                        to={`/docs/${d.slug}`}
                        className="flex items-center gap-2 text-primary hover:underline"
                      >
                        <ChevronRight className="w-4 h-4" />
                        {d.title}
                      </Link>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-muted-foreground">
                  No documentation available yet.
                </p>
              </CardContent>
            </Card>
          )}
        </main>
      </div>
    </div>
  );
}
