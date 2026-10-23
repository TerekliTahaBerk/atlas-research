# Citation export

Pure functions in `packages/core/src/citation.ts`; endpoints return files (`Cache-Control: private, no-store`, `nosniff`, attachment disposition) and the standard error envelope on failure.

- `GET /api/v1/papers/:projectPaperId/export?format=bibtex|ris`
- `GET /api/v1/projects/:projectId/export?format=bibtex|ris[&collectionId=…]` (bounded to 1,000 papers, sorted by title, archived papers excluded)

Both require `project.read`. Entries come only from metadata saved with the project paper (or the private title); nothing is looked up or invented at export time.

## BibTeX

Type: `article` (journal articles with a venue), `inproceedings` (proceedings/conference types), otherwise `misc`. Fields are written only when present: `title`, `author` (joined with `and`; names containing a comma or the word "and" are braced), `year`, `journal`/`booktitle`/`howpublished`, `doi`, `url` (DOI resolver URL when a DOI exists, else the landing page). LaTeX-active characters `\ { } # $ % & _ ^ ~` are escaped; Unicode names are preserved for UTF-8 BibTeX/biber. Keys are `{first-author family token}{year|nd}{first significant title word}`, ASCII-folded and lowercased; duplicates in one export get `b`, `c`, … suffixes.

## RIS

`TY` (`JOUR`, `CPAPER`, `GEN`), `TI`, one `AU` per author, `PY`, `T2`, `DO`, `UR`, `ER`, CRLF line endings, whitespace-normalized values.

## UI

Copy DOI, copy a formatted plain reference (`formatReference`), BibTeX preview/copy, `.bib`/`.ris` downloads per paper, and project/collection export from the library toolbar. CSL style formatting is not included.
