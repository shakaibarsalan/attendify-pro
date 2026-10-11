import { useState, useEffect } from 'react';
import styles from './Navbar.module.css';
import AttendifyWordmark from './AttendifyWordmark';

// The landing "Launch App" entry point is the Organization portal.
const appUrl = `https://${window.location.hostname}/login/org-admin`;

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const closeMobile = () => setMobileOpen(false);

  return (
    <>
      <header className={`${styles.attendifyNavbar} ${scrolled ? styles.scrolled : ''}`}>
        <nav className={styles.navInner}>
            <a href="#" className={styles.logo}>
              <AttendifyWordmark size={22} />
            </a>

            <ul className={styles.navLinks}>
              <li><a href="#how-it-works" onClick={closeMobile}>How It Works</a></li>
              <li><a href="#features" onClick={closeMobile}>Features</a></li>
              <li><a href="#security" onClick={closeMobile}>Security</a></li>
              <li><a href="#pricing" onClick={closeMobile}>Pricing</a></li>
              <li><a href="#faq" onClick={closeMobile}>FAQ</a></li>
            </ul>

            <a href={appUrl} className={styles.loginBtn}>
              Launch App
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
              </svg>
            </a>

            <button className={`${styles.mobileToggle} ${mobileOpen ? styles.open : ''}`} onClick={() => setMobileOpen(!mobileOpen)} aria-label="Menu">
              <span /><span /><span />
            </button>
        </nav>
      </header>

      <div className={`${styles.mobileMenu} ${mobileOpen ? styles.open : ''}`}>
        <a href="#how-it-works" onClick={closeMobile}>How It Works</a>
        <a href="#features" onClick={closeMobile}>Features</a>
        <a href="#security" onClick={closeMobile}>Security</a>
        <a href="#pricing" onClick={closeMobile}>Pricing</a>
        <a href="#faq" onClick={closeMobile}>FAQ</a>
        <a href="#contact" onClick={closeMobile}>Contact</a>
        <a href={appUrl} className={styles.mobileLoginBtn} onClick={closeMobile}>Launch App</a>
      </div>
    </>
  );
}
