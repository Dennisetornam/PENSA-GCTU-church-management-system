import { useState } from "react";
import { MessageSquare, Copy, Check, Phone, MessageCircle } from "lucide-react";

export interface Recipient { full_name: string; phone_number: string; whatsapp_number?: string | null }

const digits = (n: string) => n.replace(/[^\d]/g, "");

/**
 * Reusable bulk-message tool for any member list. Sends via the device:
 * - "Text all by SMS": an sms: deep link addressed to everyone (+ the message).
 * - Copy numbers / message: paste into a WhatsApp Broadcast list or a bulk-SMS tool.
 * No paid gateway — the church sends from their own phone.
 */
export function BulkMessageBar({ recipients, defaultMessage = "", context }: { recipients: Recipient[]; defaultMessage?: string; context?: string }) {
  const [msg, setMsg] = useState(defaultMessage);
  const [copied, setCopied] = useState<"" | "numbers" | "message">("");
  if (recipients.length === 0) return null;

  const numbers = recipients.map((r) => r.phone_number).filter(Boolean);
  const waNumbers = recipients.map((r) => digits(r.whatsapp_number || r.phone_number)).filter(Boolean);
  const smsHref = `sms:${numbers.join(",")}${msg ? `?body=${encodeURIComponent(msg)}` : ""}`;

  const copy = async (what: "numbers" | "message", text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(what);
    setTimeout(() => setCopied(""), 1600);
  };

  return (
    <div className="card mb-4 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-ink">
        <MessageSquare size={16} className="text-gold" /> Message {recipients.length} {recipients.length === 1 ? "member" : "members"}{context ? ` · ${context}` : ""}
      </div>
      <textarea className="field min-h-16 text-sm" value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Type a message to send to everyone…" />
      <div className="mt-2 flex flex-wrap gap-2">
        <a href={smsHref} className="btn-gold !py-2 text-sm"><Phone size={15} /> Text all by SMS</a>
        <button onClick={() => copy("message", msg)} className="btn-ghost !py-2 text-sm">{copied === "message" ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy message</>}</button>
        <button onClick={() => copy("numbers", waNumbers.join(", "))} className="btn-ghost !py-2 text-sm">{copied === "numbers" ? <><Check size={15} /> Copied</> : <><Copy size={15} /> Copy numbers</>}</button>
      </div>
      <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-soft/55">
        <MessageCircle size={13} className="mt-0.5 shrink-0 text-[#4d5645]" />
        <span>For WhatsApp: tap <span className="font-medium">Copy message</span> &amp; <span className="font-medium">Copy numbers</span>, then paste them into a WhatsApp <span className="font-medium">Broadcast list</span> to reach everyone at once.</span>
      </p>
    </div>
  );
}
