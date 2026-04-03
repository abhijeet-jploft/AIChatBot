/**
 * Reusable sortable <th> for admin tables.
 *
 * Usage:
 *   <SortableHeader label="Name" field="name" sort={sort} onSort={setSort} className="..." />
 *
 * `sort` = { field: string, dir: 'asc'|'desc' }
 * `onSort(next)` — callback receiving the next sort object.
 */
export default function SortableHeader({ label, field, sort, onSort, className = '' }) {
  const active = sort?.field === field;
  const dir = active ? sort.dir : null;

  const handleClick = () => {
    if (!active) {
      onSort({ field, dir: 'asc' });
    } else if (dir === 'asc') {
      onSort({ field, dir: 'desc' });
    } else {
      onSort({ field: null, dir: null });
    }
  };

  const iconClass = active ? dir : '';

  return (
    <th
      className={`sortable ${className}`.trim()}
      onClick={handleClick}
      aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      {label}
      <span className={`sort-icon ${iconClass}`}>
        <span className="arrow-up">▲</span>
        <span className="arrow-down">▼</span>
      </span>
    </th>
  );
}
