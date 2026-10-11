import LegalLayout, { type LegalSection } from './LegalLayout';

const sections: LegalSection[] = [
  {
    heading: 'Acceptance of Terms',
    body:
      'By accessing or using Attendify (the "Service"), you agree to these Terms of Service. If you are using the Service ' +
      'on behalf of an institution, you represent that you are authorized to accept these Terms for that institution.',
  },
  {
    heading: 'Description of the Service',
    body:
      'Attendify is a multi-tenant smart attendance system that verifies student presence using biometric methods (face ' +
      'and/or contactless fingerprint), liveness and anti-spoofing checks, and an optional live-QR presence gate, together ' +
      'with attendance management, reporting, and administration tools for institutions.',
  },
  {
    heading: 'Accounts and Eligibility',
    body:
      'Accounts are provisioned by institutions for their administrators, teachers, and students. You are responsible for ' +
      'keeping your credentials confidential and for activity under your account. You must provide accurate information and ' +
      'use the Service only for legitimate academic attendance purposes.',
  },
  {
    heading: 'Acceptable Use',
    body:
      'You agree not to: attempt to mark attendance for another person or assist proxy attendance; attempt to bypass, ' +
      'spoof, or defeat the verification checks; upload another person\'s biometric data; probe, scan, or disrupt the ' +
      'Service or its security; or use the Service in violation of applicable law or your institution\'s policies.',
  },
  {
    heading: 'Biometric Enrollment Consent',
    body:
      'Biometric check-in is optional and requires your explicit enrollment. By enrolling, you consent to the creation and ' +
      'use of a non-reversible biometric template for the sole purpose of verifying your identity when marking attendance, ' +
      'as described in the Privacy Policy. You may withdraw consent and request deletion of your biometric data.',
  },
  {
    heading: 'Subscriptions and Plans',
    body:
      'Institutions may subscribe to Attendify under tiered plans with defined limits. Plan features, limits, and any fees ' +
      'are presented at the time of selection. Misuse or exceeding plan limits may result in restricted access.',
  },
  {
    heading: 'Intellectual Property',
    body:
      'The Service, including its software, design, and content, is the property of Attendify and its licensors and is ' +
      'protected by applicable laws. These Terms do not grant you any right to copy, modify, or distribute the Service ' +
      'except as necessary to use it as intended.',
  },
  {
    heading: 'Disclaimers',
    body:
      'The Service is provided "as is" and "as available". While Attendify is designed for high accuracy and reliability, ' +
      'no biometric or automated system is perfect; institutions remain responsible for their attendance decisions and ' +
      'should provide a reasonable process to review and correct records.',
  },
  {
    heading: 'Limitation of Liability',
    body:
      'To the maximum extent permitted by law, Attendify shall not be liable for any indirect, incidental, or consequential ' +
      'damages arising from the use of, or inability to use, the Service. Nothing in these Terms excludes liability that ' +
      'cannot be excluded by law.',
  },
  {
    heading: 'Termination',
    body:
      'An institution may stop using the Service at any time. We may suspend or terminate access for breach of these Terms ' +
      'or to protect the Service and its users. Upon termination, data is handled in accordance with the Privacy Policy and ' +
      'the institution\'s instructions.',
  },
  {
    heading: 'Changes and Contact',
    body:
      'We may update these Terms from time to time; material changes are reflected by updating the "Last updated" date. ' +
      'For questions about these Terms, please reach out through the contact section on our home page.',
  },
];

export default function TermsPage() {
  return (
    <LegalLayout
      title="Terms of Service"
      updated="June 2026"
      intro="These Terms govern your use of Attendify. Please read them carefully — they cover acceptable use, biometric enrollment consent, and the responsibilities of institutions and users."
      sections={sections}
    />
  );
}
