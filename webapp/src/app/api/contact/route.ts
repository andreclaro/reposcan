import { NextResponse } from "next/server";
import { z } from "zod";

const contactSchema = z.object({
  name: z.string().min(1, "Name is required").max(200),
  email: z.string().email("Invalid email").max(320),
  subject: z.string().min(1, "Subject is required").max(300),
  message: z.string().min(1, "Message is required").max(10000)
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 }
    );
  }

  const parsed = contactSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.flatten().fieldErrors;
    const message = Object.values(first).flat().join(" ") || "Validation failed";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { name, email, subject, message } = parsed.data;

  const apiKey = process.env.RESEND_API_KEY;
  const toEmail =
    process.env.CONTACT_EMAIL ??
    process.env.NEXT_PUBLIC_CONTACT_EMAIL ??
    "contact@securitykit.io";
  const fromEmail =
    process.env.RESEND_FROM ?? "SecurityKit <onboarding@resend.dev>";

  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Contact form is not configured. Please email us directly at " +
          toEmail
      },
      { status: 503 }
    );
  }

  const { Resend } = await import("resend");
  const client = new Resend(apiKey);

  const html = [
    "<p><strong>From:</strong> " + escapeHtml(name) + " &lt;" + escapeHtml(email) + "&gt;</p>",
    "<p><strong>Subject:</strong> " + escapeHtml(subject) + "</p>",
    "<hr>",
    "<pre style=\"white-space: pre-wrap; font-family: inherit;\">" + escapeHtml(message) + "</pre>"
  ].join("\n");

  const { data, error } = await client.emails.send({
    from: fromEmail,
    to: [toEmail],
    replyTo: email,
    subject: `[Contact] ${subject}`,
    html
  });

  if (error) {
    console.error("Contact form Resend error:", error);
    return NextResponse.json(
      { error: "Failed to send message. Please try again or email us directly." },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, id: data?.id });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
