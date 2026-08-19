import nodemailer from 'nodemailer';
import { isLeadEmailsEnabled } from './settings.util.js';
import { getBackendPublicUrl } from './publicUrl.js';

// Creado bajo demanda (no a nivel de módulo): si este archivo se importa transitivamente
// antes de que dotenv.config() cargue el .env, un transporter armado al importar quedaría
// con auth.user/pass en undefined para siempre, aunque process.env ya esté poblado después.
let transporter = null;
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: Number(process.env.SMTP_PORT) || 587,
      secure: false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

// Mismo dominio que usa el frontend del CRM (Frontend/src/lib/data.js) para armar el link
// público de la ficha — no hay env propia en el backend, así que se replica el default acá.
const SITE_URL = (process.env.SITE_URL || 'https://www.silviafernandezpropiedades.com.ar').replace(/\/$/, '');

const OPERATION_TYPE_LABELS = { Venta: 'Venta', Alquiler: 'Alquiler', 'Alquiler temporal': 'Alquiler temporal' };

function propertyImageUrl(property) {
  const photo = property?.photos?.[0];
  if (!photo) return '';
  const raw = photo.local_image || photo.image_url || photo.thumb_url || '';
  if (!raw) return '';
  return raw.startsWith('http') ? raw : `${getBackendPublicUrl()}${raw}`;
}

function propertyPriceLine(property) {
  const op = property?.operations?.[0];
  const price = op?.prices?.[0];
  const opLabel = OPERATION_TYPE_LABELS[op?.operation_type] || op?.operation_type || '';
  if (!price?.price) return opLabel;
  const formatted = new Intl.NumberFormat('es-AR').format(price.price);
  const priceLabel = `${price.currency === 'USD' ? 'USD' : '$'} ${formatted}`;
  return opLabel ? `${opLabel} · ${priceLabel}` : priceLabel;
}

function propertyCardHtml(property) {
  if (!property) return '';
  const title = property.publication_title || property.address || `#${property.id}`;
  const barrio = property.location?.name || property.location?.full_location || '';
  const priceLine = propertyPriceLine(property);
  const image = propertyImageUrl(property);
  const url = `${SITE_URL}/propiedad/${property.id}`;

  return `
    <div style="margin-top:16px;border:1px solid #e6ece8;border-radius:12px;overflow:hidden;">
      ${image ? `<img src="${image}" alt="" style="width:100%;height:180px;object-fit:cover;display:block;" />` : ''}
      <div style="padding:16px;">
        <div style="font-size:15px;font-weight:700;color:#15784f;margin-bottom:4px;">${title}</div>
        ${barrio ? `<div style="font-size:13px;color:#5a6b62;margin-bottom:8px;">${barrio}</div>` : ''}
        ${priceLine ? `<div style="font-size:13px;color:#333;margin-bottom:12px;">${priceLine}</div>` : ''}
        <a href="${url}" style="display:inline-block;background:#15784f;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;">Ver publicación</a>
      </div>
    </div>
  `;
}

// `property`: doc lean de Property (o null/undefined si el lead no está asociado a ninguna).
export async function sendLeadEmail(lead, property = null) {
  // El lead se guarda siempre, pase lo que pase acá — este interruptor solo frena el mail.
  if (!(await isLeadEmailsEnabled())) return;
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const propertyTitle = property ? (property.publication_title || property.address || '') : (lead.propertyTitle || '');
  const propertyUrl = property ? `${SITE_URL}/propiedad/${property.id}` : '';
  const propertyCell = propertyUrl
    ? `<a href="${propertyUrl}" style="color:#15784f;">${propertyTitle || lead.propertyId}</a>`
    : (propertyTitle || lead.propertyId || '—');

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e6ece8;border-radius:12px;">
      <h2 style="color:#15784f;margin-top:0;">Nuevo Lead — CRM Inmobiliaria</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;width:120px;">Nombre</td><td style="padding:8px 0;">${lead.name}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Email</td><td style="padding:8px 0;"><a href="mailto:${lead.email}">${lead.email}</a></td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Teléfono</td><td style="padding:8px 0;">${lead.phone || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Propiedad</td><td style="padding:8px 0;">${propertyCell}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Fuente</td><td style="padding:8px 0;">${lead.source || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Mensaje</td><td style="padding:8px 0;">${lead.message || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Fecha</td><td style="padding:8px 0;">${new Date().toLocaleString('es-AR')}</td></tr>
      </table>
      ${propertyCardHtml(property)}
    </div>
  `;

  await getTransporter().sendMail({
    from: `"CRM Inmobiliaria" <${process.env.SMTP_USER}>`,
    to: process.env.LEADS_EMAIL || process.env.SMTP_USER,
    subject: `Nuevo lead: ${lead.name}${propertyTitle ? ` — ${propertyTitle}` : ''}`,
    html,
  });
}
