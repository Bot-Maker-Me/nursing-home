export type Home = {
  id: string
  name: string
  city: string
  address?: string
  phone?: string
  beds: number
  cutoff: string
  deliveryBy: string
  pharmacist: string
  pharmacistPhone: string
  afterHours: string
  status: 'active' | 'suspended'
}

export const homes: Home[] = [
  {
    id: 'HM-0142',
    name: 'Maple Ridge Care Home',
    city: 'Hamilton, ON',
    beds: 128,
    cutoff: '17:00',
    deliveryBy: '21:00',
    pharmacist: 'Dr. Priya Raman, RPh',
    pharmacistPhone: '905-555-0142',
    afterHours: '905-555-0199',
    status: 'active',
  },
  {
    id: 'HM-0157',
    name: 'Lakeshore Gardens LTC',
    city: 'Burlington, ON',
    beds: 96,
    cutoff: '16:30',
    deliveryBy: '20:30',
    pharmacist: 'Marcus Leblanc, RPh',
    pharmacistPhone: '905-555-0157',
    afterHours: '905-555-0199',
    status: 'active',
  },
  {
    id: 'HM-0163',
    name: 'Cedarview Residence',
    city: 'Oakville, ON',
    beds: 64,
    cutoff: '17:00',
    deliveryBy: '21:00',
    pharmacist: 'Dr. Priya Raman, RPh',
    pharmacistPhone: '905-555-0163',
    afterHours: '905-555-0199',
    status: 'suspended',
  },
  {
    id: 'HM-0201',
    name: "Tony Stacey Centre for Veterans' Care",
    city: 'Toronto, ON',
    address: '59 Lawson Road, Toronto, Ontario M1C 2J1',
    phone: '1-416-284-9235',
    beds: 0,
    cutoff: '17:00',
    deliveryBy: '21:00',
    pharmacist: 'Dr. Priya Raman, RPh',
    pharmacistPhone: '1-416-284-9235',
    afterHours: '905-555-0199',
    status: 'active',
  },
]

export const currentHome = homes[0]

export const currentUser = {
  name: 'Jordan Ellis',
  initials: 'JE',
  role: 'Home Nurse',
}

export type Delivery = {
  id: string
  window: string
  driver: string
  items: number
  status: 'Delivered' | 'Out for delivery' | 'Scheduled' | 'Preparing'
}

export const deliveries: Delivery[] = [
  { id: 'DLV-20831', window: '08:30 – 09:15', driver: 'Route A · K. Osei', items: 14, status: 'Delivered' },
  { id: 'DLV-20847', window: '13:00 – 13:45', driver: 'Route C · M. Tran', items: 6, status: 'Out for delivery' },
  { id: 'DLV-20852', window: '19:30 – 21:00', driver: 'Route A · K. Osei', items: 22, status: 'Preparing' },
  { id: 'DLV-20860', window: 'Tomorrow · 08:30', driver: 'Route B · S. Ahmed', items: 9, status: 'Scheduled' },
]

export type Thread = {
  id: string
  subject: string
  resident?: string
  last: string
  author: string
  time: string
  unread: number
  urgent?: boolean
}

export const threads: Thread[] = []

export type Policy = {
  code: string
  title: string
  section: string
  version: string
  effective: string
  pages: number
  acknowledged: boolean
}

export const policies: Policy[] = [
  { code: 'MM-01', title: 'Medication administration record (MAR) standards', section: 'Medication management', version: 'v4.2', effective: '2026-09-01', pages: 18, acknowledged: true },
  { code: 'MM-04', title: 'Controlled substances — count & destruction', section: 'Medication management', version: 'v3.0', effective: '2026-09-15', pages: 24, acknowledged: false },
  { code: 'EM-02', title: 'Emergency box contents and restocking', section: 'Emergency', version: 'v2.1', effective: '2026-06-10', pages: 9, acknowledged: true },
  { code: 'IC-07', title: 'Cold-chain storage and fridge excursions', section: 'Infection & storage', version: 'v1.6', effective: '2026-08-22', pages: 12, acknowledged: false },
  { code: 'OR-03', title: 'Order cut-offs, STAT and after-hours requests', section: 'Ordering', version: 'v5.0', effective: '2026-10-01', pages: 7, acknowledged: false },
  { code: 'DC-01', title: 'Discharge and transfer medication reconciliation', section: 'Transitions', version: 'v2.4', effective: '2026-05-03', pages: 15, acknowledged: true },
  { code: 'PR-02', title: 'Privacy: handling resident health information', section: 'Privacy', version: 'v3.3', effective: '2026-07-19', pages: 11, acknowledged: true },
]

export const weeklySchedule = [
  { day: 'Monday', cutoff: '17:00', delivery: 'Before 21:00' },
  { day: 'Tuesday', cutoff: '17:00', delivery: 'Before 21:00' },
  { day: 'Wednesday', cutoff: '17:00', delivery: 'Before 21:00' },
  { day: 'Thursday', cutoff: '17:00', delivery: 'Before 21:00' },
  { day: 'Friday', cutoff: '17:00', delivery: 'Before 21:00' },
  { day: 'Saturday', cutoff: '12:00', delivery: 'Before 17:00' },
  { day: 'Sunday', cutoff: 'Emergency only', delivery: 'On-call pharmacist' },
]

export const holidays = [
  { date: '2026-10-12', name: 'Thanksgiving', note: 'Saturday schedule — cut-off 12:00' },
  { date: '2026-12-25', name: 'Christmas Day', note: 'Emergency only' },
  { date: '2026-12-26', name: 'Boxing Day', note: 'Saturday schedule — cut-off 12:00' },
  { date: '2027-01-01', name: 'New Year’s Day', note: 'Emergency only' },
]

export const operatingHours = [
  { label: 'Monday – Friday', hours: '8:00 AM – 9:00 PM' },
  { label: 'Saturday & Sunday', hours: '9:00 AM – 5:00 PM' },
  { label: 'All statutory holidays', hours: '9:00 AM – 5:00 PM' },
]

export type EducationResource = {
  id: string
  title: string
  type: 'video' | 'pdf' | 'link'
  url: string
  description: string
  category: string
}

export const educationResources: EducationResource[] = [
  {
    id: 'edu-1',
    title: 'Safe medication administration — refresher',
    type: 'video',
    url: 'https://www.youtube.com/watch?v=ysz5S6PUM-U',
    description: 'A short walkthrough of the five rights of medication administration and documentation.',
    category: 'Medication safety',
  },
  {
    id: 'edu-2',
    title: 'MAR documentation standards',
    type: 'pdf',
    url: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
    description: 'Reference guide for completing the medication administration record correctly.',
    category: 'Documentation',
  },
  {
    id: 'edu-3',
    title: 'Ordering cut-offs and STAT process',
    type: 'link',
    url: 'https://www.hendersonsportal.ca/training/ordering',
    description: 'How to place routine, urgent and after-hours orders through the portal.',
    category: 'Ordering',
  },
]

export type HomeUser = {
  name: string
  email: string
  role: string
  mfa: boolean
  lastActive: string
  status: 'Active' | 'Invited' | 'Deactivated'
}

export const homeUsers: HomeUser[] = [
  { name: 'Jordan Ellis', email: 'j.ellis@mapleridge.ca', role: 'Home Nurse', mfa: true, lastActive: '2 min ago', status: 'Active' },
  { name: 'Amara Okafor', email: 'a.okafor@mapleridge.ca', role: 'Home Administrator', mfa: true, lastActive: '1 h ago', status: 'Active' },
  { name: 'Ben Whitfield', email: 'b.whitfield@mapleridge.ca', role: 'Home Nurse', mfa: false, lastActive: '—', status: 'Invited' },
  { name: 'Hana Sato', email: 'h.sato@mapleridge.ca', role: 'Home Nurse', mfa: true, lastActive: '14 days ago', status: 'Deactivated' },
]

export const auditLog = [
  { time: '14:12:08', actor: 'p.raman@hendersons.ca', action: 'message.sent', target: 'thread t1', ip: '10.4.2.18' },
  { time: '13:58:41', actor: 'j.ellis@mapleridge.ca', action: 'policy.viewed', target: 'MM-04 v3.0', ip: '172.16.0.44' },
  { time: '12:30:02', actor: 'a.okafor@mapleridge.ca', action: 'user.deactivated', target: 'h.sato@mapleridge.ca', ip: '172.16.0.12' },
  { time: '09:02:17', actor: 'admin@hendersons.ca', action: 'cutoff.updated', target: 'Sat 12:00', ip: '10.4.2.2' },
]
