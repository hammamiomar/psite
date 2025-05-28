import type { IconMap, SocialLink, Site } from '@/types'

export const SITE: Site = {
  title: 'Omar Hammami',
  description:
    'Personal website of Omar Hammami - Software engineer and researcher working on machine learning, computer vision, and practical solutions.',
  href: 'https://omarhammami.com',
  author: 'Omar Hammami',
  locale: 'en-US',
  featuredPostCount: 2,
  postsPerPage: 3,
}

export const NAV_LINKS: SocialLink[] = [
  {
    href: '/',
    label: 'about',
  },
  {
    href: '/blog',
    label: 'blog',
  },
  {
    href: '/projects',
    label: 'projects',
  },
  {
    href: '/recipes',
    label: 'recipes',
  },
]

export const SOCIAL_LINKS: SocialLink[] = [
  {
    href: 'https://github.com/omarhammami',
    label: 'GitHub',
  },
  {
    href: 'mailto:contact@omarhammami.com',
    label: 'Email',
  },
  {
    href: '/rss.xml',
    label: 'RSS',
  },
]

export const ICON_MAP: IconMap = {
  Website: 'lucide:globe',
  GitHub: 'lucide:github',
  LinkedIn: 'lucide:linkedin',
  Twitter: 'lucide:twitter',
  Email: 'lucide:mail',
  RSS: 'lucide:rss',
}
