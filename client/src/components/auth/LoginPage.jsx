import React, { useState, useEffect } from 'react';
import { api } from '../../utils/api';
import Icon from '../Icon';

export default function LoginPage() {
  const params = new URLSearchParams(window.location.search);
  const error = params.get('error');
  const [unitName, setUnitName] = useState(null);

  useEffect(() => {
    api.getPublicInfo().then(res => {
      if (res.unitName) {
        setUnitName(res.unitName);
        document.title = `${res.unitName} 会員管理システム`;
      }
    }).catch(() => {});
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #1a5276 0%, #2980b9 100%)',
      padding: 'var(--space-lg)',
    }}>
      <div style={{
        background: 'var(--color-surface)',
        borderRadius: 'var(--radius-xl)',
        padding: '3rem 2.5rem',
        maxWidth: 420,
        width: '100%',
        textAlign: 'center',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <Icon name="groups" size={48} className="" />
        </div>
        <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, marginBottom: '0.5rem' }}>
          {unitName || '倫理法人会'}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginBottom: '2rem', fontSize: 'var(--font-size-sm)' }}>
          会員管理システム
        </p>

        {error === 'not_registered' && (
          <div style={{
            background: 'var(--color-danger-bg)',
            color: 'var(--color-danger)',
            padding: '0.75rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            fontSize: 'var(--font-size-sm)',
          }}>
            このアカウントはシステムに登録されていません。<br />
            管理者にお問い合わせください。
          </div>
        )}

        {error === 'auth_failed' && (
          <div style={{
            background: 'var(--color-warning-bg)',
            color: 'var(--color-warning)',
            padding: '0.75rem',
            borderRadius: 'var(--radius-md)',
            marginBottom: '1.5rem',
            fontSize: 'var(--font-size-sm)',
          }}>
            ログインに失敗しました。もう一度お試しください。
          </div>
        )}

        <a
          href="/auth/login"
          className="btn btn-primary"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            padding: '0.75rem 1.5rem',
            width: '100%',
            fontSize: 'var(--font-size-base)',
          }}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Googleアカウントでログイン
        </a>
      </div>
    </div>
  );
}
