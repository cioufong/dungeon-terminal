import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("Deploying NFARenderer...");
  console.log("  Deployer:", deployer);

  const result = await deploy("NFARenderer", {
    from: deployer,
    args: [],
    log: true,
  });

  if (result.newlyDeployed) {
    console.log("  NFARenderer deployed at:", result.address);

    // Set renderer on DungeonNFA
    const nfaDeployment = await deployments.get("DungeonNFA");
    const nfa = await ethers.getContractAt("DungeonNFA", nfaDeployment.address);

    const currentRenderer = await nfa.renderer();
    if (currentRenderer === ethers.ZeroAddress) {
      console.log("  Setting renderer on DungeonNFA...");
      const tx = await nfa.setRenderer(result.address);
      await tx.wait();
      console.log("  Renderer set successfully.");
    } else {
      console.log("  Renderer already set to:", currentRenderer);
    }
  } else {
    console.log("  NFARenderer already deployed at:", result.address);
  }
};

func.tags = ["all", "NFARenderer"];
func.dependencies = ["DungeonNFA"];
export default func;
