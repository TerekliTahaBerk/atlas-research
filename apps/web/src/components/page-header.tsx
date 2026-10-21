import { Badge } from '@atlas/ui/components/badge';
export function PageHeader({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <header className="page-heading">
      <Badge variant="secondary">
        <span className="status-dot" />
        Interface preview
      </Badge>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}
