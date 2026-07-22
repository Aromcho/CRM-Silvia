const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7003/api';

let _onUnauthorized = null;
export function setUnauthorizedHandler(fn) { _onUnauthorized = fn; }

async function request(path, options = {}) {
  let response;
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      credentials: 'include',
      headers: { ...(isFormData ? {} : { 'Content-Type': 'application/json' }), ...(options.headers || {}) },
      ...options,
    });
  } catch {
    return null;
  }

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (response.status === 401) {
    if (_onUnauthorized) _onUnauthorized();
    return null;
  }

  if (!response.ok) throw new Error(data?.message || `Error ${response.status}`);
  return data;
}

export const getSession = () => request('/sessions/online');
export const login = (email, password) => request('/sessions/login', { method: 'POST', body: JSON.stringify({ email, password }) });
export const logout = () => request('/sessions/logout', { method: 'DELETE' });

// Properties
export const getProperties = (params) => request(`/properties?${new URLSearchParams(params).toString()}`);
export const getPropertyById = (id) => request(`/properties/${id}`);
export const createProperty = (data) => request('/properties', { method: 'POST', body: JSON.stringify(data) });
export const updateProperty = (id, data) => request(`/properties/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const updatePropertyStatus = (id, status) => request(`/properties/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const updatePropertyDifusion = (id, data) => request(`/properties/${id}/difusion`, { method: 'PATCH', body: JSON.stringify(data) });
export const getPropertyStats = () => request('/properties/stats');
export const triggerSync = () => request('/properties/sync', { method: 'POST' });
export const importRentals = () => request('/properties/import-rentals', { method: 'POST' });
export const uploadPropertyPhotos = (id, files) => {
  const form = new FormData();
  Array.from(files).forEach((f) => form.append('photos', f));
  return request(`/properties/${id}/photos`, { method: 'POST', body: form });
};
export const deletePropertyPhoto = (id, photoId) => request(`/properties/${id}/photos/${photoId}`, { method: 'DELETE' });
export const reorderPropertyPhotos = (id, order) => request(`/properties/${id}/photos/reorder`, { method: 'PATCH', body: JSON.stringify({ order }) });

// MercadoLibre
export const syncPropertyMercadoLibre = (id) => request(`/mercadolibre/sync/${id}`, { method: 'POST' });
export const syncAllMercadoLibre = () => request('/mercadolibre/sync-all', { method: 'POST' });
export const getMercadoLibreStatus = () => request('/mercadolibre/status');
export const getMercadoLibreSummary = () => request('/mercadolibre/summary');
export const getMercadoLibreListingTypes = () => request('/mercadolibre/listing-types');
export const upgradeMercadoLibreListingType = (id, data) => request(`/mercadolibre/listing-type/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const getPropertyMlMetrics = (id, days = 30) => request(`/mercadolibre/metrics/property/${id}?days=${days}`);
export const discoverMlExistingListings = () => request('/mercadolibre/discover-existing');
export const linkMlExistingListing = (data) => request('/mercadolibre/link-existing', { method: 'POST', body: JSON.stringify(data) });

// ZonaProp
export const getZonaPropSummary = () => request('/zonaprop/summary');

// Leads
export const getLeads = (params) => request(`/leads?${new URLSearchParams(params).toString()}`);
export const getLeadById = (id) => request(`/leads/${id}`);
export const createLead = (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) });
export const updateLead = (id, data) => request(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const updateLeadStatus = (id, status) => request(`/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const deleteLead = (id) => request(`/leads/${id}`, { method: 'DELETE' });
export const getLeadStats = () => request('/leads/stats');

// Activity feed
export const getActivities = (params) => request(`/activities?${new URLSearchParams(params || {}).toString()}`);

// Archivos (fichas de archivos de propiedades no publicadas)
export const getFileRecords = (params) => request(`/files?${new URLSearchParams(params || {}).toString()}`);
export const getFileRecordById = (id) => request(`/files/${id}`);
export const createFileRecord = (data) => request('/files', { method: 'POST', body: JSON.stringify(data) });
export const updateFileRecord = (id, data) => request(`/files/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const deleteFileRecord = (id) => request(`/files/${id}`, { method: 'DELETE' });
export const uploadFiles = (id, type, fileList) => {
  const formData = new FormData();
  formData.append('type', type);
  Array.from(fileList).forEach((f) => formData.append('files', f));
  return request(`/files/${id}/files`, { method: 'POST', body: formData });
};
export const deleteFile = (id, fileId) => request(`/files/${id}/files/${fileId}`, { method: 'DELETE' });

// Users
export const getUsers = () => request('/users');
export const updateUser = (id, data) => request(`/users/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const registerUser = (data) => request('/sessions/register', { method: 'POST', body: JSON.stringify(data) });
export const changeUserPassword = (id, password) => request(`/users/${id}/password`, { method: 'PUT', body: JSON.stringify({ password }) });

export { API_BASE };
