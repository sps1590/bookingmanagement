# User guide

For the person running a business on this platform — an owner, a manager or someone on the front desk.

**What works today:** creating your business, setting it up, and a public page that customers can find. **What does not yet:** customers choosing a time and booking it. That is the next piece of work. This guide marks each section so you are never waiting for something that is not there.

---

## 1. The idea in one paragraph

You register your business, say what you do and when you are open, and you get a web address of your own — `yoursite.com/book/your-business` — that you can put in a Facebook post, a WhatsApp status, a printed card or a Google listing. Customers open it, pick a time that is genuinely free, and the appointment appears in your diary. Nobody gets double-booked, because the system refuses to create an overlap even if two people tap "confirm" in the same second.

---

## 2. Setting up

### Creating your business

Go to `/signup`. Five things are asked for:

**What kind of business this is.** This matters more than it looks. Pick "Dental Clinic" and every screen afterwards says *Patient*, *Dentist* and *Dental Appointment*. Pick "Hair Salon" and the same screens say *Client*, *Stylist* and *Service Booking*. The words change; nothing else does. You can edit any individual word later, so if you run a diagnostic centre and call a booking a *Serial*, that is what your staff will read.

**Your business name.** What customers know you by. It appears on your booking page and in every reminder.

**Your phone number.** Type it however you normally would — `01711-000000` is fine. It is stored in international form so that reminders and lookups work consistently.

**Your name, email and password.** This is the owner account. Use at least ten characters: this login can see every customer record you ever store, including any notes you write about them.

You get a reference like **BIZ-1042**. Quote it if you ever need support.

### The five-step wizard

After signup you land in a wizard. You can close the tab at any point and come back — it remembers where you were, on any device, because your progress is saved on your business record rather than in that browser.

**1. Business details.** Confirm the name and phone, add your address, and choose your **booking page address** — the `your-business` part of the URL. Short and recognisable is best. Changing it later breaks any link you have already shared, so it is worth a moment now.

Also choose your **timezone**. Every time shown anywhere in the system — your diary, your customers' confirmations, their calendar invites — is displayed in this zone. Get it right and you never think about it again.

**2. Your first service.** One is enough to finish setup; add the rest from the dashboard afterwards.

- **How long does it take?** The time the customer is actually with you.
- **Price.** Zero is fine if you do not want to publish prices.
- **Gaps around it.** This is the setting people skip and then wish they had not. If you need fifteen minutes to sterilise between patients, or ten minutes to set up, put it here. The booking page will never offer a slot that eats into those gaps, and the system will refuse to create one even under a race between two customers. Leave them at zero if back-to-back is genuinely fine for you.

**3. Working hours.** The days you are open, your opening and closing time, and an optional daily break. This is what gets turned into bookable slots. You can set per-person hours and single-day exceptions — a holiday, someone's leave — from the dashboard later.

**4. Go live.** A summary, and a button. Until you press it your booking page is **not reachable**, deliberately: a customer who found an empty calendar would assume you were closed. Pressing it publishes the page.

---

## 3. About reminders — read this part

This platform sends reminders by **email**, **browser notification** and **calendar invite**. It does **not** send SMS.

That is a deliberate choice, and it is about cost. No SMS gateway in Bangladesh has a free tier; every one of them bills per message. The same is true of WhatsApp, even though it looks free — Meta only gives away conversations the *customer* starts, and an appointment reminder is one you start, which is billed. Rather than quietly pass that cost to you, the channel was left out.

**What this means in practice.** A customer who gives you only a phone number cannot be reminded automatically. There is no way around that.

**What to do about it.** Two things:

1. **Ask for an email address** wherever you can. One line on the booking form is the difference between a reminder and a no-show.
2. **Rely on the calendar invite.** Every confirmation carries one. When the customer taps it, the appointment goes into the calendar app already on their phone, and *their phone* then reminds them — a day before and an hour before — at no cost to you or to us. For a customer who gave no email, this is the only automatic reminder that will reach them, so it is worth a sentence when you talk to them: "tap the invite and your phone will remind you."

If SMS matters enough to pay for, the system is built so a gateway can be added without rebuilding anything. That is a conversation to have, not a limitation to live with forever.

---

## 4. Who can see what

Four roles, and the differences are real — they are enforced by the database, not just hidden in the interface.

| Role | Can see | Can do |
|---|---|---|
| **Owner** | Everything in your business | Everything, including staff, plans and settings |
| **Manager** | Everything in your business | Everything except creating or changing an owner |
| **Receptionist** | The whole diary, all customers | Take and change bookings, record payments |
| **Staff / provider** | **Only their own appointments** | Manage their own schedule |

That fourth row is worth dwelling on. A provider signs in and sees their own column of the diary — not their colleagues' appointments, and not the notes attached to them. If you have a part-time stylist or a visiting consultant, this is why you can give them a login without giving them the whole client list.

Two things the system will not let you do, both on purpose:

- **Remove the last owner.** If you try, it refuses. There is no self-service way back from locking yourself out of your own business, so the database simply does not allow it. Promote someone else to owner first.
- **Upgrade your own plan.** Plan changes go through the platform, not through your settings screen.

---

## 5. Taking deposits *(Phase 8 — not yet built)*

There is no card payment, because no gateway available here is free: Stripe cannot pay out in Bangladesh, and bKash or SSLCommerz merchant accounts need business registration plus per-transaction fees.

Instead, the flow will be the one you probably already use. The customer sends money to **your own** bKash or Nagad number and types in the transaction ID. Someone at your desk checks it against the statement and marks it verified.

Three safeguards are already built into the database for when that arrives, because manual money handling is where a dishonest employee can steal:

- **The same transaction ID cannot be used twice** in your business. Not a warning in the interface — the database refuses it.
- **What the customer claimed cannot be edited afterwards.** The transaction ID and the amount they stated are frozen the moment they are recorded. Correcting something means adding a new record, so both versions stay visible.
- **Every verification names who did it.** "Who approved this payment" always has an answer.

---

## 6. When something looks wrong

**Your booking page shows "not found".** Either the address is mistyped, or you have not pressed "Go live" yet. Check the wizard.

**Your booking page is blank on services.** You have gone live without an active service. Add one from the dashboard.

**Everything is erroring and you have not changed anything.** The database may have been paused — the free hosting tier does that after a week with no activity. There is a scheduled job that prevents it, so this means the job has stopped; whoever runs the platform needs to resume the project and check it.

**Reminders stopped for everyone at once.** The monthly email allowance is shared across every business on the platform, not per business. When it runs out, reminders stop being sent rather than failing — and the calendar invites already in your customers' phones keep working. Whoever runs the platform can switch to a second provider in a few minutes.

**A customer says they were double-booked.** This should be impossible; the database makes two overlapping appointments for one provider unrepresentable. If it happened, it is either two *different* providers at the same time, which is normal, or two bookings for one room, which the system does not model yet. Worth reporting either way.

---

## 7. What is coming

| | |
|---|---|
| Customers choosing a time and booking | Phase 3 |
| Your dashboard: day sheet, calendar, walk-ins | Phase 4 |
| Automatic reminders and calendar invites going out | Phase 5 |
| Customers rescheduling or cancelling themselves; CSV and PDF exports | Phase 6 |
| Logins for your staff, with their own schedules | Phase 7 |
| Deposits and plans | Phase 8 |
| Waitlist, analytics, multiple branches | Phase 9 |

The full plan, with what each phase has to prove before it is called done, is in [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md).
