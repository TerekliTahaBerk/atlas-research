/**
 * Synthetic preview fixtures (Phase 00.5A). These are authored design content
 * from the approved Claude Design handoff — not production domain models,
 * not tenant data and never persisted. Emails use reserved `.example` domains.
 */
export type PersonId = 'taha' | 'ayse' | 'mehmet' | 'elif' | 'jonas' | 'atlas';
export interface Person {
  id: PersonId;
  name: string;
  short: string;
  initials: string;
  /** Avatar fill; all pass 4.5:1 with white initials. */
  color: string;
  email: string;
}
export const people: Record<PersonId, Person> = {
  taha: {
    id: 'taha',
    name: 'Taha Berk Terekli',
    short: 'Taha',
    initials: 'TB',
    color: '#4e7a5e',
    email: 'taha@kayalab.example',
  },
  ayse: {
    id: 'ayse',
    name: 'Ayşe Demir',
    short: 'Ayşe',
    initials: 'AD',
    color: '#7d6648',
    email: 'ayse.demir@kayalab.example',
  },
  mehmet: {
    id: 'mehmet',
    name: 'Mehmet Kaya',
    short: 'Mehmet',
    initials: 'MK',
    color: '#4d6577',
    email: 'mehmet.kaya@kayalab.example',
  },
  elif: {
    id: 'elif',
    name: 'Elif Şahin',
    short: 'Elif',
    initials: 'EŞ',
    color: '#7a4e63',
    email: 'elif.sahin@kayalab.example',
  },
  jonas: {
    id: 'jonas',
    name: 'Jonas Berg',
    short: 'Jonas',
    initials: 'JB',
    color: '#5e5a7a',
    email: 'jonas.berg@uni.example',
  },
  atlas: {
    id: 'atlas',
    name: 'Atlas',
    short: 'Atlas',
    initials: 'A',
    color: '#2b7d46',
    email: '',
  },
};
export const currentUser = people.taha;
export const sampleWorkspace = {
  id: 'sample',
  name: 'Kaya Lab',
  members: 5,
  kind: 'Lab workspace',
};
export const workspaceMembers: { id: PersonId; role: string }[] = [
  { id: 'taha', role: 'Owner' },
  { id: 'ayse', role: 'Editor' },
  { id: 'mehmet', role: 'Editor' },
  { id: 'elif', role: 'Member' },
  { id: 'jonas', role: 'Guest' },
];
