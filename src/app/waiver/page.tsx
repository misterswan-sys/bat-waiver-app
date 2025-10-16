"use client";

import React, { useEffect, useMemo, useRef, useState } from 'react';

/* ----------------------------- UI helpers ----------------------------- */

function Section(props: React.PropsWithChildren<{ title?: string; className?: string }>) {
  const { title, className, children } = props;
  return (
    <section className={`mt-8 ${className || ''}`}>
      {title ? <h2 className="mb-3 text-xl font-semibold">{title}</h2> : null}
      {children}
    </section>
  );
}

function Field({
  label,
  children,
  required,
}: React.PropsWithChildren<{ label: string; required?: boolean }>) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </span>
      {children}
    </label>
  );
}

function Input(
  props: React.InputHTMLAttributes<HTMLInputElement> & { full?: boolean; required?: boolean },
) {
  const { full, className, ...rest } = props;
  return (
    <input
      {...rest}
      className={[
        'mt-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none ring-0',
        'focus:border-zinc-400',
        full ? 'w-full' : '',
        className || '',
      ].join(' ')}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      suppressHydrationWarning
    />
  );
}

function Textarea(
  props: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { rows?: number; full?: boolean },
) {
  const { full, className, rows = 3, ...rest } = props;
  return (
    <textarea
      {...rest}
      rows={rows}
      className={[
        'mt-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none ring-0',
        'focus:border-zinc-400',
        full ? 'w-full' : '',
        className || '',
      ].join(' ')}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="none"
      spellCheck={false}
      suppressHydrationWarning
    />
  );
}

function Select(
  props: React.SelectHTMLAttributes<HTMLSelectElement> & { full?: boolean; required?: boolean },
) {
  const { full, className, children, ...rest } = props;
  return (
    <select
      {...rest}
      className={[
        'mt-1 rounded-lg border bg-white px-3 py-2 text-sm outline-none ring-0',
        'focus:border-zinc-400',
        full ? 'w-full' : '',
        className || '',
      ].join(' ')}
      suppressHydrationWarning
    >
      {children}
    </select>
  );
}

function Check({
  checked,
  onChange,
  label,
  required,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="flex items-start gap-3">
      <input
        type="checkbox"
        className="mt-1 h-4 w-4 rounded border"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        suppressHydrationWarning
      />
      <span className="text-sm leading-5">
        {label} {required ? <span className="text-red-600">*</span> : null}
      </span>
    </label>
  );
}

/* ------------------------- Signature pad (canvas) ------------------------- */

function useSignaturePad() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);

  const resize = () => {
    const c = canvasRef.current;
    if (!c) return;
    const parent = c.parentElement!;
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = parent.clientWidth;
    const h = 160; // fixed height; keeps layout steady on phones
    c.width = Math.floor(w * dpr);
    c.height = Math.floor(h * dpr);
    c.style.width = `${w}px`;
    c.style.height = `${h}px`;
    const ctx = c.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, w, h);
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const w = c.clientWidth;
    const h = c.clientHeight;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.restore();
    resize();
  };

  useEffect(() => {
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pointer events
  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    let lastX = 0,
      lastY = 0;

    function pt(e: PointerEvent) {
      const r = c.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      return { x, y };
    }

    const down = (e: PointerEvent) => {
      e.preventDefault();
      const p = pt(e);
      drawing.current = true;
      lastX = p.x;
      lastY = p.y;
    };
    const move = (e: PointerEvent) => {
      if (!drawing.current) return;
      const p = pt(e);
      ctx.beginPath();
      ctx.moveTo(lastX, lastY);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      lastX = p.x;
      lastY = p.y;
    };
    const up = () => {
      drawing.current = false;
    };

    c.addEventListener('pointerdown', down, { passive: false });
    c.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', up, { passive: true });

    // Avoid scroll-zoom on mobile
    c.style.touchAction = 'none';

    return () => {
      c.removeEventListener('pointerdown', down);
      c.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, []);

  return { canvasRef, clear };
}

// Robust “ink” detector (works on iOS/Android)
function hasAnyInk(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d');
  if (!ctx) return false;
  const { width, height } = canvas;
  if (!width || !height) return false;
  const step = 4;
  const data = ctx.getImageData(0, 0, width, height).data;
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 0) return true;
    }
  }
  return false;
}

/* -------------------------- Helpers / constants --------------------------- */

const practitionerOptions = [
  'Jeremy Swan',
  'Derrek Everette',
  'Matt Soderberg',
  'Josue Acosta',
  'Josh Ojeda',
  'Other',
];

const idTypes = ['Driver License', 'Passport', 'Birth Certificate'] as const;
type IdType = (typeof idTypes)[number];

const procedureTypes = ['Tattoo', 'Permanent cosmetics', 'Branding', 'Piercing'] as const;
type ProcedureType = (typeof procedureTypes)[number];

async function fileToDataURL(file: File | null): Promise<string | null> {
  if (!file) return null;
  const buf = await file.arrayBuffer();
  const b64 = Buffer.from(buf).toString('base64');
  return `data:${file.type};base64,${b64}`;
}

/* ==========================================================================
   Waiver Page
   ========================================================================== */
export default function WaiverPage() {
  /* ----- gate SSR/CSR until mounted: prevents mobile hydration warnings ----- */
  const [hydrated, setHydrated] = useState(false);
useEffect(() => setHydrated(true), []);

  /* ----------------------------- Form state ----------------------------- */
  const [clientName, setClientName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [dob, setDob] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');

  const [idType, setIdType] = useState<IdType>('Driver License');
  const [idFile, setIdFile] = useState<File | null>(null);

  const [procedureType, setProcedureType] = useState<ProcedureType>('Tattoo');
  const [procedureSite, setProcedureSite] = useState('');
  const [procedureDesc, setProcedureDesc] = useState('');
  const [practitioner, setPractitioner] = useState(practitionerOptions[0]);

  // Medical history toggles (grid)
  const [mh, setMh] = useState({
    TB: false,
    Asthma: false,
    EczemaPsoriasis: false,
    Gonorrhea: false,
    HIV: false,
    Hepatitis: false,
    HeartConditions: false,
    Syphilis: false,
    Herpes: false,
    SkinConditions: false,
    PregnantNursing: false,
    MRSAStaph: false,
    Diabetes: false,
    BloodThinners: false,
    FaintingDizziness: false,
    LatexAllergies: false,
    Epilepsy: false,
    Hemophilia: false,
    ScarringKeloiding: false,
    AntibioticAllergies: false,
  });

  // Medical free-text (stacked + clean)
  const [lastAte, setLastAte] = useState('');
  const [allergies, setAllergies] = useState('');
  const [medications, setMedications] = useState('');
  const [herpesHistory, setHerpesHistory] = useState('');
  const [otherConditions, setOtherConditions] = useState('');
  const [antibioticsHistory, setAntibioticsHistory] = useState('');
  const [cardiacValve, setCardiacValve] = useState('');
  const [extraInfo, setExtraInfo] = useState('');

  // Informed consent list (all required)
  const consentItems = useMemo(
    () => [
      'I am the person on the legal ID presented as proof that I am at least 18 years of age.',
      'I am under the age of 18 years old and have the presence of my parent or guardian to receive the body piercing. (Applicable only to underage body piercing. N/A if not applicable).',
      'I am not under the influence of alcohol or drugs and I am voluntarily submitting myself to receive body art without duress or coercion.',
      'I acknowledge that the information that I have provided in the medical questionnaire is complete and true to the best of my knowledge.',
      'I understand the permanent nature of receiving body art and that removal can be expensive and may leave scars on the procedure site.',
      'The body art described or shown on the client record form is correctly placed to my specifications.',
      'All questions about the body art procedure have been answered to my satisfaction, and I have been given written aftercare instructions for the procedure I am about to receive.',
      'I understand the restrictions on physical activities such as bathing, recreational water activities, gardening, contact with animals, and the durations of the restrictions.',
      'I understand that any medical information obtained will be subject to the federal Health Insurance Portability and Accountability Act of 1996 (HIPPA).',
      '*I am aware that tattoo inks, dyes, and pigments used on the procedure site have not been approved by the federal Food and Drug Administration, and that the health consequences of using these products are unknown.',
      'I am aware of the signs and symptoms of infection, including, but not limited to redness, swelling, tenderness of the procedure site, red streaks going from the procedure site towards the heart, elevated body temperature, or purulent drainage from the procedure site.',
      'I understand there is a possibility of getting an infection as a result of receiving body art particularly in the event that I do not take proper care of the procedure site.',
      'I will seek professional medical attention if signs and symptoms of an infection occur.',
      'I agree to follow all instructions concerning the care of my tattoo, and that any touch-ups needed due to my own negligence will be done at my own expense.',
      'I understand that there is a chance I might feel lightheaded, dizzy during or after being tattooed.',
      'I agree to immediately notify the artist in the event I feel lightheaded, dizzy and/or faint before, during or after the procedure.',
      'I have been fully informed of the risks of body art including but not limited to infection, scarring, difficulties in detecting melanoma, and allergic reactions to tattoo pigment, latex gloves, and antibiotics. Having been informed of the potential risks associated with a body art procedure, I still wish to proceed with the body art application and I assume any and all risks that may arise from body art.',
    ],
    [],
  );
  const [consents, setConsents] = useState<boolean[]>(() => consentItems.map(() => false));

  // Optional consents
  const [optPhoto, setOptPhoto] = useState(false);
  const [sendAftercare, setSendAftercare] = useState(true);

  // Signature
  const sig = useSignaturePad();

  // UX
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  /* ------------------------------- Submit ------------------------------- */

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setResult(null);

    if (!clientName || !email) {
      alert('Please fill required fields (Name, Email).');
      return;
    }

    if (!consents.every(Boolean)) {
      alert('Please check all informed consent items.');
      return;
    }

    const canvas = sig.canvasRef.current!;
    if (!hasAnyInk(canvas)) {
      alert('Please sign in the signature box.');
      return;
    }

    setSubmitting(true);
    try {
      const waiver_id = `BAT-LOCAL-${Math.floor(Math.random() * 100000)}`;
      const signature_png = canvas.toDataURL('image/png');
      const id_photo_front = await fileToDataURL(idFile);

      const payload = {
        waiver_id,

        // Client
        client_name: clientName,
        email,
        phone,
        address,
        dob,

        emergency_contact: emergencyName,
        emergency_phone: emergencyPhone,

        // ID
        id_type: idType,
        id_last4: '',

        // Procedure
        practitioner,
        procedure_type: procedureType,
        procedure_site: procedureSite,
        procedure_desc: procedureDesc,

        // Images
        signature_png, // server will convert to stored path
        id_photo_front, // server will convert/store

        // Medical flags
        mh_diabetes: mh.Diabetes,
        mh_hemophilia: mh.Hemophilia,
        mh_pregnancy: mh.PregnantNursing,
        mh_hepatitis: mh.Hepatitis,
        mh_hiv: mh.HIV,
        mh_keloids: mh.ScarringKeloiding,
        mh_allergies: mh.LatexAllergies || mh.AntibioticAllergies,
        mh_medication: !!medications?.trim(),

        // Text answers
        medical_notes: [
          lastAte && `Last ate: ${lastAte}`,
          allergies && `Allergies: ${allergies}`,
          medications && `Medications: ${medications}`,
          herpesHistory && `Herpes history: ${herpesHistory}`,
          otherConditions && `Other conditions: ${otherConditions}`,
          antibioticsHistory && `Prophylactic antibiotics: ${antibioticsHistory}`,
          cardiacValve && `Cardiac valve disease: ${cardiacValve}`,
          extraInfo && `Extra info: ${extraInfo}`,
        ]
          .filter(Boolean)
          .join('\n'),

        // Consents (required, already validated)
        ack_age: consents[0],
        ack_underage_ok: consents[1],
        ack_sober: consents[2],
        ack_truthful: consents[3],
        ack_permanent: consents[4],
        ack_placement: consents[5],
        ack_qs_answered: consents[6],
        ack_restrictions: consents[7],
        ack_hippa: consents[8],
        ack_fda_notice: consents[9],
        ack_infection_signs: consents[10],
        ack_infection_risk: consents[11],
        ack_seek_medical: consents[12],
        ack_aftercare_negligence: consents[13],
        ack_lightheaded: consents[14],
        ack_notify_artist: consents[15],
        ack_risks_assumed: consents[16],

        // Optional
        opt_photo: optPhoto,
        opt_email: true, // you can remove if not needed

        // Follow-up
        send_aftercare: sendAftercare,

        // Meta
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
        timestamp_iso: new Date().toISOString(),
      };

      const r = await fetch('/api/waiver', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await r.json().catch(() => ({}));
      if (!r.ok || !json?.ok) {
        console.error('Submit error', json);
        setResult('Something went wrong saving your waiver. Please try again.');
      } else {
        setResult(`Waiver submitted! Your ID: ${json.waiver_id || waiver_id}`);
        // Optionally scroll to top or show a nicer success view
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) {
      console.error(err);
      setResult('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  /* -------------------------------- Render ------------------------------- */

  return (
    <main
      className="mx-auto max-w-3xl px-4 pb-24 pt-8"
      suppressHydrationWarning
    >
      <h1 className="text-2xl font-bold">Broken Art Tattoo — Digital Waiver</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Please complete this release form. Fields with * are required.
      </p>

      {result ? (
        <div className="mt-4 rounded-lg border bg-green-50 px-4 py-3 text-green-900">{result}</div>
      ) : null}

      <form className="mt-6 space-y-8" onSubmit={handleSubmit}>
        {/* ----------------------------- Client Info ----------------------------- */}
        <Section title="Client Info">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Name *" required>
              <Input full value={clientName} onChange={(e) => setClientName(e.target.value)} />
            </Field>
            <Field label="Date of Birth">
              <Input
                type="date"
                full
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </Field>
            <Field label="Email *" required>
              <Input
                type="email"
                full
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </Field>
            <Field label="Phone">
              <Input full value={phone} onChange={(e) => setPhone(e.target.value)} />
            </Field>
            <Field label="Address">
              <Input
                full
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2 sm:col-span-2">
              <Field label="Emergency Contact">
                <Input
                  full
                  value={emergencyName}
                  onChange={(e) => setEmergencyName(e.target.value)}
                />
              </Field>
              <Field label="Emergency Phone">
                <Input
                  full
                  value={emergencyPhone}
                  onChange={(e) => setEmergencyPhone(e.target.value)}
                />
              </Field>
            </div>
          </div>
        </Section>

        {/* ------------------------------- ID -------------------------------- */}
        <Section title="Identification">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type of ID Provided">
              <Select
                full
                value={idType}
                onChange={(e) => setIdType(e.target.value as IdType)}
              >
                {idTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Upload photo of the ID (front)">
              <Input
                type="file"
                accept="image/*"
                full
                onChange={(e) => setIdFile(e.target.files?.[0] || null)}
              />
            </Field>
          </div>
        </Section>

        {/* ---------------------------- Procedure ---------------------------- */}
        <Section title="Procedure">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Type">
              <Select
                full
                value={procedureType}
                onChange={(e) => setProcedureType(e.target.value as ProcedureType)}
              >
                {procedureTypes.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Practitioner">
              <Select
                full
                value={practitioner}
                onChange={(e) => setPractitioner(e.target.value)}
              >
                {practitionerOptions.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Procedure Site">
              <Input
                full
                value={procedureSite}
                onChange={(e) => setProcedureSite(e.target.value)}
              />
            </Field>
            <Field label="Description of Procedure">
              <Input
                full
                value={procedureDesc}
                onChange={(e) => setProcedureDesc(e.target.value)}
              />
            </Field>
          </div>
        </Section>

        {/* ------------------------ Medical History (grid) ------------------------ */}
        <Section title="Medical History">
          <p className="mb-3 text-sm text-zinc-600">
            Please check any conditions below that apply to you.
          </p>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {(
              [
                ['TB', 'TB'],
                ['Asthma', 'Asthma'],
                ['EczemaPsoriasis', 'Eczema/Psoriasis'],
                ['Gonorrhea', 'Gonorrhea'],
                ['HIV', 'HIV'],
                ['Hepatitis', 'Hepatitis'],
                ['HeartConditions', 'Heart Conditions'],
                ['Syphilis', 'Syphilis'],
                ['Herpes', 'Herpes'],
                ['SkinConditions', 'Skin Conditions'],
                ['PregnantNursing', 'Pregnant/Nursing'],
                ['MRSAStaph', 'MRSA/Staph Infections'],
                ['Diabetes', 'Diabetes'],
                ['BloodThinners', 'Blood Thinners'],
                ['FaintingDizziness', 'Fainting/Dizziness'],
                ['LatexAllergies', 'Latex Allergies'],
                ['Epilepsy', 'Epilepsy'],
                ['Hemophilia', 'Hemophilia'],
                ['ScarringKeloiding', 'Scarring/Keloiding'],
                ['AntibioticAllergies', 'Antibiotic Allergies'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border"
                  checked={(mh as any)[key]}
                  onChange={(e) => setMh((m) => ({ ...m, [key]: e.target.checked }))}
                  suppressHydrationWarning
                />
                {label}
              </label>
            ))}
          </div>

          {/* Clean stacked free-text follow-ups (mobile friendly) */}
          <div className="mt-6 space-y-4">
            <Field label="How long has it been since you last ate?">
              <Input full value={lastAte} onChange={(e) => setLastAte(e.target.value)} />
            </Field>

            <Field label="Any allergies (metals, soaps, cosmetics, alcohol)?">
              <Textarea full value={allergies} onChange={(e) => setAllergies(e.target.value)} />
            </Field>

            <Field label="Medications that may affect healing?">
              <Textarea full value={medications} onChange={(e) => setMedications(e.target.value)} />
            </Field>

            <Field label="History of herpes at the procedure site?">
              <Input
                full
                value={herpesHistory}
                onChange={(e) => setHerpesHistory(e.target.value)}
              />
            </Field>

            <Field label="Other medical or skin conditions affecting the outcome?">
              <Textarea
                full
                value={otherConditions}
                onChange={(e) => setOtherConditions(e.target.value)}
              />
            </Field>

            <Field label="Prescribed antibiotics prior to dental/surgical procedures?">
              <Input
                full
                value={antibioticsHistory}
                onChange={(e) => setAntibioticsHistory(e.target.value)}
              />
            </Field>

            <Field label="Cardiac valve disease?">
              <Input full value={cardiacValve} onChange={(e) => setCardiacValve(e.target.value)} />
            </Field>

            <Field label="Anything else your artist should know?">
              <Textarea full value={extraInfo} onChange={(e) => setExtraInfo(e.target.value)} />
            </Field>
          </div>
        </Section>

        {/* ------------------------- Informed Consent ------------------------- */}
        <Section title="Informed Consent to Receive Body Art">
          <p className="mb-3 text-sm text-zinc-600">
            Please read and check each box when you are certain you understand the implications of
            signing. <strong>Broken Art Tattoo</strong>.
          </p>

          <div className="space-y-3">
            <div className="rounded-md border bg-zinc-50 px-3 py-2 text-sm">
              <strong>NOTICE:</strong> Tattoo inks, dyes, and pigments that have not been approved by
              the federal Food and Drug Administration have health consequences that are unknown.
            </div>

            {consentItems.map((text, idx) => (
              <Check
                key={idx}
                checked={consents[idx]}
                onChange={(v) =>
                  setConsents((arr) => {
                    const copy = arr.slice();
                    copy[idx] = v;
                    return copy;
                  })
                }
                label={text}
                required
              />
            ))}
          </div>

          {/* Optional consents */}
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            <Check
              checked={optPhoto}
              onChange={setOptPhoto}
              label="You may photograph the work for portfolio/social (optional)."
            />
            <Check
              checked={sendAftercare}
              onChange={setSendAftercare}
              label="Send me the aftercare email for this procedure."
            />
          </div>
        </Section>

        {/* ------------------------------ Signature ------------------------------ */}
        <Section title="Signature">
          <p className="text-sm text-zinc-600">Sign with your finger (mobile) or mouse/trackpad.</p>
          <div className="mt-2 rounded-xl border bg-white">
            <canvas
              ref={sig.canvasRef}
              className="block h-40 w-full rounded-xl touch-none"
              suppressHydrationWarning
            />
          </div>
          <div className="mt-2">
            <button
              type="button"
              onClick={sig.clear}
              className="rounded-xl border px-3 py-1 text-sm hover:bg-zinc-50"
            >
              Clear signature
            </button>
          </div>
        </Section>

        {/* -------------------------------- Submit ------------------------------- */}
        <div className="flex items-center justify-between">
          <p className="text-xs text-zinc-600">
            By submitting I certify the above is true and I agree to the studio policies.
          </p>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-2xl bg-black px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
          >
            {submitting ? 'Submitting…' : 'Submit Waiver'}
          </button>
        </div>
      </form>
    </main>
  );
}
