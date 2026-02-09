import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deployer } = await getNamedAccounts();

  const vrfCoordinator =
    process.env.VRF_COORDINATOR ||
    "0xa2d23627bC0314f4Cbd08Ff54EcB89bb45685053";
  const vrfSubId = process.env.VRF_SUB_ID || "0";

  const dungeonNFA = await deployments.get("DungeonNFA");

  console.log("Adding VRF consumer...");
  console.log("  DungeonNFA proxy:", dungeonNFA.address);
  console.log("  VRF Coordinator:", vrfCoordinator);
  console.log("  VRF Sub ID:", vrfSubId);

  const coordinator = await ethers.getContractAt(
    [
      "function addConsumer(uint64 subId, address consumer) external",
      "function getSubscription(uint64 subId) external view returns (uint96 balance, uint64 reqCount, address owner, address[] memory consumers)",
    ],
    vrfCoordinator
  );

  // Check if already registered
  try {
    const [, , , consumers] = await coordinator.getSubscription(vrfSubId);
    const alreadyAdded = consumers
      .map((c: string) => c.toLowerCase())
      .includes(dungeonNFA.address.toLowerCase());

    if (alreadyAdded) {
      console.log("  Already registered as VRF consumer, skipping.");
      return;
    }
  } catch {
    console.log("  Could not check subscription, attempting to add...");
  }

  const tx = await coordinator.addConsumer(vrfSubId, dungeonNFA.address);
  await tx.wait();
  console.log("  VRF consumer added successfully.");
};

func.tags = ["vrf-consumer"];
func.dependencies = ["DungeonNFA"];
export default func;
