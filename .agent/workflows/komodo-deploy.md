---
description: Deploy Exim-Accurate to Komodo using GitHub Actions and GHCR
---

# Komodo Deployment Guide (GitHub Actions + GHCR)

This guide uses **GitHub Actions** to build the image and **Komodo UI** to deploy it.

---

## Step 1: CI/CD Build (Automated)

1. Any push to `main` triggers the GitHub Action: `.github/workflows/docker-build.yml`.
2. The action builds the image and pushes it to `ghcr.io/mws-mad-labs/exim-accurate:latest`.

**Verification:**
- Check [GitHub Actions](https://github.com/MWS-MAD-Labs/Exim-Accurate/actions) to ensure the build succeeds.
- Check [GitHub Packages](https://github.com/orgs/MWS-MAD-Labs/packages?repo_name=Exim-Accurate) to see the image.

> [!IMPORTANT]
> To allow Komodo to pull the image without a token:
> 1. Go to your Package Settings on GitHub.
> 2. Set the package visibility to **Public**.
> 3. Or, add your GitHub PAT to Komodo's **Registry** settings.

---

## Step 2: Configure Komodo Stack

1. Open Komodo UI → **Stacks** → `exima`
2. Ensure **Source** is set to `Git Repo` (linked to `exima` repo).
3. Ensure **Compose File Path** is `compose.prebuilt.yaml`. Its app service must retain `pull_policy: always` so a deploy refreshes the mutable `latest` image.
4. Update/Verify **Environment** variables:
   - Ensure `DATABASE_URL` uses the Compose service address, for example `postgresql://postgres:password@postgres:5432/exim_accurate?schema=public`.
   - Do not use `localhost` from inside the app container.
   - PostgreSQL is intentionally not published on a host port in the production Compose file; the app reaches it over the private Compose network.
   - Ensure `NEXTAUTH_URL` and `ACCURATE_REDIRECT_URI` use the production domain.

---

## Step 3: Pull and Deploy (Manual or Automated)

### Automated (Recommended)
Using a **Komodo Procedure** with the Compose `pull_policy: always` setting ensures the stack syncs, refreshes the image, and replaces the app container when the image changes.

1.  **Create Procedure**:
    - In Komodo UI → **Procedures** → **Create Procedure**.
    - Name it `exima-redeploy`.
    - Add Step: `Sync Stack` (select `exima`).
    - Add Step: `Deploy Stack` (select `exima`).
2.  **Generate Webhook**:
    - Inside the Procedure page, scroll to **Webhook**.
    - Click **Generate Webhook**.
    - Copy the **URL** and the **Secret**.
3.  **Config GitHub Secrets**:
    - GitHub Repository → **Settings** → **Secrets and variables** → **Actions**.
    - Update `KOMODO_WEBHOOK_URL` with the Procedure URL.
    - Update `KOMODO_WEBHOOK_SECRET` with the Procedure Secret.
4.  Every push to `main` will now trigger the full redeploy pipeline.

### Manual
1. In the `exima` stack, click **Pull** to sync the latest `compose.prebuilt.yaml`.
2. Click **Deploy**.
3. Komodo will pull the `latest` image from GHCR and start the containers.

---

## Step 4: Post-Deployment Steps

1. **Verify automatic migrations:**
   - Confirm the **postgres** container is healthy before the app starts.
   - Check the **app** container logs for `All migrations have been successfully applied` or `No pending migrations to apply`, followed by `Starting application...`.
   - Confirm the **app** container becomes healthy after Next.js starts listening on port `5758`.
   - The image entrypoint runs `npx prisma migrate deploy` before starting Next.js. Do not use `prisma db push` in production.

2. **Seed Admin User:**
   - Follow the one-off prebuilt-container procedure in `DEPLOYMENT.md`; the production image does not include the `tsx` seed runner.

---

## Troubleshooting

### "Permission Denied" on Pull
If the GHCR image is private, Komodo will fail to pull.
- **Fix:** Go to **Registries** in Komodo sidebar → **Add Registry** → `ghcr.io` with your GitHub username and PAT.

### Buildx Errors
By using GHCR, we bypass the `buildx` issues on the Komodo server as the build happens on GitHub's infrastructure.