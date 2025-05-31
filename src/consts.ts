import type { IconMap, SocialLink, Site } from '@/types'

export const SITE: Site = {
  title: 'Omar Hammami',
  description:
    'Personal website of Omar Hammami',
  href: 'https://hammamiomar.xyz',
  author: 'Omar Hammami',
  locale: 'en-US',
  featuredPostCount: 2,
  postsPerPage: 3,
}

export const NAV_LINKS: SocialLink[] = [

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
    href: 'https://github.com/hammamiomar',
    label: 'GitHub',
  },
  {
    href: 'mailto:contact@hhammamiomar@gmail.com',
    label: 'Email',
  },
  {
    href: 'https://linkedin.com/in/hhammamiomar',
    label: 'LinkedIn',
  },
  {
    href: 'https://x.com/hambagugu',
    label: 'Twitter'
  }
]

export const ICON_MAP: IconMap = {
  Website: 'lucide:globe',
  GitHub: 'lucide:github',
  LinkedIn: 'lucide:linkedin',
  Twitter: 'lucide:twitter',
  Email: 'lucide:mail',
  RSS: 'lucide:rss',
}
