const API_BASE = '';

async function apiFetch(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
  });
  if (res.status === 401) {
    window.location.href = '/auth/login';
    throw new Error('認証が必要です');
  }
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'エラーが発生しました');
  return data;
}

export const api = {
  // Auth
  getMe: () => apiFetch('/auth/me'),
  setup: (unitName) => apiFetch('/auth/setup', { method: 'POST', body: JSON.stringify({ unitName }) }),

  // Dashboard
  getDashboard: () => apiFetch('/api/dashboard'),

  // Members
  getMembers: () => apiFetch('/api/members'),
  getMember: (id) => apiFetch(`/api/members/${id}`),
  addMember: (data) => apiFetch('/api/members', { method: 'POST', body: JSON.stringify(data) }),
  updateMember: (id, data) => apiFetch(`/api/members/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateMemberStatus: (id, field, value) =>
    apiFetch(`/api/members/${id}/status`, { method: 'PATCH', body: JSON.stringify({ field, value }) }),
  deleteMember: (id) => apiFetch(`/api/members/${id}`, { method: 'DELETE' }),

  // Events
  getEvents: () => apiFetch('/api/events'),
  getEvent: (id) => apiFetch(`/api/events/${id}`),
  addEvent: (data) => apiFetch('/api/events', { method: 'POST', body: JSON.stringify(data) }),
  updateEvent: (id, data) => apiFetch(`/api/events/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteEvent: (id) => apiFetch(`/api/events/${id}`, { method: 'DELETE' }),
  addAttendance: (eventId, data) =>
    apiFetch(`/api/events/${eventId}/attendance`, { method: 'POST', body: JSON.stringify(data) }),
  updateAttendance: (eventId, attId, data) =>
    apiFetch(`/api/events/${eventId}/attendance/${attId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAttendance: (eventId, attId) =>
    apiFetch(`/api/events/${eventId}/attendance/${attId}`, { method: 'DELETE' }),
  getEventTypes: () => apiFetch('/api/events/types'),

  // Settings
  getUsers: () => apiFetch('/api/settings/users'),
  addUser: (data) => apiFetch('/api/settings/users', { method: 'POST', body: JSON.stringify(data) }),
  deleteUser: (id) => apiFetch(`/api/settings/users/${id}`, { method: 'DELETE' }),

  getStatuses: () => apiFetch('/api/settings/statuses'),
  addStatus: (data) => apiFetch('/api/settings/statuses', { method: 'POST', body: JSON.stringify(data) }),
  updateStatus: (rowIndex, data) => apiFetch(`/api/settings/statuses/${rowIndex}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteStatus: (rowIndex) => apiFetch(`/api/settings/statuses/${rowIndex}`, { method: 'DELETE' }),

  // Custom fields
  getCustomFields: () => apiFetch('/api/settings/custom-fields'),
  addCustomField: (data) => apiFetch('/api/settings/custom-fields', { method: 'POST', body: JSON.stringify(data) }),
  updateCustomField: (id, data) => apiFetch(`/api/settings/custom-fields/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCustomField: (id) => apiFetch(`/api/settings/custom-fields/${id}`, { method: 'DELETE' }),
  addCustomFieldOption: (fieldId, data) =>
    apiFetch(`/api/settings/custom-fields/${fieldId}/options`, { method: 'POST', body: JSON.stringify(data) }),
  deleteCustomFieldOption: (fieldId, rowIndex) =>
    apiFetch(`/api/settings/custom-fields/${fieldId}/options/${rowIndex}`, { method: 'DELETE' }),

  getEventTypeSettings: () => apiFetch('/api/settings/event-types'),
  addEventType: (data) => apiFetch('/api/settings/event-types', { method: 'POST', body: JSON.stringify(data) }),
  deleteEventType: (rowIndex) => apiFetch(`/api/settings/event-types/${rowIndex}`, { method: 'DELETE' }),

  getGeneral: () => apiFetch('/api/settings/general'),
  updateGeneral: (data) => apiFetch('/api/settings/general', { method: 'PUT', body: JSON.stringify(data) }),
};
