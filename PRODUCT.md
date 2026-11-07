# Product brief: The Autonomous FinTech Team

TECHX Tunisia hackathon. A small education business (fictional) sells training programs in TND. Six cooperating
agents (sales, intelligence, payment, analyst, strategy, security) plus an orchestrator run the customer journey
end to end: talk to a prospect, understand them, recommend an offer, take a simulated payment, hold anything risky
for a human, then report and recommend business actions.

## Audiences

1. **Hackathon judges** watching a projector from a distance. They need to see, within seconds, that agents are
   doing real work: live activity, workflow states moving, a payment held for approval, a prompt injection blocked.
2. **Ops admins** (finance, security, sales managers) who review approvals, payments, alerts and analytics.
3. **Prospects** on the public side: browse offers, chat or talk with the sales agent, pay (simulated).

## Surfaces

- Public: landing, offers, offer detail, assistant (text/voice), checkout, success, payment failed.
- Admin app: dashboard, live activity, workflows, agents, studio, customers, products, orders, payments,
  analytics, strategy, security, approvals, audit, settings, demo control.

## Principles

- **Show the work.** Every agent action is visible as an event; every money movement has a status, a reference
  and a trail.
- **Humans decide risky things.** Refunds and held payments always go through approvals; the UI makes that obvious.
- **Honest demo.** All data is fictional and payments are simulated. The UI says so (Simulated badge, footer).
- **Readable at distance.** Large restrained KPIs, high contrast, no decorative noise.
- **Permissions in the UI are a convenience.** The backend enforces RBAC; the UI only hides what a role cannot use.

## Demo accounts

Password `Demo!2026`: admin@demo.techx, finance@demo.techx, security@demo.techx, sales@demo.techx,
viewer@demo.techx.
