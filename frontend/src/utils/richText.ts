/**
 * Utility functions for rendering and handling HTML and Markdown safely
 */

/**
 * Strips HTML tags and Markdown syntax safely to return a clean, plain text preview.
 * Perfect for list or table previews.
 */
export function stripHtmlTags(text: string | undefined | null): string {
  if (!text) return '';

  let clean = text;

  // Convert markdown bold, italic, and headers to simple text or remove their tags
  clean = clean
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/__(.*?)__/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/_(.*?)_/g, '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, '') // remove multi-line code blocks
    .replace(/`(.*?)`/g, '$1')
    .replace(/^#+\s+/gm, '') // remove header marks
    .replace(/^\s*[-*+]\s+/gm, ''); // remove bullet list marks

  // Convert common block HTML tags to line breaks or spacing first
  clean = clean
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<li>/gi, '• ')
    .replace(/<\/li>/gi, '\n');

  // Strip all other HTML tags
  clean = clean.replace(/<[^>]+>/g, '');

  // Decode standard HTML entities
  clean = clean
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&ldquo;/gi, '“')
    .replace(/&rdquo;/gi, '”')
    .replace(/&lsquo;/gi, '‘')
    .replace(/&rsquo;/gi, '’');

  // Normalize consecutive newlines and spaces
  const lines = clean
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  return lines.join('\n');
}

/**
 * Converts Markdown string into basic HTML.
 * If the string already contains significant HTML tags, it will return the string as is.
 */
export function convertMarkdownToHtml(markdown: string | null | undefined): string {
  if (!markdown) return '';

  // If it already looks like HTML (contains paragraph, strong, list or header tags), keep it
  const hasHtml = /<[a-z][\s\S]*>/i.test(markdown);
  if (hasHtml) {
    return markdown;
  }

  let html = markdown;

  // Escape basic HTML characters to prevent raw HTML execution inside Markdown
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$2</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // Italics
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');

  // Unordered list items
  html = html.replace(/^\s*[-*+]\s+(.*)$/gim, '<li>$1</li>');

  // Wrap block li structures in ul
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');

  // Blockquotes
  html = html.replace(/^\s*>\s+(.*)$/gim, '<blockquote>$1</blockquote>');

  // Code blocks and inline code
  html = html.replace(/```([\s\S]*?)```/gm, '<pre><code>$1</code></pre>');
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');

  // Split and wrap in paragraphs
  const blocks = html.split(/\n{2,}/);
  html = blocks
    .map(block => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (
        trimmed.startsWith('<h') ||
        trimmed.startsWith('<ul') ||
        trimmed.startsWith('<ol') ||
        trimmed.startsWith('<pre') ||
        trimmed.startsWith('<blockquote')
      ) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br />')}</p>`;
    })
    .filter(Boolean)
    .join('');

  return html;
}

/**
 * Client-safe HTML sanitizer.
 * Parses input using the browser's native DOM parser, strips unauthorized/dangerous
 * tags (script, iframe, etc.) and event handlers, then returns sanitized HTML.
 */
export function sanitizeHtml(html: string): string {
  if (typeof window === 'undefined') return html;

  const template = document.createElement('template');
  template.innerHTML = html;

  const sanitizeElement = (node: Node) => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as HTMLElement;
      const tagName = el.tagName.toLowerCase();

      // Set of safe HTML tags for styling/formatting evaluation questions
      const allowedTags = [
        'p', 'br', 'strong', 'b', 'em', 'i', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
        'ul', 'ol', 'li', 'span', 'pre', 'code', 'blockquote', 'div'
      ];

      if (!allowedTags.includes(tagName)) {
        // If tag is not allowed, replace it with its safe text node representation
        const textNode = document.createTextNode(el.textContent || '');
        el.parentNode?.replaceChild(textNode, el);
        return;
      }

      // Remove any dangerous or unwanted attributes (especially inline event listeners like onclick)
      const allowedAttrs = ['class', 'style'];
      const attrsToRemove: string[] = [];

      for (let i = 0; i < el.attributes.length; i++) {
        const attrName = el.attributes[i].name;
        if (!allowedAttrs.includes(attrName)) {
          attrsToRemove.push(attrName);
        }
      }

      attrsToRemove.forEach(attr => el.removeAttribute(attr));
    }

    // Recursively process children
    const children = Array.from(node.childNodes);
    children.forEach(sanitizeElement);
  };

  Array.from(template.content.childNodes).forEach(sanitizeElement);
  return template.innerHTML;
}

/**
 * Returns safe, sanitized, formatted HTML content from raw Markdown or HTML.
 */
export function getSafeFormattedHtml(text: string | null | undefined): string {
  if (!text) return '';
  const convertedHtml = convertMarkdownToHtml(text);
  return sanitizeHtml(convertedHtml);
}
