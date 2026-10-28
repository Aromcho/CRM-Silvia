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
    throw new Error('No se pudo conectar con el servidor.');
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
export const duplicateProperty = (id, operationType) => request(`/properties/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ operation_type: operationType }) });
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
export const updatePropertyPhotoDescription = (id, photoId, description) => request(`/properties/${id}/photos/${photoId}/description`, { method: 'PATCH', body: JSON.stringify({ description }) });

// MercadoLibre
export const syncPropertyMercadoLibre = (id) => request(`/mercadolibre/sync/${id}`, { method: 'POST' });
export const checkPropertyMercadoLibre = (id) => request(`/mercadolibre/requirements/${id}`);
export const syncAllMercadoLibre = () => request('/mercadolibre/sync-all', { method: 'POST' });
export const getMercadoLibreStatus = () => request('/mercadolibre/status');
export const getMercadoLibreSummary = () => request('/mercadolibre/summary');
export const getMercadoLibreSummaryProperties = (filter) => request(`/mercadolibre/summary/properties?filter=${filter}`);
export const getMercadoLibreListingTypes = () => request('/mercadolibre/listing-types');
export const getMercadoLibreAvailableUpgrades = (id) => request(`/mercadolibre/available-upgrades/${id}`);
export const upgradeMercadoLibreListingType = (id, data) => request(`/mercadolibre/listing-type/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
export const getPropertyMlMetrics = (id, days = 30) => request(`/mercadolibre/metrics/property/${id}?days=${days}`);
export const getMercadoLibreReports = (days = 30) => request(`/mercadolibre/reports?days=${days}`);
export const discoverMlExistingListings = () => request('/mercadolibre/discover-existing');
export const linkMlExistingListing = (data) => request('/mercadolibre/link-existing', { method: 'POST', body: JSON.stringify(data) });

// ZonaProp
export const getZonaPropSummary = () => request('/zonaprop/summary');
export const getZonaPropSummaryProperties = (filter) => request(`/zonaprop/summary/properties?filter=${filter}`);
export const syncPropertyZonaProp = (id) => request(`/zonaprop/sync/${id}`, { method: 'POST' });
export const upgradeZonaPropPlan = (id, tipoDePublicacion) => request(`/zonaprop/plan/${id}`, { method: 'PATCH', body: JSON.stringify({ tipoDePublicacion }) });
export const syncAllZonaProp = () => request('/zonaprop/sync-all', { method: 'POST' });
export const reconcileZonaProp = () => request('/zonaprop/reconcile', { method: 'POST' });
export const configureZonaPropCallbacks = () => request('/zonaprop/callbacks/configure', { method: 'POST' });
export const pollZonaPropLeads = (sinceDays) => request(`/zonaprop/leads/poll?sinceDays=${sinceDays}`, { method: 'POST' });
export const getZonaPropReports = (days = 30) => request(`/zonaprop/reports?days=${days}`);

// Leads
export const getLeads = (params) => request(`/leads?${new URLSearchParams(params).toString()}`);
export const getLeadById = (id) => request(`/leads/${id}`);
export const createLead = (data) => request('/leads', { method: 'POST', body: JSON.stringify(data) });
export const updateLead = (id, data) => request(`/leads/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const updateLeadStatus = (id, status) => request(`/leads/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
export const deleteLead = (id) => request(`/leads/${id}`, { method: 'DELETE' });
export const getLeadStats = () => request('/leads/stats');

// WhatsApp (rotación de agentes y conteo de consultas, servido por web-silvia-next)
export const getWhatsAppStats = () => request('/whatsapp/stats');
export const getLeadEmailSetting = () => request('/leads/email-setting');
export const updateLeadEmailSetting = (enabled) => request('/leads/email-setting', { method: 'PATCH', body: JSON.stringify({ leadEmailsEnabled: enabled }) });

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

// Instagram DM (solo SUPERADMIN)
export const getInstagramStatus = () => request('/instagram/status');
export const getInstagramConnectUrl = () => `${API_BASE}/instagram/oauth/connect`;
export const disconnectInstagram = () => request('/instagram/disconnect', { method: 'POST' });
export const refreshInstagramToken = () => request('/instagram/refresh-token', { method: 'POST' });
export const subscribeInstagramWebhooks = () => request('/instagram/subscribe', { method: 'POST' });
export const getInstagramConfig = () => request('/instagram/config');
export const updateInstagramConfig = (data) => request('/instagram/config', { method: 'PUT', body: JSON.stringify(data) });
export const getInstagramLeads = (params) => request(`/instagram/leads?${new URLSearchParams(params || {}).toString()}`);
export const retryInstagramLead = (id) => request(`/instagram/leads/${id}/retry`, { method: 'POST' });
export const deleteInstagramLead = (id) => request(`/instagram/leads/${id}`, { method: 'DELETE' });
export const getInstagramMedia = (params) => request(`/instagram/media?${new URLSearchParams(params || {}).toString()}`);
export const setInstagramMediaProperty = (mediaId, data) => request(`/instagram/media/${mediaId}`, { method: 'PUT', body: JSON.stringify(data) });
export const searchInstagramProperties = (q) => request(`/instagram/properties?q=${encodeURIComponent(q || '')}`);

export { API_BASE };

// Mail Marketing (solo SUPERADMIN)
export const getMailConfig = () => request('/mail-marketing/config');
export const updateMailConfig = (data) => request('/mail-marketing/config', { method: 'PUT', body: JSON.stringify(data) });
export const getMailFilterOptions = () => request('/mail-marketing/filter-options');
export const previewMailAudience = (data) => request('/mail-marketing/audience', { method: 'POST', body: JSON.stringify(data) });
export const searchMailProperties = (q) => request(`/mail-marketing/properties?${new URLSearchParams({ q: q || '' }).toString()}`);
export const getMailCampaigns = () => request('/mail-marketing/campaigns');
export const getMailCampaign = (id) => request(`/mail-marketing/campaigns/${id}`);
export const createMailCampaign = (data) => request('/mail-marketing/campaigns', { method: 'POST', body: JSON.stringify(data || {}) });
export const updateMailCampaign = (id, data) => request(`/mail-marketing/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) });
export const deleteMailCampaign = (id) => request(`/mail-marketing/campaigns/${id}`, { method: 'DELETE' });
export const duplicateMailCampaign = (id) => request(`/mail-marketing/campaigns/${id}/duplicate`, { method: 'POST' });
export const previewMailCampaign = (id, data) => request(`/mail-marketing/campaigns/${id}/preview`, { method: 'POST', body: JSON.stringify(data || {}) });
export const sendMailTest = (id, data) => request(`/mail-marketing/campaigns/${id}/test`, { method: 'POST', body: JSON.stringify(data || {}) });
export const startMailCampaign = (id, expectedCount) => request(`/mail-marketing/campaigns/${id}/send`, { method: 'POST', body: JSON.stringify({ expectedCount }) });
export const pauseMailCampaign = (id) => request(`/mail-marketing/campaigns/${id}/pause`, { method: 'POST' });
export const resumeMailCampaign = (id) => request(`/mail-marketing/campaigns/${id}/resume`, { method: 'POST' });
export const cancelMailCampaign = (id) => request(`/mail-marketing/campaigns/${id}/cancel`, { method: 'POST' });
export const getMailCampaignSends = (id, params) => request(`/mail-marketing/campaigns/${id}/sends?${new URLSearchParams(params || {}).toString()}`);
