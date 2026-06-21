const nodemailer = require('nodemailer');
const { db, getSettings } = require('../database');

function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function isEmailEnabled(s) {
  return s.email_enabled === '1' || s.email_enabled === 1;
}

function getTransporter() {
  const s = getSettings();
  if (!isEmailEnabled(s)) {
    console.log('[Email] Skipped — email notifications are disabled. Enable in Admin Panel → Settings → Email (SMTP).');
    return null;
  }
  if (!s.smtp_host) {
    console.log('[Email] Skipped — SMTP host is not configured. Set it in Admin Panel → Settings → Email (SMTP).');
    return null;
  }
  // Always create fresh — settings may have changed since last call
  return nodemailer.createTransport({
    host: s.smtp_host,
    port: parseInt(s.smtp_port, 10) || 587,
    secure: parseInt(s.smtp_port, 10) === 465,
    auth: s.smtp_user ? { user: s.smtp_user, pass: s.smtp_pass } : undefined,
  });
}

async function sendMail({ to, subject, html }) {
  const t = getTransporter();
  if (!t) return;
  const s = getSettings();
  try {
    await t.sendMail({ from: s.smtp_from || 'noreply@randolphofficecenter.com', to, subject, html });
    console.log('[Email] Sent to', to, '—', subject);
  } catch (err) {
    console.error('[Email] Failed to send to', to, '—', err.message);
  }
}

async function notifyNewRequest(request, pmRecipients, submitter) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1B3A6B">New Service Request Submitted</h2>
      <p>A new service request has been submitted and requires attention.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px;color:#666">Request #</td><td style="padding:4px 8px">${request.id}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Tenant</td><td style="padding:4px 8px">${esc(request.tenant_name)}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Building</td><td style="padding:4px 8px">${esc(request.building)} W. Randolph</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Category</td><td style="padding:4px 8px">${esc(request.category_name)}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Priority</td><td style="padding:4px 8px">${esc(request.priority)}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Description</td><td style="padding:4px 8px;white-space:pre-wrap">${esc(request.description)}</td></tr>
      </table>
      <p style="color:#666;font-size:12px;margin-top:24px">Log in to the Randolph Office Center portal to manage this request.</p>
    </div>`;

  const confirmHtml = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1B3A6B">Service Request Received</h2>
      <p>Your service request has been submitted successfully. Building management will follow up shortly.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px;color:#666">Request #</td><td style="padding:4px 8px">${request.id}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Category</td><td style="padding:4px 8px">${esc(request.category_name)}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Priority</td><td style="padding:4px 8px">${esc(request.priority)}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Description</td><td style="padding:4px 8px;white-space:pre-wrap">${esc(request.description)}</td></tr>
      </table>
      <p style="color:#666;font-size:12px;margin-top:24px">Log in to the Randolph Office Center portal to track your request.</p>
    </div>`;

  for (const user of pmRecipients) {
    if (user.request_updates) {
      await sendMail({ to: user.email, subject: `New Service Request #${request.id} — ${request.category_name} (${request.tenant_name})`, html });
    }
  }
  if (submitter?.request_updates) {
    await sendMail({ to: submitter.email, subject: `Service Request #${request.id} Submitted — ${request.category_name}`, html: confirmHtml });
  }
}

async function notifyRequestStatus(request, newStatus, recipients) {
  const statusLabels = {
    open: 'Open', in_progress: 'In Progress',
    pending_tenant: 'Pending Your Response', resolved: 'Resolved', closed: 'Closed',
  };
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1B3A6B">Service Request Update</h2>
      <p>Request <strong>#${request.id}</strong> status has changed to <strong>${esc(statusLabels[newStatus] || newStatus)}</strong>.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px;color:#666">Tenant</td><td style="padding:4px 8px">${esc(request.tenant_name)}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Category</td><td style="padding:4px 8px">${esc(request.category_name)}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Description</td><td style="padding:4px 8px;white-space:pre-wrap">${esc(request.description)}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Priority</td><td style="padding:4px 8px">${esc(request.priority)}</td></tr>
      </table>
      <p style="color:#666;font-size:12px;margin-top:24px">Log in to the Randolph Office Center portal to view details.</p>
    </div>`;
  for (const user of recipients) {
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
      <h2 style="color:#1B3A6B">${esc(announcement.title)}</h2>
      <div style="white-space:pre-wrap;color:#333">${esc(announcement.content)}</div>
      <p style="color:#666;font-size:12px;margin-top:24px">Log in to the portal to view all announcements.</p>
    </div>`;
  for (const user of recipients) {
    if (user.announcements) {
      await sendMail({ to: user.email, subject: `${announcement.urgent ? '[URGENT] ' : ''}${announcement.title}`, html });
    }
  }
}

async function notifyBookingCancelled(booking, cancelledByUserId) {
  // Only notify when someone else (a PM) cancelled — self-cancellation needs no email
  if (booking.user_id === cancelledByUserId) return;
  const userPrefs = db.prepare(`
    SELECT u.email, np.booking_confirmations FROM users u
    LEFT JOIN notification_prefs np ON np.user_id = u.id
    WHERE u.id = ? AND u.active = 1
  `).get(booking.user_id);
  if (!userPrefs?.booking_confirmations) return;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1B3A6B">Booking Cancelled</h2>
      <p>Your reservation for <strong>${esc(booking.amenity_name)}</strong> has been cancelled by building management.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px;color:#666">Date</td><td style="padding:4px 8px">${new Date(booking.start_time).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric',year:'numeric'})}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Time</td><td style="padding:4px 8px">${new Date(booking.start_time).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})} – ${new Date(booking.end_time).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})}</td></tr>
      </table>
      <p>Please contact building management if you have questions.</p>
      <p style="color:#666;font-size:12px;margin-top:24px">Log in to the portal to make a new booking.</p>
    </div>`;
  await sendMail({ to: userPrefs.email, subject: `Booking Cancelled — ${esc(booking.amenity_name)}`, html });
}

async function notifyNewComment(request, comment, authorIsPM) {
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#1B3A6B">New Comment on Service Request #${request.id}</h2>
      <p><strong>${esc(comment.author_name)}</strong> added a comment on ${authorIsPM ? 'their' : 'your'} service request.</p>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:4px 8px;color:#666">Request #</td><td style="padding:4px 8px">${request.id}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Category</td><td style="padding:4px 8px">${esc(request.category_name)}</td></tr>
        <tr><td style="padding:4px 8px;color:#666">Tenant</td><td style="padding:4px 8px">${esc(request.tenant_name)}</td></tr>
      </table>
      <div style="margin:16px 0;background:#f8f9fa;border-left:4px solid #1B3A6B;padding:12px 16px;border-radius:0 6px 6px 0">
        <div style="font-size:.8rem;color:#666;margin-bottom:4px">${esc(comment.author_name)} wrote:</div>
        <div style="white-space:pre-wrap;color:#333">${esc(comment.content)}</div>
      </div>
      <p style="color:#666;font-size:12px;margin-top:24px">Log in to the Randolph Office Center portal to reply.</p>
    </div>`;

  if (authorIsPM) {
    // PM commented — notify the request submitter
    const submitter = db.prepare(`
      SELECT u.email, np.request_updates FROM users u
      LEFT JOIN notification_prefs np ON np.user_id = u.id
      WHERE u.id = ? AND u.active = 1
    `).get(request.submitted_by_id);
    if (submitter?.request_updates) {
      await sendMail({ to: submitter.email, subject: `New Comment on Request #${request.id} — ${request.category_name}`, html });
    }
  } else {
    // Tenant commented — notify all PM users with request_updates on
    const pmUsers = db.prepare(`
      SELECT u.email, np.request_updates FROM users u
      LEFT JOIN notification_prefs np ON np.user_id = u.id
      WHERE u.role IN ('pm_admin', 'pm_user') AND u.active = 1
    `).all();
    for (const user of pmUsers) {
      if (user.request_updates) {
        await sendMail({ to: user.email, subject: `New Comment on Request #${request.id} — ${request.category_name} (${request.tenant_name})`, html });
      }
    }
  }
}

module.exports = { sendMail, notifyNewRequest, notifyRequestStatus, notifyBookingConfirm, notifyBookingCancelled, notifyAnnouncement, notifyNewComment };
