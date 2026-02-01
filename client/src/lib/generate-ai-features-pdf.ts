import jsPDF from 'jspdf';

export function generateAIFeaturesPDF() {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Title
  doc.setFontSize(24);
  doc.setTextColor(88, 28, 135); // Purple
  doc.text('WhachatCRM AI Features', pageWidth / 2, 25, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setTextColor(107, 114, 128); // Gray
  doc.text('Plan Comparison Guide', pageWidth / 2, 35, { align: 'center' });
  
  // Table header
  const startY = 50;
  const colWidths = [70, 28, 28, 28, 36];
  const rowHeight = 12;
  let currentY = startY;
  
  // Header row
  doc.setFillColor(88, 28, 135); // Purple
  doc.rect(10, currentY, pageWidth - 20, rowHeight, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  
  let xPos = 12;
  doc.text('Feature', xPos, currentY + 8);
  xPos += colWidths[0];
  doc.text('Free', xPos, currentY + 8);
  xPos += colWidths[1];
  doc.text('Starter', xPos, currentY + 8);
  xPos += colWidths[2];
  doc.text('Pro', xPos, currentY + 8);
  xPos += colWidths[3];
  doc.text('AI Brain', xPos, currentY + 8);
  
  currentY += rowHeight;
  
  // Data rows
  const features = [
    { name: 'Smart Task Prioritization (AI Recommended)', free: '✓', starter: '✓', pro: '✓', aiBrain: '✓' },
    { name: 'AI Reply Suggestions', free: '—', starter: '50/mo', pro: '200/mo', aiBrain: 'Unlimited' },
    { name: 'Sentiment Detection', free: '—', starter: '50/mo', pro: '200/mo', aiBrain: 'Unlimited' },
    { name: 'Lead Qualification & Scoring', free: '—', starter: '—', pro: '—', aiBrain: '✓' },
    { name: 'Human Handoff Keywords', free: '—', starter: '—', pro: '—', aiBrain: '✓' },
    { name: 'Business Knowledge Base', free: '—', starter: '—', pro: '—', aiBrain: '✓' },
    { name: 'Plain English Automation Builder', free: '—', starter: '—', pro: '—', aiBrain: '✓' },
    { name: 'AI Health Monitoring', free: '—', starter: 'Basic', pro: 'Basic', aiBrain: 'Full' },
  ];
  
  doc.setFont('helvetica', 'normal');
  
  features.forEach((feature, index) => {
    // Alternating row colors
    if (index % 2 === 0) {
      doc.setFillColor(249, 250, 251);
      doc.rect(10, currentY, pageWidth - 20, rowHeight, 'F');
    }
    
    doc.setTextColor(55, 65, 81);
    doc.setFontSize(8);
    
    xPos = 12;
    doc.text(feature.name, xPos, currentY + 8);
    
    xPos += colWidths[0];
    if (feature.free === '✓') doc.setTextColor(16, 185, 129);
    else if (feature.free === '—') doc.setTextColor(156, 163, 175);
    else doc.setTextColor(55, 65, 81);
    doc.text(feature.free, xPos, currentY + 8);
    
    xPos += colWidths[1];
    if (feature.starter === '✓') doc.setTextColor(16, 185, 129);
    else if (feature.starter === '—') doc.setTextColor(156, 163, 175);
    else doc.setTextColor(55, 65, 81);
    doc.text(feature.starter, xPos, currentY + 8);
    
    xPos += colWidths[2];
    if (feature.pro === '✓') doc.setTextColor(16, 185, 129);
    else if (feature.pro === '—') doc.setTextColor(156, 163, 175);
    else doc.setTextColor(55, 65, 81);
    doc.text(feature.pro, xPos, currentY + 8);
    
    xPos += colWidths[3];
    if (feature.aiBrain === '✓' || feature.aiBrain === 'Unlimited' || feature.aiBrain === 'Full') doc.setTextColor(16, 185, 129);
    else doc.setTextColor(55, 65, 81);
    doc.text(feature.aiBrain, xPos, currentY + 8);
    
    currentY += rowHeight;
  });
  
  // Pricing section
  currentY += 15;
  doc.setTextColor(31, 41, 55);
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('Pricing', 12, currentY);
  
  currentY += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  
  const pricing = [
    { plan: 'Free', price: '$0/mo', note: 'Forever free' },
    { plan: 'Starter', price: '$19/mo', note: 'For small businesses' },
    { plan: 'Pro', price: '$49/mo', note: 'For growing teams' },
    { plan: 'Full AI Brain Add-on', price: '+$29/mo', note: 'Requires Starter or Pro' },
  ];
  
  pricing.forEach((item) => {
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(88, 28, 135);
    doc.text(item.plan, 12, currentY);
    
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 65, 81);
    doc.text(`${item.price} — ${item.note}`, 70, currentY);
    
    currentY += 8;
  });
  
  // Tier explanation
  currentY += 12;
  doc.setFillColor(243, 232, 255); // Light purple
  doc.rect(10, currentY - 5, pageWidth - 20, 50, 'F');
  
  doc.setTextColor(88, 28, 135);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('AI Feature Tiers Explained', 14, currentY + 5);
  
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(75, 85, 99);
  
  const explanations = [
    'AI Recommended: Smart task prioritization based on engagement & urgency (available to all)',
    'AI Assist: Reply suggestions & sentiment detection with monthly quotas (Starter/Pro)',
    'Full AI Brain: Unlimited AI + lead qualification, automation builder & more (+$29/mo add-on)',
  ];
  
  currentY += 12;
  explanations.forEach((text) => {
    doc.text('• ' + text, 14, currentY);
    currentY += 8;
  });
  
  // Footer
  currentY = doc.internal.pageSize.getHeight() - 20;
  doc.setFontSize(8);
  doc.setTextColor(156, 163, 175);
  doc.text('WhachatCRM — Unified WhatsApp CRM', pageWidth / 2, currentY, { align: 'center' });
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, pageWidth / 2, currentY + 6, { align: 'center' });
  
  // Save
  doc.save('WhachatCRM-AI-Features-Comparison.pdf');
}
