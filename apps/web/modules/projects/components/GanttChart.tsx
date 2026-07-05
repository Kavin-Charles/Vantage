'use client';

export interface GanttTask {
  id: string;
  title: string;
  start_date: string | null;
  due_date: string | null;
  status_color: string;
  parent_id: string | null;
}

interface Props {
  tasks: GanttTask[];
  startDate: Date;
  endDate: Date;
  onTaskClick?: (taskId: string) => void;
}

const DAY_PX = 32;
const ROW_H = 40;
const LABEL_W = 220;
const HEADER_H = 48;

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str;
}

function getDaysArray(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  cur.setHours(0, 0, 0, 0);
  const endMs = new Date(end).setHours(0, 0, 0, 0);
  while (cur.getTime() <= endMs) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

interface MonthGroup {
  label: string;
  startDay: number;
  count: number;
}

function getMonthGroups(days: Date[]): MonthGroup[] {
  const groups: MonthGroup[] = [];
  let cur: MonthGroup | null = null;
  for (let i = 0; i < days.length; i++) {
    const d = days[i]!;
    const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    if (!cur || cur.label !== label) {
      if (cur) groups.push(cur);
      cur = { label, startDay: i, count: 1 };
    } else {
      cur.count++;
    }
  }
  if (cur) groups.push(cur);
  return groups;
}

export default function GanttChart({ tasks, startDate, endDate, onTaskClick }: Props) {
  const days = getDaysArray(startDate, endDate);
  const monthGroups = getMonthGroups(days);
  const gridW = days.length * DAY_PX;
  const totalW = LABEL_W + gridW;
  const totalH = HEADER_H + tasks.length * ROW_H;
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function dayIndex(dateStr: string | null): number | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    const start0 = new Date(startDate);
    start0.setHours(0, 0, 0, 0);
    const diff = Math.round((d.getTime() - start0.getTime()) / 86400000);
    return diff;
  }

  const todayIdx = dayIndex(today.toISOString());

  return (
    <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: '100%', fontFamily: 'DM Sans' }}>
      <svg
        width={totalW}
        height={totalH}
        style={{ display: 'block', minWidth: totalW }}
      >
        {/* Background */}
        <rect x={0} y={0} width={totalW} height={totalH} fill="var(--bg)" />

        {/* Label column header */}
        <rect x={0} y={0} width={LABEL_W} height={HEADER_H} fill="var(--surface)" />
        <line x1={LABEL_W} y1={0} x2={LABEL_W} y2={totalH} stroke="var(--border)" strokeWidth={1} />

        {/* Month headers */}
        {monthGroups.map((mg) => (
          <g key={mg.label + mg.startDay}>
            <rect
              x={LABEL_W + mg.startDay * DAY_PX}
              y={0}
              width={mg.count * DAY_PX}
              height={HEADER_H / 2}
              fill="var(--surface)"
            />
            <text
              x={LABEL_W + mg.startDay * DAY_PX + (mg.count * DAY_PX) / 2}
              y={HEADER_H / 4 + 5}
              textAnchor="middle"
              fill="var(--text2)"
              fontSize={11}
              fontFamily="DM Sans"
            >
              {mg.label}
            </text>
            <line
              x1={LABEL_W + mg.startDay * DAY_PX}
              y1={0}
              x2={LABEL_W + mg.startDay * DAY_PX}
              y2={totalH}
              stroke="var(--border)"
              strokeWidth={1}
            />
          </g>
        ))}

        {/* Day headers + vertical lines */}
        {days.map((d, i) => {
          const isWeekend = d.getDay() === 0 || d.getDay() === 6;
          return (
            <g key={i}>
              {isWeekend && (
                <rect
                  x={LABEL_W + i * DAY_PX}
                  y={HEADER_H / 2}
                  width={DAY_PX}
                  height={totalH - HEADER_H / 2}
                  fill="var(--surface2)"
                  opacity={0.5}
                />
              )}
              <text
                x={LABEL_W + i * DAY_PX + DAY_PX / 2}
                y={HEADER_H - 8}
                textAnchor="middle"
                fill={isWeekend ? 'var(--text3)' : 'var(--text2)'}
                fontSize={10}
                fontFamily="DM Sans"
              >
                {d.getDate()}
              </text>
              <line
                x1={LABEL_W + (i + 1) * DAY_PX}
                y1={HEADER_H / 2}
                x2={LABEL_W + (i + 1) * DAY_PX}
                y2={totalH}
                stroke="var(--border)"
                strokeWidth={0.5}
              />
            </g>
          );
        })}

        {/* Header bottom border */}
        <line x1={0} y1={HEADER_H} x2={totalW} y2={HEADER_H} stroke="var(--border)" strokeWidth={1} />

        {/* Today line */}
        {todayIdx !== null && todayIdx >= 0 && todayIdx < days.length && (
          <line
            x1={LABEL_W + todayIdx * DAY_PX + DAY_PX / 2}
            y1={HEADER_H}
            x2={LABEL_W + todayIdx * DAY_PX + DAY_PX / 2}
            y2={totalH}
            stroke="var(--blue)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}

        {/* Task rows */}
        {tasks.map((task, rowIdx) => {
          const y = HEADER_H + rowIdx * ROW_H;
          const startIdx = dayIndex(task.start_date);
          const endIdx = dayIndex(task.due_date);
          const hasBar = startIdx !== null && endIdx !== null;

          return (
            <g
              key={task.id}
              style={{ cursor: onTaskClick ? 'pointer' : undefined }}
              onClick={() => onTaskClick?.(task.id)}
            >
              {/* Row bg */}
              <rect x={0} y={y} width={totalW} height={ROW_H} fill={rowIdx % 2 === 0 ? 'var(--surface)' : 'var(--bg)'} />

              {/* Row bottom border */}
              <line x1={0} y1={y + ROW_H} x2={totalW} y2={y + ROW_H} stroke="var(--border)" strokeWidth={0.5} />

              {/* Label */}
              <text
                x={12}
                y={y + ROW_H / 2 + 4}
                fill="var(--text)"
                fontSize={12}
                fontFamily="DM Sans"
              >
                {truncate(task.title, 22)}
              </text>

              {/* Gantt bar */}
              {hasBar && startIdx! < days.length && endIdx! >= 0 ? (
                <rect
                  x={LABEL_W + Math.max(0, startIdx!) * DAY_PX + 2}
                  y={y + 8}
                  width={Math.max(DAY_PX, (Math.min(endIdx! + 1, days.length) - Math.max(0, startIdx!)) * DAY_PX - 4)}
                  height={ROW_H - 16}
                  rx={4}
                  fill={task.status_color}
                  opacity={0.85}
                />
              ) : !hasBar ? (
                <text
                  x={LABEL_W + 12}
                  y={y + ROW_H / 2 + 4}
                  fill="var(--text3)"
                  fontSize={11}
                  fontFamily="DM Sans"
                  fontStyle="italic"
                >
                  No dates
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
