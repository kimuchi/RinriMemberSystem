import React, { useState } from 'react';
import { api } from '../../utils/api';
import Icon from '../Icon';

export default function SetupPage({ user, onComplete }) {
  const [unitName, setUnitName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e) {
    e.preventDefault();
    if (!unitName.trim()) {
      setError('単会名を入力してください');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.setup(unitName.trim());
      onComplete(unitName.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

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
        maxWidth: 480,
        width: '100%',
        boxShadow: 'var(--shadow-lg)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <Icon name="celebration" size={48} />
          <h1 style={{ fontSize: 'var(--font-size-xl)', fontWeight: 700, margin: '1rem 0 0.5rem' }}>
            初回セットアップ
          </h1>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
            {user.name} さん、ようこそ！<br />
            あなたがこのシステムのオーナーとして登録されました。<br />
            まず、単会名を設定してください。
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">単会名</label>
            <input
              type="text"
              className="form-input"
              placeholder="例：丸の内倫理法人会"
              value={unitName}
              onChange={e => setUnitName(e.target.value)}
              autoFocus
            />
          </div>

          {error && (
            <div style={{
              color: 'var(--color-danger)',
              fontSize: 'var(--font-size-sm)',
              marginBottom: 'var(--space-md)',
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{ width: '100%', padding: '0.75rem', fontSize: 'var(--font-size-base)' }}
          >
            {loading ? '設定中...' : 'セットアップを完了する'}
          </button>
        </form>
      </div>
    </div>
  );
}
