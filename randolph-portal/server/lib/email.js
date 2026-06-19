const nodemailer = require('nodemailer');
const { getSettings } = require('../database');

let _transporter = null;

function getTransporter() {
  const s = getSettings();
  if (s.email_enabled !== 'true' || !s.smtp_host) return null;
  if (!_transporter) {
    _transporter = nodemailer.createTransport({
      host: s.smtp_host,
      port: parseInt(s.smtp_port, 10) || 587,
      secure: parseInt(s.smtp_port, 10) === 465,
      auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined,
    });
  }
  return _transporter;
}

async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) return;
  const s = getSettings();
  try {
    await t.sendMail({ from: s.smtp_from || 'noreply@randolphofficecenter.com', to, subject, html });
  } catch (err) {
    console.error('[Email] Failed to send to', to, err.message);
  }
}

async function notifyRequestStatus(request, newStatus, tenantUsers) {
  const statusLabels = {
    open: 'Open', in_progress: 'In Progress',
    pending_tenant: 'Pending Your Response', resolved: 'Resolved', closed: 'Closed',
  };
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1B3A6B">Service Request Update</h2>
      <p>Request <strong>#${request.id}</strong> status has changed to <strong>${statusLabels[newStatus] || newStatus}</strong>.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px;color:#666">Category</td><td style="padding:4px 8px">${request.category_name}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Description</td><td style="padding:4px 8px">${request.description}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Priority</td><td style="padding:4px 8px">${request.priority}</td></tr>
      </table>
      <p style="color:#666;font-size:12px;margin-top:24px">Log in to the Randolph Office Center portal to view details.</p>
    </div>`;
  for (const user of tenantUsers) {
    if (user.request_updates) {
      await sendMail({ to: user.email, subject: `Service Request #${request.id} — ${statusLabels[newStatus] || newStatus}`, html });
    }
  }
}

async function notifyBookingConfirm(booking, user) {
  if (!user.booking_confirmations) return;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1B3A6B">Booking Confirmation</h2>
      <p>Your reservation for <strong>${booking.amenity_name}</strong> is confirmed.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px;color:#666">Date</td><td style="padding:4px 8px">${new Date(booking.start_time).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Time</td><td style="padding:4px 8px">${new Date(booking.start_time).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})} – ${new Date(booking.end_time).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Headcount</td><td style="padding:4px 8px">${booking.headcount}</td></tr>
      </table>
      <p style="color:#666;font-size:12px;margin-top:24px">Log in to the portal to manage your booking.</p>
    </div>`;
  await sendMail({ to: user.email, subject: `Booking Confirmed — ${booking.amenity_name}`, html });
}

async function notifyAnnouncement(announcement, recipients) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      ${announcement.urgent ? '<div style="background:#dc2626;color:white;padding:8px 12px;border-radius:4px;margin-bottom:12px"><strong>URGENT</strong></div>' : ''}
      <h2 style="color:#1B3A6B">${announcement.title}</h2>
      <div style="white-space:pre-wrap;color:#333">${announcement.content}</div>
      <p style="color:#666;font-size:12px;margin-top:24px">Log in to the portal to view all announcements.</p>
    </div>`;
  for (const user of recipients) {
    if (user.announcements) {
      await sendMail({ to: user.email, subject: `${announcement.urgent ? '[URGENT] ' : ''}${announcement.title}`, html });
    }
  }
}

module.exports = { sendMail, notifyRequestStatus, notifyBookingConfirm, notifyAnnouncement };
