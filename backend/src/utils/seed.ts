import { prisma } from './db';
import bcrypt from 'bcryptjs';

async function seed() {
  console.log('🌱 Iniciando seed...');
  const adminExists = await prisma.user.findUnique({ where: { email: 'admin@crm.com' } });
  if (!adminExists) {
    const hashedPassword = await bcrypt.hash('admin123', 12);
    await prisma.user.create({
      data: { name: 'Administrador', email: 'admin@crm.com', password: hashedPassword, role: 'ADMIN' },
    });
    console.log('✅ Admin: admin@crm.com / admin123');
  }
  const companies = await prisma.company.findMany({ where: { city: { not: null } }, select: { city: true, state: true } });
  const cityMap = new Map<string, { city: string; state: string | null }>();
  for (const c of companies) {
    if (c.city) {
      const key = `${c.city}-${c.state || ''}`;
      if (!cityMap.has(key)) cityMap.set(key, { city: c.city, state: c.state });
    }
  }
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'];
  let colorIdx = 0;
  for (const [, { city, state }] of cityMap) {
    const groupName = state ? `${city} - ${state}` : city;
    const existing = await prisma.group.findFirst({ where: { name: groupName } });
    if (!existing) {
      const group = await prisma.group.create({
        data: { name: groupName, description: `Empresas do município de ${city}`, color: colors[colorIdx % colors.length] },
      });
      const cityCompanies = await prisma.company.findMany({ where: { city, state: state || undefined }, select: { id: true } });
      if (cityCompanies.length > 0) {
        await prisma.companyGroup.createMany({
          data: cityCompanies.map((c) => ({ groupId: group.id, companyId: c.id })),
          skipDuplicates: true,
        });
        console.log(`✅ Grupo: ${groupName} (${cityCompanies.length} empresas)`);
      }
      colorIdx++;
    }
  }
  console.log('🌱 Seed concluído!');
}
seed().catch((e) => { console.error(e); process.exit(1); }).finally(async () => { await prisma.$disconnect(); });
