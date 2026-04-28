export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { bedrijf, periode, rapport, emailData } = req.body;
  if (!rapport) return res.status(400).json({ error: 'Geen rapport data' });

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'API key niet geconfigureerd' });

  const BG   = { good: '#EAF3DE', warn: '#FAEEDA', bad: '#FCEBEB', blue: '#E6F1FB', none: '#f7f7f5' };
  const TEXT = { good: '#27500A', warn: '#633806', bad: '#791F1F', blue: '#0C447C', none: '#5a5a56' };
  const BAR  = { good: '#3B6D11', warn: '#854F0B', bad: '#A32D2D', blue: '#185FA5' };

  function kpiCard(label, value, sub, status = 'none') {
    const bg = BG[status] || BG.none;
    const tc = TEXT[status] || TEXT.none;
    return `<td width="50%" style="padding:4px;vertical-align:top">
      <div style="background:${bg};border-radius:8px;padding:12px 14px">
        <div style="font-size:11px;color:${tc};margin-bottom:3px;line-height:1.3">${label}</div>
        <div style="font-size:19px;font-weight:600;color:${tc}">${value}</div>
        ${sub ? `<div style="font-size:11px;color:${tc};margin-top:2px;opacity:.85">${sub}</div>` : ''}
      </div>
    </td>`;
  }

  function kpiRow(cards) {
    return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:6px"><tr>${cards.join('')}</tr></table>`;
  }

  function section(title, sub, content) {
    return `<div style="background:#fff;border:1px solid #e0e0db;border-radius:12px;padding:18px 20px;margin-bottom:12px">
      <div style="font-size:14px;font-weight:600;color:#1a1a18;margin-bottom:${sub ? '2px' : '12px'}">${title}</div>
      ${sub ? `<div style="font-size:12px;color:#9a9a94;margin-bottom:12px">${sub}</div>` : ''}
      ${content}
    </div>`;
  }

  function pill(status) {
    const labels = { good: 'Winstgevend', warn: 'Break-even', bad: 'Verlieslatend' };
    if (!labels[status]) return '';
    return `<span style="display:inline-block;background:${BG[status]};color:${TEXT[status]};font-size:11px;font-weight:600;padding:2px 8px;border-radius:10px">${labels[status]}</span>`;
  }

  function barRow(label, value, maxValue, color) {
    const pct = maxValue > 0 ? Math.min((value / maxValue) * 100, 100) : 0;
    return `<div style="display:flex;align-items:center;gap:8px;margin:5px 0">
      <div style="font-size:12px;color:#5a5a56;width:170px;flex-shrink:0">${label}</div>
      <div style="flex:1;height:5px;background:#f0f0ec;border-radius:3px;overflow:hidden">
        <div style="width:${pct.toFixed(1)}%;height:100%;background:${color};border-radius:3px"></div>
      </div>
      <div style="font-size:12px;font-weight:500;color:#1a1a18;width:44px;text-align:right">${value.toLocaleString('nl-NL')}</div>
    </div>`;
  }

  let body = '';

  if (emailData) {
    const d = emailData;

    // OMZETMIX
    body += section('Omzetmix', null,
      kpiRow([
        kpiCard('Offline omzet', d.omzetmix.offline, null, 'blue'),
        kpiCard('Online omzet', d.omzetmix.online, null, 'blue'),
      ])
    );

    // WATERVAL
    const wfRows = d.waterval.map(w =>
      `<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-bottom:1px solid #f0f0ec">
        <span style="font-size:13px;color:${w.bold ? '#1a1a18' : '#5a5a56'};font-weight:${w.bold ? '600' : '400'}">${w.l}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="width:70px;height:5px;background:#f0f0ec;border-radius:3px;overflow:hidden">
            <div style="width:${Math.min(Math.abs(parseFloat(w.v)), 100)}%;height:100%;background:${w.kleur};border-radius:3px"></div>
          </div>
          <span style="font-size:13px;font-weight:500;color:${w.kleur};min-width:46px;text-align:right">${w.v}</span>
        </div>
      </div>`
    ).join('');
    body += section('P&L waterval', 'Hoe omzet naar winst stroomt', wfRows);

    // BREAK-EVEN
    const be = d.breakeven;
    const maxBez = Math.max(be.gem_bez || 0, be.be_bezoekers || 0) * 1.15 || 1;
    body += section('Break-even analyse', 'Hoeveel bezoekers om alle kosten te dekken?',
      kpiRow([
        kpiCard('Break-even bezoekers/mnd', be.be_bezoekers > 0 ? be.be_bezoekers.toLocaleString('nl-NL') : '–', 'Vaste kosten + marketing gedekt', be.be_bereikt ? 'good' : 'bad'),
        kpiCard('Huidig gemiddelde', be.gem_bez > 0 ? be.gem_bez.toLocaleString('nl-NL') : '–', be.be_bereikt ? 'Boven break-even' : 'Onder break-even', be.be_bereikt ? 'good' : 'bad'),
      ]) +
      kpiRow([kpiCard('Omzet per bezoeker', be.rpv, 'Alle omzetstromen gecombineerd', 'blue')]) +
      (be.be_bezoekers > 0 && be.gem_bez > 0
        ? barRow('Huidige bezoekers', be.gem_bez, maxBez, be.be_bereikt ? BAR.good : BAR.bad) +
          barRow('Break-even bezoekers', be.be_bezoekers, maxBez, BAR.warn)
        : '')
    );

    // CPV
    const cpv = d.cpv;
    body += section('Max. kosten per bezoeker (CPV)', 'Wat mag één bezoeker via marketing kosten?',
      kpiRow([
        kpiCard('Max. CPV bruto', cpv.max_bruto, 'Na directe kosten, vóór overhead', 'blue'),
        kpiCard('Max. CPV netto', cpv.max_netto, 'Na álle kosten — de echte grens', cpv.status === 'good' ? 'good' : cpv.status === 'bad' ? 'bad' : 'warn'),
      ]) +
      kpiRow([
        kpiCard('Huidig CPV (alle marketing)', cpv.huidig, 'Wat je nu uitgeeft per bezoeker', cpv.status),
        kpiCard('Huidig CPV (alleen paid)', cpv.huidig_paid, 'Facebook + Google per bezoeker', 'none'),
      ]) +
      `<div style="font-size:12px;color:#5a5a56;line-height:1.6;padding:10px 12px;background:#f7f7f5;border-radius:8px;margin-top:6px">${cpv.oordeel}</div>`
    );

    // ROAS
    const roas = d.roas;
    const roasContent = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
      <tr>
        <td style="font-size:11px;font-weight:600;color:#5a5a56;padding:3px 0 7px;border-bottom:1px solid #e0e0db">Kanaal</td>
        <td style="font-size:11px;font-weight:600;color:#5a5a56;padding:3px 6px 7px;text-align:center;border-bottom:1px solid #e0e0db">Break-even</td>
        <td style="font-size:11px;font-weight:600;color:#5a5a56;padding:3px 6px 7px;text-align:center;border-bottom:1px solid #e0e0db">Jaargemiddelde</td>
        <td style="font-size:11px;font-weight:600;color:#5a5a56;padding:3px 6px 7px;text-align:center;border-bottom:1px solid #e0e0db">Kwartaal</td>
        <td style="font-size:11px;font-weight:600;color:#5a5a56;padding:3px 6px 7px;text-align:center;border-bottom:1px solid #e0e0db">Gewogen</td>
        <td style="font-size:11px;font-weight:600;color:#5a5a56;padding:3px 0 7px;text-align:right;border-bottom:1px solid #e0e0db">Status</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#1a1a18;padding:8px 0;border-bottom:1px solid #f0f0ec">Meta / Facebook</td>
        <td style="font-size:12px;color:#5a5a56;text-align:center;padding:8px 6px;border-bottom:1px solid #f0f0ec">${roas.be_bruto}</td>
        <td style="font-size:12px;color:#5a5a56;text-align:center;padding:8px 6px;border-bottom:1px solid #f0f0ec">${roas.fb_jaar}</td>
        <td style="font-size:12px;color:#5a5a56;text-align:center;padding:8px 6px;border-bottom:1px solid #f0f0ec">${roas.fb_kwartaal}</td>
        <td style="font-size:13px;font-weight:600;color:#1a1a18;text-align:center;padding:8px 6px;border-bottom:1px solid #f0f0ec">${roas.fb_gewogen}</td>
        <td style="text-align:right;padding:8px 0;border-bottom:1px solid #f0f0ec">${pill(roas.fb_status)}</td>
      </tr>
      <tr>
        <td style="font-size:13px;color:#1a1a18;padding:8px 0">Google Ads</td>
        <td style="font-size:12px;color:#5a5a56;text-align:center;padding:8px 6px">${roas.be_bruto}</td>
        <td style="font-size:12px;color:#5a5a56;text-align:center;padding:8px 6px">${roas.goog_jaar}</td>
        <td style="font-size:12px;color:#5a5a56;text-align:center;padding:8px 6px">${roas.goog_kwartaal}</td>
        <td style="font-size:13px;font-weight:600;color:#1a1a18;text-align:center;padding:8px 6px">${roas.goog_gewogen}</td>
        <td style="text-align:right;padding:8px 0">${pill(roas.goog_status)}</td>
      </tr>
    </table>
    <div style="font-size:11px;color:#9a9a94;margin-top:10px;line-height:1.5">Break-even ROAS netto: <strong>${roas.be_netto}</strong> &nbsp;·&nbsp; Let op: Meta/Google rapporteert alleen online conversies. Werkelijke ROAS ligt waarschijnlijk hoger.</div>`;
    body += section('ROAS per kanaal', null, roasContent);

    // GROEI
    const g = d.groei;
    body += section('Bezetting & groei 2026', null,
      kpiRow([
        kpiCard('Huidige bezetting', g.bezetting, 'Van maximale capaciteit', g.bez_status),
        kpiCard('Bezoekersdoel 2026', g.bez_doel, `+${g.groei_pct} groei t.o.v. huidig`, 'blue'),
      ])
    );

    // LTV / CAC
    if (d.ltv) {
      const l = d.ltv;
      body += section('Klantwaarde — LTV & CAC', null,
        kpiRow([
          kpiCard('Lifetime value (LTV)', l.ltv, null, 'blue'),
          kpiCard('LTV:CAC ratio', l.ratio, l.ratio_status === 'good' ? 'Gezond (>3x)' : l.ratio_status === 'warn' ? 'Matig (1–3x)' : 'Gevaarlijk (<1x)', l.ratio_status),
        ]) +
        kpiRow([
          kpiCard('CAC (alle marketing)', l.cac, 'Per nieuwe klant', 'none'),
          kpiCard('CAC (alleen paid)', l.cac_paid, 'FB + Google per nieuwe klant', 'none'),
        ])
      );
    }

  } else {
    body = `<div style="background:#fff;border:1px solid #e0e0db;border-radius:12px;padding:20px;font-family:monospace;font-size:12px;color:#5a5a56;white-space:pre-wrap;line-height:1.8">${rapport}</div>`;
  }

  const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#e8e8e4;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:620px;margin:28px auto;padding:0 12px 40px">
    <div style="background:#185FA5;border-radius:12px 12px 0 0;padding:24px 28px">
      <div style="font-size:10px;color:rgba(255,255,255,0.55);letter-spacing:.1em;margin-bottom:6px;text-transform:uppercase">P&L Intake Rapport</div>
      <div style="font-size:22px;font-weight:600;color:#fff;margin-bottom:2px">${bedrijf || 'Nieuw rapport'}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.7)">${periode || ''}</div>
    </div>
    <div style="background:#f0f0ec;border-left:1px solid #e0e0db;border-right:1px solid #e0e0db;padding:8px 20px">
      <div style="font-size:11px;color:#9a9a94">Ontvangen via P&L Intake Tool &nbsp;·&nbsp; Absolute bedragen niet bijgevoegd</div>
    </div>
    <div style="background:#f0f0ec;border-left:1px solid #e0e0db;border-right:1px solid #e0e0db;padding:12px 8px">
      ${body}
    </div>
    <div style="background:#fff;border:1px solid #e0e0db;border-radius:0 0 12px 12px;padding:12px 24px">
      <div style="font-size:11px;color:#9a9a94">Verstuurd via maydium.nl P&L tool &nbsp;·&nbsp; michael@maydium.nl</div>
    </div>
  </div>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'P&L Tool <onboarding@resend.dev>',
        to: ['michael@maydium.nl'],
        subject: `P&L rapport — ${bedrijf || 'Nieuw'} — ${periode || ''}`,
        html: emailHtml,
        text: rapport,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      console.error('Resend error:', data);
      return res.status(500).json({ error: 'Email versturen mislukt', detail: data });
    }
    return res.status(200).json({ success: true, id: data.id });
  } catch (err) {
    console.error('Send error:', err);
    return res.status(500).json({ error: 'Server fout', detail: err.message });
  }
}
