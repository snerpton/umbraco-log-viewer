# Publishing (automated, no Personal Access Token)

This repo publishes to the VS Code Marketplace from GitHub Actions using
**Microsoft Entra ID** via GitHub OIDC (workload identity federation). There is
no Personal Access Token to store or rotate — which matters because global Azure
DevOps PATs are retired on **1 December 2026**.

Once set up, releasing is just:

```bash
# bump the version in package.json first, then:
git tag v0.1.0
git push origin v0.1.0
```

`.github/workflows/release.yml` builds the `.vsix`, publishes it, and attaches it
to a GitHub Release for the tag.

---

## One-time setup

You need an Azure account with any active subscription (free tier is fine — a
managed identity is a real Azure resource and needs somewhere to live), a GitHub
repo with Actions enabled, and a Marketplace publisher.

### 1. Create your Marketplace publisher

Go to <https://marketplace.visualstudio.com/manage>, sign in with a Microsoft
account, click **Create publisher**, and choose an ID (permanent). Put that ID in
`package.json` → `publisher` (currently the placeholder `your-publisher-id`).

### 2. Create a user-assigned managed identity

Use a **managed identity**, not an App Registration. An App Registration
authenticates but then fails at publish with `InvalidAccessException: The
requested operation is not allowed`.

1. In the Azure portal, search **Managed Identities** → **+ Create**.
2. Pick a subscription, resource group, region, and a name (e.g. `vscode-publisher`).
3. **Review + create** → **Create** → **Go to resource**.

### 3. Add a GitHub federated credential to that identity

On the managed identity: **Settings → Federated credentials → + Add credential**.

- **Federated credential scenario**: *GitHub Actions deploying Azure resources*
- **Organization**: your GitHub username/org
- **Repository**: just the repo name
- **Entity type**: **Environment** (not Branch or Tag — Tag matches only one exact
  tag and breaks on your next release)
- **GitHub environment name**: `marketplace-publish` (must match the `environment:`
  in the workflows)
- **Name**: any label, e.g. `github-actions`

### 4. Add the repo secrets

On the managed identity, **Settings → Properties**, copy **Client ID** and
**Tenant ID**. Then in your GitHub repo: **Settings → Secrets and variables →
Actions → New repository secret**:

- `AZURE_CLIENT_ID` = the identity's Client ID
- `AZURE_TENANT_ID` = the identity's Tenant ID

### 5. Find the ID the Marketplace actually wants, then authorize it

The Marketplace runs on Azure DevOps, which keeps its own identity record —
separate from the identity's Client ID, Tenant ID, and ARM resource ID. A brand
new identity has no Azure DevOps profile yet, so adding it by any of those IDs
returns "not found". One API call, made *as the identity*, creates the profile
and returns the usable ID.

1. Commit and push, then run the **Debug Identity (one-time)** workflow
   (Actions tab → Run workflow).
2. Open the run → expand the last step → copy the `"id"` value from the JSON.
3. Go to <https://marketplace.visualstudio.com/manage>, select your publisher,
   open **Members**, **Add**, paste that `id`, set role **Contributor**, save.
4. Delete `.github/workflows/debug-identity.yml` and push — you only need it once.

### 6. Release

Bump `package.json` version, then push a matching `vX.Y.Z` tag. The release
workflow verifies the tag matches `package.json`, packages, and publishes.

---

## Also reach VSCodium / Cursor / Gitpod (optional)

Those forks use **Open VSX**, not Microsoft's Marketplace. To publish there too,
create a namespace at <https://open-vsx.org>, then run
`npx ovsx publish umbraco-log-viewer-<version>.vsix -p <open-vsx-token>` (this one
still uses a token). You can add it as a step in `release.yml` if you want both.

## Troubleshooting

- **`InvalidAccessException` at publish** — you used an App Registration instead
  of a managed identity (step 2), or the identity isn't a Contributor on the
  publisher (step 5).
- **Members search can't find the identity** — you pasted the Client/Tenant/
  Resource ID instead of the `id` from the Debug Identity run (step 5).
- **`azure/login` fails with an OIDC error** — the federated credential's
  Organization/Repository/Environment must exactly match this repo and the
  `marketplace-publish` environment name.
