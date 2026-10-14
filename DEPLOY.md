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
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | the project's VAPID public key | public, optional — `lib/push.ts` already carries it. If you *do* set it, it must be the **same** key as the Edge Function's `VAPID_PUBLIC_KEY`; a different value here makes every device subscribe against one key while sends are signed with the other. Leave it unset to use the built-in one |
| `RESEND_API_KEY` | *(optional)* | enables server-side email |
| `PHARMACY_EMAIL` | *(optional)* | defaults to pharmacy@hendersonsportal.ca |
| `MAIL_FROM` | *(optional)* | Resend "from" address |

Never put `VAPID_PRIVATE_KEY` on the hosting side — it belongs only to Edge Function
secrets (see section 6).

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

---

## 6. Web Push notifications (browser alerts for portal chat)

Three pieces, in this order: the database, the Edge Function secrets, then the function.
Both this portal and the Pharma Portal write to the same `public.portal_messages` table, so
the **sending side exists once, here** — the Pharma Portal only has to register its own
service worker and subscriptions.

### 6a. Database (Supabase → SQL Editor)

Run `supabase/migrations/20261016000000_push_subscriptions.sql` (already included in
`supabase/schema.sql` as section 9 for fresh setups). It creates `push_subscriptions` with
owner-only RLS, enables `pg_net`, and adds the `portal_messages_send_push` trigger that
fires the Edge Function after every insert.

**Trigger choice:** pg_net + a database trigger, *not* a Supabase Database Webhook. The
trigger covers inserts from any client (this portal's API routes and the Pharma Portal
alike), runs asynchronously so it can never slow down or block a message insert, and keeps
its configuration in the database instead of the dashboard.

Then store the two values the trigger needs in **Vault** (SQL Editor, run once — replace
both placeholders with your own values):

```sql
select vault.create_secret(
  'https://<your-project-ref>.supabase.co/functions/v1/send-push',
  'push_function_url');
select vault.create_secret('<your service_role key>', 'push_service_role_key');
```

The service-role key never appears in this repo, in client code, or in any `NEXT_PUBLIC_*`
variable. Until both secrets exist the trigger is a silent no-op and chat keeps working.

### 6b. Edge Function secrets (Dashboard → Project → Edge Functions → Manage Secrets)

| Name | Value |
|------|-------|
| `VAPID_PUBLIC_KEY` | the project's VAPID public key |
| `VAPID_PRIVATE_KEY` | the project's VAPID **private** key — server secret |
| `VAPID_SUBJECT` | `mailto:param@pharmastrategies.ca` |

The two keys are a **pair** and must be the exact match of each other: a public key is 87
characters and a private key is 43, so anything else was mistyped, truncated, or pasted
with a line break inside it. `VAPID_PUBLIC_KEY` here must be the same key as the built-in
one in `lib/push.ts` — if they differ, subscriptions are created against one key while
sends are signed with the other, and every push is refused. Both sides now strip stray
whitespace and report `bad_vapid_keys` rather than failing silently.

**Rotating the keys** invalidates every existing device: a subscription is bound to the key
that created it. The portal notices the stale subscription and re-subscribes, so each user
only has to press **Enable notifications** once more.

### 6c. Deploy `send-push`

`supabase/functions/send-push/index.ts` (Deno + `web-push`). Either paste it into
Dashboard → Edge Functions → **send-push** → Deploy, or with the CLI:

```bash
supabase functions deploy send-push
```

Leave JWT verification ON: the trigger authenticates with the service-role key, and the
function additionally refuses any caller whose token is not `service_role`.

What it does: resolves the thread's home, picks recipients **excluding the sender**
(pharmacy-sent → the home's portal users; home-sent → the accounts with the `pharmacy`
or `admin` role, i.e. whoever runs the pharmacy console), sends generic copy only
(`New message` / `You have a new message…`), and deletes subscriptions that answer
`404`/`410`.

A `{"ok":true,"sent":0,"reason":"no_recipients"}` reply means the other side of that
thread resolved to nobody — the thread's `home_id` has no portal users on it, or the
sender is its only member. Remember the sender is always excluded by design: messaging
yourself never notifies you. Use the portal's **Send a test alert** button to prove your
own device, and have the *other* side send a message to prove the trigger.

### 6d. Verify

1. Sign in as a portal user → **Account → Message alerts → Enable notifications**
   (or use the banner above the chat) and accept the browser prompt.
2. Confirm a row exists: `select user_id, tenant_id, endpoint from public.push_subscriptions;`
3. Press **Send a test alert**. It goes through the same function a real reply does, so it
   is the quickest way to prove a device end-to-end: close the tab first, and the alert
   should still arrive. If it fails, the message names the cause — `bad_vapid_keys`,
   a missing subscription, or a refused send — instead of failing silently.
3. Send a message from the pharmacy side, then check that pg_net fired:

   ```sql
   select status_code, content, created from net._http_response order by created desc limit 5;
   ```

   `status_code = 200` with `{"ok":true,"sent":1}` means the push went out. A `403` means
   the Vault `push_service_role_key` is wrong; no row at all means `push_function_url` is
   missing.

   **`status_code` NULL with `error_msg = 'A libcurl function was given a bad argument'` is
   the silent one:** the request never left Postgres, so the Edge Function was never called
   and its logs stay empty — which is why "nothing arrives anywhere, desktop or mobile, tab
   open or closed" while the in-app bell still works. It means one of the two Vault secrets
   holds a value with whitespace inside it: usually the service-role key copied from a
   wrapped line, or the VAPID public key pasted into the wrong secret (a VAPID key is 87 or
   43 characters — a service-role key is a `eyJ…` JWT of roughly 200+). Confirm the shape —
   this reveals no secret content:

   ```sql
   select name,
          length(decrypted_secret) as chars,
          (decrypted_secret ~ '\s') as has_whitespace,
          (decrypted_secret ~ '^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$') as looks_like_service_key
   from vault.decrypted_secrets
   where name in ('push_function_url', 'push_service_role_key');
   ```

   `looks_like_service_key` must be `true` and `has_whitespace` `false`. To repair, copy the
   real key from **Project Settings → API → `service_role`** and run:

   ```sql
   select vault.update_secret(
     (select id from vault.decrypted_secrets where name = 'push_service_role_key'),
     '<PASTE_THE_eyJ_SERVICE_ROLE_KEY>');
   ```

   The trigger itself now strips whitespace from both values and validates their shape, so a
   wrapped paste no longer breaks the call — and a wrong value raises a warning (the
   Postgres equivalent of a console log) instead of idling silently.

   The function also returns `failed` and `lastStatus`, which separate "nobody is
   subscribed" from "the send was refused": `{"ok":true,"sent":0,"failed":1,"lastStatus":403}`
   means the device subscribed against a different VAPID key — re-enable notifications on
   it. A `{"ok":false,"reason":"bad_vapid_keys"}` means the Edge Function secrets hold a
   key that is the wrong length or is not a matching pair.

On **iPhone**, notifications only work from an installed app: **Share → Add to Home
Screen**, then open the portal from the Home Screen. The account screen and chat banner
show that instruction automatically while the portal is not installed.

Notifications also cannot be enabled while the portal is open *inside another page* (an
embed, or the workspace preview pane) — browsers block the permission prompt there, and the
account screen says "open the portal in its own tab" instead of failing silently. Test from
the deployed URL in a normal tab. If anything else fails, the browser console prints
`[push] enable failed: <ErrorName>`; the account screen shows the readable version.
