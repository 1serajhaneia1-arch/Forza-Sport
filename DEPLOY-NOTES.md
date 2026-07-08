# Deploy Notes

## Setup
1. `npm install`
2. Copy `.env.example` to `.env` and fill in real values (a starter `.env` with
   your requested admin password is already included — just make sure it never
   gets committed to git).
3. `npm start`

## HTTPS

**Local development:** run `./generate-dev-cert.sh` once. It creates a
self-signed certificate in `certs/`. Restart the server and it will
automatically serve over `https://localhost:3443` (plain HTTP on :3000 will
redirect there). Your browser will warn that the cert isn't trusted — that's
expected and fine for local testing; click through it.

**Real production domain:** a self-signed cert is not appropriate for real
users — browsers will show a security warning and some browsers/OSes will
block the site outright. For a real domain you have two good options:

- **Reverse proxy (recommended):** put Nginx or Caddy in front of this Node
  app and let it handle HTTPS with a free certificate from
  [Let's Encrypt](https://letsencrypt.org/) (via `certbot`). The Node app
  keeps running on plain HTTP on localhost; the proxy terminates TLS and
  forwards traffic to it. This is the standard setup and what most hosting
  guides assume.
- **Hosting platform handles it for you:** if you deploy to something like
  Render, Railway, Fly.io, or a similar PaaS, HTTPS on your `*.your-host.com`
  subdomain is usually automatic with zero config. You'd only need the
  certs/ folder approach above if you're running this Node process directly
  on a bare VM with nothing in front of it.

## Admin access
Visit `dashboard.html?key=YOUR_ADMIN_KEY` (the key is whatever you set as
`ADMIN_KEY` in `.env`). Consider bookmarking that URL rather than typing the
key each time — but don't share the link.

## User accounts
Accounts now live server-side in `data/users.json` with bcrypt-hashed
passwords (12 rounds) and a signed, httpOnly session cookie (JWT, 7-day
expiry). This file is a simple JSON store, good for getting a real site
launched. If you outgrow it (many concurrent users, need for querying/
reporting), migrating to the MySQL setup already listed in `package.json`
is the natural next step — happy to help with that when you're ready.

## Orders
Orders placed at checkout are now saved server-side in `data/orders.json`
(same simple JSON-file approach as users), not just in the customer's
browser. This means:

- **Dashboard → Orders tab** shows every order that comes in, from any
  customer, on any device — you no longer need to be on the same browser
  the customer used. You can search, filter by status, update status
  (Pending approval → Confirmed → Processing → Shipped → Delivered /
  Cancelled), or delete an order from there.
- **Customer order history** (`history.html`) shows a signed-in customer's
  orders pulled from the server, so it follows their account across
  devices, and reflects any status update you make from the dashboard.
  Guests who don't create an account still only get the on-device copy,
  same as before.
- The checkout page still keeps a local copy in the browser too, purely as
  a fallback — if for some reason the request to the server fails (e.g. no
  internet), the customer still sees their order was recorded on their
  device, and is told to also contact you directly with the order number.

No email/SMS notifications are wired up yet, so you'll want to check the
dashboard periodically for new "Pending approval" orders. `nodemailer` is
already listed in `package.json` if you'd like to add an email alert to
yourself whenever a new order comes in — happy to wire that up on request.
