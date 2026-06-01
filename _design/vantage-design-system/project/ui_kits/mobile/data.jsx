/* Seed data — pulled / adapted from the web ui_kits. */

const STAGES = [
  { id: 'lead',       name: 'Lead',       badge: 'gray'   },
  { id: 'qualifying', name: 'Qualifying', badge: 'blue'   },
  { id: 'proposal',   name: 'Proposal',   badge: 'amber'  },
  { id: 'closing',    name: 'Closing',    badge: 'purple' },
  { id: 'won',        name: 'Won',        badge: 'green'  },
  { id: 'lost',       name: 'Lost',       badge: 'red'    },
];

const DEALS = [
  { id: 'd1', name: 'Stackline — Developer Plan',          company: 'Stackline',         contact: 'Maya Chen',     value: 4800,  prob: 20,  close: '2026-06-27', stage: 'lead',       owner: 'Nina Park' },
  { id: 'd2', name: 'Ben Hartley — Indie License',         company: 'Hartley Studio',    contact: 'Ben Hartley',   value: 990,   prob: 30,  close: '2026-06-12', stage: 'lead',       owner: 'James Okafor' },
  { id: 'd3', name: 'Fenix Analytics — Team Plan',         company: 'Fenix Analytics',   contact: 'Priya Iyer',    value: 18000, prob: 40,  close: '2026-06-03', stage: 'qualifying', owner: 'Nina Park' },
  { id: 'd4', name: 'Cobalt Systems — Enterprise',         company: 'Cobalt Systems',    contact: 'David Reyes',   value: 55000, prob: 45,  close: '2026-07-12', stage: 'qualifying', owner: 'Nina Park' },
  { id: 'd5', name: 'Cobalt — Infra Monitoring Add-on',    company: 'Cobalt Systems',    contact: 'David Reyes',   value: 12000, prob: 65,  close: '2026-05-27', stage: 'proposal',   owner: 'James Okafor' },
  { id: 'd6', name: 'Orbit Cloud — Platform License',      company: 'Orbit Cloud',       contact: 'Sasha Mori',    value: 36000, prob: 85,  close: '2026-05-30', stage: 'closing',    owner: 'Nina Park' },
  { id: 'd7', name: 'Meridian Labs — Annual Plan',         company: 'Meridian Labs',     contact: 'Theo Klein',    value: 24000, prob: 100, close: '2026-05-03', stage: 'won',        owner: 'Nina Park' },
];

const CONTACTS = [
  { id: 'c1', name: 'Maya Chen',     title: 'CTO',                  company: 'Stackline',         status: 'prospect',   email: 'maya@stackline.dev',     phone: '+1 415 555 0123', last: '2d ago' },
  { id: 'c2', name: 'David Reyes',   title: 'VP Engineering',       company: 'Cobalt Systems',    status: 'customer',   email: 'd.reyes@cobalt.io',      phone: '+1 415 555 0188', last: 'today' },
  { id: 'c3', name: 'Priya Iyer',    title: 'Head of Data',         company: 'Fenix Analytics',   status: 'prospect',   email: 'priya@fenix.co',         phone: '+44 20 7946 0344', last: '4h ago' },
  { id: 'c4', name: 'Sasha Mori',    title: 'Founder',              company: 'Orbit Cloud',       status: 'customer',   email: 'sasha@orbit.cloud',      phone: '+1 510 555 0149', last: 'yesterday' },
  { id: 'c5', name: 'Theo Klein',    title: 'Director of Platform', company: 'Meridian Labs',     status: 'customer',   email: 't.klein@meridian.dev',   phone: '+1 503 555 0190', last: '1w ago' },
  { id: 'c6', name: 'Ben Hartley',   title: 'Indie Developer',      company: 'Hartley Studio',    status: 'cold',       email: 'ben@hartley.studio',     phone: '+1 206 555 0117', last: '3w ago' },
  { id: 'c7', name: 'Renée Okafor',  title: 'CEO',                  company: 'Ironwood Group',    status: 'churned',    email: 'r@ironwood.io',          phone: '+1 312 555 0145', last: '2mo ago' },
];

const ACTIVITIES = [
  { id: 'a1', type: 'call',             contact: 'David Reyes',     summary: 'Reviewed monitoring add-on scope. Sending revised quote tomorrow.', at: '14m ago' },
  { id: 'a2', type: 'mail',             contact: 'Priya Iyer',      summary: 'Sent: Team plan walkthrough recording + pricing PDF.',              at: '38m ago' },
  { id: 'a3', type: 'meeting',          contact: 'Sasha Mori',      summary: 'Renewal call — confirmed seat count for 2026 (12 → 18).',           at: '2h ago' },
  { id: 'a4', type: 'note',             contact: 'Maya Chen',       summary: 'Stackline is evaluating against Datadog + Hubspot.',                at: '5h ago' },
  { id: 'a5', type: 'deal_change',      contact: 'Orbit Cloud',     summary: 'Stage moved: Proposal → Closing.',                                  at: 'yesterday' },
  { id: 'a6', type: 'contact_created',  contact: 'Ben Hartley',     summary: 'New contact added.',                                                at: 'yesterday' },
  { id: 'a7', type: 'phone',            contact: 'Theo Klein',      summary: 'Annual renewal — paperwork in countersign.',                        at: 'Mon' },
];

const ACTIVITY_TYPE = {
  call:            { icon: 'phone',    label: 'Call',     tone: 'blue' },
  phone:           { icon: 'phone',    label: 'Call',     tone: 'blue' },
  mail:            { icon: 'mail',     label: 'Email',    tone: 'purple' },
  meeting:         { icon: 'meeting',  label: 'Meeting',  tone: 'green' },
  note:            { icon: 'note',     label: 'Note',     tone: 'amber' },
  deal_change:     { icon: 'arrow',    label: 'Deal',     tone: 'gray' },
  contact_created: { icon: 'contacts', label: 'Contact',  tone: 'gray' },
};

const SERVERS = [
  { id: 's1', name: 'prod-web-01',     region: 'us-east-1', host: '10.0.4.21',   status: 'online',   cpu: 24, mem: 41, disk: 62, ping: '8ms',   uptime: '47d 6h' },
  { id: 's2', name: 'prod-api-01',     region: 'us-east-1', host: '10.0.4.22',   status: 'degraded', cpu: 71, mem: 68, disk: 44, ping: '14ms',  uptime: '12d 4h' },
  { id: 's3', name: 'prod-worker-01',  region: 'us-east-1', host: '10.0.4.31',   status: 'degraded', cpu: 55, mem: 91, disk: 72, ping: '12ms',  uptime: '32d 1h' },
  { id: 's4', name: 'prod-postgres',   region: 'us-east-1', host: '10.0.4.41',   status: 'offline',  cpu:  0, mem:  0, disk: 88, ping: '—',     uptime: '0' },
  { id: 's5', name: 'staging-01',      region: 'us-west-2', host: '10.0.5.21',   status: 'online',   cpu: 18, mem: 58, disk: 31, ping: '32ms',  uptime: '6d 14h' },
  { id: 's6', name: 'analytics-ch',    region: 'eu-west-1', host: '10.0.7.11',   status: 'online',   cpu: 36, mem: 49, disk: 24, ping: '94ms',  uptime: '102d' },
];

const SERVER_SPARK = {
  online:   [22,24,28,21,26,30,24,22,25,24,26,28,24],
  degraded: [55,62,68,64,71,76,80,73,68,72,70,74,71],
  offline:  [40,30,20,12,8,4,2,0,0,0,0,0,0],
};

const STATUS_BADGE = {
  online:   { color: 'green', dot: 'var(--green)' },
  degraded: { color: 'amber', dot: 'var(--amber)' },
  offline:  { color: 'red',   dot: 'var(--red)'   },
  stopped:  { color: 'gray',  dot: 'var(--text3)' },
};

const ALERTS = [
  { id: 'al1', sev: 'critical', message: 'prod-worker-01: Memory at 91.7% — above critical threshold (90%)', resource: 'prod-worker-01', resType: 'server',   at: '2m ago',  ack: false, res: false },
  { id: 'al2', sev: 'warning',  message: 'prod-api-01: CPU sustained at 71.5% for 10 minutes',                resource: 'prod-api-01',    resType: 'server',   at: '4m ago',  ack: true,  res: false },
  { id: 'al3', sev: 'warning',  message: 'Database "prod-postgres" is unreachable',                            resource: 'prod-postgres',  resType: 'database', at: '12m ago', ack: false, res: false },
  { id: 'al4', sev: 'critical', message: 'legacy.orbitcloud.io is down — 4 consecutive failed pings',          resource: 'legacy.orbitcloud.io', resType: 'website', at: '1h ago',  ack: false, res: false },
  { id: 'al5', sev: 'warning',  message: 'app.cobaltsystems.com response time degraded (1247ms)',              resource: 'app.cobaltsystems.com', resType: 'website', at: '38m ago', ack: false, res: false },
  { id: 'al6', sev: 'info',     message: 'staging-01 recovered — memory back below 70%',                      resource: 'staging-01',     resType: 'server',   at: '23m ago', ack: false, res: true  },
  { id: 'al7', sev: 'info',     message: 'analytics-clickhouse SSL certificate expires in 8 days',            resource: 'analytics-ch',   resType: 'database', at: '3h ago',  ack: true,  res: true  },
];

const SEV_COLOR = { critical: 'red', warning: 'amber', info: 'blue' };

const TASKS = [
  { id: 't1', title: 'Send revised quote to Cobalt (infra add-on)', due: 'Today',  prio: 'high',   done: false, contact: 'David Reyes' },
  { id: 't2', title: 'Prep renewal deck for Orbit Cloud',           due: 'Today',  prio: 'high',   done: false, contact: 'Sasha Mori' },
  { id: 't3', title: 'Follow up with Stackline on POC',             due: 'Tomorrow', prio: 'med',  done: false, contact: 'Maya Chen' },
  { id: 't4', title: 'Triage prod-worker-01 memory pressure',       due: 'Today',  prio: 'urgent', done: false, contact: null },
  { id: 't5', title: 'Update pricing PDF for Q3',                   due: 'Fri',    prio: 'low',    done: true,  contact: null },
];

const PRIO_BADGE = {
  urgent: 'red',
  high:   'amber',
  med:    'blue',
  low:    'gray',
};

const KPIS = {
  pipeline:   { value: '$129.8K', delta: '+12.4%', spark: [60,62,58,65,68,66,72,78,76,82,86,90,93,95] },
  revenue:    { value: '$33.6K',  delta: '+8.1%',  spark: [20,22,24,23,26,28,27,30,29,31,32,33,34] },
  contacts:   { value: '47',      delta: '+5',     spark: [30,32,33,35,37,38,40,42,42,44,45,46,47] },
  uptime:     { value: '99.92%',  delta: '−0.04%', deltaTone: 'red', spark: [99.99,99.99,99.98,99.97,99.96,99.95,99.95,99.94,99.93,99.93,99.92,99.92,99.92] },
};

const ACTIVE_USER = { name: 'Nina Park', role: 'Admin', email: 'nina@vantage.dev' };

Object.assign(window, {
  STAGES, DEALS, CONTACTS, ACTIVITIES, ACTIVITY_TYPE,
  SERVERS, SERVER_SPARK, STATUS_BADGE,
  ALERTS, SEV_COLOR, TASKS, PRIO_BADGE, KPIS, ACTIVE_USER,
});
