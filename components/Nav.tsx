import { SiteNav } from '@/components/SiteNav';
import { reviewsLive } from '@/lib/reviews';

/**
 * The site bar, with the decisions about WHICH ITEMS EXIST made in one place.
 *
 * WHY THIS WRAPPER EXISTS. `sampleLive` was passed by hand at fourteen call sites, every one of
 * them the literal `true`. Adding a second conditional item the same way would have made
 * twenty-eight places to forget, and "a nav item pointing at a 404 is worse than a missing one"
 * is a rule that only holds if somebody remembers it on every page they write.
 *
 * So the questions are asked here, once, and every page renders <Nav /> without knowing the
 * answers. SiteNav stays a client component because it reads usePathname to mark the current
 * page; this is the server half that can talk to the database.
 */
export async function Nav(props: { issue?: string; tagline?: string; scanIsHere?: boolean }) {
  return <SiteNav {...props} sampleLive reviewsLive={await reviewsLive()} />;
}
