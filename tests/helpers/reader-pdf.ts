// A valid, synthetic one-page PDF with graphics, a Roman page label and a bookmark.
// It has no selectable text; no real research content is included.
export function readerPdfFixture() {
  const content = "q 0.9 0.9 0.9 rg 40 40 532 712 re f Q";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R /PageLabels << /Nums [0 << /S /r >>] >> /Outlines 6 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << >> /Contents 4 0 R >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< >>",
    "<< /Type /Outlines /First 7 0 R /Last 7 0 R /Count 1 >>",
    "<< /Title (Controlled bookmark) /Parent 6 0 R /Dest [3 0 R /Fit] >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf +=
    `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n` +
    offsets.map((n) => `${String(n).padStart(10, "0")} 00000 n \n`).join("") +
    `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
