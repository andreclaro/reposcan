"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function ContactForm() {
  const [status, setStatus] = useState<"idle" | "sending" | "success" | "error">(
    "idle"
  );
  const [errorMessage, setErrorMessage] = useState<string>("");

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const formData = new FormData(form);
    const body = {
      name: formData.get("name") as string,
      email: formData.get("email") as string,
      subject: formData.get("subject") as string,
      message: formData.get("message") as string
    };

    setStatus("sending");
    setErrorMessage("");

    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        setStatus("error");
        setErrorMessage(
          typeof data.error === "string"
            ? data.error
            : "Something went wrong. Please try again or email us directly."
        );
        return;
      }

      setStatus("success");
      form.reset();
    } catch {
      setStatus("error");
      setErrorMessage("Network error. Please try again or email us directly.");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-xl mx-auto">
      {status === "success" && (
        <div className="rounded-lg border border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30 px-4 py-3 text-sm text-green-800 dark:text-green-200">
          Thanks for reaching out. We&apos;ll get back to you soon.
        </div>
      )}
      {status === "error" && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      )}

      <div>
        <label htmlFor="contact-name" className="block text-sm font-medium mb-1">
          Name
        </label>
        <Input
          id="contact-name"
          name="name"
          type="text"
          required
          placeholder="Your name"
          disabled={status === "sending"}
          className="h-10"
        />
      </div>
      <div>
        <label
          htmlFor="contact-email"
          className="block text-sm font-medium mb-1"
        >
          Email
        </label>
        <Input
          id="contact-email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          disabled={status === "sending"}
          className="h-10"
        />
      </div>
      <div>
        <label
          htmlFor="contact-subject"
          className="block text-sm font-medium mb-1"
        >
          Subject
        </label>
        <Input
          id="contact-subject"
          name="subject"
          type="text"
          required
          placeholder="Custom plan / Enterprise inquiry"
          disabled={status === "sending"}
          className="h-10"
        />
      </div>
      <div>
        <label
          htmlFor="contact-message"
          className="block text-sm font-medium mb-1"
        >
          Message
        </label>
        <textarea
          id="contact-message"
          name="message"
          required
          rows={5}
          placeholder="Tell us about your needs..."
          disabled={status === "sending"}
          className={cn(
            "w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs outline-none transition-[color,box-shadow]",
            "placeholder:text-muted-foreground border-input",
            "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
            "disabled:pointer-events-none disabled:opacity-50",
            "md:text-sm min-h-[120px] resize-y"
          )}
        />
      </div>
      <Button type="submit" disabled={status === "sending"} className="w-full">
        {status === "sending" ? "Sending…" : "Send message"}
      </Button>
    </form>
  );
}
