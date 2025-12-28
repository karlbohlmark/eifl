import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Plus, Trash2, Key, Eye, EyeOff } from "lucide-react";

interface Secret {
  name: string;
  updatedAt: string;
  scope: "project" | "repo";
}

interface Props {
  scope: "project" | "repo";
  scopeId: number;
  title?: string;
}

export function SecretsManager({ scope, scopeId, title = "Secrets" }: Props) {
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [showValue, setShowValue] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apiBase = scope === "project"
    ? `/api/projects/${scopeId}/secrets`
    : `/api/repos/${scopeId}/secrets`;

  useEffect(() => {
    fetchSecrets();
  }, [scopeId, scope]);

  async function fetchSecrets() {
    try {
      const res = await fetch(apiBase);
      if (res.ok) {
        setSecrets(await res.json());
      }
    } catch (e) {
      console.error("Failed to fetch secrets:", e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    try {
      const res = await fetch(apiBase, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, value }),
      });

      if (res.ok) {
        setName("");
        setValue("");
        setShowForm(false);
        fetchSecrets();
      } else {
        const data = await res.json();
        setError(data.error || "Failed to save secret");
      }
    } catch {
      setError("Failed to save secret");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(secretName: string) {
    setDeleting(secretName);
    try {
      const res = await fetch(`${apiBase}/${encodeURIComponent(secretName)}`, {
        method: "DELETE",
      });
      if (res.ok) {
        fetchSecrets();
      }
    } catch (e) {
      console.error("Failed to delete secret:", e);
    } finally {
      setDeleting(null);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="w-6 h-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Key className="w-5 h-5" />
            {title}
          </CardTitle>
          {!showForm && (
            <Button size="sm" onClick={() => setShowForm(true)}>
              <Plus className="w-4 h-4 mr-1" />
              Add Secret
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {showForm && (
          <form onSubmit={handleSubmit} className="mb-4 p-4 border rounded-lg bg-muted/50">
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="secret-name">Name</Label>
                <Input
                  id="secret-name"
                  placeholder="DATABASE_URL"
                  value={name}
                  onChange={(e) => setName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, "_"))}
                  className="font-mono"
                />
                <p className="text-xs text-muted-foreground">
                  Uppercase letters, numbers, and underscores only
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="secret-value">Value</Label>
                <div className="relative">
                  <Input
                    id="secret-value"
                    type={showValue ? "text" : "password"}
                    placeholder="Enter secret value"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    className="pr-10"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                    onClick={() => setShowValue(!showValue)}
                  >
                    {showValue ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <div className="flex gap-2">
                <Button type="submit" disabled={!name || !value || saving}>
                  {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save Secret
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setShowForm(false);
                    setName("");
                    setValue("");
                    setError(null);
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          </form>
        )}

        {secrets.length === 0 && !showForm ? (
          <div className="text-center py-8 text-muted-foreground">
            <p className="mb-2">No secrets configured</p>
            <p className="text-sm">
              Secrets are available as environment variables in pipeline steps
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {secrets.map((secret) => (
              <div
                key={secret.name}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <p className="font-mono font-medium">{secret.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Updated {new Date(secret.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => handleDelete(secret.name)}
                  disabled={deleting === secret.name}
                >
                  {deleting === secret.name ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Trash2 className="w-4 h-4" />
                  )}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
