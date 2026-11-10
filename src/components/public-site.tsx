import Link from "next/link";
import { AtlasCompass, PublicBrand } from "./public-brand";
import { Icon } from "./ui";

function ResearchPreview({ reading = false }: { reading?: boolean }) {
  return (
    <div
      className={`research-preview ${reading ? "preview-reading" : ""}`}
      role="img"
      aria-label={
        reading
          ? "Illustrative PDF reading view with linked page notes"
          : "Illustrative writing view with a source citation and related research task"
      }
    >
      <div className="preview-topbar">
        <span>
          <Icon name="folder" /> Attention & understanding
        </span>
        <span>
          <Icon name="note" /> {reading ? "Read" : "Write"}
        </span>
        <span>
          <Icon name="link" /> Evidence
        </span>
      </div>
      <div className="preview-layout">
        <aside className="preview-sidebar">
          <strong>Sources</strong>
          <span className="preview-selected">
            <Icon name="file" /> Attention Is All You Need
          </span>
          <span>
            <Icon name="note" /> Reading notes
          </span>
          <strong>Project</strong>
          <span>
            <Icon name="note" /> Evidence synthesis
          </span>
          <span>
            <Icon name="check" /> Review the findings
          </span>
          <span>
            <Icon name="discussion" /> Team discussion
          </span>
        </aside>
        <div className="preview-document">
          <small>{reading ? "PAPER · PAGE 2" : "RESEARCH NOTES"}</small>
          <h3>
            {reading
              ? "Attention Is All You Need"
              : "A clearer view of the evidence"}
          </h3>
          <p>
            {reading
              ? "The Transformer uses attention mechanisms to connect information across a sequence."
              : "How does attention compare with recurrent approaches?"}
          </p>
          <p>
            {reading ? (
              <mark>
                Capture the passage that matters, then keep your own
                interpretation beside it.
              </mark>
            ) : (
              "Read the original paper, record the evidence, and return to the passage as your understanding develops."
            )}
          </p>
          <span className="preview-citation">
            <Icon name="file" /> Vaswani et al., 2017 · p. 2
          </span>
          <h4>{reading ? "Read. Reflect. Connect." : "Questions to follow"}</h4>
          <p>
            Compare the architecture, the training setup, and the limits of the
            reported results.
          </p>
          <div className="preview-rule" />
          <div className="preview-rule short" />
        </div>
        <aside className="preview-evidence">
          <strong>{reading ? "Page notes" : "Source evidence"}</strong>
          <div>
            <span className="preview-page">Page 2</span>
            <Icon name="file" />
            <h4>Attention Is All You Need</h4>
            <p>Keep a note linked to this exact source and page.</p>
            <small>Vaswani et al. · 2017</small>
          </div>
          <div className="preview-linked">
            <Icon name="check" />
            <span>
              Compare the evidence<small>Linked research task</small>
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}

const faq = [
  [
    "What can I do with Atlas?",
    "Organize sources in a project, read and annotate PDFs, write source-linked documents, assign tasks, and discuss the research with your team.",
  ],
  [
    "Can I trace a note back to its source?",
    "Yes. Source-linked notes and document citations retain their source, PDF version and page so you can return to the original evidence.",
  ],
  [
    "What sources can I add?",
    "Search scholarly metadata with Crossref, add a DOI or article link, enter source details, and upload a PDF. Word, slides, YouTube and cloud-drive imports are not currently supported.",
  ],
  [
    "Can I work with a small team?",
    "Atlas supports personal and shared workspaces with project permissions, assigned tasks and project discussions. Each collaborator needs an existing account in this installation while email delivery is disabled.",
  ],
  [
    "Are AI answers available?",
    "AI answers are currently turned off in this installation. You can review source evidence and prepare questions without sending a model request.",
  ],
  [
    "How do I get access?",
    "Sign in with an existing Atlas account. New registration and password recovery are unavailable in the current preview while email delivery is disabled.",
  ],
];

export function PublicSite() {
  return (
    <div className="public-site">
      <a href="#public-main" className="public-skip">
        Skip to content
      </a>
      <header className="public-header">
        <div>
          <PublicBrand />
          <nav aria-label="Main navigation">
            <a href="#about">About</a>
            <a href="#workflow">Workflow</a>
            <a href="#faq">FAQ</a>
          </nav>
          <div className="public-header-actions">
            <Link className="public-button public-login" href="/sign-in">
              Log in
            </Link>
            <Link className="public-button public-primary" href="/sign-in">
              Start researching
            </Link>
          </div>
        </div>
      </header>
      <main id="public-main">
        <section className="public-hero">
          <div className="public-terrain" aria-hidden="true" />
          <div className="public-hero-copy">
            <h1>
              Your research,
              <br />
              connected to its sources.
            </h1>
            <p>
              Read papers, capture evidence, and turn your notes
              <br className="desktop-break" /> into clear, connected work.
            </p>
            <Link
              className="public-button public-primary public-hero-cta"
              href="/sign-in"
            >
              Start researching
              <Icon name="arrow" />
            </Link>
          </div>
          <figure className="public-hero-preview">
            <ResearchPreview />
            <figcaption>
              Illustrative research workflow · example content
            </figcaption>
          </figure>
        </section>
        <section className="public-about public-container" id="about">
          <h2>
            A place for your
            <br />
            next question.
          </h2>
          <div>
            <p>
              Research takes shape across papers, passages, ideas, and
              conversations. Atlas brings those pieces into one connected
              workspace.
            </p>
            <p>
              Keep the source close to the thought. Move from reading to
              writing, then from an open question to a shared next step.
            </p>
          </div>
        </section>
        <section className="public-feature public-container" id="workflow">
          <div className="public-feature-copy">
            <span className="public-kicker">READ & ANNOTATE</span>
            <h2>Read with context.</h2>
            <p>
              Bring your papers, take focused notes, and keep the evidence that
              matters attached to its original page.
            </p>
            <Link href="/sign-in">
              Open your workspace <Icon name="arrow" />
            </Link>
          </div>
          <div className="public-feature-art public-art-blue">
            <ResearchPreview reading />
          </div>
        </section>
        <section className="public-feature public-feature-reverse public-container">
          <div className="public-feature-copy">
            <span className="public-kicker">WRITE & CONNECT</span>
            <h2>Write with evidence.</h2>
            <p>
              Turn your notes into clear, source-linked writing. Follow a
              citation back to the paper whenever you need a closer look.
            </p>
            <Link href="/sign-in">
              Continue your research <Icon name="arrow" />
            </Link>
          </div>
          <div className="public-feature-art public-art-pink">
            <ResearchPreview />
          </div>
        </section>
        <section className="public-connected public-container">
          <h2>
            Connect the work
            <br />
            around your research.
          </h2>
          <div className="public-workflow-grid">
            {(
              [
                [
                  "folder",
                  "One project, shared context.",
                  "Keep sources, notes, documents and decisions together in a personal or shared workspace.",
                ],
                [
                  "check",
                  "Give the next step a home.",
                  "Turn a question into an assigned task, with a link back to the research behind it.",
                ],
                [
                  "discussion",
                  "Keep the conversation connected.",
                  "Discuss the work with your team and follow updates through your Inbox.",
                ],
              ] as const
            ).map(([icon, title, description]) => (
              <article key={title}>
                <div>
                  <Icon name={icon} />
                </div>
                <h3>{title}</h3>
                <p>{description}</p>
              </article>
            ))}
          </div>
        </section>
        <section id="faq" className="public-faq public-container">
          <h2>
            A few things
            <br />
            to know.
          </h2>
          <div>
            {faq.map(([question, answer]) => (
              <details key={question}>
                <summary>
                  {question}
                  <Icon name="chevron" />
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>
        <section className="public-closing">
          <div className="public-terrain" aria-hidden="true" />
          <AtlasCompass />
          <h2>
            Make room for your
            <br />
            next discovery.
          </h2>
          <Link className="public-button public-primary" href="/sign-in">
            Start researching <Icon name="arrow" />
          </Link>
        </section>
      </main>
      <footer className="public-footer public-container">
        <div>
          <PublicBrand />
          <p>A connected research workspace.</p>
        </div>
        <nav aria-label="Footer navigation">
          <a href="#about">About</a>
          <a href="#workflow">Workflow</a>
          <a href="#faq">FAQ</a>
          <Link href="/sign-in">Log in</Link>
        </nav>
        <small>Atlas Research</small>
      </footer>
    </div>
  );
}
