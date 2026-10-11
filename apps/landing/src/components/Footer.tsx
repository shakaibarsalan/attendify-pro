import styles from './Footer.module.css';
import AttendifyWordmark from './AttendifyWordmark';

const quickLinks = [
  { label: 'Features', href: '#features' },
  { label: 'How It Works', href: '#how-it-works' },
  { label: 'Security', href: '#security' },
  { label: 'Pricing', href: '#pricing' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Contact', href: '#contact' },
];

const legalLinks = [
  { label: 'Documentation', href: '/docs' },
  { label: 'Privacy Policy', href: '/privacy' },
  { label: 'Terms of Service', href: '/terms' },
];

export default function Footer() {
  return (
    <footer className={styles.siteFooter}>
      <div className="container">
        <div className={styles.footerGrid}>
          <div className={styles.footerBrand}>
            <a href="#" className={styles.footerLogo}>
              <AttendifyWordmark size={20} />
            </a>
            <p className={styles.footerTagline}>
              AI-powered attendance tracking for modern universities.
            </p>
            <a
              href="mailto:info@attendify.pro"
              className={styles.footerLink}
              style={{ display: 'inline-block', marginTop: 12, fontWeight: 600 }}
            >
              info@attendify.pro
            </a>
          </div>

          <div className={styles.footerColumn}>
            <h4 className={styles.footerColumnTitle}>Quick Links</h4>
            <ul className={styles.footerLinks}>
              {quickLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className={styles.footerLink}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className={styles.footerColumn}>
            <h4 className={styles.footerColumnTitle}>Legal</h4>
            <ul className={styles.footerLinks}>
              {legalLinks.map((link) => (
                <li key={link.label}>
                  <a href={link.href} className={styles.footerLink}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={styles.footerBottom}>
          <span>&copy; {new Date().getFullYear()} Attendify. All rights reserved.</span>
        </div>
      </div>
    </footer>
  );
}
