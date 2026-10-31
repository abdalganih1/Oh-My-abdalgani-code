// DataTable — a real table on desktop, stacked cards on phones (same column definitions).
// columns: [{ key, header, cell?(row,i), align?: 'end'|'center', className?, width?,
//             primary?: true (card title on mobile), hideOnMobile?: true, mobileFull?: true }]
import { Fragment } from 'react';
import { motion } from 'motion/react';
import { useMedia } from '../lib/hooks.js';
import { cn, Empty, Skeleton } from './core.jsx';

const val = (c, r, i) => (c.cell ? c.cell(r, i) : r[c.key]);

export function DataTable({ columns, rows, rowKey = (r, i) => r.id ?? i, onRowClick, empty, loading, className, dense, maxHeight, groupBy, groupLabel, rowClassName, stickyHeader = true }) {
  const mobile = useMedia('(max-width: 760px)');
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

  if (mobile) {
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
            {columns.map((c) => (
              <th key={c.key} style={c.width ? { width: c.width } : undefined}
                className={cn('whitespace-nowrap border-b border-line px-3.5 py-2.5 text-start text-[11.5px] font-semibold tracking-wide text-muted', c.align === 'end' && 'text-end', c.align === 'center' && 'text-center', c.thClassName)}>{c.header}</th>
            ))}
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
                    <td key={c.key} className={cn('px-3.5 align-middle', dense ? 'py-2' : 'py-3', c.align === 'end' && 'text-end num', c.align === 'center' && 'text-center', c.className)}>{val(c, r, i)}</td>
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
