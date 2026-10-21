'use client';
import { useState } from 'react';
import { FileText, BookOpen, Code2, Play, Sparkles } from 'lucide-react';
import { Button } from '@atlas/ui/components/button';
import { PageHeader } from '@/components/page-header';
import { PreviewNotice, CapabilityButton } from './primitives';
import { useAtlas } from '@/features/atlas-ai/atlas-provider';
const tex =
  '\\documentclass{article}\n\\title{Thoughtful Human--AI Collaboration}\n\\author{Sample Research Team}\n\\begin{document}\n\\maketitle\n\\section{Introduction}\nResearch tools should preserve agency,\nkeep evidence traceable, and support reflection.\n\n\\section{Research questions}\nHow can we evaluate understanding\nalongside task completion?\n\n\\section{Related work}\n% Verified references will be added here.\n\\end{document}';
export function ManuscriptsScreen() {
  const [source, setSource] = useState(tex);
  const [file, setFile] = useState('main.tex');
  const { openAssistant } = useAtlas();
  return (
    <div>
      <PageHeader
        title="Manuscripts"
        description="From connected ideas to a considered manuscript."
      />
      <PreviewNotice phase="07">
        Future workspace · editable local LaTeX text, static typesetting
        illustration. No compilation or export.
      </PreviewNotice>
      <div className="manuscript-workspace">
        <aside className="document-tree">
          <h2>Manuscript files</h2>
          {['main.tex', 'references.bib', 'figures/'].map((name) => (
            <button
              key={name}
              aria-current={file === name ? 'page' : undefined}
              onClick={() => setFile(name)}
            >
              <FileText aria-hidden="true" />
              {name}
            </button>
          ))}
          <h3>Sections</h3>
          <p>
            Introduction
            <br />
            Research questions
            <br />
            Related work
          </p>
          <h3>References & figures</h3>
          <p className="muted">No verified sources attached.</p>
        </aside>
        <section className="latex-editor">
          <header>
            <Code2 aria-hidden="true" />
            <strong>{file}</strong>
            <CapabilityButton title="Compile manuscript" phase="07">
              Compile unavailable
            </CapabilityButton>
          </header>
          <textarea
            aria-label="LaTeX source preview"
            spellCheck={false}
            value={
              file === 'main.tex'
                ? source
                : file === 'references.bib'
                  ? '% No bibliography entries. Attach verified citations in a future phase.'
                  : '% Figure upload and linking are future capabilities.'
            }
            readOnly={file !== 'main.tex'}
            onChange={(e) => setSource(e.target.value)}
          />
          <Button
            variant="secondary"
            onClick={() =>
              openAssistant({
                context: 'manuscript',
                references: [
                  {
                    id: 'manuscript-sample',
                    kind: 'manuscript',
                    title: 'Human–AI collaboration · draft',
                  },
                ],
              })
            }
          >
            <Sparkles data-icon="inline-start" />
            Write with Atlas
          </Button>
        </section>
        <section className="manuscript-preview">
          <header>
            <BookOpen aria-hidden="true" />
            Static layout · not compiled
          </header>
          <article>
            <h2>Thoughtful Human–AI Collaboration</h2>
            <p className="metadata">Sample Research Team</p>
            <h3>1. Introduction</h3>
            <p>
              Research tools should preserve agency, keep evidence traceable,
              and support reflection.
            </p>
            <h3>2. Research questions</h3>
            <p>How can we evaluate understanding alongside task completion?</p>
            <p className="metadata">
              This illustration does not update from the source editor.
            </p>
          </article>
          <p>Compiler status: unavailable · no compilation attempted.</p>
          <CapabilityButton title="Export manuscript" phase="07">
            Export preview
          </CapabilityButton>
        </section>
      </div>
    </div>
  );
}
export function ExperimentsScreen() {
  const { openAssistant } = useAtlas();
  return (
    <div>
      <PageHeader
        title="Experiments"
        description="A future space for reproducible exploration."
      />
      <PreviewNotice phase="07">
        Notebook layout preview · code and outputs are authored examples.
        Nothing can execute.
      </PreviewNotice>
      <div className="experiment-layout">
        <section className="notebook-cells">
          <header>
            <h2>Exploring collaboration patterns</h2>
            <CapabilityButton title="Notebook execution" phase="07">
              <Play data-icon="inline-start" />
              Run unavailable
            </CapabilityButton>
          </header>
          <article className="markdown-cell">
            <p className="metadata">MARKDOWN CELL</p>
            <h3>Start with a question.</h3>
            <p>
              How might researcher control change the way people evaluate an
              assistant’s suggestions? Record assumptions before interpreting
              results.
            </p>
          </article>
          <article className="code-cell">
            <p className="metadata">CODE CELL · NOT EXECUTED</p>
            <pre>
              <code>
                {
                  '# Illustrative code only\nimport pandas as pd\n\n# Future: authorized dataset artifact\ndata = pd.DataFrame({\n    "condition": ["baseline", "assisted"],\n    "observations": [12, 12],\n})\ndata.groupby("condition").count()'
                }
              </code>
            </pre>
          </article>
          <article className="output-cell">
            <p className="metadata">STATIC OUTPUT EXAMPLE · NOT A RESULT</p>
            <table>
              <caption>Illustrative observations</caption>
              <thead>
                <tr>
                  <th>Condition</th>
                  <th>Observations</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>baseline</td>
                  <td>12</td>
                </tr>
                <tr>
                  <td>assisted</td>
                  <td>12</td>
                </tr>
              </tbody>
            </table>
          </article>
        </section>
        <aside className="context-panel">
          <h2>Environment</h2>
          <p>No runtime connected.</p>
          <h3>Dataset</h3>
          <p>No file or private dataset loaded.</p>
          <h3>Artifacts</h3>
          <p>
            Future plots, outputs, and experiment versions will stay connected
            to the project.
          </p>
          <Button
            variant="secondary"
            onClick={() =>
              openAssistant({
                context: 'experiment',
                prompt: 'Explore a reproducibility checklist',
              })
            }
          >
            <Sparkles data-icon="inline-start" />
            Explore with Atlas
          </Button>
        </aside>
      </div>
    </div>
  );
}
