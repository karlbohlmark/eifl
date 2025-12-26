# GitHub Integration
To integrate Eifl with your GitHub repositories, follow these steps:

## 1. Configure Eifl Server
Ensure your Eifl server is reachable from the internet (e.g., using a tunnel like ngrok or hosting it on a public IP).
Set the following environment variable on your Eifl server:
- `GITHUB_WEBHOOK_SECRET`: A secret string used to secure webhooks.

Optional (for private repositories):
- `GITHUB_TOKEN`: A GitHub Personal Access Token (PAT) with `repo` scope. This allows Eifl to fetch `.eifl.json` from private repositories.

## 2. Create Repository in Eifl
Create a repository in Eifl pointing to your GitHub repository.
You can do this via the API:
```bash
curl -X POST http://your-eifl-server/api/projects/1/repos \
  -H "Content-Type: application/json" \
  -d '{"name": "my-repo", "remoteUrl": "https://github.com/myuser/my-repo.git"}'
```

## 3. Configure GitHub Webhook
Go to your GitHub repository settings -> Webhooks -> Add webhook.
- **Payload URL**: `http://your-eifl-server/api/webhooks/github`
- **Content type**: `application/json`
- **Secret**: The value of `GITHUB_WEBHOOK_SECRET` you set in step 1.
- **Which events would you like to trigger this webhook?**: Just the `push` event.
- **Active**: Checked.

## 4. Add Pipeline Config
Add a `.eifl.json` file to the root of your GitHub repository.
Example:
```json
{
  "name": "Build and Test",
  "steps": [
    {
      "name": "Install",
      "run": "bun install"
    },
    {
      "name": "Test",
      "run": "bun test"
    }
  ]
}
```

Now, every time you push to your GitHub repository, Eifl will trigger a build!
