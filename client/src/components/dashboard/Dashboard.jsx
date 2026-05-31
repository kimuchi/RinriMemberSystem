import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../../utils/api';
import { useApp } from '../../App';
import Icon from '../Icon';
import './Dashboard.css';

export default function Dashboard() {
  const { unitName } = useApp();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    try {
      const d = await api.getDashboard();
      setData(d);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return <div style={{ display: 'flex', justifyContent: 'center', padding: '4rem' }}><div className="spinner" /></div>;
  }

  if (!data) {
    return <div className="empty-state"><Icon name="error_outline" /><p>データの取得に失敗しました</p></div>;
  }

  const { cards = [], counts = {}, statusBreakdown, recentEvents, typeStats } = data;

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1 className="page-title">{unitName}</h1>
        <p className="page-subtitle">ダッシュボード</p>
      </div>

      {/* Stat Cards */}
      {cards.length > 0 && (
        <div className="stat-grid">
          {cards.map(card => (
            <div key={card.id} className={`stat-card stat-${card.color || 'muted'}`}>
              <div className="stat-icon"><Icon name={card.icon || 'group'} size={28} /></div>
              <div className="stat-value">{card.count}</div>
              <div className="stat-label">{card.label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="dashboard-grid">
        {/* Status Breakdown */}
        <div className="card">
          <div className="card-header">
            <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>入会ステータス別</h2>
            <Link to="/members" style={{ fontSize: 'var(--font-size-xs)' }}>名簿を見る →</Link>
          </div>
          <div className="card-body">
            {Object.entries(statusBreakdown).length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>まだデータがありません</p>
            ) : (
              <div className="status-bars">
                {Object.entries(statusBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => (
                    <div key={status} className="status-bar-row">
                      <span className="status-bar-label">{status}</span>
                      <div className="status-bar-track">
                        <div
                          className="status-bar-fill"
                          style={{ width: `${(count / counts.total) * 100}%` }}
                        />
                      </div>
                      <span className="status-bar-count">{count}</span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* Recent Events */}
        <div className="card">
          <div className="card-header">
            <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>最近のイベント</h2>
            <Link to="/events" style={{ fontSize: 'var(--font-size-xs)' }}>すべて見る →</Link>
          </div>
          <div className="card-body">
            {recentEvents.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontSize: 'var(--font-size-sm)' }}>まだイベントがありません</p>
            ) : (
              <div className="event-list-mini">
                {recentEvents.map(e => (
                  <Link key={e.id} to={`/events/${e.id}`} className="event-mini-item">
                    <div>
                      <div className="event-mini-name">{e.name}</div>
                      <div className="event-mini-meta">
                        {e.type && <span className="badge badge-primary">{e.type}</span>}
                        <span>{e.date}</span>
                      </div>
                    </div>
                    <div className="event-mini-att">
                      <Icon name="people" size={16} />
                      <span>{e.attendees}/{e.total}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Event Type Stats */}
        {typeStats.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 style={{ fontSize: 'var(--font-size-base)', fontWeight: 600 }}>種類別参加率</h2>
            </div>
            <div className="card-body">
              <div className="type-stats">
                {typeStats.map(ts => (
                  <div key={ts.type} className="type-stat-item">
                    <div className="type-stat-header">
                      <span className="type-stat-name">{ts.type}</span>
                      <span className="type-stat-rate">{ts.rate}%</span>
                    </div>
                    <div className="type-stat-bar">
                      <div className="type-stat-fill" style={{ width: `${ts.rate}%` }} />
                    </div>
                    <div className="type-stat-meta">{ts.events}件のイベント</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
