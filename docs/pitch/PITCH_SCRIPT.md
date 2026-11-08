# Trackify, the 5-minute pitch script

Deck: `Trackify-pitch-5min.pptx` (9 slides, `node build-deck.mjs --pitch5`). About 650 spoken words, 120 to 130 words per minute, leaves 20 seconds of slack. Times are cumulative. The same text is in each slide's speaker notes.

Delivery notes: one speaker, or switch at slide 4 ("And for that") and again at slide 7 ("A human in the loop"). Pause one full second on the reveal. Never read the slide; the slide shows, you tell.

---

## Slide 1, Cover (0:00 to 0:15)

> Good morning. We are Team Trackify, and in the next five minutes we will show you a FinTech team that is run by six AI agents. But first, a story most of you have lived.

## Slide 2, Have you ever (0:15 to 0:50)

> Have you ever tried to buy a course at eleven at night? You have questions: is this level right for me, can I pay in instalments, when does it start. The website has a chatbot. It answers nothing, and it sells nothing. You close the tab.
>
> Now flip to the other side, the business owner. Sales chat, payment gateway, analytics dashboard, fraud checks: four tools, six people, and none of them share context. The buyer gets nothing, the owner gets spreadsheets.

## Slide 3, Three problems, one cause (0:50 to 1:25)

> We see three problems. Disconnected tools: every hand-off loses information and somebody re-types the data. Autonomy without control: the moment an AI can touch money, you inherit fraud, prompt injection and a system nobody is accountable for. And no trace, no trust: a decision made inside a model call cannot be replayed, verified or defended to a customer or a regulator.
>
> One root cause: there is no team, only tools.

## Slide 4, Introducing Trackify (1:25 to 1:45)

*(pause, then)*

> And for that, we built Trackify. One autonomous team. Six specialised agents. And a human on every risky decision.
>
> Think of it less as a chatbot and more as a small company that never sleeps, with a very strict compliance officer in the room. Everything you will see is running code.

## Slide 5, What Trackify does (1:45 to 2:35)

> Follow one customer. She lands on the public site and talks to the Sales agent, by voice or text, in English or French. The Customer Intelligence agent listens in and scores her needs, her objections and her purchase intent. When she enrols, the Payment agent opens a simulated checkout: prices live on the server, and the payment is a strict state machine, so an agent can never invent a discount or skip a step.
>
> The Financial Analyst recomputes revenue and forecast in exact decimals, and the Strategy agent turns those numbers into recommendations, each one labelled as an observed fact or a hypothesis.
>
> Above every arrow sits the Security agent. It screens each message for prompt injection before any model sees it, and it scores every payment: velocity, repeated failures, duplicates, high amounts, tampering. Anything risky is held. And a held payment is only ever released by a person.

## Slide 6, How the agents connect (2:35 to 3:25)

> This is the question we get most often: how are the agents actually connected? This is the product's own orchestration canvas.
>
> Three rules. First, no agent talks to another directly. Every message goes through the orchestrator, and every message is typed, never free text: customer turn, interaction result, risk decision, payment result, metrics updated. Each arrow you see here is stored, and replayable, in the audit log.
>
> Second, every agent has a short allow-list of tools and physically cannot call anything else. Not one of them can approve, refund or change a price.
>
> Third, the loop on anything risky closes with a human. Look at the bottom right: Payment asks, a person releases. The model writes the words; deterministic code sets the prices, scores the risk and moves the state.

## Slide 7, A human in the loop (3:25 to 4:00)

> Here is what that looks like for the business. Held payments and refund requests land in an approval centre with an expiry countdown. We enforce a four-eyes rule: whoever requested a refund cannot be the one who approves it.
>
> Every action, by an agent or a human, is appended to a hash-chained audit log; each entry carries the hash of the one before it. Edit history anywhere, and the chain breaks exactly there. That is the answer to "no trace, no trust".

## Slide 8, What changes (4:00 to 4:35)

> So what changes? For the business: qualified sales handled around the clock, numbers exact to the millime, recommendations that cite their evidence, a seven-day forecast that refreshes after every order.
>
> For trust: no agent can approve, refund or change a price; fraud and injection are stopped before money moves; and there is a human signature on every risky decision.
>
> In our seeded demo that is forty-two customer journeys, twenty-four enrolments, thirty-three thousand nine hundred dinars of simulated revenue, and eighteen high-risk payments held for review.

## Slide 9, Conclusion (4:35 to 5:00)

> Trackify is an AI team that sells, collects and analyses on its own, and can never move money without a human.
>
> It is a full stack today: FastAPI and PostgreSQL behind Next.js, one hundred thirty-seven backend tests, end-to-end coverage, one command to run. Next: a real sandbox gateway, a Redis bus, and verticals beyond training.
>
> Thank you. The repo is on screen, and we are happy to run the live demo. Questions?

---

## If the jury asks

- **"Is the AI deciding anything financial?"** No. Prices, risk scores, state transitions and permissions are deterministic code. The model only writes the wording and the explanations, and every reply is validated before it is shown.
- **"What happens if the model is down or rate-limited?"** Every agent falls back to its rules engine; the demo never stalls. There is a 60-second circuit breaker on rate limits.
- **"How do you stop prompt injection?"** A classifier runs before any model call, in English and French. A refused message gets a fixed safe reply and a security event. Model text can never change the verdict. You can try it live on the Security page.
- **"Why simulated payments?"** The brief forbids live gateways and card data; nothing in the system stores a PAN or CVV. The provider adapter is one function, `payments.execute_provider`, ready for a sandbox gateway.
- **"Can a buyer see what they bought?"** Yes: a buyer dashboard with the library, orders in arrival with a progress tracker, printable receipts and the assistant's recommendations. Owners switch between buying and selling, like Fiverr.
- **"How is this different from a chatbot plus Stripe?"** Six specialised agents with typed hand-offs, least-privilege tools, a fraud engine, four-eyes approvals and a tamper-evident audit log. The chatbot is one sixth of it.
