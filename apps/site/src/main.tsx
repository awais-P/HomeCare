import './styles.css';

import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';

import { LEGAL_DOCS, LEGAL_UPDATED, type LegalDocId } from '@homecare/shared/legal';

const PAGES: { path: string; doc: LegalDocId }[] = [
  { path: '/terms', doc: 'terms' },
  { path: '/privacy', doc: 'privacy' },
  { path: '/delete-account', doc: 'delete-account' },
];

function LegalPage({ doc }: { doc: LegalDocId }) {
  const legal = LEGAL_DOCS[doc];
  useEffect(() => {
    document.title = `${legal.title} — HomeCare`;
  }, [legal.title]);
  return (
    <article className="doc">
      <h1>{legal.title}</h1>
      <p className="meta">Last updated {LEGAL_UPDATED}</p>
      <p className="draft">Draft — will be reviewed before launch.</p>
      <p>{legal.intro}</p>
      {legal.sections.map((section) => (
        <section key={section.heading}>
          <h2>{section.heading}</h2>
          {section.paragraphs?.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {section.bullets ? (
            <ul>
              {section.bullets.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </article>
  );
}

function Home() {
  return (
    <article className="doc">
      <h1>HomeCare</h1>
      <p>Errands from any shop and verified home services in Islamabad and Rawalpindi.</p>
      <ul className="links">
        {PAGES.map((p) => (
          <li key={p.path}>
            <a href={p.path}>{LEGAL_DOCS[p.doc].title}</a>
          </li>
        ))}
      </ul>
    </article>
  );
}

function App() {
  const page = PAGES.find((p) => window.location.pathname.replace(/\/$/, '') === p.path);
  return (
    <>
      <header className="top">
        <a href="/" className="brand">
          <span className="mark">⌂</span> HomeCare
        </a>
        <nav>
          {PAGES.map((p) => (
            <a key={p.path} href={p.path}>
              {LEGAL_DOCS[p.doc].title.replace('Delete your HomeCare account', 'Delete account')}
            </a>
          ))}
        </nav>
      </header>
      <main>{page ? <LegalPage doc={page.doc} /> : <Home />}</main>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
