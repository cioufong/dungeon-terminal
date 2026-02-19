import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer, server] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("---");

  // Deploy NFARenderer
  const Renderer = await ethers.getContractFactory("NFARenderer");
  const renderer = await Renderer.deploy();
  const rendererReceipt = await renderer.deploymentTransaction()!.wait();
  console.log("NFARenderer deploy gas:", rendererReceipt!.gasUsed.toString());

  // Deploy DungeonNFA proxy (UUPS)
  // initialize(address treasury, address _vrfCoordinator, uint64 _vrfSubId, bytes32 _vrfKeyHash)
  const DungeonNFA = await ethers.getContractFactory("DungeonNFA");
  const treasury = deployer.address;
  const fakeVrfCoordinator = server.address; // just a non-zero address for estimation
  const vrfSubId = 1;
  const vrfKeyHash = ethers.keccak256(ethers.toUtf8Bytes("test"));

  // Get block number before deploying to count gas across all deploy txs
  const blockBefore = await ethers.provider.getBlockNumber();

  const nfa = await upgrades.deployProxy(
    DungeonNFA,
    [treasury, fakeVrfCoordinator, vrfSubId, vrfKeyHash],
    { kind: "uups" }
  );
  await nfa.waitForDeployment();

  // Get addresses
  const proxyAddr = await nfa.getAddress();
  const implAddr = await upgrades.erc1967.getImplementationAddress(proxyAddr);
  console.log("Implementation address:", implAddr);
  console.log("Proxy address:", proxyAddr);

  // Sum gas for all blocks used during proxy deploy (impl + proxy + initialize)
  const blockAfter = await ethers.provider.getBlockNumber();
  let proxyTotalGas = BigInt(0);
  for (let b = blockBefore + 1; b <= blockAfter; b++) {
    const block = await ethers.provider.getBlock(b, true);
    if (block) {
      for (const txHash of block.transactions) {
        const receipt = await ethers.provider.getTransactionReceipt(txHash);
        if (receipt) proxyTotalGas += receipt.gasUsed;
      }
    }
  }
  console.log("DungeonNFA proxy deploy total gas:", proxyTotalGas.toString());

  // setRenderer gas
  const setRendererTx = await nfa.setRenderer(await renderer.getAddress());
  const setRendererReceipt = await setRendererTx.wait();
  console.log("setRenderer gas:", setRendererReceipt!.gasUsed.toString());

  // setVRFEnabled gas
  const setVRFTx = await nfa.setVRFEnabled(false);
  const setVRFReceipt = await setVRFTx.wait();
  console.log("setVRFEnabled gas:", setVRFReceipt!.gasUsed.toString());

  // setGameServer gas
  const setServerTx = await nfa.setGameServer(server.address, true);
  const setServerReceipt = await setServerTx.wait();
  console.log("setGameServer gas:", setServerReceipt!.gasUsed.toString());

  // freeMint gas estimate (with vrfEnabled=false so instant reveal)
  const mintTx = await nfa.freeMint({ value: ethers.parseEther("0.01") });
  const mintReceipt = await mintTx.wait();
  console.log("freeMint (instant) gas:", mintReceipt!.gasUsed.toString());

  // Summary with BSC cost estimates
  console.log("\n========== BSC Mainnet Cost Estimate ==========");
  const BNB_PRICE_USD = 650; // approximate
  const GAS_PRICE_GWEI = 1; // BSC typical gas price

  const costs: [string, bigint][] = [
    ["NFARenderer deploy", rendererReceipt!.gasUsed],
    ["DungeonNFA proxy deploy", proxyTotalGas],
    ["setRenderer", setRendererReceipt!.gasUsed],
    ["setVRFEnabled", setVRFReceipt!.gasUsed],
    ["setGameServer", setServerReceipt!.gasUsed],
    ["freeMint (instant)", mintReceipt!.gasUsed],
  ];

  let totalGas = BigInt(0);
  for (const [label, gas] of costs) {
    const costBNB = Number(gas) * GAS_PRICE_GWEI * 1e-9;
    const costUSD = costBNB * BNB_PRICE_USD;
    console.log(
      `${label.padEnd(25)} ${gas.toString().padStart(10)} gas | ${costBNB.toFixed(6)} BNB | $${costUSD.toFixed(4)}`
    );
    totalGas += gas;
  }
  console.log("---");
  const totalBNB = Number(totalGas) * GAS_PRICE_GWEI * 1e-9;
  const totalUSD = totalBNB * BNB_PRICE_USD;
  console.log(
    `${"TOTAL".padEnd(25)} ${totalGas.toString().padStart(10)} gas | ${totalBNB.toFixed(6)} BNB | $${totalUSD.toFixed(4)}`
  );
  console.log(
    `Gas prices on BSC are typically 1-3 gwei. Above uses ${GAS_PRICE_GWEI} gwei & $${BNB_PRICE_USD}/BNB.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
