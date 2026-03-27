---
trigger: always_on
---

# Description
Defines environment variable management, API Route authentication, Supabase access control, and file upload security.
No exceptions — apply to every task.

# Content

## Environment Variables

```
# Server only — never expose to client
GOOGLE_API_KEY
SUPABASE_SERVICE_ROLE_KEY

# Client allowed (NEXT_PUBLIC_ prefix)
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```

- Never add `NEXT_PUBLIC_` prefix to `GOOGLE_API_KEY`
- All env vars must be centrally managed in `lib/env.ts`

```typescript
// lib/env.ts
export const env = {
  googleApiKey: process.env.GOOGLE_API_KEY!,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL!,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
}
```

## API Route Security
- Validate session before every Gemini API call
- Return 401 immediately for unauthenticated requests

```typescript
const session = await getSession(req)
if (!session) return new Response('Unauthorized', { status: 401 })
```

## Supabase Security
- RLS must be applied to every table (see database.md)
- Users can only access their own data (`user_id = auth.uid()`)
- Use `service_role_key` for admin operations only — never on client side

## File Upload Security
- Allowed formats: PDF, DOCX only
- Max file size: 10MB per file
- Storage path must follow `{user_id}/{document_id}` structure for isolation
- Deletion must remove both DB record and Storage file simultaneously