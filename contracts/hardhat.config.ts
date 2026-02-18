import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@nomicfoundation/hardhat-verify";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-deploy";
import "dotenv/config";

const DEPLOYER_PRIVATE_KEY =
  process.env.DEPLOYER_PRIVATE_KEY ||
  "0000000000000000000000000000000000000000000000000000000000000001";

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.33",
    settings: {
      viaIR: true,
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  paths: {
    deploy: "./deploy",
    deployments: "./deployments",
  },
  networks: {
    bscTestnet: {
      url: process.env.TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 97,
    },
    bscMainnet: {
      url: process.env.MAINNET_RPC_URL || "https://bsc-dataseed.binance.org/",
      accounts: [DEPLOYER_PRIVATE_KEY],
      chainId: 56,
    },
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY || "",
    customChains: [
      {
        network: "bscTestnet",
        chainId: 97,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=97",
          browserURL: "https://testnet.bscscan.com",
        },
      },
      {
        network: "bscMainnet",
        chainId: 56,
        urls: {
          apiURL: "https://api.etherscan.io/v2/api?chainid=56",
          browserURL: "https://bscscan.com",
        },
      },
    ],
  },
  mocha: {
    timeout: 60000,
  },
};

export default config;
