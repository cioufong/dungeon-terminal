import { ethers, upgrades } from "hardhat";

async function main() {
  const proxyAddress = process.env.NFA_CONTRACT_ADDRESS;
  if (!proxyAddress) throw new Error("Set NFA_CONTRACT_ADDRESS env");

  const [deployer] = await ethers.getSigners();
  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("\nUpgrading DungeonNFA to V2...");
  console.log("  Deployer:", deployer.address);
  console.log("  Balance:", ethers.formatEther(balance), "BNB");
  console.log("  Proxy:", proxyAddress);

  // Read pre-upgrade state
  const V1Factory = await ethers.getContractFactory("DungeonNFA");
  const v1 = V1Factory.attach(proxyAddress);
  const ownerBefore = await v1.owner();
  const supplyBefore = await v1.totalSupply();
  console.log("  Owner:", ownerBefore);
  console.log("  Total supply:", supplyBefore.toString());

  // Force import if needed
  try {
    await upgrades.forceImport(proxyAddress, V1Factory, { kind: "uups" });
    console.log("  Proxy imported into upgrades manifest");
  } catch {
    console.log("  Proxy already registered");
  }

  // Deploy V2 implementation and upgrade
  console.log("\n  Deploying V2 implementation and upgrading...");
  const V2Factory = await ethers.getContractFactory("DungeonNFAV2");
  const nfaV2 = await upgrades.upgradeProxy(proxyAddress, V2Factory, {
    call: { fn: "initializeV2", args: [] },
  });
  await nfaV2.waitForDeployment();

  const implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
  console.log("  New implementation:", implAddress);

  // Verify
  const ver = await nfaV2.version();
  const maxLog = await nfaV2.maxAdventureLog();
  const ownerAfter = await nfaV2.owner();
  const supplyAfter = await nfaV2.totalSupply();
  console.log("\n  Post-upgrade verification:");
  console.log("  - version():", ver);
  console.log("  - maxAdventureLog:", maxLog.toString());
  console.log("  - owner:", ownerAfter);
  console.log("  - totalSupply:", supplyAfter.toString());

  if (ver !== "2.0.0") throw new Error("Version mismatch!");
  if (maxLog.toString() !== "10") throw new Error("maxAdventureLog not initialized!");
  if (ownerAfter !== ownerBefore) throw new Error("Owner changed!");

  // Optionally set game server
  const gameServerAddress = process.env.GAME_SERVER_ADDRESS;
  if (gameServerAddress) {
    console.log("\n  Setting game server:", gameServerAddress);
    const tx = await nfaV2.setGameServer(gameServerAddress, true);
    await tx.wait();
    console.log("  Game server authorized");
  } else {
    console.log("\n  Set GAME_SERVER_ADDRESS env to auto-authorize a game server");
  }

  console.log("\nUpgrade to V2 complete!");
  console.log("Proxy:", proxyAddress);
  console.log("Implementation:", implAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
