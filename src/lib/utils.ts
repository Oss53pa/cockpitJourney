export function cn(...args: Array<string | false | null | undefined>): string {
  return args.filter(Boolean).join(' ');
}

const RTF = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });

export function relativeTime(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  const sec = Math.round(ms / 1000);
  const min = Math.round(sec / 60);
  const hr = Math.round(min / 60);
  const day = Math.round(hr / 24);
  if (Math.abs(sec) < 60) return RTF.format(sec, 'second');
  if (Math.abs(min) < 60) return RTF.format(min, 'minute');
  if (Math.abs(hr) < 24) return RTF.format(hr, 'hour');
  return RTF.format(day, 'day');
}

export function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

export function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' });
}

export function formatLongDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatNumber(n: number, opts: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat('fr-FR', opts).format(n);
}

export function formatCurrency(n: number, currency = 'XOF'): string {
  return new Intl.NumberFormat('fr-FR', { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
}

export function priorityLabel(p: 1 | 2 | 3 | 4): string {
  return ['—', 'Faible', 'Normale', 'Haute', 'Critique'][p];
}

export function priorityColor(p: 1 | 2 | 3 | 4): string {
  return ['bg-atlas-mute', 'bg-atlas-mute', 'bg-signal-blue', 'bg-signal-yellow', 'bg-signal-red'][p];
}

export function statusLabel(s: string): string {
  switch (s) {
    case 'todo':
      return 'À faire';
    case 'in_progress':
      return 'En cours';
    case 'in_review':
      return 'En revue';
    case 'done':
      return 'Terminé';
    case 'blocked':
      return 'Bloqué';
    default:
      return s;
  }
}

export function healthLabel(h: 'green' | 'yellow' | 'red'): string {
  return h === 'green' ? 'Vert' : h === 'yellow' ? 'Jaune' : 'Rouge';
}

export function healthBg(h: 'green' | 'yellow' | 'red'): string {
  return h === 'green' ? 'bg-signal-green' : h === 'yellow' ? 'bg-signal-yellow' : 'bg-signal-red';
}

export function healthText(h: 'green' | 'yellow' | 'red'): string {
  return h === 'green' ? 'text-signal-green' : h === 'yellow' ? 'text-signal-yellow' : 'text-signal-red';
}
