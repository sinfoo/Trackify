# Trackify, the 5-minute pitch script

Deck: `Trackify-pitch-5min.pptx` (9 slides, `node build-deck.mjs --pitch5`). About 620 spoken words at 125 to 130 words per minute: 4 minutes 50, with slack for the pause on the reveal. Times are cumulative.

Delivery notes: one speaker, or switch at slide 4 ("And for that") and again at slide 7 ("A human in the loop"). Pause one full second on the reveal. Never read the slide; the slide shows, you tell.

---

## Slide 1, Cover (0:00 to 0:15)

> Good morning. We are Team Trackify, and in the next five minutes we will show you a FinTech team that is run by six AI agents. But first, a story most of you have lived.

## Slide 2, Have you ever (0:15 to 0:45)

> Have you ever tried to buy a course at eleven at night? You have real questions: is this level right for me, can I pay in instalments. The website has a chatbot. It answers nothing and sells nothing. You close the tab.
>
> Now flip to the other side, the business owner. Sales chat, payment gateway, analytics dashboard, fraud checks: four tools, six people, and none of them share context. The buyer gets nothing, the owner gets spreadsheets.

## Slide 3, Three problems, one cause (0:45 to 1:15)

> Three problems. Disconnected tools: every hand-off loses information. Autonomy without control: the moment an AI can touch money, you inherit fraud, prompt injection and a system nobody is accountable for. And no trace, no trust: a decision made inside a model call cannot be replayed or defended to a customer or a regulator.
>
> One root cause: there is no team, only tools.

## Slide 4, Introducing Trackify (1:15 to 1:35)

*(pause, then)*

> And for that, we built Trackify. One autonomous team. Six specialised agents. And a human on every risky decision.
>
> Less a chatbot, more a small company that never sleeps, with a very strict compliance officer in the room. Everything you will see is running code.

## Slide 5, What Trackify does (1:35 to 2:25)

> Follow one customer. She talks to the Sales agent, by voice or text, in English or French. Customer Intelligence listens in and scores her needs, objections and purchase intent. When she enrols, the Payment agent opens a simulated checkout: prices live on the server, and the payment is a strict state machine, so no agent can invent a discount or skip a step.
>
> The Financial Analyst recomputes revenue and forecast in exact decimals; Strategy turns the numbers into recommendations, each labelled observed fact or hypothesis.
>
> Above every arrow sits Security. It screens each message for prompt injection before any model sees it and scores every payment: velocity, repeats, duplicates, high amounts, tampering. Anything risky is held, and only a person can release it.

## Slide 6, How the agents connect (2:25 to 3:15)

> How are the agents actually connected? This is the product's own orchestration canvas, and three rules.
>
> First, no agent talks to another directly. Everything goes through the orchestrator, and every message is typed, never free text: customer turn, risk decision, payment result, metrics updated. Each arrow is stored and replayable in the audit log.
>
> Second, each agent has a short allow-list of tools and physically cannot call anything else. None can approve, refund or change a price.
>
> Third, the loop on anything risky closes with a human: bottom right, Payment asks, a person releases. The model writes the words; deterministic code sets prices, scores risk and moves state.

## Slide 7, A human in the loop (3:15 to 3:50)

> For the business it looks like this. Held payments and refunds land in an approval centre with an expiry countdown, under a four-eyes rule: whoever requested a refund cannot approve it.
>
> Every action, agent or human, is appended to a hash-chained audit log; each entry carries the hash of the one before. Edit history anywhere and the chain breaks exactly there. That is our answer to "no trace, no trust".

## Slide 8, What changes (3:50 to 4:25)

> What changes? For the business: qualified sales around the clock, numbers exact to the millime, recommendations that cite their evidence, a seven-day forecast after every order. For trust: fraud and injection stopped before money moves, and a human signature on every risky decision.
>
> In our seeded demo: forty-two journeys, twenty-four enrolments, thirty-three thousand nine hundred dinars of simulated revenue, eighteen risky payments held for review.

## Slide 9, Conclusion (4:25 to 4:50)

> Trackify is an AI team that sells, collects and analyses on its own, and can never move money without a human.
>
> It is a full stack today: FastAPI and PostgreSQL behind Next.js, one hundred thirty-seven backend tests, one command to run. Next: a sandbox gateway, a Redis bus, verticals beyond training.
>
> Thank you. The repo is on screen and the live demo is ready. Questions?

---

## If the jury asks

- **"Is the AI deciding anything financial?"** No. Prices, risk scores, state transitions and permissions are deterministic code. The model only writes the wording and the explanations, and every reply is validated before it is shown.
- **"What happens if the model is down or rate-limited?"** Every agent falls back to its rules engine; the demo never stalls. There is a 60-second circuit breaker on rate limits.
- **"How do you stop prompt injection?"** A classifier runs before any model call, in English and French. A refused message gets a fixed safe reply and a security event. Model text can never change the verdict. You can try it live on the Security page.
- **"Why simulated payments?"** The brief forbids live gateways and card data; nothing in the system stores a PAN or CVV. The provider adapter is one function, `payments.execute_provider`, ready for a sandbox gateway.
- **"Can a buyer see what they bought?"** Yes: a buyer dashboard with the library, orders in arrival with a progress tracker, printable receipts and the assistant's recommendations. Owners switch between buying and selling, like Fiverr.
- **"How is this different from a chatbot plus Stripe?"** Six specialised agents with typed hand-offs, least-privilege tools, a fraud engine, four-eyes approvals and a tamper-evident audit log. The chatbot is one sixth of it.
