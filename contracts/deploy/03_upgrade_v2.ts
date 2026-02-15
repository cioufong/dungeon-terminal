import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers, upgrades } = hre;
  const { deployer } = await getNamedAccounts();

  const balance = await ethers.provider.getBalance(deployer);
  console.log("Upgrading DungeonNFA to V2...");
  console.log("  Deployer:", deployer);
  console.log("  Balance:", ethers.formatEther(balance), "BNB");

  // Get current proxy address
  const existing = await deployments.get("DungeonNFA");
  const proxyAddress = existing.address;
  console.log("  Proxy:", proxyAddress);

  // Read pre-upgrade state
  const V1Factory = await ethers.getContractFactory("DungeonNFA");
  const V2Factory = await ethers.getContractFactory("DungeonNFAV2");
  const v1 = V1Factory.attach(proxyAddress);
  const ownerBefore = await (v1 as any).owner();
  const supplyBefore = await (v1 as any).totalSupply();
  console.log("  Owner:", ownerBefore);
  console.log("  Total supply:", supplyBefore.toString());

  // Check if V2 is already active (from a previous partial run)
  let alreadyV2 = false;
  try {
    const v2Check = V2Factory.attach(proxyAddress);
    const ver = await (v2Check as any).version();
    if (ver === "2.0.0") {
      alreadyV2 = true;
      console.log("\n  V2 already active on-chain (version:", ver, ")");
    }
  } catch { /* not V2 yet */ }

  let implAddress: string;

  if (alreadyV2) {
    // V2 upgrade already applied on-chain — just update deployment records
    implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("  Existing V2 implementation:", implAddress);
  } else {
    // Force import (in case this proxy wasn't deployed via this upgrades plugin instance)
    try {
      await upgrades.forceImport(proxyAddress, V1Factory, { kind: "uups" });
      console.log("  Proxy imported into manifest");
    } catch {
      console.log("  Proxy already in manifest");
    }

    // Upgrade to V2
    console.log("\n  Deploying V2 implementation...");
    await upgrades.upgradeProxy(proxyAddress, V2Factory, {
      call: { fn: "initializeV2", args: [] },
    });

    implAddress = await upgrades.erc1967.getImplementationAddress(proxyAddress);
    console.log("  New implementation:", implAddress);
  }

  // Verify
  const nfaV2 = V2Factory.attach(proxyAddress);
  const ver = await (nfaV2 as any).version();
  const maxLog = await (nfaV2 as any).maxAdventureLog();
  const ownerAfter = await (nfaV2 as any).owner();
  const supplyAfter = await (nfaV2 as any).totalSupply();
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
    const isAlready = await (nfaV2 as any).gameServers(gameServerAddress);
    if (isAlready) {
      console.log("\n  Game server already authorized:", gameServerAddress);
    } else {
      console.log("\n  Setting game server:", gameServerAddress);
      const tx = await (nfaV2 as any).setGameServer(gameServerAddress, true);
      await tx.wait();
      console.log("  Game server authorized");
    }
  } else {
    console.log("\n  Set GAME_SERVER_ADDRESS env to auto-authorize a game server");
  }

  // Save updated deployment info
  const artifact = await deployments.getExtendedArtifact("DungeonNFAV2");
  await deployments.save("DungeonNFA", {
    ...existing,
    implementation: implAddress,
    abi: artifact.abi,
  });

  console.log("\nDone! V2 upgrade complete.");
};

func.tags = ["upgrade-v2"];
export default func;
