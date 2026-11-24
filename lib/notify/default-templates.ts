import type { Terminology } from "@/lib/terminology";

/**
 * The notification templates a new tenant starts with.
 *
 * Seeded at signup (plan §3.3) with the tenant's own nouns already substituted,
 * rather than left as placeholders. A dentist opening the settings screen
 * should read "Your dental appointment is confirmed" and be able to edit that
 * sentence — not meet `{{booking_label}}` and have to work out what the
 * product will do with it. The `{{...}}` placeholders that remain are the ones
 * only the system can fill.
 *
 * ## Which channels exist
 *
 * No SMS and no WhatsApp (docs/DECISIONS.md D-009): neither has a free tier
 * for business-initiated reminders. That has a consequence worth stating in
 * the templates themselves — a customer who gave only a phone number cannot
 * be reached by any of these. Which is why `calendar` is here as a
 * first-class channel rather than a link in a footer: the `.ics` invite puts
 * the appointment in the customer's own calendar, and their own phone then
 * does the reminding for free.
 *
 * Phase 5 renders and sends these.
 */

export interface TemplateSeed {
  event_type: string;
  channel: "email" | "push" | "telegram" | "calendar";
  subject: string | null;
  body_template: string;
}

export function defaultTemplates(t: Terminology, businessName: string): TemplateSeed[] {
  const booking = t.booking.toLowerCase();

  return [
    {
      event_type: "booking_confirmed",
      channel: "email",
      subject: `Your ${booking} at ${businessName} is confirmed`,
      body_template: [
        `Hello {{customer_name}},`,
        ``,
        `Your ${booking} is confirmed.`,
        ``,
        `  ${t.booking}: {{service_name}}`,
        `  ${t.staff}: {{staff_name}}`,
        `  When: {{date}} at {{time}}`,
        `  Reference: {{booking_code}}`,
        ``,
        `The calendar invite attached to this email will remind you.`,
        ``,
        `Need to change or cancel it? {{manage_url}}`,
        ``,
        `${businessName}`,
      ].join("\n"),
    },
    {
      event_type: "booking_pending",
      channel: "email",
      subject: `We have your ${booking} request`,
      body_template: [
        `Hello {{customer_name}},`,
        ``,
        `We have your request for {{date}} at {{time}} and will confirm it shortly.`,
        `Reference: {{booking_code}}`,
        ``,
        `${businessName}`,
      ].join("\n"),
    },
    {
      event_type: "reminder_24h",
      channel: "email",
      subject: `Tomorrow: your ${booking} at ${businessName}`,
      body_template: [
        `Hello {{customer_name}},`,
        ``,
        `A reminder that your ${booking} is tomorrow, {{date}} at {{time}}, with {{staff_name}}.`,
        ``,
        `If you can no longer make it, please let us know so we can offer the time`,
        `to someone else: {{manage_url}}`,
        ``,
        `${businessName}`,
      ].join("\n"),
    },
    {
      event_type: "reminder_1h",
      channel: "push",
      subject: `Your ${booking} is in an hour`,
      body_template: `{{service_name}} with {{staff_name}} at {{time}}. See you shortly.`,
    },
    {
      event_type: "reminder_24h",
      channel: "push",
      subject: `Tomorrow at {{time}}`,
      body_template: `{{service_name}} with {{staff_name}} at ${businessName}, {{date}} at {{time}}.`,
    },
    {
      event_type: "rescheduled",
      channel: "email",
      subject: `Your ${booking} has moved to {{date}}`,
      body_template: [
        `Hello {{customer_name}},`,
        ``,
        `Your ${booking} is now {{date}} at {{time}} with {{staff_name}}.`,
        `Reference: {{booking_code}}`,
        ``,
        `The updated calendar invite replaces the previous one.`,
        ``,
        `${businessName}`,
      ].join("\n"),
    },
    {
      event_type: "cancelled",
      channel: "email",
      subject: `Your ${booking} on {{date}} is cancelled`,
      body_template: [
        `Hello {{customer_name}},`,
        ``,
        `Your ${booking} on {{date}} at {{time}} has been cancelled.`,
        `Reference: {{booking_code}}`,
        ``,
        `You are welcome to book another time whenever suits you.`,
        ``,
        `${businessName}`,
      ].join("\n"),
    },
    // The calendar invite is its own channel because it is not a message: it
    // is a file the customer's calendar app owns and re-reads. Phase 5 keeps a
    // stable UID and increments SEQUENCE so a reschedule updates the existing
    // entry instead of leaving two appointments in their diary.
    {
      event_type: "booking_confirmed",
      channel: "calendar",
      subject: `{{service_name}} at ${businessName}`,
      body_template: [
        `{{service_name}} with {{staff_name}}`,
        `Reference: {{booking_code}}`,
        `Manage this ${booking}: {{manage_url}}`,
      ].join("\n"),
    },
  ];
}
