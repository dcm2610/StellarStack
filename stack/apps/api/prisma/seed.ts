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

  // Create a sample blueprint (Pterodactyl-compatible)
  const blueprint = await prisma.blueprint.upsert({
    where: { id: "minecraft-vanilla" },
    update: {
      imageName: "ghcr.io/ptero-eggs/yolks",
      imageTag: "java_21",
      startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -Dterminal.jline=false -Dterminal.ansi=true -jar {{SERVER_JARFILE}}",
      stopCommand: "stop",
      startupDetection: { done: "Done" },
      installScript: `#!/bin/ash
# Minecraft Vanilla Server Install Script

cd /mnt/server

# Download vanilla server
LATEST_VERSION=\${VANILLA_VERSION:-"1.21.4"}

echo "Downloading Minecraft server version \${LATEST_VERSION}..."

# Get version manifest
MANIFEST_URL="https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
VERSION_URL=$(curl -s $MANIFEST_URL | jq -r ".versions[] | select(.id == \\"$LATEST_VERSION\\") | .url")

if [ -z "$VERSION_URL" ]; then
  echo "Version $LATEST_VERSION not found, using latest release..."
  VERSION_URL=$(curl -s $MANIFEST_URL | jq -r '.latest.release as $ver | .versions[] | select(.id == $ver) | .url')
fi

# Get server download URL
SERVER_URL=$(curl -s $VERSION_URL | jq -r '.downloads.server.url')

# Download server
curl -o server.jar $SERVER_URL

echo "Download complete!"
`,
      installContainer: "ghcr.io/ptero-eggs/installers:alpine",
      installEntrypoint: "ash",
      variables: [
        {
          name: "Server Jar File",
          description: "The name of the server jarfile to run",
          env_variable: "SERVER_JARFILE",
          default_value: "server.jar",
          user_viewable: true,
          user_editable: true,
          rules: "required|string|max:50",
        },
        {
          name: "Minecraft Version",
          description: "The version of Minecraft to install",
          env_variable: "VANILLA_VERSION",
          default_value: "1.21.4",
          user_viewable: true,
          user_editable: true,
          rules: "required|string|max:20",
        },
      ],
    },
    create: {
      id: "minecraft-vanilla",
      name: "Minecraft Vanilla",
      description: "Vanilla Minecraft Java Edition server",
      category: "gaming",
      imageName: "ghcr.io/ptero-eggs/yolks",
      imageTag: "java_21",
      startup: "java -Xms128M -Xmx{{SERVER_MEMORY}}M -Dterminal.jline=false -Dterminal.ansi=true -jar {{SERVER_JARFILE}}",
      stopCommand: "stop",
      startupDetection: { done: `{\\r\\n    \\"done\\": \\")! For help, type \\"\\r\\n}` },
      installScript: `#!/bin/ash
# Minecraft Vanilla Server Install Script

cd /mnt/server

# Download vanilla server
LATEST_VERSION=\${VANILLA_VERSION:-"1.21.4"}

echo "Downloading Minecraft server version \${LATEST_VERSION}..."

# Get version manifest
MANIFEST_URL="https://piston-meta.mojang.com/mc/game/version_manifest_v2.json"
VERSION_URL=$(curl -s $MANIFEST_URL | jq -r ".versions[] | select(.id == \\"$LATEST_VERSION\\") | .url")

if [ -z "$VERSION_URL" ]; then
  echo "Version $LATEST_VERSION not found, using latest release..."
  VERSION_URL=$(curl -s $MANIFEST_URL | jq -r '.latest.release as $ver | .versions[] | select(.id == $ver) | .url')
fi

# Get server download URL
SERVER_URL=$(curl -s $VERSION_URL | jq -r '.downloads.server.url')

# Download server
curl -o server.jar $SERVER_URL

echo "Download complete!"
`,
      installContainer: "ghcr.io/ptero-eggs/installers:alpine",
      installEntrypoint: "ash",
      variables: [
        {
          name: "Server Jar File",
          description: "The name of the server jarfile to run",
          env_variable: "SERVER_JARFILE",
          default_value: "server.jar",
          user_viewable: true,
          user_editable: true,
          rules: "required|string|max:50",
        },
        {
          name: "Minecraft Version",
          description: "The version of Minecraft to install",
          env_variable: "VANILLA_VERSION",
          default_value: "1.21.4",
          user_viewable: true,
          user_editable: true,
          rules: "required|string|max:20",
        },
      ],
      isPublic: true,
      config: {},
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
