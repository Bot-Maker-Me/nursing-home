# Deploying the Henderson's Pharmacy Client Portal

There are **three separate things** to set up. They don't depend on each other's tooling.

---

## 1. Database — Supabase

1. Supabase → your project → **SQL Editor** → New query.
2. Paste the **entire** contents of `supabase/schema.sql` → **Run**.
   - Expect: *"Success. No rows returned."*
   - If your database was set up from `supabase/migrations/*` instead (rather than this
     single file), also run `supabase/fix-permissions.sql`. Admin actions such as
     **Create client** and **Create invitation** need table-level `INSERT`/`UPDATE`
     grants; without them they fail with 500s even though the lists load.
3. Confirm in **Table Editor**: `profiles`, `homes`, `pharmacies`, `invitations`,
   `chat_threads`, `portal_messages`, `portal_documents`, `managed_records`.
3b. (Optional) Create the **pharmacy** account — a non-admin login that only gets the
   conversation view at `/pharmacy`. Invite it from **/admin → User accounts → Invite a
   portal user** and pick **Pharmacy** as the role, or set an existing profile's role:
   ```sql
   update public.profiles set role = 'pharmacy' where id = (
     select id from auth.users where email = 'pharmacy@yourdomain.ca'
   );
   ```
   Signing in with that account lands on `/pharmacy` (chat only — no admin console).

4. Create your first admin:
   - **Authentication → Users → Add user → Create new user** (email + a password you choose, tick **Auto confirm user**).
   - Then in SQL Editor (replace the email):
     ```sql
     insert into public.profiles (id, full_name, role)
     select id, coalesce(raw_user_meta_data->>'full_name',''), 'admin'
     from auth.users
     where email = 'your-email@example.com'
     on conflict (id) do update set role = 'admin';
     ```
5. Note your **Project URL**, **anon key**, and **service_role key** (Settings → API). You need them in step 3.

---

## 2. Code — GitHub

This repo has commits but **no remote** yet. In a terminal at the project root:

```bash
git remote add origin https://github.com/Bot-Maker-Me/nursing-home.git
git branch -M main
git push -u origin main
```

If the repo already has a commit, either merge it or (if it's empty) the push just works.

---

## 3. Hosting — Vercel

### Option A — Import from Git (recommended; avoids the workspace token entirely)
1. Go to **vercel.com** → **Add New… → Project**.
2. **Import** the `Bot-Maker-Me/nursing-home` repo.
3. Add Environment Variables (below) → **Deploy**.
4. Every future `git push` auto-deploys.

### Option B — Vercel CLI (uses your own logged-in session)
```bash
vercel login       # log in as the account that owns the project
vercel --prod       # deploy to production
```

### Environment Variables (Vercel → Project → Settings → Environment Variables)
| Name | Value | Notes |
|------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://ayvpdpthxwplbsmhpbva.supabase.co` | public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your anon key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | your service-role key | **Sensitive** |
| `RESEND_API_KEY` | *(optional)* | enables server-side email |
| `PHARMACY_EMAIL` | *(optional)* | defaults to pharmacy@hendersonsportal.ca |
| `MAIL_FROM` | *(optional)* | Resend "from" address |

After adding/changing env vars, **redeploy** so they take effect.

---

## 4. Fixing the deploy error

```
403 forbidden … resource under scope "piyush80545-1371s-projects"
"You must re-authenticate to this scope or use a token with access to this scope." saml: true
```

**Cause:** the credential the workspace's deploy button is holding belongs to a
*different* Vercel account/scope than the one that owns your project
(`piyush80545-1371s-projects`). Because that scope enforces SAML/SSO, the token
expires quickly and must be re-authorized.

**Fixes (any one):**
- **Reconnect in the workspace:** open the workspace's Vercel/account connection settings,
  disconnect, reconnect, and when Vercel asks which account/team, choose
  **`piyush80545-1371s-projects`**. Complete the SSO prompt if one appears.
- **Skip the workspace deployer:** use **Option A** or **Option B** above — both use your
  own Vercel login and are unaffected by the workspace token.

---

## 5. Verify after deploy

1. Open the production URL → sign in with the admin account from step 1.4 → you land on `/admin`.
2. Admin → **Clients & pharmacies**: the 3 seeded homes should be listed.
3. **Conversations** and **Data manager** load without errors.
4. As a portal (nurse) user: open **Connect with Pharmacy**, start a conversation —
   the message appears live in the admin console.
5. In **Data manager**, download a CSV template, edit it, import it → records appear.
