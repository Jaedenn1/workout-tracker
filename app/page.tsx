const exercises = [
  { name: "Leg Extensions", previous: "100 × 15 × 3", target: "105 × 12–15" },
  { name: "Hack Squat", previous: "90 × 12 × 3", target: "90 × 13–15" },
  { name: "Smith RDL", previous: "180 × 12 × 3", target: "180 × 13–15" },
];

export default function Home() {
  return (
    <main className="shell">
      <header>
        <p className="eyebrow">TODAY</p>
        <h1>Leg Day</h1>
        <p className="muted">Previous performance beside every exercise.</p>
      </header>

      <section className="stack">
        {exercises.map((exercise) => (
          <article className="card" key={exercise.name}>
            <div className="row">
              <h2>{exercise.name}</h2>
              <button>Start</button>
            </div>
            <div className="metrics">
              <div><span>Previous</span><strong>{exercise.previous}</strong></div>
              <div><span>Target</span><strong>{exercise.target}</strong></div>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
