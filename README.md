# Daryl Barber

Production booking site for Daryl Barber. The browser talks to Vercel API routes; only those routes can read or write Supabase data.

## Local setup

1. Copy `.env.example` to `.env` and fill the server-only Supabase variables.
2. Apply the migration with `supabase link --project-ref lnldjooudtwtykojcdry` followed by `supabase db push`.
3. Set `ADMIN_ACCESS_CODE` and a random `ADMIN_SESSION_SECRET` (at least 32 characters).
4. Run `npx vercel dev` for the full frontend + API flow. `npm run dev` only serves the Vite frontend.

For a local API smoke test, set all values in `.env` and run `npx vercel dev`. The public browser never needs a Supabase key: every data request is handled by a server function.

## Checks

```bash
npm run typecheck
npm test
npm run build
```

## Vercel environment

Configure `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `ADMIN_ACCESS_CODE`, and `ADMIN_SESSION_SECRET` in the Vercel project. These values are server-only and must never use a `VITE_` prefix.

Use the Supabase project URL `https://lnldjooudtwtykojcdry.supabase.co` and project ref `lnldjooudtwtykojcdry`. Set the variables in each Vercel environment that will serve traffic, then redeploy so the functions receive them.

## Launch checklist

1. Authenticate the Supabase CLI, link project ref `lnldjooudtwtykojcdry`, run `supabase db push`, and run the Supabase database advisors.
2. Set a four-digit `ADMIN_ACCESS_CODE` and a random `ADMIN_SESSION_SECRET` in Vercel, then verify the admin code login.
3. Verify public booking, overlap rejection, admin login, manual walk-in, status transitions, referral ledger redemption, loyalty redemption, and customer cancellation with `vercel dev`.
4. Revoke and rotate the exposed Neon credential before pushing any history or deploying this repository. Old commits still contain that credential even though the current source does not.
5. Add the final business legal identity, postal address, registration details, and contact email to the legal notice before public launch. The repository cannot infer those facts.
6. After a public booking, the site opens the customer's SMS app addressed to Daryl with a French confirmation draft. The customer must press Send; browsers and mobile operating systems do not allow a website to silently send an SMS. Configure a transactional provider such as Twilio or Brevo if true server-sent SMS or email confirmations are required.
7. Link the Vercel project under the intended owner, add the purchased domain, configure DNS, and verify HTTPS, the apex domain, and the `www` redirect before launch.

For `dlbarber.fr`, keep the existing LWS nameservers. After Vercel displays the domain instructions, replace the parked apex `A` record with the exact Vercel value (normally `76.76.21.21`) and point `www` to the exact Vercel `CNAME` target (normally `cname.vercel-dns.com`). Do not change nameservers unless Vercel explicitly asks for that; the current `ns17`-`ns20.lwsdns.com` nameservers show that LWS is the active DNS host.

## Security notes

- Do not restore the old Neon credential. It was exposed in the public repository and must remain revoked.
- Do not expose Supabase secret/service-role keys to the browser.
- Appointment creation and reward redemption run inside database functions so conflicts and double-spend attempts are rejected atomically.
- The public API returns availability only; customer and admin booking data requires an authenticated admin session.
- Customer management tokens are hashed in the database and carried in URL fragments, so they are not sent in HTTP requests or referrer headers.
