import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  const treasury = process.env.TREASURY_ADDRESS || deployer;

  // VRF config — defaults to BSC Testnet values
  const vrfCoordinator =
    process.env.VRF_COORDINATOR ||
    "0xa2d23627bC0314f4Cbd08Ff54EcB89bb45685053";
  const vrfSubId = process.env.VRF_SUB_ID || "0";
  const vrfKeyHash =
    process.env.VRF_KEY_HASH ||
    "0x617abc3f53ae11766071d04ada1c7b0fbd49833b9542e9e91da4d3191c70cc80";

  const balance = await ethers.provider.getBalance(deployer);

  console.log("Deploying DungeonNFA...");
  console.log("  Deployer:", deployer);
  console.log("  Treasury:", treasury);
  console.log("  VRF Coordinator:", vrfCoordinator);
  console.log("  VRF Sub ID:", vrfSubId);
  console.log("  VRF Key Hash:", vrfKeyHash);
  console.log("  Balance:", ethers.formatEther(balance), "BNB");

  const result = await deploy("DungeonNFA", {
    from: deployer,
    proxy: {
      proxyContract: "UUPS",
      execute: {
        init: {
          methodName: "initialize",
          args: [treasury, vrfCoordinator, vrfSubId, vrfKeyHash],
        },
      },
    },
    log: true,
  });

  if (result.newlyDeployed) {
    console.log("\n  Proxy:", result.address);
    console.log(
      "  Implementation:",
      result.implementation
    );

    // Authorize game server if env var is set
    const gameServerAddress = process.env.GAME_SERVER_ADDRESS;
    if (gameServerAddress) {
      console.log("\n  Setting game server:", gameServerAddress);
      const DungeonNFA = await ethers.getContractAt("DungeonNFA", result.address);
      const tx = await DungeonNFA.setGameServer(gameServerAddress, true);
      await tx.wait();
      console.log("  Game server authorized ✓");
    }

    console.log("\nDone! Copy the proxy address to frontend/.env.local:");
    console.log(`  VITE_NFA_CONTRACT_ADDRESS=${result.address}`);
  } else {
    console.log("  DungeonNFA already deployed at:", result.address);
  }
};

func.tags = ["all", "DungeonNFA"];
export default func;
