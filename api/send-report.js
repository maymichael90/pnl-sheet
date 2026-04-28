export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { bedrijf, periode, rapport } = req.body;

  if (!rapport) {
    return res.status(400).json({ error: 'Geen rapport data' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'API key niet geconfigureerd' });
  }

  const htmlRapport = rapport
    .split('\n')
    .map(line => {
      if (line.startsWith('P&L RAPPORT')) return `<h2 style="color:#1a1a18;font-size:16px;margin:0 0 2px">${line}</h2>`;
      if (line.match(/^─+$/)) return `<hr style="border:none;border-top:1px solid #e0e0db;margin:10px 0">`;
      if (line === '') return `<div style="height:6px"></div>`;
      if (!line.startsWith(' ')) return `<div style="font-size:13px;font-weight:600;color:#1a1a18;margin-top:10px">${line}</div>`;
      const parts = line.split(/\s{2,}/);
      const label = parts[0] || '';
      const value = parts.slice(1).join('  ') || '';
      const isGood = value.includes('WINSTGEVEND') || value.includes('BOVEN') || value.includes('GEZOND') || value.includes('GEHAALD');
      const isBad = value.includes('VERLIESLATEND') || value.includes('ONDER') || value.includes('GEVAARLIJK') || value.includes('NIET GEHAALD');
      const valueColor = isGood ? '#27500A' : isBad ? '#791F1F' : '#5a5a56';
      return `<div style="display:flex;justify-content:space-between;font-size:12.5px;padding:2px 0;border-bottom:1px solid #f0f0ec">
        <span style="color:#5a5a56">${label.trim()}</span>
        <span style="color:${valueColor};font-weight:500;text-align:right;margin-left:16px">${value}</span>
      </div>`;
    })
    .join('');

  const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f7f7f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;overflow:hidden;border:1px solid #e0e0db">
    <div style="background:#185FA5;padding:24px 28px">
      <div style="font-size:11px;color:rgba(255,255,255,0.7);letter-spacing:.08em;margin-bottom:4px">P&L INTAKE TOOL</div>
      <div style="font-size:20px;font-weight:500;color:#fff">${bedrijf || 'Nieuw rapport'}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.8);margin-top:2px">${periode || ''}</div>
    </div>
    <div style="padding:24px 28px">
      <div style="font-size:12px;color:#9a9a94;margin-bottom:16px">
        Ontvangen via P&L Intake Tool · Absolute bedragen niet bijgevoegd
      </div>
      ${htmlRapport}
    </div>
    <div style="padding:16px 28px;background:#f7f7f5;border-top:1px solid #e0e0db">
      <div style="font-size:11px;color:#9a9a94">Verstuurd via maydium.nl P&L tool · michael@maydium.nl</div>
    </div>
  </div>
</body>
</html>`;

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
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
