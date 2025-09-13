// src/app/api/waiver/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// --- Helpers ---
function dataUrlToBytes(dataUrl?: string | null): { bytes: Uint8Array; mime: string } | null {
  if (!dataUrl || !dataUrl.startsWith("data:")) return null;
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.slice(5, meta.indexOf(";"));
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

// --- Init Supabase (server client) ---
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// --- Brevo email sender ---
async function sendAftercareEmail(to: string, name?: string) {
  const apiKey = process.env.BREVO_API_KEY!;
  const from = process.env.FROM_EMAIL || "Broken Art Tattoo <no-reply@brokenarttattoo.com>";
  const replyTo = process.env.REPLY_TO || undefined;

  const first = (name || "").trim().split(/\s+/)[0] || "there";

  const htmlContent = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
      <h2>Tattoo Aftercare Instructions</h2>
      <p>Hi <strong>${first}</strong>,</p>
      <p>Thanks for trusting <b>Broken Art Tattoo</b> with your new piece! Here’s how to take care of it:</p>
      <ul>
        <li>Keep your bandage on for 5 hours (plastic) or 24 hours (second skin).</li>
        <li>Wash gently with unscented soap and lukewarm water.</li>
        <li>Pat dry, don’t rub.</li>
        <li>Apply a thin layer of tattoo ointment 2–3× daily.</li>
        <li>No pools, saunas, or direct sun until fully healed.</li>
      </ul>
      <p>If anything feels off, contact your artist.</p>
      <p><a href="https://g.page/r/CTIC7Zd1etmgEBE/review">Leave us a Google Review</a></p>
    </div>
  `;

  const payload = {
    sender: { name: "Broken Art Tattoo", email: from.match(/<([^>]+)>/)?.[1] ?? from },
    to: [{ email: to }],
    subject: "Aftercare & Healing Guide — Broken Art Tattoo",
    htmlContent,
    ...(replyTo ? { replyTo: { email: replyTo } } : {})
  };

  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": apiKey,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!r.ok) {
    console.error("Brevo send error", r.status, await r.text());
  } else {
    console.log("Brevo send ok", r.status);
  }
}

// --- Main Handler ---
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const waiver_id: string = body?.waiver_id || `BAT-${Date.now()}`;

    if (!body?.client_name || !body?.email) {
      return NextResponse.json({ ok: false, error: "Missing client_name or email" }, { status: 400 });
    }

    // Upload images (signature + ID front)
    const uploads: Promise<any>[] = [];

    const sig = dataUrlToBytes(body?.signature_png);
    if (sig) {
      const path = `waivers/${waiver_id}/signature.png`;
      uploads.push(
        supabase.storage.from("waivers").upload(path, sig.bytes, {
          contentType: "image/png",
          upsert: true,
        })
      );
      body.signature_path = path;
      delete body.signature_png;
    }

    const idFront = dataUrlToBytes(body?.id_photo_front);
    if (idFront) {
      const ext = idFront.mime.split("/")[1] || "png";
      const path = `waivers/${waiver_id}/id_front.${ext}`;
      uploads.push(
        supabase.storage.from("waivers").upload(path, idFront.bytes, {
          contentType: idFront.mime,
          upsert: true,
        })
      );
      body.id_photo_front_path = path;
      delete body.id_photo_front;
    }

    await Promise.all(uploads);

    // Insert DB record
    const insertPayload = {
      waiver_id,
      client_name: body.client_name ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      dob: body.dob ?? null,
      procedure_type: body.procedure_type ?? null,
      procedure_site: body.procedure_site ?? null,
      signature_path: body.signature_path ?? null,
      id_photo_front_path: body.id_photo_front_path ?? null,
      send_aftercare: !!body.send_aftercare,
      timestamp_iso: new Date().toISOString(),
    };

    const { error } = await supabase.from("waivers").insert(insertPayload);
if (error) {
  console.error("DB insert error", error);
  return NextResponse.json(
    { ok: false, error: error.message, details: error.details, hint: error.hint },
    { status: 500 }
  );
}

    // Send aftercare email if requested
    if (body.send_aftercare && body.email) {
      await sendAftercareEmail(body.email, body.client_name);
    }

    return NextResponse.json({ ok: true, waiver_id }, { status: 200 });
  } catch (e) {
    console.error("Handler exception", e);
    return NextResponse.json({ ok: false, error: "Server error" }, { status: 500 });
  }
}