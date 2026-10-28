import type { APIRoute } from 'astro'

const getRobotsTxt = (sitemapURL: URL) => `# Crawlers and AI agents are welcome to read and index this public site.
User-agent: *
Allow: /

Sitemap: ${sitemapURL.href}
`

export const GET: APIRoute = ({ site }) => {
  const sitemapURL = new URL('sitemap-index.xml', site)
  return new Response(getRobotsTxt(sitemapURL), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
