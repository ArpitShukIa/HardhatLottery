require("@nomicfoundation/hardhat-toolbox");
require("hardhat-deploy")
require("dotenv").config()

const RINKEBY_RPC_URL = process.env.RINKEBY_RPC_URL
const PRIVATE_KEY = process.env.PRIVATE_KEY
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY || ""

module.exports = {
    networks: {
        hardhat: {
            chainId: 31337
        },
        localhost: {
            chainId: 31337,
            url: 'http://127.0.0.1:8545/'
        },
        rinkeby: {
            url: RINKEBY_RPC_URL,
            accounts: [PRIVATE_KEY],
            chainId: 4,
            blockConfirmations: 6,
            gas: 6000000
        }
    },
    solidity: "0.8.9",
    etherscan: {
        apiKey: ETHERSCAN_API_KEY
    },
    namedAccounts: {
        deployer: {
            default: 0
        }
    }

};
