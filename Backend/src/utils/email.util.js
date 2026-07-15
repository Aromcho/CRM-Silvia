import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendLeadEmail(lead, propertyTitle = '') {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;border:1px solid #e6ece8;border-radius:12px;">
      <h2 style="color:#15784f;margin-top:0;">Nuevo Lead — CRM Inmobiliaria</h2>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;width:120px;">Nombre</td><td style="padding:8px 0;">${lead.name}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Email</td><td style="padding:8px 0;"><a href="mailto:${lead.email}">${lead.email}</a></td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Teléfono</td><td style="padding:8px 0;">${lead.phone || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Propiedad</td><td style="padding:8px 0;">${propertyTitle || lead.propertyId || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Fuente</td><td style="padding:8px 0;">${lead.source || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Mensaje</td><td style="padding:8px 0;">${lead.message || '—'}</td></tr>
        <tr><td style="padding:8px 0;color:#5a6b62;font-weight:600;">Fecha</td><td style="padding:8px 0;">${new Date().toLocaleString('es-AR')}</td></tr>
      </table>
    </div>
  `;

  await transporter.sendMail({
    from: `"CRM Inmobiliaria" <${process.env.SMTP_USER}>`,
    to: process.env.LEADS_EMAIL || process.env.SMTP_USER,
    subject: `Nuevo lead: ${lead.name}${propertyTitle ? ` — ${propertyTitle}` : ''}`,
    html,
  });
}
