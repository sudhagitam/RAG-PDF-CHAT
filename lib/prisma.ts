// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PrismaClientType = any;

let prismaInstance: PrismaClientType | null = null;

function getPrisma(): PrismaClientType {
  if (!prismaInstance) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require('@prisma/client');
    prismaInstance = new PrismaClient({
      datasources: { db: { url: process.env.DATABASE_URL } },
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }
  return prismaInstance;
}

export const prisma = getPrisma();
