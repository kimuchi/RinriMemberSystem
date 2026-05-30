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

/**
 * バイナリレスポンス（xlsx等）をダウンロードする
 * Content-Disposition のファイル名を尊重する
 */
async function apiDownload(url, options = {}, fallbackName = 'download') {
  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
    credentials: 'include',
  });
  if (res.status === 401) {
    window.location.href = '/auth/login';
    throw new Error('認証が必要です');
  }
  if (!res.ok) {
    let msg = 'ダウンロードに失敗しました';
    try { msg = (await res.json()).error || msg; } catch (e) {}
    throw new Error(msg);
  }

  // Content-Disposition からファイル名を取り出す
  let filename = fallbackName;
  const disp = res.headers.get('Content-Disposition') || '';
  const utf8Match = disp.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match) {
    try { filename = decodeURIComponent(utf8Match[1]); } catch (e) {}
  } else {
    const plainMatch = disp.match(/filename="?([^";]+)"?/i);
    if (plainMatch) filename = plainMatch[1];
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Cleanup after the click handler has had a chance to fire
  setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

export const api = {
  // Auth
  getMe: () => apiFetch('/auth/me'),
  getPublicInfo: () => apiFetch('/auth/public-info'),
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
  addAttendanceBulk: (eventId, members, status) =>
    apiFetch(`/api/events/${eventId}/attendance/bulk`, { method: 'POST', body: JSON.stringify({ members, status }) }),
  updateAttendance: (eventId, attId, data) =>
    apiFetch(`/api/events/${eventId}/attendance/${attId}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteAttendance: (eventId, attId) =>
    apiFetch(`/api/events/${eventId}/attendance/${attId}`, { method: 'DELETE' }),
  getEventTypes: () => apiFetch('/api/events/types'),
  getExportFields: (eventId) => apiFetch(`/api/events/${eventId}/export-fields`),
  exportEventAttendees: (eventId, columns) =>
    apiDownload(
      `/api/events/${eventId}/export`,
      { method: 'POST', body: JSON.stringify({ columns }) },
      'attendees.xlsx',
    ),

  // Form Import
  getFormConfig: (eventId) => apiFetch(`/api/events/${eventId}/form`),
  connectForm: (eventId, spreadsheetId, sheetName) =>
    apiFetch(`/api/events/${eventId}/form/connect`, { method: 'POST', body: JSON.stringify({ spreadsheetId, sheetName }) }),
  saveFormMapping: (eventId, data) =>
    apiFetch(`/api/events/${eventId}/form/mapping`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteFormLink: (eventId) =>
    apiFetch(`/api/events/${eventId}/form`, { method: 'DELETE' }),
  previewFormImport: (eventId) =>
    apiFetch(`/api/events/${eventId}/form/preview`, { method: 'POST' }),
  executeFormImport: (eventId, entries, newMembers) =>
    apiFetch(`/api/events/${eventId}/form/execute`, { method: 'POST', body: JSON.stringify({ entries, newMembers }) }),

  // CSV Import
  getImportFields: () => apiFetch('/api/members/import/fields'),
  previewCsvImport: (data) =>
    apiFetch('/api/members/import/preview', { method: 'POST', body: JSON.stringify(data) }),
  executeCsvImport: (updates, newMembers) =>
    apiFetch('/api/members/import/execute', { method: 'POST', body: JSON.stringify({ updates, newMembers }) }),

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
