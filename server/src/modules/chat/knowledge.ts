// Public, user-facing knowledge base for the Attendify landing-page assistant and
// the /docs page. This file intentionally contains NO personal or private data
// (no names, registration numbers, server IPs, credentials, demo passwords, API
// keys, or internal secrets) — only information that is useful and safe to share
// with prospective users, students, teachers, and administrators.

export interface KnowledgeSection {
  id: string;
  title: string;
  body: string;
}

export const KNOWLEDGE_SECTIONS: KnowledgeSection[] = [
  {
    id: 'overview',
    title: 'What is Attendify?',
    body:
      'Attendify is an AI-powered smart attendance system for universities and colleges. ' +
      'Instead of roll-calls, sign-in sheets, cards, or shareable QR codes — all of which can be faked by a friend — ' +
      'Attendify confirms that the genuine, enrolled student is physically present and is a real, live person. ' +
      'It is delivered as a secure online service (multi-tenant SaaS): one platform can serve many institutions at once, ' +
      "with each institution's data kept strictly separate. It works for physical, hybrid, and fully online classes, and " +
      'requires no special hardware in the classroom — students simply use their own phone or laptop camera.',
  },
  {
    id: 'how-it-works',
    title: 'How marking attendance works (for students)',
    body:
      'When a teacher opens a lecture session, the student marks attendance in seconds:\n' +
      '1. If the teacher turns on the live-QR presence check, the student scans the rotating QR code shown on the ' +
      "teacher's screen or projector (using the in-app scanner, the phone camera, or Google Lens). This proves the " +
      'student is actually in the room.\n' +
      '2. The student then confirms their identity with a quick biometric check — either a face scan (with a short ' +
      'liveness gesture) or a contactless fingerprint scan using the rear camera.\n' +
      '3. If everything passes, attendance is marked instantly and appears on the live roster. If a check fails, it is ' +
      'rejected and a fraud alert is raised for the teacher to review.',
  },
  {
    id: 'anti-proxy',
    title: 'How Attendify stops proxy (fake) attendance',
    body:
      'Traditional systems verify a token that can be passed around (a spoken "present", a signature, a card tap, or a ' +
      'shared QR). Attendify instead layers several independent checks, so a proxy would have to defeat all of them at once:\n' +
      '• Biometric identity — the student must match their own enrolled face or fingerprint.\n' +
      '• Liveness — the student must perform a random, on-the-spot gesture, so a photo cannot pass.\n' +
      '• Anti-spoofing — the system rejects printed photos, screen replays, videos, and masks.\n' +
      '• Live-QR presence gate — a QR that rotates every few seconds proves the student is watching the live screen in ' +
      'the room; a saved or screenshotted code expires within seconds.\n' +
      '• Location & device checks — optional GPS geofencing plus duplicate-device and duplicate-IP detection catch a ' +
      'single phone trying to mark several absent friends.',
  },
  {
    id: 'biometrics',
    title: 'Face and fingerprint check-in',
    body:
      'Attendify supports two contactless biometric methods, and either one is enough to mark attendance:\n' +
      '• Face recognition — fast and accurate, using modern AI face-embedding technology, paired with a liveness ' +
      'gesture (e.g., turn your head or smile) and anti-spoofing so photos and videos are rejected.\n' +
      '• Contactless fingerprint — no special sensor needed; the student simply holds a fingertip to the rear camera ' +
      'with the flash on, and the app captures the ridge pattern. An on-device quality coach guides the capture so it ' +
      'only takes a clear, in-focus shot.\n' +
      'Students enroll once (you can add a few samples for best accuracy) and then check in any time.',
  },
  {
    id: 'presence-gate',
    title: 'The live-QR presence gate',
    body:
      'The QR code in Attendify is a presence gate, not a way to mark attendance by itself. The teacher displays a QR ' +
      'that rotates every few seconds (it can be popped out into a floating, always-on-top window so the teacher can ' +
      'keep using their slides). A student scans the current code to prove they are in the room, and then must still ' +
      'pass a biometric check. Because the code rotates so quickly, a screenshot shared with an absent friend is useless ' +
      'almost immediately — and even a valid scan cannot mark attendance without the matching face or fingerprint.',
  },
  {
    id: 'privacy',
    title: 'Your privacy and data protection',
    body:
      'Privacy is a core design goal. Attendify does NOT store raw photos of your face or fingerprint. Instead it stores ' +
      'a one-way mathematical representation (a numeric "embedding" for faces and a processed ridge-pattern template for ' +
      'fingerprints) from which the original image cannot be reconstructed. Biometric data is kept in a separate, ' +
      'access-controlled database and transmitted over encrypted HTTPS connections. Each institution sees only its own ' +
      'data. Institutions should still obtain consent for biometric enrollment and follow their local data-protection rules.',
  },
  {
    id: 'roles',
    title: 'Who uses Attendify',
    body:
      'Attendify has four roles:\n' +
      '• Student — enrolls a face and/or fingerprint and marks attendance for their own classes.\n' +
      '• Teacher — creates lecture sessions, runs the presence gate, watches the live roster, and reviews/corrects records.\n' +
      '• Organization (institution) admin — manages departments, teachers, students, courses, and enrollments, and ' +
      'reviews fraud alerts and analytics for their institution.\n' +
      '• System admin — the platform operator who onboards institutions and manages subscription plans.',
  },
  {
    id: 'teachers',
    title: 'For teachers',
    body:
      'As a teacher you can: create an attendance session for your course with a start/end window; choose which check-in ' +
      'methods are allowed (face and/or fingerprint) and whether to require the live-QR presence gate; display the ' +
      'rotating QR (and pop it out into an always-on-top window for projection); watch students appear on the live roster ' +
      'in real time, with the time each one marked; correct a record if needed (mark it verified or rejected); and export ' +
      'per-session or per-student attendance as a CSV file. When a session ends, students who did not check in are ' +
      'automatically marked absent.',
  },
  {
    id: 'students',
    title: 'For students',
    body:
      'As a student you can: enroll your face and/or contactless fingerprint once under the Biometrics section; see your ' +
      'enrolled courses and any active sessions; mark attendance by scanning the live QR (if required) and then confirming ' +
      'with face or fingerprint; and view your attendance history and per-course analytics, switching between courses with ' +
      'a single tap. You log in with the email your institution issued you (often based on your registration number) or ' +
      'your personal email, and you can keep a personal email for notifications and password recovery.',
  },
  {
    id: 'admins',
    title: 'For administrators',
    body:
      'Organization admins manage their institution end to end: add teachers and students (individually or by CSV import), ' +
      'create departments and courses, manage enrollments, set optional classroom geofences, review fraud alerts, and view ' +
      'institution-wide analytics. They can also request API access to integrate Attendify with their own ERP or ' +
      'student-information system using secure, scoped API keys and signed webhooks.',
  },
  {
    id: 'plans',
    title: 'Plans and pricing',
    body:
      'Attendify is offered in subscription tiers — Starter, Professional, Enterprise, and Unlimited — that scale with the ' +
      'number of students, teachers, and departments an institution needs, with a free trial to get started. Higher tiers ' +
      'unlock larger limits and capabilities such as API access. See the Pricing section on the home page for current ' +
      'details, or contact the team for institution-specific quotes.',
  },
  {
    id: 'getting-started',
    title: 'Getting started',
    body:
      'Institutions get started by requesting onboarding from the home page. Once an institution is set up, its admin adds ' +
      'teachers and students and creates courses. Students then log in, enroll their biometrics once, and are ready to mark ' +
      'attendance. Teachers create a session at the start of each lecture and (optionally) display the live-QR presence ' +
      'gate. No app installation is required — Attendify runs in a modern web browser.',
  },
  {
    id: 'troubleshooting',
    title: 'Tips and troubleshooting',
    body:
      '• Face not detected / "center your face": make sure your face is well-lit, fills the frame, and is centered; if ' +
      'guidance is slow you can use the on-screen Continue button.\n' +
      '• Fingerprint capture: hold your fingertip flat against the rear camera with the flash on so the ridges look sharp; ' +
      'it captures automatically once the box turns green.\n' +
      '• "QR expired": the QR rotates every few seconds, so scan the one currently on the screen, not a saved screenshot.\n' +
      '• Camera permission: allow camera access in your browser; the presence-gate pop-out and always-on-top window work ' +
      'best in Chrome or Edge.\n' +
      '• Always remember: scanning the QR alone is not enough — you must also pass the face or fingerprint check.',
  },
  {
    id: 'technology',
    title: 'Technology and reliability',
    body:
      'Attendify is fully self-hosted (it does not rely on any third-party Backend-as-a-Service). It uses AI face ' +
      'recognition with fast vector search for matching, on-device-grade liveness and anti-spoofing, and classical ' +
      'computer-vision techniques for contactless fingerprint matching. The platform runs as containerized services behind ' +
      'a secure HTTPS gateway, with automated testing and continuous deployment, real-time updates, audit logging, and ' +
      'automated fraud detection — designed to be reliable and observable at classroom scale.',
  },
];

export interface FaqItem {
  q: string;
  a: string;
}

export const FAQS: FaqItem[] = [
  {
    q: 'What is Attendify?',
    a: 'Attendify is an AI-powered smart attendance system for universities and colleges that confirms a real, enrolled student is physically present — using face or contactless-fingerprint biometrics plus a live-QR presence check — so proxy (fake) attendance becomes practically impossible.',
  },
  {
    q: 'How do I mark my attendance?',
    a: 'Open the active session, scan the live rotating QR if your teacher enabled it (proving you are in the room), then confirm your identity with a quick face scan or a contactless fingerprint. If both pass, you are marked present instantly.',
  },
  {
    q: 'How does Attendify prevent proxy attendance?',
    a: 'It layers several independent checks: your own face/fingerprint must match, a random liveness gesture defeats photos, anti-spoofing rejects screens and videos, the rotating QR proves you are in the room, and optional location/device checks catch one phone marking several friends.',
  },
  {
    q: 'Is my biometric data safe?',
    a: 'Yes. Attendify never stores raw photos of your face or fingerprint — only a one-way mathematical representation that cannot be turned back into an image. Biometric data is kept in a separate, access-controlled database and sent over encrypted HTTPS.',
  },
  {
    q: "What if my face isn't recognized or the camera won't start?",
    a: 'Make sure your face is well-lit, centered, and fills the frame, and that you allowed camera access. If guidance is slow you can use the on-screen Continue button, or switch to the contactless fingerprint method instead.',
  },
  {
    q: 'Why did my QR scan say it expired?',
    a: 'The QR rotates every few seconds for security, so a saved screenshot stops working almost immediately. Scan the code currently shown on the screen — and remember the QR alone never marks attendance; you still confirm with face or fingerprint.',
  },
  {
    q: 'Do I need to install an app?',
    a: 'No. Attendify runs in a modern web browser on your phone or laptop. The always-on-top QR pop-out for teachers works best in Chrome or Edge.',
  },
  {
    q: 'What plans are available?',
    a: 'Attendify comes in Starter, Professional, Enterprise, and Unlimited tiers that scale with your number of students, teachers, and departments, with a free trial. See the Pricing section on the home page or contact the team for a quote.',
  },
  {
    q: 'Does it work for online or hybrid classes?',
    a: 'Yes. The biometric and liveness checks work anywhere, so remote and hybrid students can be verified; location-based checks are simply relaxed for fully online classes.',
  },
  {
    q: 'How does a teacher start a session?',
    a: 'A teacher opens a session for their course with a time window, chooses the allowed methods (face/fingerprint) and whether to require the live-QR presence gate, then displays the rotating QR and watches the live roster fill in.',
  },
];

/** Flattened knowledge text used as grounding context for the assistant LLM. */
export function buildKnowledgeText(): string {
  const sections = KNOWLEDGE_SECTIONS.map((s) => `## ${s.title}\n${s.body}`).join('\n\n');
  const faqs = FAQS.map((f) => `Q: ${f.q}\nA: ${f.a}`).join('\n\n');
  return `# Attendify — Knowledge Base\n\n${sections}\n\n# Frequently Asked Questions\n\n${faqs}`;
}
