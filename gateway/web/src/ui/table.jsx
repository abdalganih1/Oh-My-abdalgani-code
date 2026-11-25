// DataTable — a real table on desktop, stacked cards on phones (same column definitions).
// columns: [{ key, header, cell?(row,i), align?: 'end'|'center', className?, width?,
//             primary?: true (card title on mobile), hideOnMobile?: true, mobileFull?: true,
//             line?(row) (compact render in the one-line view), lineHide?: true, lineGrow?: true,
//             sort?(row) → value to sort by (default row[key]); sortable?: false to turn it off }]
// Clicking a column header sorts: descending → ascending → original order.
// mobileView: 'cards' (default) | 'line' (one dense row per item) | 'table' (the full table, scrolls sideways)
import { Fragment, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { ArrowDown, ArrowUp, ChevronsUpDown, LayoutList, Rows3, Table2 } from 'lucide-react';
import { useMedia } from '../lib/hooks.js';
import { cn, Empty, Segmented, Skeleton } from './core.jsx';

export const MOBILE_QUERY = '(max-width: 760px)';
const VIEWS = [
  { value: 'cards', label: 'بطاقات', icon: LayoutList },
  { value: 'line', label: 'سطر', icon: Rows3 },
  { value: 'table', label: 'جدول', icon: Table2 },
];
/** View picker for DataTable's phone layouts — renders nothing on wide screens. */
export function MobileViewToggle({ value, onChange, className }) {
  const mobile = useMedia(MOBILE_QUERY);
  if (!mobile) return null;
  return <Segmented size="sm" value={value} onChange={onChange} options={VIEWS} className={className} />;
}

const val = (c, r, i) => (c.cell ? c.cell(r, i) : r[c.key]);
const sortVal = (c, r) => (c.sort ? c.sort(r) : r[c.key]);
const isPrim = (v) => typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean';
const canSort = (c, rows) => c.sortable !== false && !!c.header && (c.sort || rows.some((r) => isPrim(r[c.key])));
const collator = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });
/** Empty values (null/undefined/'') always go last, whichever direction. */
function compare(a, b) {
  const ea = a == null || a === '', eb = b == null || b === '';
  if (ea || eb) return ea === eb ? 0 : ea ? 1 : -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  if (typeof a === 'boolean' || typeof b === 'boolean') return Number(a) - Number(b);
  return collator.compare(String(a), String(b));
}

export function DataTable({ columns, rows, rowKey = (r, i) => r.id ?? i, onRowClick, empty, loading, className, dense, maxHeight, groupBy, groupLabel, rowClassName, stickyHeader = true, mobileView = 'cards' }) {
  const mobile = useMedia(MOBILE_QUERY);
  const view = mobile ? mobileView : 'table';
  const [sort, setSort] = useState(null); // { key, dir: 'asc' | 'desc' }
  const sortCol = sort && !groupBy ? columns.find((c) => c.key === sort.key) : null;
  rows = useMemo(() => {
    if (!sortCol || !rows?.length) return rows;
    const m = sort.dir === 'asc' ? 1 : -1;
    return rows.map((r, i) => [r, i]).sort(([a, ia], [b, ib]) => {
      const va = sortVal(sortCol, a), vb = sortVal(sortCol, b);
      const ea = va == null || va === '', eb = vb == null || vb === '';
      return (ea || eb ? compare(va, vb) : m * compare(va, vb)) || ia - ib;
    }).map(([r]) => r);
  }, [rows, sortCol, sort?.dir]);
  const toggleSort = (c) => setSort((s) => (s?.key !== c.key ? { key: c.key, dir: 'desc' } : s.dir === 'desc' ? { key: c.key, dir: 'asc' } : null));
  if (loading && !rows?.length) {
    return <div className={cn('space-y-2', className)}>{Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-11" />)}</div>;
  }
  if (!rows?.length) return empty === null ? null : (typeof empty === 'object' && empty?.type ? empty : <Empty {...(empty || { title: 'ما في بيانات' })} />);

  const groups = [];
  rows.forEach((r, i) => {
    const g = groupBy ? groupBy(r) : null;
    if (!groups.length || groups.at(-1).g !== g) groups.push({ g, items: [] });
    groups.at(-1).items.push([r, i]);
  });

  if (view === 'line') {
    const cols = columns.filter((c) => !c.hideOnMobile && !c.lineHide);
    return (
      <div className={cn('min-w-0 overflow-auto rounded-xl border border-line', className)} style={maxHeight ? { maxHeight } : undefined}>
        {groups.map(({ g, items }, gi) => (
          <Fragment key={gi}>
            {groupBy && <div className="sticky top-0 z-[1] border-b border-line bg-solid/95 px-2.5 py-1.5 text-[11.5px] font-semibold text-muted backdrop-blur">{groupLabel ? groupLabel(g) : g}</div>}
            {items.map(([r, i]) => (
              <div key={rowKey(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn('flex min-w-0 items-center gap-2 whitespace-nowrap border-b border-line/70 px-2.5 py-2 text-[12px] last:border-0', onRowClick && 'cursor-pointer active:bg-accent-soft/60', rowClassName?.(r))}>
                {cols.map((c) => (
                  <div key={c.key} className={cn('min-w-0', c.lineGrow ? 'flex-1' : 'shrink-0', c.align === 'end' && 'num')}>
                    {c.line ? c.line(r, i) : val(c, r, i)}
                  </div>
                ))}
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    );
  }

  if (view === 'cards') {
    const primary = columns.find((c) => c.primary) || columns[0];
    const rest = columns.filter((c) => c !== primary && !c.hideOnMobile);
    return (
      <div className={cn('flex flex-col gap-2.5', className)}>
        {groups.map(({ g, items }, gi) => (
          <Fragment key={gi}>
            {groupBy && <div className="px-1 pt-2 text-xs font-semibold text-muted">{groupLabel ? groupLabel(g) : g}</div>}
            {items.map(([r, i]) => (
              <div key={rowKey(r, i)} onClick={onRowClick ? () => onRowClick(r) : undefined}
                className={cn('rounded-2xl border border-line bg-solid/60 p-3.5', onRowClick && 'cursor-pointer active:scale-[.99] transition-transform', rowClassName?.(r))}>
                <div className="mb-2 min-w-0 text-[14.5px] font-medium">{val(primary, r, i)}</div>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {rest.map((c) => (
                    <div key={c.key} className={cn('min-w-0', c.mobileFull && 'col-span-2')}>
                      {c.header && <div className="text-[11px] font-semibold text-muted">{c.header}</div>}
                      <div className="min-w-0 break-words text-[13px]">{val(c, r, i)}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Fragment>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('min-w-0 overflow-auto rounded-2xl border border-line', className)} style={maxHeight ? { maxHeight } : undefined}>
      <table className="w-full border-collapse text-[13.5px]">
        <thead className={cn(stickyHeader && 'sticky top-0 z-[1]')}>
          <tr className="bg-sunken/90 backdrop-blur">
            {columns.map((c) => {
              const sortable = !groupBy && canSort(c, rows);
              const active = sortable && sort?.key === c.key;
              const Icon = active ? (sort.dir === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;
              return (
                <th key={c.key} style={c.width ? { width: c.width } : undefined}
                  aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                  className={cn('whitespace-nowrap border-b border-line px-3.5 py-2.5 text-start text-[11.5px] font-semibold tracking-wide text-muted', c.align === 'end' && 'text-end', c.align === 'center' && 'text-center', c.thClassName)}>
                  {sortable ? (
                    <button type="button" onClick={() => toggleSort(c)} title="ترتيب"
                      className={cn('group inline-flex items-center gap-1 rounded hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40', active && 'text-fg')}>
                      {c.header}
                      <Icon size={12} className={cn('shrink-0', active ? 'opacity-100' : 'opacity-0 group-hover:opacity-60')} />
                    </button>
                  ) : c.header}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {groups.map(({ g, items }, gi) => (
            <Fragment key={gi}>
              {groupBy && (
                <tr><td colSpan={columns.length} className="sticky top-[38px] z-[1] border-b border-line bg-solid/95 px-3.5 pb-1.5 pt-3 text-xs font-semibold text-muted backdrop-blur">{groupLabel ? groupLabel(g) : g}</td></tr>
              )}
              {items.map(([r, i]) => (
                <motion.tr key={rowKey(r, i)} layout="position" onClick={onRowClick ? () => onRowClick(r) : undefined}
                  tabIndex={onRowClick ? 0 : undefined} onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(r); } : undefined}
                  className={cn('border-b border-line/70 transition-colors last:border-0 hover:bg-accent-soft/50', onRowClick && 'cursor-pointer focus-visible:bg-accent-soft focus-visible:outline-none', rowClassName?.(r))}>
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-3.5 align-middle', dense ? 'py-2' : 'py-3', mobile && 'whitespace-nowrap', c.align === 'end' && 'text-end num', c.align === 'center' && 'text-center', c.className)}>{val(c, r, i)}</td>
                  ))}
                </motion.tr>
              ))}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
