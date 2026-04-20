import Link from "next/link";
import styles from "./page.module.css";

const proofLogos = ["Aperture House", "EventFrame", "Summit Pixel", "VenueLens", "Northlight Media"];

const testimonials = [
  {
    quote:
      "FaceLocator cut our photo delivery support tickets by 68% in the first month. Guests now find their shots in under a minute.",
    name: "Maya Collins",
    role: "Head of Operations, PixelCon",
  },
  {
    quote:
      "The registration flow felt effortless for attendees, and we finally got a privacy workflow our legal team approved without revisions.",
    name: "Daniel Ortega",
    role: "Production Director, CitySummit Live",
  },
  {
    quote:
      "Our photographers upload once and FaceLocator handles the matching. It feels like adding an extra coordinator to the team.",
    name: "Nina Park",
    role: "Founder, Brightroom Events",
  },
];

const metrics = [
  { value: "4.9/5", label: "Organizer satisfaction" },
  { value: "92%", label: "Attendees find photos same day" },
  { value: "< 60s", label: "Average lookup time" },
];

export default function Home() {
  return (
    <main className={styles.page}>
      <div className={styles.bgPattern} aria-hidden="true" />

      <header className={styles.navWrap}>
        <nav className={styles.nav} aria-label="Primary">
          <p className={styles.brand}>FaceLocator</p>
          <div className={styles.navActions}>
            <Link className={styles.navLink} href="/events/speaker-session-2026/register">
              Live demo
            </Link>
            <Link className={styles.navCta} href="/events/speaker-session-2026/register">
              Start free
            </Link>
          </div>
        </nav>
      </header>

      <section className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.kicker}>Event Photography, Reinvented</p>
          <h1>Help every attendee find every photo instantly.</h1>
          <p className={styles.heroText}>
            FaceLocator matches guest selfies to your event gallery in seconds, so teams deliver a premium post-event
            experience without spreadsheet chaos.
          </p>
          <div className={styles.heroActions}>
            <Link className={styles.primaryCta} href="/events/speaker-session-2026/register">
              Launch sample flow
            </Link>
            <a className={styles.secondaryCta} href="#testimonials">
              See success stories
            </a>
          </div>
        </div>

        <aside className={styles.heroCard}>
          <p className={styles.cardTitle}>Trusted by high-volume event teams</p>
          <ul className={styles.metricList}>
            {metrics.map((item) => (
              <li key={item.label}>
                <span>{item.value}</span>
                <p>{item.label}</p>
              </li>
            ))}
          </ul>
        </aside>
      </section>

      <section className={styles.logoSection} aria-label="Partner logos">
        <p>Used by modern event studios</p>
        <ul>
          {proofLogos.map((logo) => (
            <li key={logo}>{logo}</li>
          ))}
        </ul>
      </section>

      <section className={styles.problemSolution}>
        <article>
          <div className={styles.cardIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 7h18" />
              <path d="M6 3h12l3 4H3l3-4z" />
              <path d="M5 7v10a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V7" />
              <path d="M10 11h4" />
            </svg>
          </div>
          <h2>The old way costs teams time and trust</h2>
          <p>
            Manual tagging, inbox back-and-forth, and delayed galleries frustrate attendees while your staff spends days
            triaging requests.
          </p>
        </article>

        <article>
          <div className={styles.cardIcon} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="9" />
              <path d="M8 12.2l2.5 2.5L16.5 9" />
            </svg>
          </div>
          <h2>The FaceLocator way feels instant</h2>
          <p>
            Guests enroll with one selfie, photographers upload as usual, and each attendee gets a personalized photo
            feed without exposing anyone else’s images.
          </p>
        </article>
      </section>

      <section id="testimonials" className={styles.testimonials}>
        <div className={styles.sectionHeading}>
          <p className={styles.kicker}>Social Proof</p>
          <h2>Teams running conferences, summits, and festivals rely on FaceLocator.</h2>
        </div>

        <div className={styles.testimonialGrid}>
          {testimonials.map((item) => (
            <article key={item.name} className={styles.testimonialCard}>
              <p className={styles.quote}>{item.quote}</p>
              <p className={styles.author}>{item.name}</p>
              <p className={styles.role}>{item.role}</p>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.finalCta}>
        <h2>Turn your next event gallery into a wow moment.</h2>
        <p>Launch in minutes, keep attendee data private, and let your team focus on creating great events.</p>
        <Link className={styles.primaryCta} href="/events/speaker-session-2026/register">
          Start with the sample event
        </Link>
      </section>
    </main>
  );
}
