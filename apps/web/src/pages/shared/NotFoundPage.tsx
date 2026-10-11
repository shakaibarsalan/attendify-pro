import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Home, Compass } from 'lucide-react';
import styles from './NotFoundPage.module.css';

interface Props {
  title?: string;
  message?: string;
  code?: string;
}

export default function NotFoundPage({ title, message, code = '404' }: Props) {
  const navigate = useNavigate();

  return (
    <div className={styles.screen}>
      <div className={styles.glowA} aria-hidden="true" />
      <div className={styles.glowB} aria-hidden="true" />

      <div className={styles.card}>
        <div className={styles.badge}>
          <Compass size={15} strokeWidth={2.2} />
          Attendify
        </div>

        <div className={styles.code}>{code}</div>

        <h1 className={styles.heading}>{title || 'Page not found'}</h1>
        <p className={styles.message}>
          {message ||
            "The page you're looking for doesn't exist or may have been moved. Let's get you back on track."}
        </p>

        <div className={styles.actions}>
          <button onClick={() => navigate('/')} className={styles.btnPrimary}>
            <Home size={17} strokeWidth={2.2} />
            Back to home
          </button>
          <button onClick={() => navigate(-1)} className={styles.btnGhost}>
            <ArrowLeft size={17} strokeWidth={2.2} />
            Go back
          </button>
        </div>
      </div>
    </div>
  );
}
