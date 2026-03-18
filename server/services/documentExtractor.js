/**
 * Extract plain text from uploaded documents for training.
 * Supports: .txt, .md, .pdf, .doc, .docx
 */
let pdfParse = null;
let mammoth = null;

try {
  pdfParse = require('pdf-parse');
} catch (e) {
  // optional
}

try {
  mammoth = require('mammoth');
} catch (e) {
  // optional
}

function extractFromBuffer(buffer, originalName = '', mimeType = '') {
  const ext = (originalName && originalName.includes('.'))
    ? originalName.slice(originalName.lastIndexOf('.')).toLowerCase()
    : '';
  const mime = (mimeType || '').toLowerCase();

  if (ext === '.txt' || ext === '.md' || mime === 'text/plain' || mime === 'text/markdown') {
    return Promise.resolve(buffer.toString('utf8'));
  }

  if ((ext === '.pdf' || mime === 'application/pdf') && pdfParse) {
    return pdfParse(buffer).then((r) => r.text || '');
  }

  if ((ext === '.docx' || ext === '.doc' || mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || mime === 'application/msword') && mammoth) {
    return mammoth.extractRawText({ buffer }).then((r) => r.value || '');
  }

  return Promise.reject(new Error(`Unsupported format: ${ext || mime || 'unknown'}. Install pdf-parse and mammoth for PDF/DOCX.`));
}

module.exports = { extractFromBuffer };
