/* Demo data: services, therapists with skills + hours, an admin, and a sample client. */
import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

const services = [
  { name: 'Swedish Relaxation Massage', category: 'Massage', durationMin: 60, bufferMin: 15, priceCents: 5500,
    description: 'Long, flowing strokes to melt away tension and calm the nervous system.' },
  { name: 'Deep Tissue Massage', category: 'Massage', durationMin: 90, bufferMin: 15, priceCents: 8000,
    description: 'Slow, firm pressure targeting chronic knots and deep muscle tension.' },
  { name: 'Hot Stone Therapy', category: 'Massage', durationMin: 75, bufferMin: 15, priceCents: 7500,
    description: 'Heated basalt stones and warm oil release stubborn tightness.' },
  { name: 'Aromatherapy Ritual', category: 'Massage', durationMin: 60, bufferMin: 15, priceCents: 6000,
    description: 'A bespoke blend of essential oils with a soothing full-body massage.' },
  { name: 'TK Signature Facial', category: 'Facials', durationMin: 60, bufferMin: 15, priceCents: 6500,
    description: 'Deep cleanse, exfoliation, extraction and a mask tailored to your skin.' },
  { name: 'Hydrating Glow Facial', category: 'Facials', durationMin: 45, bufferMin: 15, priceCents: 4500,
    description: 'An express facial that restores moisture and a radiant finish.' },
  { name: 'Body Scrub & Wrap', category: 'Body', durationMin: 75, bufferMin: 30, priceCents: 7000,
    description: 'Sea-salt exfoliation followed by a nourishing, detoxifying wrap.' },
  { name: 'Luxury Manicure', category: 'Nails', durationMin: 45, bufferMin: 15, priceCents: 3000,
    description: 'Shaping, cuticle care, hand massage and polish.' },
  { name: 'Spa Pedicure', category: 'Nails', durationMin: 60, bufferMin: 15, priceCents: 3800,
    description: 'Warm soak, scrub, callus care, massage and polish.' },
];

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const hm = (h: number, m = 0) => h * 60 + m;

async function main() {
  const password = await bcrypt.hash('Password123!', 10);

  await prisma.user.upsert({
    where: { email: 'admin@tksigspa.com' },
    update: {},
    create: { email: 'admin@tksigspa.com', name: 'Spa Manager', role: Role.ADMIN, passwordHash: password },
  });
  await prisma.user.upsert({
    where: { email: 'client@example.com' },
    update: {},
    create: { email: 'client@example.com', name: 'Tariro Moyo', phone: '+263 77 000 0000', passwordHash: password },
  });

  const svc: Record<string, string> = {};
  for (const s of services) {
    const row = await prisma.service.upsert({ where: { slug: slug(s.name) }, update: s, create: { ...s, slug: slug(s.name) } });
    svc[s.name] = row.id;
  }

  const weekdays = [1, 2, 3, 4, 5];
  const therapists = [
    {
      name: 'Grace Chikwanha', title: 'Senior Massage Therapist', email: 'grace@tksigspa.com',
      bio: '10 years of therapeutic and sports massage experience.',
      skills: ['Swedish Relaxation Massage', 'Deep Tissue Massage', 'Hot Stone Therapy', 'Aromatherapy Ritual'],
      hours: [...weekdays.map((d) => ({ dayOfWeek: d, startMin: hm(9), endMin: hm(13) })),
              ...weekdays.map((d) => ({ dayOfWeek: d, startMin: hm(14), endMin: hm(18) }))],
    },
    {
      name: 'Rudo Ncube', title: 'Massage & Body Therapist', email: 'rudo@tksigspa.com',
      bio: 'Specialist in hot stone and body treatments.',
      skills: ['Swedish Relaxation Massage', 'Hot Stone Therapy', 'Body Scrub & Wrap', 'Aromatherapy Ritual'],
      hours: [2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMin: hm(10), endMin: hm(19) })),
    },
    {
      name: 'Nyasha Dube', title: 'Skin Care Specialist', email: 'nyasha@tksigspa.com',
      bio: 'Licensed aesthetician passionate about healthy, glowing skin.',
      skills: ['TK Signature Facial', 'Hydrating Glow Facial', 'Body Scrub & Wrap'],
      hours: [1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMin: hm(9), endMin: hm(17) })),
    },
    {
      name: 'Chipo Mutasa', title: 'Nail Technician', email: 'chipo@tksigspa.com',
      bio: 'Meticulous nail care and relaxing hand & foot rituals.',
      skills: ['Luxury Manicure', 'Spa Pedicure', 'Hydrating Glow Facial'],
      hours: [...[1, 2, 3, 4, 5, 6].map((d) => ({ dayOfWeek: d, startMin: hm(8, 30), endMin: hm(16, 30) })),
              { dayOfWeek: 7, startMin: hm(10), endMin: hm(14) }],
    },
  ];

  for (const t of therapists) {
    const user = await prisma.user.upsert({
      where: { email: t.email },
      update: {},
      create: { email: t.email, name: t.name, role: Role.THERAPIST, passwordHash: password },
    });
    const existing = await prisma.therapist.findUnique({ where: { userId: user.id } });
    if (existing) continue;
    await prisma.therapist.create({
      data: {
        name: t.name,
        title: t.title,
        bio: t.bio,
        userId: user.id,
        services: { create: t.skills.map((name) => ({ serviceId: svc[name] })) },
        workingHours: { create: t.hours },
      },
    });
  }

  console.log('Seeded. Logins (password: Password123!):');
  console.log('  admin      admin@tksigspa.com');
  console.log('  client     client@example.com');
  console.log('  therapist  grace@tksigspa.com (and rudo@, nyasha@, chipo@)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
