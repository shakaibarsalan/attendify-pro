import LegalLayout, { type LegalSection } from './LegalLayout';

const sections: LegalSection[] = [
  {
    heading: 'Scope of this Policy',
    body:
      'This Privacy Policy explains how Attendify (the "Service") collects, uses, and protects information when an ' +
      'institution and its users use the Service to record and manage attendance. Each institution that adopts Attendify ' +
      'acts as the controller of its own data; Attendify processes that data on the institution\'s behalf.',
  },
  {
    heading: 'Information We Collect',
    body:
      '• Account information — your name, the email address issued by your institution (and an optional personal email), ' +
      'your role, and, for students, a registration number.\n' +
      '• Attendance records — the sessions you attend, the time of marking, and the verification method used.\n' +
      '• Biometric data — if you choose to use biometric check-in, a mathematical face representation and/or a processed ' +
      'fingerprint template (see "How We Handle Biometric Data").\n' +
      '• Technical signals — to detect fraud, limited technical data such as a device fingerprint and IP address may be ' +
      'recorded for an attendance attempt.',
  },
  {
    heading: 'How We Handle Biometric Data',
    body:
      'Attendify does NOT store raw photographs of your face or fingerprint. Instead it stores a one-way mathematical ' +
      'representation — a numeric "embedding" for faces and a processed ridge-pattern template for fingerprints — from ' +
      'which the original image cannot be reconstructed. Biometric data is kept in a separate, access-controlled database, ' +
      'is transmitted only over encrypted HTTPS connections, and is used solely to verify your identity when marking ' +
      'attendance. You provide this data only by explicitly enrolling, and you may request its deletion.',
  },
  {
    heading: 'How We Use Information',
    body:
      'Information is used to provide the Service: to authenticate users, to verify identity and presence when marking ' +
      'attendance, to prevent proxy and fraudulent attendance, to produce attendance reports and analytics for your ' +
      'institution, and to maintain the security and reliability of the platform.',
  },
  {
    heading: 'Data Sharing',
    body:
      'Your data is visible only within your own institution and to the platform operator for the purpose of running the ' +
      'Service. Attendify does not sell your data. Where your institution chooses to integrate Attendify with its own ' +
      'systems (for example, a student-information system) through the optional API, data is shared only as the institution ' +
      'configures and authorizes.',
  },
  {
    heading: 'Data Retention',
    body:
      'Account and attendance data is retained for as long as your institution maintains its account and as required by ' +
      'its academic and compliance policies. Biometric templates are retained only while you remain enrolled in biometric ' +
      'check-in and are removed when you or your institution delete them.',
  },
  {
    heading: 'Security',
    body:
      'Attendify protects data with encrypted (HTTPS) connections, hashed passwords, role-based access control, strict ' +
      'separation of each institution\'s data, a dedicated and access-controlled biometric database, audit logging, and ' +
      'automated fraud detection. No system is perfectly secure, but these measures are designed to reduce risk and the ' +
      'impact of any incident.',
  },
  {
    heading: 'Your Rights and Consent',
    body:
      'Biometric enrollment is voluntary and requires your consent. You may view your attendance records, update your ' +
      'personal email, and request deletion of your biometric data through your institution. Depending on your location, ' +
      'you may have additional rights under applicable data-protection law; please contact your institution to exercise them.',
  },
  {
    heading: 'Changes to this Policy',
    body:
      'We may update this Policy from time to time. Material changes will be reflected by updating the "Last updated" date ' +
      'above. Continued use of the Service after an update constitutes acceptance of the revised Policy.',
  },
];

export default function PrivacyPage() {
  return (
    <LegalLayout
      title="Privacy Policy"
      updated="June 2026"
      intro="Your privacy matters. This page explains, in plain language, what information Attendify collects, how biometric data is protected, and the choices you have."
      sections={sections}
    />
  );
}
