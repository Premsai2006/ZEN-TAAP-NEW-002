export const PAGE_SIZE = 10;

export function paginate(items, page, pageSize = PAGE_SIZE) {
  const list = items || [];
  const start = (page - 1) * pageSize;
  return list.slice(start, start + pageSize);
}

export default function PageBar({ page, total, pageSize = PAGE_SIZE, onPage, testId = "page-bar" }) {
  if (!total || total <= pageSize) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safe = Math.min(Math.max(1, page), pages);
  return (
    <div className="page-bar" data-testid={testId}>
      <button
        type="button"
        className="mini-btn"
        disabled={safe <= 1}
        onClick={() => onPage(safe - 1)}
        data-testid={`${testId}-prev`}
      >
        Previous
      </button>
      <span className="page-bar-meta">
        Page {safe} of {pages} · {total} items
      </span>
      <button
        type="button"
        className="mini-btn"
        disabled={safe >= pages}
        onClick={() => onPage(safe + 1)}
        data-testid={`${testId}-next`}
      >
        Next
      </button>
    </div>
  );
}
