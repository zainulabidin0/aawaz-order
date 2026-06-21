import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var __db__: PrismaClient | undefined;
}

const prisma =
  global.__db__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (!global.__db__) {
  global.__db__ = prisma;
}

export default prisma;
