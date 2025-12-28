import { useState, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Copy,
  Check,
  Loader2,
  CheckCircle,
  XCircle,
  AlertCircle,
  ExternalLink,
} from "lucide-react";

interface GitHubRepoInfo {
  name: string;
  fullName: string;
  private: boolean;
  defaultBranch: string;
  cloneUrl: string;
}

interface VerifyResult {
  valid: boolean;
  error?: string;
  repoInfo?: GitHubRepoInfo;
  tokenConfigured: boolean;
}

type ValidationState = "idle" | "validating" | "valid" | "invalid";

interface Props {
  projectId: number;
  onSuccess: () => void;
  onCancel: () => void;
}

export function GitHubRepoForm({ projectId, onSuccess, onCancel }: Props) {
  const [step, setStep] = useState<"input" | "success">("input");
  const [repoName, setRepoName] = useState("");
  const [githubUrl, setGithubUrl] = useState("");
  const [validationState, setValidationState] =
    useState<ValidationState>("idle");
  const [verifyResult, setVerifyResult] = useState<VerifyResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateUrl = useCallback(
    async (url: string) => {
      if (!url.trim()) {
        setValidationState("idle");
        setVerifyResult(null);
        return;
      }

      // Quick format check before API call
      if (!url.match(/github\.com[:/]/)) {
        setValidationState("invalid");
        setVerifyResult({
          valid: false,
          error: "Not a GitHub URL",
          tokenConfigured: false,
        });
        return;
      }

      setValidationState("validating");
      try {
        const res = await fetch(
          `/api/github/verify?url=${encodeURIComponent(url)}`
        );
        const result: VerifyResult = await res.json();
        setVerifyResult(result);
        setValidationState(result.valid ? "valid" : "invalid");

        // Auto-fill repo name from GitHub if empty
        if (result.valid && result.repoInfo && !repoName) {
          setRepoName(result.repoInfo.name);
        }
      } catch {
        setValidationState("invalid");
        setVerifyResult({
          valid: false,
          error: "Failed to verify repository",
          tokenConfigured: false,
        });
      }
    },
    [repoName]
  );

  const handleUrlBlur = () => {
    validateUrl(githubUrl);
  };

  const handleSubmit = async () => {
    if (!repoName.trim() || validationState !== "valid" || !verifyResult?.repoInfo)
      return;

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/projects/${projectId}/repos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: repoName,
          remoteUrl: verifyResult.repoInfo.cloneUrl,
        }),
      });

      if (res.ok) {
        setStep("success");
      } else {
        const data = await res.json();
        setError(data.error || "Failed to create repository");
      }
    } catch {
      setError("Failed to create repository");
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const webhookUrl = `${window.location.origin}/api/webhooks/github`;

  if (step === "success") {
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-green-500" />
            Repository Connected
          </CardTitle>
          <CardDescription>
            Complete these steps to enable automatic builds
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Webhook URL */}
          <div className="space-y-2">
            <Label>1. Copy the webhook URL</Label>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm">
              <span className="flex-1 truncate">{webhookUrl}</span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0"
                onClick={() => copyToClipboard(webhookUrl, "webhook-url")}
              >
                {copiedId === "webhook-url" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </div>

          {/* Webhook Secret Info */}
          <div className="space-y-2">
            <Label>2. Webhook Secret</Label>
            <div className="p-3 bg-muted rounded-md text-sm">
              {verifyResult?.tokenConfigured ? (
                <p className="text-muted-foreground">
                  Use the same secret as your{" "}
                  <code className="bg-background px-1 py-0.5 rounded">
                    GITHUB_WEBHOOK_SECRET
                  </code>{" "}
                  environment variable.
                </p>
              ) : (
                <p className="text-yellow-600 dark:text-yellow-500">
                  <AlertCircle className="inline w-4 h-4 mr-1" />
                  Set{" "}
                  <code className="bg-background px-1 py-0.5 rounded">
                    GITHUB_WEBHOOK_SECRET
                  </code>{" "}
                  env var on your server, then use that value here.
                </p>
              )}
            </div>
          </div>

          {/* GitHub Setup Instructions */}
          <div className="space-y-2">
            <Label>3. Add webhook in GitHub</Label>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground p-3 bg-muted rounded-md">
              <li>Go to your repository on GitHub</li>
              <li>
                Click <strong>Settings</strong> &rarr; <strong>Webhooks</strong>{" "}
                &rarr; <strong>Add webhook</strong>
              </li>
              <li>
                Paste the webhook URL above into <strong>Payload URL</strong>
              </li>
              <li>
                Set <strong>Content type</strong> to{" "}
                <code className="bg-background px-1 py-0.5 rounded">
                  application/json
                </code>
              </li>
              <li>Enter your webhook secret</li>
              <li>
                Select <strong>Just the push event</strong>
              </li>
              <li>
                Click <strong>Add webhook</strong>
              </li>
            </ol>
            {verifyResult?.repoInfo && (
              <a
                href={`https://github.com/${verifyResult.repoInfo.fullName}/settings/hooks/new`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
              >
                Open GitHub webhook settings
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>

          <div className="flex gap-2 pt-4">
            <Button onClick={onSuccess}>Done</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle>Connect GitHub Repository</CardTitle>
        <CardDescription>
          Link an existing GitHub repository to trigger builds on push
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* GitHub URL Input */}
        <div className="space-y-2">
          <Label htmlFor="github-url">GitHub Repository URL</Label>
          <div className="relative">
            <Input
              id="github-url"
              placeholder="https://github.com/owner/repo"
              value={githubUrl}
              onChange={(e) => setGithubUrl(e.target.value)}
              onBlur={handleUrlBlur}
              className={
                validationState === "invalid" ? "border-destructive" : ""
              }
            />
            <div className="absolute right-3 top-1/2 -translate-y-1/2">
              {validationState === "validating" && (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              )}
              {validationState === "valid" && (
                <CheckCircle className="w-4 h-4 text-green-500" />
              )}
              {validationState === "invalid" && (
                <XCircle className="w-4 h-4 text-destructive" />
              )}
            </div>
          </div>
          {validationState === "invalid" && verifyResult?.error && (
            <p className="text-sm text-destructive">{verifyResult.error}</p>
          )}
          {validationState === "valid" && verifyResult?.repoInfo && (
            <p className="text-sm text-muted-foreground">
              {verifyResult.repoInfo.private && "(Private) "}
              {verifyResult.repoInfo.fullName}
            </p>
          )}
        </div>

        {/* Repository Name */}
        <div className="space-y-2">
          <Label htmlFor="repo-name">Repository Name in EIFL</Label>
          <Input
            id="repo-name"
            placeholder="my-repo"
            value={repoName}
            onChange={(e) => setRepoName(e.target.value)}
          />
          <p className="text-sm text-muted-foreground">
            This name is used to identify the repository in EIFL
          </p>
        </div>

        {/* Error Display */}
        {error && (
          <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-2">
          <Button
            onClick={handleSubmit}
            disabled={
              !repoName.trim() || validationState !== "valid" || isSubmitting
            }
          >
            {isSubmitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Connect Repository
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
