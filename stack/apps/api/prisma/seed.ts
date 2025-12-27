import { PrismaClient } from "@prisma/client";
import { auth } from "../src/lib/auth";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create default location
  const location = await prisma.location.upsert({
    where: { id: "default-location" },
    update: {},
    create: {
      id: "default-location",
      name: "Default Location",
      country: "US",
      city: "New York",
      description: "Default server location",
    },
  });
  console.log("Created location:", location.name);

  // Create admin user
  const adminEmail = "admin@stellarstack.app";
  const adminPassword = "StellarAdmin2025!";

  // Check if admin user exists
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (existingUser) {
    // Delete existing user and account to recreate with proper password hash
    console.log("Deleting existing admin user to recreate with proper password...");
    await prisma.account.deleteMany({ where: { userId: existingUser.id } });
    await prisma.session.deleteMany({ where: { userId: existingUser.id } });
    await prisma.user.delete({ where: { id: existingUser.id } });
  }

  // Use better-auth's API to create user with proper password hash
  console.log("Creating admin user via better-auth API...");
  const ctx = await auth.api.signUpEmail({
    body: {
      email: adminEmail,
      password: adminPassword,
      name: "Admin",
    },
  });

  if (ctx.user) {
    // Update user to be admin
    await prisma.user.update({
      where: { id: ctx.user.id },
      data: {
        role: "admin",
        emailVerified: true,
      },
    });
    console.log("Created admin user:", ctx.user.email);
  } else {
    console.error("Failed to create admin user");
  }

  // Create a sample blueprint
  const blueprint = await prisma.blueprint.upsert({
    where: { id: "minecraft-vanilla" },
    update: {},
    create: {
      id: "minecraft-vanilla",
      name: "Minecraft Vanilla",
      description: "Vanilla Minecraft Java Edition server",
      category: "gaming",
      imageName: "itzg/minecraft-server",
      imageTag: "latest",
      isPublic: true,
      config: {
        environment: {
          EULA: "TRUE",
          TYPE: "VANILLA",
        },
        ports: [
          {
            container_port: 25565,
            protocol: "tcp",
          },
        ],
        resources: {
          memory: 2147483648, // 2GB
          cpus: 1.0,
        },
        volumes: [
          {
            name: "minecraft-data",
            target: "/data",
          },
        ],
        stdin_open: true,
        tty: true,
      },
    },
  });
  console.log("Created blueprint:", blueprint.name);

  console.log("\nSeed completed!");
  console.log("\nAdmin credentials:");
  console.log("  Email:", adminEmail);
  console.log("  Password:", adminPassword);
}

main()
  .catch((e) => {
    console.error("Seed error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
