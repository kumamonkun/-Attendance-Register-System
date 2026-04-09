import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

const SESSION_KEY = 'active_session';

function readStoredSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY)) || null;
  } catch {
    return null;
  }
}

function formatTimeLeft(seconds) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function SessionDisplay() {
  const [session, setSession] = useState(() => readStoredSession());
  const [timeLeft, setTimeLeft] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(Boolean(document.fullscreenElement));
  const [fullscreenError, setFullscreenError] = useState('');

  useEffect(() => {
    const syncSession = () => {
      const nextSession = readStoredSession();
      setSession((current) => {
        if (nextSession) return nextSession;
        if (current) return { ...current, active: false };
        return null;
      });
    };
    const onStorage = (event) => {
      if (event.key === SESSION_KEY) syncSession();
    };

    window.addEventListener('storage', onStorage);
    window.addEventListener('focus', syncSession);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('focus', syncSession);
    };
  }, []);

  useEffect(() => {
    const updateFullscreenState = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', updateFullscreenState);
    return () => document.removeEventListener('fullscreenchange', updateFullscreenState);
  }, []);

  useEffect(() => {
    if (!session?.active) {
      setTimeLeft(0);
      return;
    }

    const tick = () => {
      const secondsLeft = Math.max(0, Math.round((new Date(session.expiresAt) - Date.now()) / 1000));
      setTimeLeft(secondsLeft);
      if (secondsLeft === 0) {
        setSession((current) => current ? { ...current, active: false } : null);
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [session?.id, session?.expiresAt, session?.active]);

  const status = useMemo(() => {
    if (!session) return 'missing';
    if (!session.active) return 'closed';
    if (new Date() > new Date(session.expiresAt)) return 'expired';
    return 'live';
  }, [session]);

  const requestFullscreen = async () => {
    setFullscreenError('');

    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }

      if (document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
        return;
      }

      setFullscreenError('Fullscreen is not supported in this browser.');
    } catch {
      setFullscreenError('Fullscreen was blocked. Try allowing it from this window.');
    }
  };

  return (
    <div className="session-display-page">
      <div className="session-display-shell">
        <div className="session-display-toolbar">
          <span className={`session-display-pill ${status === 'live' ? 'live' : 'inactive'}`}>
            {status === 'live' ? 'Live session' : status === 'missing' ? 'No active session' : 'Session ended'}
          </span>
          <div className="session-display-actions">
            <button className="btn" onClick={requestFullscreen}>
              {isFullscreen ? 'Exit Fullscreen' : 'Open Fullscreen'}
            </button>
            <Link className="btn" to="/session">Back to Session</Link>
          </div>
        </div>

        {!session ? (
          <div className="session-display-empty">
            <h1>No active session</h1>
            <p>Start a session first, then open this display window to show the live QR code to students.</p>
          </div>
        ) : (
          <div className="session-display-content">
            <div className="session-display-meta">
              <p className="session-display-label">Attendance Register</p>
              <h1>{session.courseCode}</h1>
              <p className="session-display-course-name">{session.courseName}</p>
            </div>

            <div className="session-display-card">
              {status === 'live' ? (
                <>
                  <img src={session.qrDataUrl} alt={`Live QR code for ${session.courseCode}`} className="session-display-qr" />
                  <div className="session-display-code">{session.sessionCode}</div>
                  <p className="session-display-hint">Students scan this code and enter their student ID</p>
                </>
              ) : (
                <div className="session-display-ended">
                  <div className="session-display-ended-icon">Session Closed</div>
                  <p>
                    {status === 'expired'
                      ? 'This attendance session has expired.'
                      : 'This attendance session is no longer active.'}
                  </p>
                </div>
              )}
            </div>

            <div className="session-display-footer">
              <div className="session-display-countdown">
                <span>Time remaining</span>
                <strong>{status === 'live' ? formatTimeLeft(timeLeft) : '0:00'}</strong>
              </div>
              <p className="session-display-note">
                QR updates automatically with the live session. Keep this window open while the class is checking in.
              </p>
            </div>
          </div>
        )}

        {fullscreenError && <p className="session-display-error">{fullscreenError}</p>}
      </div>
    </div>
  );
}
