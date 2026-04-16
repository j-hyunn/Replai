# Supabase Google OAuth Setup Guide

## Required Environment Variables

Add the following to your `.env.local` file:

```env
# Client-allowed (NEXT_PUBLIC_ prefix required)
NEXT_PUBLIC_SUPABASE_URL=https://<your-project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-anon-key>

# Server-only — never expose to client, never add NEXT_PUBLIC_ prefix
SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
GOOGLE_API_KEY=<your-google-ai-api-key>
```

> **Security rule**: `GOOGLE_API_KEY` and `SUPABASE_SERVICE_ROLE_KEY` must NEVER have the `NEXT_PUBLIC_` prefix.

---

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com/dashboard](https://supabase.com/dashboard)
2. Click **New project**
3. Choose your organization, set a project name and database password
4. Select a region and click **Create new project**

---

## Step 2: Get Supabase API Keys

1. In your project dashboard, go to **Project Settings → API**
2. Copy the following values into `.env.local`:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon / public key** → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_ROLE_KEY`

---

## Step 3: Set Up Google OAuth in Google Cloud Console

1. Go to [https://console.cloud.google.com](https://console.cloud.google.com)
2. Create a new project (or select an existing one)
3. Navigate to **APIs & Services → OAuth consent screen**
   - Choose **External** user type
   - Fill in App name, User support email, Developer contact
   - Click **Save and Continue** through all steps
4. Navigate to **APIs & Services → Credentials**
5. Click **Create Credentials → OAuth client ID**
   - Application type: **Web application**
   - Name: `Replai`
   - Under **Authorized redirect URIs**, add:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
6. Click **Create** and copy the **Client ID** and **Client Secret**

---

## Step 4: Configure Google OAuth in Supabase

1. In your Supabase project dashboard, go to **Authentication → Providers**
2. Find **Google** and toggle it **Enabled**
3. Paste the **Client ID** and **Client Secret** from Step 3
4. Copy the **Callback URL** shown in Supabase (should match what you set in Google Cloud)
5. Click **Save**

---

## Step 5: Configure Allowed Redirect URLs

1. In Supabase, go to **Authentication → URL Configuration**
2. Set **Site URL**:
   - Development: `http://localhost:3000`
   - Production: `https://your-vercel-domain.vercel.app`
3. Under **Redirect URLs**, add:
   - `http://localhost:3000/**`
   - `https://your-vercel-domain.vercel.app/**`

---

## Step 6: Run Database Migration

Apply the initial schema migration to your Supabase project:

```bash
# Using Supabase CLI
npx supabase db push

# Or apply manually via Supabase Dashboard → SQL Editor
# Copy and paste the contents of:
# supabase/migrations/20260327000001_initial_schema.sql
```

---

## Step 7: Configure Storage Bucket

1. In Supabase, go to **Storage**
2. Click **New bucket**
   - Name: `documents`
   - Public: **No** (private bucket)
3. Add storage policy for authenticated users:

```sql
-- Allow users to upload to their own folder only
create policy "user folder isolation"
  on storage.objects for all
  using (
    bucket_id = 'documents'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
```

> Files will be stored at path `{user_id}/{document_id}` for isolation (see security rules).

---

## Verification Checklist

- [ ] `.env.local` has all 4 required environment variables
- [ ] Google Cloud OAuth client created with correct redirect URI
- [ ] Supabase Google provider enabled with Client ID + Secret
- [ ] Redirect URLs configured in Supabase Auth settings
- [ ] Database migration applied (4 tables + RLS policies)
- [ ] Storage bucket `documents` created as private
- [ ] Storage policy applied for user folder isolation
