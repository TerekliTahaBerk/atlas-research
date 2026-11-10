import Link from "next/link";
import { PublicBrand } from "./public-brand";
import { Icon } from "./ui";

const faqs = [
  [
    "What can I do with Atlas?",
    "Bring sources into a project, read and annotate PDFs, write source-linked documents, and connect the work through tasks and discussions.",
  ],
  [
    "Can I get back to the original passage?",
    "Yes. Source-linked notes and citations retain their source, PDF version and page, so you can return to the evidence behind your writing.",
  ],
  [
    "What can I add to my library?",
    "Search scholarly metadata through Crossref, add a DOI or article link, enter source details, and upload a PDF.",
  ],
  [
    "Can I use Atlas with my team?",
    "Personal and shared workspaces support project permissions, assigned tasks and project discussions. Your Inbox brings the updates back to the research.",
  ],
  [
    "How do I get started?",
    "Open Atlas and sign in with an existing account. New registration and password recovery are unavailable in the current preview while email delivery is disabled. AI answers are also currently turned off.",
  ],
];

function SourceLabel() {
  return (
    <span className="source-label">
      <Icon name="file" /> Vaswani et al., 2017 <span>p. 2</span>
    </span>
  );
}

export function AuthEvidence() {
  return (
    <div
      className="auth-evidence"
      role="img"
      aria-label="Illustration of a reading note connected to a source and writing document"
    >
      <div className="auth-source-card">
        <span className="card-kind">
          <Icon name="file" /> YOUR SOURCE
        </span>
        <h3>Attention Is All You Need</h3>
        <p>Vaswani et al. · 2017</p>
        <div className="source-card-footer">
          <span>PDF</span>
          <span>Page 2 of 15</span>
        </div>
      </div>
      <div className="auth-note-card">
        <span className="card-kind">
          <Icon name="note" /> YOUR THINKING
        </span>
        <p>What changes when attention replaces recurrence?</p>
        <SourceLabel />
      </div>
      <span className="auth-evidence-label">
        An illustrative source-to-note connection
      </span>
    </div>
  );
}

function WorkspaceDemo() {
  return (
    <div id="workspace" className="workspace-demo">
      <div className="demo-context">
        <span>
          <span className="demo-project-mark">
            <Icon name="folder" />
          </span>{" "}
          Attention & understanding <Icon name="chevron" />
        </span>
        <span className="demo-example">Example workspace</span>
      </div>
      <div
        className="demo-tabbar"
        role="group"
        aria-label="Explore the workspace"
      >
        {(["Read", "Write", "Plan"] as const).map((tab, i) => (
          <span key={tab}>
            <input
              className="demo-radio"
              type="radio"
              id={`demo-${tab.toLowerCase()}`}
              name="demo-view"
              defaultChecked={i === 0}
            />
            <label htmlFor={`demo-${tab.toLowerCase()}`}>
              <Icon name={i === 0 ? "book" : i === 1 ? "note" : "check"} />
              {tab}
            </label>
          </span>
        ))}
        <span className="demo-private">
          <Icon name="link" /> Connected to the source
        </span>
      </div>
      <div className="demo-panels">
        <div className="demo-panel demo-read-panel">
          <aside className="demo-library">
            <span>LIBRARY</span>
            <div className="demo-source-active">
              <Icon name="file" />
              <span>
                Attention Is
                <br />
                All You Need<small>Vaswani et al., 2017</small>
              </span>
            </div>
            <div>
              <Icon name="note" />
              <span>
                Reading notes<small>1 linked note</small>
              </span>
            </div>
            <div className="demo-sidebar-bottom">
              <span>
                One source.
                <br />A growing understanding.
              </span>
            </div>
          </aside>
          <div className="demo-reader">
            <div className="demo-reader-bar">
              <span>
                Page 2 <small>/ 15</small>
              </span>
              <Icon name="search" />
            </div>
            <div className="demo-paper">
              <small>READING THE ORIGINAL</small>
              <h3>
                Attention Is
                <br />
                All You Need
              </h3>
              <p className="demo-paper-byline">Vaswani et al. · 2017</p>
              <div className="demo-paper-divider" />
              <h4>A question to read with</h4>
              <p>
                How does the architecture connect information across a sequence?
              </p>
              <p>
                <mark>
                  Compare the attention mechanism with recurrent approaches.
                </mark>
              </p>
              <p>
                Keep the original passage nearby as you develop your own
                interpretation.
              </p>
              <span className="demo-paper-page">2</span>
            </div>
          </div>
          <aside className="demo-note-rail">
            <span className="demo-rail-heading">
              <Icon name="note" /> My page note
            </span>
            <div className="demo-yellow-note">
              <small>PAGE 2</small>
              <p>What is the trade-off between attention and recurrence?</p>
              <SourceLabel />
            </div>
            <span className="demo-connection">
              <Icon name="link" /> Linked to this page
            </span>
            <p className="demo-rail-caption">
              A thought you can always trace back.
            </p>
          </aside>
        </div>
        <div className="demo-panel demo-write-panel">
          <article className="demo-writing">
            <span className="demo-writing-meta">
              <Icon name="note" /> RESEARCH DOCUMENT
            </span>
            <h3>
              Making sense
              <br />
              of attention.
            </h3>
            <p>
              Start with a question, then bring your reading into a clear line
              of thought.
            </p>
            <SourceLabel />
            <h4>What to compare</h4>
            <p>
              Look at the architecture, the training setup, and the limits of
              the reported results. Keep the source in sight as the argument
              develops.
            </p>
            <blockquote>
              What evidence would change my interpretation?
            </blockquote>
          </article>
          <aside className="demo-note-rail">
            <span className="demo-rail-heading">
              <Icon name="library" /> Source evidence
            </span>
            <div className="demo-source-card">
              <Icon name="file" />
              <h4>Attention Is All You Need</h4>
              <p>Vaswani et al. · 2017</p>
              <SourceLabel />
            </div>
            <span className="demo-connection">
              <Icon name="link" /> One click back to the paper
            </span>
          </aside>
        </div>
        <div className="demo-panel demo-plan-panel">
          <div className="demo-task-view">
            <span className="demo-writing-meta">
              <Icon name="check" /> NEXT STEPS
            </span>
            <h3>
              Give the question
              <br />a next step.
            </h3>
            <p>Try the example tasks. Changes stay in this preview.</p>
            <div className="demo-tasks">
              {[
                "Read the architecture section",
                "Compare attention and recurrence",
                "Discuss the evidence with the team",
              ].map((task, i) => (
                <label key={task}>
                  <input type="checkbox" defaultChecked={i === 0} />
                  <span>
                    {task}
                    <small>
                      {i === 0 ? "Reading" : "Research"} · Attention &
                      understanding
                    </small>
                  </span>
                  <Icon name={i === 2 ? "discussion" : "file"} />
                </label>
              ))}
            </div>
            <SourceLabel />
          </div>
        </div>
      </div>
      <div className="demo-footer">
        <span>
          <span className="demo-dot" /> Illustrative content
        </span>
        <span>Sources, notes and next steps — connected.</span>
      </div>
    </div>
  );
}

export function PublicSite({ appOrigin = "" }: { appOrigin?: string }) {
  const signIn = `${appOrigin}/sign-in`;
  return (
    <div className="public-site atlas-entry-v2">
      <a className="public-skip" href="#public-main">
        Skip to content
      </a>
      <header className="public-header">
        <div>
          <PublicBrand />
          <nav aria-label="Main navigation">
            <a href="#workspace">The workspace</a>
            <a href="#workflow">How it connects</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="public-header-actions">
            <Link className="public-login" href={signIn}>
              Log in
            </Link>
            <Link className="public-button public-primary" href={signIn}>
              Open Atlas <Icon name="arrow" />
            </Link>
          </div>
        </div>
      </header>
      <main id="public-main">
        <section className="public-hero public-container">
          <div className="public-hero-copy">
            <h1>
              A clearer path
              <br />
              from paper
              <br />
              to <em>insight.</em>
            </h1>
            <p>
              Read closely. Keep the evidence. Move your research forward in one
              connected workspace.
            </p>
            <div className="public-hero-actions">
              <Link className="public-button public-primary" href={signIn}>
                Start researching <Icon name="arrow" />
              </Link>
              <a href="#workspace" className="public-text-link">
                Explore the workspace
              </a>
            </div>
            <div className="public-hero-note">
              <span className="public-note-line" />
              <p>
                Built around your sources.
                <br />
                <span>Made for the way you think.</span>
              </p>
            </div>
          </div>
          <WorkspaceDemo />
        </section>
        <section id="workflow" className="public-workflow public-container">
          <div className="public-section-heading">
            <span>THE RESEARCH, CONNECTED</span>
            <h2>
              Keep the thread
              <br />
              of your thinking.
            </h2>
            <p>
              From the first paper to the next conversation,
              <br />
              your work keeps its context.
            </p>
          </div>
          <div className="public-steps">
            {[
              [
                "01",
                "Read with a question.",
                "Bring papers into your library. Highlight a passage and capture the thought it opens up.",
              ],
              [
                "02",
                "Write with the evidence.",
                "Turn notes into source-linked writing. Return to the original page whenever you need a closer look.",
              ],
              [
                "03",
                "Move the work forward.",
                "Connect a task or a discussion to the research behind it. Give the next step a shared context.",
              ],
            ].map(([n, title, body]) => (
              <article key={n}>
                <span>{n}</span>
                <h3>{title}</h3>
                <p>{body}</p>
              </article>
            ))}
          </div>
        </section>
        <section className="public-evidence-section public-container">
          <div>
            <span className="public-kicker">WITH THE SOURCE IN SIGHT</span>
            <h2>
              The link back
              <br />
              makes the difference.
            </h2>
            <p>
              An idea is more useful when you can revisit what led you there.
              Atlas keeps your reading, your notes and your writing within reach
              of one another.
            </p>
            <a href="#workspace" className="public-text-link">
              Take a closer look <Icon name="arrow" />
            </a>
          </div>
          <div className="public-evidence-visual">
            <AuthEvidence />
          </div>
        </section>
        <section id="faq" className="public-faq public-container">
          <div>
            <span className="public-kicker">A FEW THINGS TO KNOW</span>
            <h2>
              Good questions.
              <br />
              Clear answers.
            </h2>
          </div>
          <div>
            {faqs.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Icon name="plus" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="public-closing public-container">
          <div>
            <span className="public-kicker">ATLAS RESEARCH</span>
            <h2>
              Your next idea
              <br />
              starts with a source.
            </h2>
          </div>
          <Link className="public-button" href={signIn}>
            Open your workspace <Icon name="arrow" />
          </Link>
        </section>
      </main>
      <footer className="public-footer public-container">
        <PublicBrand />
        <p>A connected research workspace.</p>
        <nav aria-label="Footer navigation">
          <a href="#workspace">The workspace</a>
          <a href="#workflow">How it connects</a>
          <a href="#faq">FAQ</a>
          <Link href={signIn}>Log in</Link>
        </nav>
        <small>Atlas Research</small>
      </footer>
    </div>
  );
}
