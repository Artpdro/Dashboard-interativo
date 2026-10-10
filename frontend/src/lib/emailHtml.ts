import DOMPurify from 'dompurify';

const HAS_HTML = /<\/?[a-z][\s\S]*?>/i;
const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Texto antigo (sem HTML) vira HTML com <br>; HTML existente é mantido. */
export function toHtml(value: string | null | undefined): string {
  if (!value) return '';
  if (HAS_HTML.test(value)) return value;
  return escapeHtml(value).replace(/\r?\n/g, '<br>');
}

const ALLOWED_TAGS = ['a','b','strong','i','em','u','s','strike','span','font','p','div','br','hr','ul','ol','li','h1','h2','h3','blockquote','sub','sup','table','thead','tbody','tr','td','th','img'];
const ALLOWED_ATTR = ['style','href','target','rel','face','size','color','align','src','alt','width','height'];

export function sanitizeEmailHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
export function renderEmailHtml(value: string | null | undefined): string {
  return sanitizeEmailHtml(toHtml(value));
}
