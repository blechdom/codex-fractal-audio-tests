import Head from "next/head";
import Link from "next/link";

const ACCENT = "#90caf9";

const METHODS = [
  {
    title: "1. Marching Squares Boundary Time",
    tag: "best first prototype",
    body:
      "Extract an iso-contour around the Julia boundary, stitch the segments into closed loops, then choose clockwise or counterclockwise travel. Time is path arclength around the loop. Even if the drawn contour folds near itself, playback never reverses; the sound follows tangent angle, curvature, speed, and local feature change.",
    sound:
      "Tangent angle can pan or drive pitch, curvature can trigger accents, segment length can set duration, and slope change can become melody. This directly matches the idea that we hear the boundary's turning motion through time.",
  },
  {
    title: "2. External Angle Time",
    tag: "mathematical loop",
    body:
      "Use external ray angle as the time coordinate. The boundary is heard as one periodic orbit from angle 0 through 1 and back to the start. This gives a natural forward-only loop for connected Julia sets.",
    sound:
      "Angle is clock position, local landing density drives event density, and escape potential near the ray controls brightness or filter tone.",
  },
  {
    title: "3. Equipotential Contour Scan",
    tag: "stable boundary proxy",
    body:
      "Trace a smooth contour just outside the exact boundary. Over longer form, move the contour inward toward the Julia set. This avoids unstable pixel-level boundary tracing while preserving the closed-loop feel.",
    sound:
      "One loop becomes a phrase. Inward contour depth becomes arrangement time, like moving from sparse outside texture to denser boundary detail.",
  },
  {
    title: "4. Adaptive Boundary Walker",
    tag: "edge follower",
    body:
      "Walk the strongest local boundary edge while enforcing a forward tangent direction. At every step, choose a next point that continues the contour and penalizes backwards motion.",
    sound:
      "Direction changes become intervals, sharp turns become attacks, slower uncertain regions become sustained tones, and confident edge sections become rhythmic runs.",
  },
  {
    title: "5. Harmonic Measure Sampling",
    tag: "perceptual importance",
    body:
      "Sample the boundary by where external rays are likely to land instead of equal Euclidean distance. This emphasizes visible/self-similar areas and avoids spending too much time on microscopic dust.",
    sound:
      "Dense harmonic regions become clusters or ornamentation; sparse regions become rests, drones, or lower event rates.",
  },
  {
    title: "6. Symbolic Itinerary Time",
    tag: "grammar of the Julia map",
    body:
      "Order points by their symbolic itinerary under iteration: sectors, signs, left/right branches, or binary angle expansions. This treats the boundary as a generated sequence rather than a geometric curve.",
    sound:
      "Repeated prefixes become repeated motifs. Branch changes become chord changes. Self-similarity becomes audible as recurring rhythmic cells.",
  },
  {
    title: "7. Multiscale Loop Stack",
    tag: "most musical",
    body:
      "Use several forward-only loops at different scales: a coarse boundary loop, medium feature loops, and tiny high-detail loops. Each layer is circular, but the layers phase against each other.",
    sound:
      "The large loop is form, medium loops become groove, and small loops become ornaments, shimmer, or texture.",
  },
];

export default function JuliaBoundarySonificationPage() {
  return (
    <>
      <Head>
        <title>Julia Boundary Sonification | mandelbrot codex</title>
        <meta
          name="description"
          content="Design notes for turning Julia set boundaries into forward-moving musical time."
        />
      </Head>
      <div className="page-wide">
        <p style={{ marginBottom: "0.65rem" }}>
          <Link href="/" style={{ color: ACCENT, textDecoration: "underline" }}>
            Home
          </Link>
        </p>

        <h1 className="site-title" style={{ color: ACCENT }}>
          Julia Boundary Sonification
        </h1>
        <h2 className="subtitle">Where is time on an infinite closed boundary?</h2>

        <p style={{ opacity: 0.82, maxWidth: 980, lineHeight: 1.55 }}>
          The goal is to experience the edge of a Julia set as a one-way temporal path. A boundary can
          curl, fold near itself, and circle back to its starting point, but playback should not feel
          like time is reversing. The musical signal should come from how the path turns, compresses,
          accelerates, branches, and repeats itself.
        </p>

        <section style={{ border: "1px solid #2a3442", borderRadius: 10, background: "#0d1118", padding: "0.9rem", margin: "1rem 0" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>Marching Squares As Boundary Time</h3>
          <p style={{ lineHeight: 1.55, opacity: 0.84 }}>
            Marching squares is a strong first implementation. Render a scalar field for the Julia
            set, choose an iso-value near the boundary, extract contour segments, and stitch them
            into ordered loops. Once a loop is ordered, time is simply progress around that loop:
            clockwise or counterclockwise. The path may visually fold near itself, but the time
            parameter keeps moving forward.
          </p>
          <p style={{ lineHeight: 1.55, opacity: 0.84 }}>
            For audio, the most important signal may not be absolute position. It may be the change
            in slope: tangent angle, curvature, turn rate, segment length, and acceleration. That
            turns a windy visual circuit into rhythm, melody, articulation, and timbre.
          </p>
        </section>

        <div className="experiment-grid" style={{ marginTop: "1rem" }}>
          {METHODS.map((method) => (
            <article key={method.title} className="experiment-card">
              <h3 style={{ color: ACCENT }}>{method.title}</h3>
              <p style={{ opacity: 0.82 }}>{method.body}</p>
              <p style={{ opacity: 0.74 }}>
                <strong>Sound:</strong> {method.sound}
              </p>
              <span className="tag">{method.tag}</span>
            </article>
          ))}
        </div>

        <section style={{ marginTop: "1.2rem", border: "1px solid #2b2f39", borderRadius: 10, background: "#0f1319", padding: "0.9rem" }}>
          <h3 style={{ color: ACCENT, marginTop: 0 }}>First Build Recommendation</h3>
          <p style={{ lineHeight: 1.55, opacity: 0.84, marginBottom: 0 }}>
            Start with marching squares plus a multiscale loop stack. It gives a real closed boundary
            path, a clear clockwise/counterclockwise time direction, and immediately useful musical
            features: slope, curvature, segment length, local density, and loop hierarchy.
          </p>
        </section>
      </div>
    </>
  );
}
