import { NextResponse } from "next/server";
import { z } from "zod";

import { buildContactFormEmail } from "@/lib/email-templates/contact-form";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email").max(320),
  subject: z.string().min(1, "Subject is required").max(300),
  message: z.string().min(1, "Message is required").max(10000),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const message =
      Object.values(first).flat().join(" ") || "Validation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { name, email, subject, message } = parsed.data;

  const toEmail =
    process.env.CONTACT_EMAIL ??
    process.env.NEXT_PUBLIC_CONTACT_EMAIL ??
    "contact@securitykit.io";

  // Check if email is configured before building message
  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      {
        error:
          "Contact form is not configured. Please email us directly at " +
          toEmail,
      },
      { status: 503 }
    );
  }

  // Build the email using the styled template
  const { subject: emailSubject, html } = buildContactFormEmail({
    name,
    email,
    subject,
    message,
  });

  // Send to the contact email address using the shared utility
  // Note: sendEmail sends FROM the configured RESEND_FROM address,
  // but we need to send TO the contact address, so we use Resend directly
  const { Resend } = await import("resend");
  const client = new Resend(process.env.RESEND_API_KEY);
  const fromEmail =
    process.env.RESEND_FROM ?? "SecurityKit <onboarding@resend.dev>";

  const { data, error } = await client.emails.send({
    from: fromEmail,
    to: [toEmail],
    replyTo: email,
    subject: emailSubject,
    html,
  });

  if (error) {
    console.error("Contact form Resend error:", error);
    return NextResponse.json(
      {
        error:
          "Failed to send message. Please try again or email us directly.",
      },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data?.id });
}
